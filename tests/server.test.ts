import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createMonitoringServer } from '../server/app.ts';
import type { MonitoringServer, ServerOptions } from '../server/app.ts';
import { Simulator } from '../shared/simulator.ts';
import { diagnosticsSchema, telemetrySchema } from '../shared/types.ts';
import { HttpTelemetryCollector } from '../server/adapters/collector.ts';
import { IbmAceAdminClient, IbmMqRestCollector } from '../server/adapters/ibm.ts';

const running: MonitoringServer[] = [];
afterEach(async () => { await Promise.all(running.splice(0).map(server => server.close())); });

async function start(options: ServerOptions = {}) {
  const monitor = createMonitoringServer({ staticDir: false, pollMs: 60_000, ...options });
  running.push(monitor);
  const port = await monitor.listen(0);
  return { monitor, url: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws/telemetry` };
}

async function post(url: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });
}

async function login(url: string, token: string) {
  const response = await post(url, '/api/session', { token });
  return response.headers.get('set-cookie')!.split(';')[0];
}

describe('Monitoring REST and WebSocket integration', () => {
  it('serves strict telemetry, separate diagnostics, and explicit mock configuration', async () => {
    const { url } = await start();
    const telemetry = await (await fetch(`${url}/api/telemetry`)).json();
    const diagnostics = await (await fetch(`${url}/api/diagnostics`)).json();
    expect(telemetrySchema.safeParse(telemetry).success).toBe(true);
    expect(diagnosticsSchema.safeParse(diagnostics).success).toBe(true);
    expect(await (await fetch(`${url}/api/config`)).json()).toEqual({ mode: 'mock', scenario: 'normal', actionsEnabled: true, authenticationRequired: false });
  });

  it('broadcasts exact schema updates and cleans up sockets during shutdown', async () => {
    const { monitor, wsUrl } = await start({ pollMs: 20 });
    const socket = new WebSocket(wsUrl);
    const messages: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on('message', message => {
        messages.push(JSON.parse(message.toString()));
        if (messages.length === 2) resolve();
      });
      socket.on('error', reject);
    });
    expect(messages.every(value => telemetrySchema.safeParse(value).success)).toBe(true);
    const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
    await monitor.close();
    running.splice(running.indexOf(monitor), 1);
    await closed;
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('applies scenarios, rejects unknown input, and reports failed bank probes honestly', async () => {
    const { url } = await start();
    expect((await post(url, '/api/scenario', { scenario: 'unknown' })).status).toBe(400);
    expect((await post(url, '/api/scenario', { scenario: 'normal', unwanted: 'extra' })).status).toBe(400);
    expect((await post(url, '/api/channels/UNKNOWN/ping')).status).toBe(400);
    expect((await post(url, '/api/scenario', { scenario: 'bni_timeout' })).status).toBe(200);
    const telemetry = await (await fetch(`${url}/api/telemetry`)).json();
    expect(telemetry.channels.find((channel: { id: string }) => channel.id === 'BNI').status).toBe('DOWN');
    const probe = await post(url, '/api/channels/BNI/ping');
    expect(probe.status).toBe(409);
    expect((await probe.json()).ok).toBe(false);
    expect((await post(url, '/api/channels/QRIS/ping')).status).toBe(200);
  });

  it('blocks retries to an offline bank, requeues a message once, and supports discard', async () => {
    const { url } = await start({ simulator: new Simulator('bni_timeout') });
    let telemetry = await (await fetch(`${url}/api/telemetry`)).json();
    const blocked = telemetry.queues.recent_dlq_items.find((item: { channel: string }) => item.channel === 'BNI');
    expect((await post(url, `/api/dlq/${blocked.tx_id}/retry`)).status).toBe(409);
    const available = telemetry.queues.recent_dlq_items.find((item: { channel: string }) => item.channel === 'BCA');
    const payload = await (await fetch(`${url}/api/dlq/${available.tx_id}`)).json();
    expect(payload.payload.idempotency_key).toBe(available.tx_id);
    const depth = telemetry.queues.inbound_depth;
    const [first, second] = await Promise.all([post(url, `/api/dlq/${available.tx_id}/retry`), post(url, `/api/dlq/${available.tx_id}/retry`)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    telemetry = await (await fetch(`${url}/api/telemetry`)).json();
    expect(telemetry.queues.dlq_count).toBe(2);
    expect(telemetry.queues.inbound_depth).toBe(depth + 1);
    expect((await fetch(`${url}/api/dlq/${available.tx_id}`)).status).toBe(404);
    expect((await fetch(`${url}/api/dlq/${blocked.tx_id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await fetch(`${url}/api/dlq/${blocked.tx_id}`, { method: 'DELETE' })).status).toBe(409);
  });

  it('requires authentication for HTTP, payloads, mutations and websocket access', async () => {
    const { url, wsUrl } = await start({ operatorToken: 'integration-test-operator-token' });
    expect((await fetch(`${url}/api/config`)).status).toBe(200);
    expect((await fetch(`${url}/api/telemetry`)).status).toBe(401);
    expect((await fetch(`${url}/api/dlq/TX-UNKNOWN`)).status).toBe(401);
    expect((await post(url, '/api/scenario', { scenario: 'normal' })).status).toBe(401);
    expect((await post(url, '/api/session', { token: 'wrong' })).status).toBe(401);
    const rejected = new WebSocket(wsUrl);
    const status = await new Promise<number>(resolve => {
      rejected.on('unexpected-response', (_req, res) => { resolve(res.statusCode!); res.resume(); rejected.terminate(); });
      rejected.on('error', () => {});
    });
    expect(status).toBe(401);
    const response = await post(url, '/api/session', { token: 'integration-test-operator-token' });
    const cookieHeader = response.headers.get('set-cookie')!;
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Strict');
    const cookie = cookieHeader.split(';')[0];
    expect((await fetch(`${url}/api/telemetry`, { headers: { Cookie: cookie } })).status).toBe(200);
    const allowed = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
    await new Promise<void>((resolve, reject) => { allowed.once('message', () => resolve()); allowed.on('error', reject); });
    allowed.close();
    expect((await fetch(`${url}/api/session`, { method: 'DELETE', headers: { Cookie: cookie } })).status).toBe(200);
    expect((await fetch(`${url}/api/telemetry`, { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it('rejects foreign origins, oversize input and excessive actions', async () => {
    const { url } = await start({ actionLimit: 3 });
    expect((await post(url, '/api/scenario', { scenario: 'normal' }, { Origin: 'https://malicious.example' })).status).toBe(403);
    expect((await post(url, '/api/scenario', { scenario: 'normal' }, { Origin: url })).status).toBe(200);
    expect((await post(url, '/api/scenario', { scenario: 'normal' }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post(url, '/api/scenario', { scenario: 'x'.repeat(20_000) })).status).toBe(413);
    await post(url, '/api/channels/BNI/ping');
    await post(url, '/api/channels/BNI/ping');
    expect((await post(url, '/api/channels/BNI/ping')).status).toBe(429);
    expect((await fetch(`${url}/api/telemetry`)).headers.get('access-control-allow-origin')).toBe(null);
  });

  it('fails closed for live mode without credentials or when the source goes stale', async () => {
    expect(() => createMonitoringServer({ mode: 'live' })).toThrow('OPERATOR_TOKEN');
    const { url } = await start({ mode: 'live', operatorToken: 'integration-live-token' });
    expect(await (await fetch(`${url}/api/config`)).json()).toEqual({ mode: 'live', scenario: null, actionsEnabled: false, authenticationRequired: true });
    const cookie = await login(url, 'integration-live-token');
    expect((await fetch(`${url}/api/telemetry`, { headers: { Cookie: cookie } })).status).toBe(503);
    expect((await post(url, '/api/scenario', { scenario: 'normal' }, { Cookie: cookie })).status).toBe(403);
    expect((await post(url, '/api/channels/BCA/ping', {}, { Cookie: cookie })).status).toBe(403);

    const sample = new Simulator().getTelemetry();
    const { url: liveUrl, monitor } = await start({ mode: 'live', operatorToken: 'integration-live-token', collector: {
      readTelemetry: async () => sample,
      readDiagnostics: async () => null,
    } });
    const liveCookie = await login(liveUrl, 'integration-live-token');
    expect((await fetch(`${liveUrl}/api/telemetry`, { headers: { Cookie: liveCookie } })).status).toBe(200);
    sample.timestamp = new Date(Date.now() - 60_000).toISOString();
    await monitor.runtime.refresh();
    expect((await fetch(`${liveUrl}/api/telemetry`, { headers: { Cookie: liveCookie } })).status).toBe(503);
    expect((await fetch(`${liveUrl}/api/diagnostics`, { headers: { Cookie: liveCookie } })).status).toBe(503);
  });
});

describe('Read-only integration adapters', () => {
  it('calls the documented ACE and MQ paths without consuming queue messages', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: URL | RequestInfo) => {
      urls.push(String(input));
      return Response.json(String(input).includes('/messageflows') ? { children: [{ name: 'Payments', uri: '/apiv2/servers/ACE1/messageflows/Payments', type: 'messageFlow' }] }
        : { queue: [{ name: 'PAYMENT.IN', status: { currentDepth: 42 }, storage: { maximumDepth: 5000 } }] });
    }) as typeof fetch;
    const options = { baseUrl: 'https://ace.example', bearerToken: 'private-test-token', fetchImpl };
    expect((await new IbmAceAdminClient(options).listMessageFlows('ACE 1', 'Payments App'))[0].name).toBe('Payments');
    expect((await new IbmMqRestCollector(options).readQueue('QM1', 'PAYMENT.IN')).currentDepth).toBe(42);
    expect(urls[0]).toBe('https://ace.example/apiv2/servers/ACE%201/applications/Payments%20App/messageflows');
    expect(urls[1]).toBe('https://ace.example/ibmmq/rest/v1/admin/qmgr/QM1/queue/PAYMENT.IN?status=status.currentDepth&attributes=storage.maximumDepth');
  });

  it('discovers ACE application, REST API and service containers before reading flows', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: URL | RequestInfo) => {
      const url = String(input); urls.push(url);
      if (url.endsWith('/applications')) return Response.json({ children: [{ name: 'Payments', uri: '/applications/Payments', type: 'application' }] });
      if (url.endsWith('/messageflows')) return Response.json({ children: [{ name: 'Route', uri: '/applications/Payments/messageflows/Route', type: 'messageFlow' }] });
      return Response.json({ children: [] });
    }) as typeof fetch;
    const flows = await new IbmAceAdminClient({ baseUrl: 'https://ace.example', independentServer: true, fetchImpl }).listMessageFlows('ignored-for-independent-server');
    expect(flows.map(flow => flow.name)).toEqual(['Route']);
    expect(urls).toContain('https://ace.example/apiv2/applications/Payments/messageflows');
    expect(urls).not.toContain('https://ace.example/apiv2/messageflows');
  });

  it('validates collector freshness, exact schema, and mandatory collector credentials', async () => {
    const sample = new Simulator().getTelemetry();
    const adapter = new HttpTelemetryCollector({ baseUrl: 'https://collector.example/telemetry', bearerToken: 'private-token', fetchImpl: (async () => Response.json(sample)) as typeof fetch });
    expect((await adapter.readTelemetry()).channels.length).toBe(5);
    sample.timestamp = new Date(Date.now() - 10_000).toISOString();
    await expect(adapter.readTelemetry()).rejects.toThrow('stale');
    await expect(new HttpTelemetryCollector({ baseUrl: 'https://collector.example' }).readTelemetry()).rejects.toThrow('credentials');
    const invalid = new HttpTelemetryCollector({ baseUrl: 'https://collector.example', bearerToken: 'token', fetchImpl: (async () => Response.json({ ...sample, accidental_secret: 'must-not-pass' })) as typeof fetch });
    await expect(invalid.readTelemetry()).rejects.toThrow();
  });
});
