import { diagnosticsSchema, telemetrySchema } from '../../shared/types.ts';
import type { ActionResult, ChannelId, Diagnostics, Telemetry } from '../../shared/types.ts';
import { readJson } from './ibm.ts';
import type { HttpClientOptions } from './ibm.ts';

export interface TelemetryCollector {
  readTelemetry(): Promise<Telemetry>;
  readDiagnostics(): Promise<Diagnostics | null>;
}

/**
 * Implement against an organization's transaction store + audited payment replay service.
 * Replay must be idempotent and reconcile provider outcome before resubmission.
 * The default live installation deliberately has no implementation of these mutations.
 */
export interface LiveActionProvider {
  ping(channel: ChannelId): Promise<ActionResult>;
  getPayload(txId: string): Promise<unknown>;
  retry(txId: string): Promise<ActionResult>;
  discard(txId: string): Promise<ActionResult>;
}

export class HttpTelemetryCollector implements TelemetryCollector {
  constructor(private readonly options: Partial<HttpClientOptions> & { diagnosticsUrl?: string; maxAgeMs?: number }) {}

  private configured(): HttpClientOptions {
    if (!this.options.baseUrl) throw new Error('TELEMETRY_COLLECTOR_URL is not configured.');
    if (!this.options.bearerToken && !(this.options.username && this.options.password)) {
      throw new Error('Telemetry collector credentials are not configured.');
    }
    return this.options as HttpClientOptions;
  }

  private fresh(timestamp: string) {
    const age = Date.now() - Date.parse(timestamp);
    if (age > (this.options.maxAgeMs ?? 5000) || age < -5000) throw new Error('Collector data is stale or its clock is invalid.');
  }

  async readTelemetry(): Promise<Telemetry> {
    const telemetry = telemetrySchema.parse(await readJson(this.configured()));
    this.fresh(telemetry.timestamp);
    return telemetry;
  }

  async readDiagnostics(): Promise<Diagnostics | null> {
    if (!this.options.diagnosticsUrl) return null;
    const diagnostics = diagnosticsSchema.parse(await readJson({ ...this.configured(), baseUrl: this.options.diagnosticsUrl }));
    if (diagnostics.data_mode !== 'live' || diagnostics.source_status !== 'fresh') throw new Error('Collector diagnostics are not fresh live data.');
    this.fresh(diagnostics.collected_at);
    return diagnostics;
  }
}
