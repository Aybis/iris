import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createMonitoringServer } from './app.ts';
import type { ServerOptions } from './app.ts';
import { HttpTelemetryCollector } from './adapters/collector.ts';

export { createApp, createMonitoringServer, MonitoringRuntime } from './app.ts';
export type { ServerOptions, MonitoringServer } from './app.ts';

export function optionsFromEnvironment(env: NodeJS.ProcessEnv = process.env): ServerOptions {
  const mode = env.DATA_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'live') throw new Error('DATA_MODE must be mock or live.');
  const production = env.NODE_ENV === 'production';
  let publicOrigin = env.PUBLIC_ORIGIN ?? (production ? undefined : 'http://localhost:5173');
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('PUBLIC_ORIGIN must contain only an HTTP(S) origin.');
    }
    publicOrigin = parsed.origin;
  }
  return {
    mode, production, publicOrigin, operatorToken: env.OPERATOR_TOKEN,
    controlStatePath: mode === 'mock' ? (env.CONTROL_STATE_PATH ?? 'data/control-state.json') : undefined,
    enterpriseCollectorUrl: env.ENTERPRISE_COLLECTOR_URL, enterpriseCollectorToken: env.COLLECTOR_TOKEN,
    collector: mode === 'live' ? new HttpTelemetryCollector({
      baseUrl: env.TELEMETRY_COLLECTOR_URL,
      diagnosticsUrl: env.DIAGNOSTICS_COLLECTOR_URL,
      bearerToken: env.COLLECTOR_TOKEN,
      username: env.COLLECTOR_USERNAME,
      password: env.COLLECTOR_PASSWORD,
    }) : undefined,
  };
}

async function main() {
  const configuredPort = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const options = optionsFromEnvironment();
  const monitor = createMonitoringServer(options);
  const port = await monitor.listen(configuredPort, process.env.HOST ?? '127.0.0.1');
  process.stdout.write(`Flowstead ${options.mode} monitoring server listening on port ${port}\n`);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    void monitor.close().then(() => { clearTimeout(deadline); process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => {
    // Configuration messages can expose credentials embedded in malformed URLs.
    process.stderr.write('Monitoring server could not start. Check configuration, port, and live operator authentication.\n');
    process.exitCode = 1;
  });
}
