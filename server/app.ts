import express from 'express';
import type { ErrorRequestHandler, Express, RequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { channelIdSchema, diagnosticsSchema, scenarioSchema, telemetrySchema } from '../shared/types.ts';
import type { ActionResult, AppConfig, Diagnostics, Telemetry } from '../shared/types.ts';
import { Simulator } from '../shared/simulator.ts';
import { HttpTelemetryCollector } from './adapters/collector.ts';
import type { LiveActionProvider, TelemetryCollector } from './adapters/collector.ts';
import { Security } from './security.ts';
import { ControlRuntime, attachControlRoutes } from './control.ts';
import { environmentSchema } from '../shared/enterprise.ts';
import type { Environment } from '../shared/enterprise.ts';
import type { SecurityOptions } from './security.ts';

export interface ServerOptions extends SecurityOptions {
  mode?: 'mock' | 'live';
  controlStatePath?: string;
  enterpriseCollectorUrl?: string;
  enterpriseCollectorToken?: string;
  simulator?: Simulator;
  collector?: TelemetryCollector;
  liveActions?: LiveActionProvider;
  pollMs?: number;
  maxAgeMs?: number;
  staticDir?: string | false;
}

export class MonitoringRuntime {
  readonly security: Security;
  readonly simulator: Simulator;
  readonly mode: 'mock' | 'live';
  private telemetry: Telemetry | null = null;
  private diagnostics: Diagnostics | null = null;
  private refreshing = false;
  readonly collector: TelemetryCollector;
  constructor(readonly options: ServerOptions) {
    this.mode = options.mode ?? 'mock';
    if (this.mode === 'live' && !options.operatorToken) throw new Error('OPERATOR_TOKEN is required in live mode.');
    this.security = new Security(options);
    this.simulator = options.simulator ?? new Simulator();
    this.collector = options.collector ?? new HttpTelemetryCollector({});
    if (this.mode === 'mock') this.readMock();
  }

  config(): AppConfig {
    return { mode: this.mode, actionsEnabled: this.mode === 'mock' || !!this.options.liveActions,
      scenario: this.mode === 'mock' ? this.simulator.getScenario() : null,
      authenticationRequired: !!this.options.operatorToken };
  }

  private readMock() {
    this.telemetry = telemetrySchema.parse(this.simulator.getTelemetry());
    this.diagnostics = diagnosticsSchema.parse(this.simulator.getDiagnostics());
  }

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      if (this.mode === 'mock') { this.simulator.tick(new Date()); this.readMock(); }
      else {
        const [telemetry, diagnostics] = await Promise.allSettled([this.collector.readTelemetry(), this.collector.readDiagnostics()]);
        this.telemetry = telemetry.status === 'fulfilled' ? telemetrySchema.parse(telemetry.value) : null;
        this.diagnostics = diagnostics.status === 'fulfilled' && diagnostics.value ? diagnosticsSchema.parse(diagnostics.value) : null;
      }
    } catch { this.telemetry = null; this.diagnostics = null; }
    finally { this.refreshing = false; }
  }

  private fresh(timestamp: string) {
    const age = Date.now() - Date.parse(timestamp);
    return age >= -5000 && age <= (this.options.maxAgeMs ?? 5000);
  }

  getTelemetry(): Telemetry | null {
    if (this.mode === 'mock') this.readMock();
    return this.telemetry && this.fresh(this.telemetry.timestamp) ? this.telemetry : null;
  }

  getDiagnostics(): Diagnostics | null {
    if (this.mode === 'mock') this.readMock();
    return this.diagnostics && this.fresh(this.diagnostics.collected_at) ? this.diagnostics : null;
  }
}

const txIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/);
const scenarioBodySchema = z.object({ scenario: scenarioSchema }).strict();

export function createApp(options: ServerOptions = {}, runtime = new MonitoringRuntime(options), control = new ControlRuntime(options)): Express {
  const app = express();
  app.disable('x-powered-by');
  app.locals.runtime = runtime;
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (options.production) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // Check all API origins before parsing bodies; never enable CORS.
  app.use('/api', runtime.security.checkOrigin);
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/config', (_req, res) => res.json(runtime.config()));
  app.post('/api/session', runtime.security.rateLimit, runtime.security.login);
  app.delete('/api/session', runtime.security.rateLimit, runtime.security.logout);
  app.use('/api', runtime.security.authenticate);
  attachControlRoutes(app,runtime,options,control);

  app.get('/api/telemetry', (_req, res) => {
    const value = runtime.getTelemetry();
    if (!value) { res.status(503).json({ ok: false, message: 'Live telemetry is unavailable or stale. Check the configured collector.' }); return; }
    res.json(value);
  });
  app.get('/api/diagnostics', (_req, res) => {
    const value = runtime.getDiagnostics();
    if (!value) { res.status(503).json({ ok: false, message: 'Detailed diagnostics are unavailable or stale.' }); return; }
    res.json(value);
  });

  const requireActions: RequestHandler = (_req, res, next) => {
    if (!runtime.config().actionsEnabled) { res.status(403).json({ ok: false, message: 'Live actions are disabled. Configure an audited action provider.' }); return; }
    if (!runtime.getTelemetry()) { res.status(503).json({ ok: false, message: 'Actions are unavailable while telemetry is stale.' }); return; }
    next();
  };
  const mutation = [runtime.security.rateLimit, requireActions];
  const respondAction = (res: express.Response, result: ActionResult) => res.status(result.ok ? 200 : 409).json(result);

  app.post('/api/scenario', runtime.security.rateLimit, (req, res) => {
    if (runtime.mode !== 'mock') { res.status(403).json({ ok: false, message: 'Simulation scenarios are only available in mock mode.' }); return; }
    const parsed = scenarioBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, message: 'Invalid simulation scenario.' }); return; }
    runtime.simulator.setScenario(parsed.data.scenario);
    res.json({ ok: true, message: 'Simulation scenario updated.' });
  });
  app.post('/api/channels/:id/ping', ...mutation, async (req, res) => {
    const parsed = channelIdSchema.safeParse(req.params.id);
    if (!parsed.success) { res.status(400).json({ ok: false, message: 'Unknown payment channel.' }); return; }
    const result = runtime.mode === 'mock' ? runtime.simulator.ping(parsed.data) : await options.liveActions!.ping(parsed.data);
    respondAction(res, result);
  });
  app.get('/api/dlq/:txId', runtime.security.rateLimit, requireActions, async (req, res) => {
    const parsed = txIdSchema.safeParse(req.params.txId);
    if (!parsed.success) { res.status(400).json({ ok: false, message: 'Invalid transaction ID.' }); return; }
    try {
      const payload = runtime.mode === 'mock' ? runtime.simulator.getPayload(parsed.data) : await options.liveActions!.getPayload(parsed.data);
      res.json({ tx_id: parsed.data, payload });
    } catch { res.status(404).json({ ok: false, message: 'Transaction payload is not available.' }); }
  });
  app.post('/api/dlq/:txId/retry', ...mutation, async (req, res) => {
    const parsed = txIdSchema.safeParse(req.params.txId);
    if (!parsed.success) { res.status(400).json({ ok: false, message: 'Invalid transaction ID.' }); return; }
    const result = runtime.mode === 'mock' ? runtime.simulator.retry(parsed.data) : await options.liveActions!.retry(parsed.data);
    respondAction(res, result);
  });
  app.delete('/api/dlq/:txId', ...mutation, async (req, res) => {
    const parsed = txIdSchema.safeParse(req.params.txId);
    if (!parsed.success) { res.status(400).json({ ok: false, message: 'Invalid transaction ID.' }); return; }
    const result = runtime.mode === 'mock' ? runtime.simulator.discard(parsed.data) : await options.liveActions!.discard(parsed.data);
    respondAction(res, result);
  });
  app.use('/api', (_req, res) => { res.status(404).json({ ok: false, message: 'Unknown API endpoint.' }); });

  const staticDir = options.staticDir === false ? null : resolve(options.staticDir ?? 'dist');
  if (staticDir && existsSync(resolve(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: options.production ? '1h' : 0 }));
    app.get(/.*/, (req, res, next) => {
      if (req.path.includes('.') || req.path.startsWith('/ws/')) { next(); return; }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(staticDir, 'index.html'));
    });
  }
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === 'object' && error !== null && 'status' in error && error.status === 413 ? 413
      : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ ok: false, message: status === 413 ? 'Request body too large.' : status === 400 ? 'Invalid JSON body.' : 'The operation failed. Review server diagnostics.' });
  };
  app.use(handleError);
  return app;
}

export interface MonitoringServer {
  app: Express;
  server: Server;
  wss: WebSocketServer;
  runtime: MonitoringRuntime;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export function createMonitoringServer(options: ServerOptions = {}): MonitoringServer {
  const runtime = new MonitoringRuntime(options);
  const control = new ControlRuntime(options);
  const app = createApp(options, runtime, control);
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  let timer: ReturnType<typeof setInterval> | undefined;
  let shuttingDown = false;
  const sockets = new Map<WebSocket, { authenticated: () => boolean; alive: boolean; environment: Environment; enterprise: boolean }>();

  server.on('upgrade', (req, socket, head) => {
    const wsUrl = new URL(req.url ?? '/', 'http://localhost');
    const enterprise = wsUrl.pathname === '/ws/telemetry';
    const parsedEnv = environmentSchema.safeParse(wsUrl.searchParams.get('environment') ?? 'Production');
    if (!parsedEnv.success || !['/ws/telemetry','/ws/payments'].includes(wsUrl.pathname)) { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    if (!runtime.security.validOrigin(req) || !runtime.security.authenticated(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    if (shuttingDown) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      sockets.set(ws, { authenticated: () => runtime.security.authenticated(req), alive: true, environment: parsedEnv.data, enterprise });
      ws.on('pong', () => { const state = sockets.get(ws); if (state) state.alive = true; });
      ws.on('close', () => { sockets.delete(ws); });
      ws.on('error', () => { ws.terminate(); });
      // This is a one-way telemetry channel; actions must use authenticated REST.
      ws.on('message', () => { ws.close(1008, 'Use REST endpoints for actions.'); });
      const telemetry = enterprise ? control.snapshot(parsedEnv.data) : runtime.getTelemetry();
      if (telemetry) ws.send(JSON.stringify(telemetry));
      else ws.close(1013, 'Telemetry source unavailable.');
    });
  });

  let ticks = 0;
  const broadcast = async () => {
    await Promise.all([runtime.refresh(),control.tick()]);
    if (shuttingDown) return;
    ticks++;
    for (const [ws, state] of sockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const telemetry = state.enterprise ? control.snapshot(state.environment) : runtime.getTelemetry();
      if (!state.authenticated()) { ws.close(1008, 'Session expired.'); continue; }
      if (!telemetry) { ws.close(1013, 'Telemetry source unavailable.'); continue; }
      if (ws.bufferedAmount > 1_000_000) { ws.terminate(); continue; }
      if (ticks % 30 === 0) {
        if (!state.alive) { ws.terminate(); continue; }
        state.alive = false; ws.ping();
      }
      ws.send(JSON.stringify(telemetry));
    }
  };

  return { app, server, wss, runtime,
    async listen(port = 3001, host = '127.0.0.1') {
      await Promise.all([runtime.refresh(),control.tick()]);
      await new Promise<void>((resolveListen, reject) => {
        const failed = (error: Error) => reject(error);
        server.once('error', failed);
        server.listen(port, host, () => { server.off('error', failed); resolveListen(); });
      });
      timer = setInterval(() => { void broadcast(); }, options.pollMs ?? 1000);
      timer.unref();
      const address = server.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    async close() {
      shuttingDown = true;
      if (timer) clearInterval(timer);
      runtime.security.clear();
      for (const ws of sockets.keys()) ws.terminate();
      sockets.clear();
      await new Promise<void>(done => wss.close(() => done()));
      if (server.listening) await new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); });
    },
  };
}
