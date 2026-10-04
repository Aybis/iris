/** Read-only integration adapters. No message is consumed or paid by these clients. */
export interface HttpClientOptions {
  baseUrl: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function authorization(options: HttpClientOptions): Record<string, string> {
  if (options.bearerToken) return { Authorization: `Bearer ${options.bearerToken}` };
  if (options.username && options.password) {
    return { Authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}` };
  }
  return {};
}

/** Verify certificate chains using Node's default trust store / NODE_EXTRA_CA_CERTS. */
export async function readJson(options: HttpClientOptions, path = ''): Promise<unknown> {
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('Adapter URL must be HTTP(S), with credentials supplied separately.');
  }
  const url = path ? new URL(`${base.pathname.replace(/\/$/, '')}${path}`, base.origin) : base;
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { Accept: 'application/json', ...authorization(options) },
    signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
  // Limit material read into memory even when an upstream omits Content-Length.
  if (Number(response.headers.get('content-length') ?? 0) > 2_000_000) throw new Error('Upstream response too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty upstream response');
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 2_000_000) { await reader.cancel(); throw new Error('Upstream response too large'); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}

export interface AceMessageFlow {
  name: string;
  uri: string;
  type: string;
}
export interface AceAdminAdapter {
  listMessageFlows(server: string, application?: string): Promise<AceMessageFlow[]>;
}

/** Uses documented application / REST API / service scopes for deployed flows. */
export class IbmAceAdminClient implements AceAdminAdapter {
  constructor(private readonly options: HttpClientOptions & { independentServer?: boolean }) {}

  async listMessageFlows(server: string, application?: string): Promise<AceMessageFlow[]> {
    const scope = this.options.independentServer ? '' : `/servers/${encodeURIComponent(server)}`;
    if (application) return this.readCollection(`/apiv2${scope}/applications/${encodeURIComponent(application)}/messageflows`);
    // The mission's unscoped /servers/{server}/messageflows shorthand is not in
    // the ACE 13 OpenAPI. Discover containers, then query their flow collections.
    const collections = await Promise.all(['applications', 'rest-apis', 'services'].map(async kind => {
      const containers = await this.readCollection(`/apiv2${scope}/${kind}`);
      const flows = await Promise.all(containers.map(container => this.readCollection(`/apiv2${scope}/${kind}/${encodeURIComponent(container.name)}/messageflows`)));
      return flows.flat();
    }));
    return collections.flat();
  }

  private async readCollection(path: string): Promise<AceMessageFlow[]> {
    const result = await readJson(this.options, path);
    if (!result || typeof result !== 'object' || !('children' in result) || !Array.isArray(result.children)) {
      throw new Error('Invalid ACE collection response');
    }
    return result.children.map((value: unknown) => {
      if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string'
        || !('uri' in value) || typeof value.uri !== 'string'
        || !('type' in value) || typeof value.type !== 'string') {
        throw new Error('Invalid ACE collection entry');
      }
      return { name: value.name, uri: value.uri, type: value.type };
    });
  }
}

export interface MqQueueStatistics {
  name: string;
  currentDepth: number;
  maximumDepth: number | null;
  collectedAt: string;
}
export interface MqStatisticsCollector {
  readQueue(queueManager: string, queue: string): Promise<MqQueueStatistics>;
}

/** MQ administrative REST v1; v3 installations need an MQSC/PCF collector instead. */
export class IbmMqRestCollector implements MqStatisticsCollector {
  constructor(private readonly options: HttpClientOptions) {}

  async readQueue(queueManager: string, queue: string): Promise<MqQueueStatistics> {
    const path = `/ibmmq/rest/v1/admin/qmgr/${encodeURIComponent(queueManager)}/queue/${encodeURIComponent(queue)}?status=status.currentDepth&attributes=storage.maximumDepth`;
    const result = await readJson(this.options, path);
    if (!result || typeof result !== 'object' || !('queue' in result) || !Array.isArray(result.queue)) {
      throw new Error('Invalid MQ queue response');
    }
    const entry = result.queue.find((item: unknown) => !!item && typeof item === 'object' && 'name' in item && item.name === queue);
    const depth = entry?.status?.currentDepth;
    const maximum = entry?.storage?.maximumDepth;
    if (!Number.isSafeInteger(depth) || depth < 0 || (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 0))) {
      throw new Error('Invalid MQ queue depth');
    }
    return { name: queue, currentDepth: depth, maximumDepth: maximum ?? null, collectedAt: new Date().toISOString() };
  }
}
