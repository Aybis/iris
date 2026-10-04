import { z } from 'zod';

export const channelIds = ['BCA', 'MANDIRI', 'BNI', 'ASTRAPAY', 'QRIS'] as const;
export const channelIdSchema = z.enum(channelIds);
export type ChannelId = z.infer<typeof channelIdSchema>;
export const scenarioIds = ['normal', 'flash_sale', 'bni_timeout', 'dlq_influx', 'bca_outage', 'thread_starvation'] as const;
export const scenarioSchema = z.enum(scenarioIds);
export type Scenario = z.infer<typeof scenarioSchema>;
export const scenarioLabels: Record<Scenario, string> = { normal: 'Normal Operation', flash_sale: 'Flash Sale', bni_timeout: 'Bank BNI Timeout', dlq_influx: 'DLQ Influx', bca_outage: 'BCA Bank Outage', thread_starvation: 'Thread Starvation' };
export const channelSchema = z.object({
  id: channelIdSchema, name: z.string(), status: z.enum(['UP', 'DEGRADED', 'DOWN']),
  tps: z.number().nonnegative(), latency_ms: z.number().nonnegative(), error_rate: z.number().min(0).max(100),
}).strict();
export const dlqItemSchema = z.object({
  tx_id: z.string(), timestamp: z.string(), channel: channelIdSchema, reason: z.string(), payload_snippet: z.string(),
}).strict();
export const incidentSchema = z.object({
  id: z.string(), timestamp: z.string(), level: z.enum(['CRITICAL', 'ERROR', 'WARN', 'INFO']),
  service: z.string(), raw_code: z.string(), plain_message: z.string(),
}).strict();
export const telemetrySchema = z.object({
  timestamp: z.string().datetime(),
  system: z.object({
    status: z.enum(['HEALTHY', 'DEGRADED', 'OUTAGE']), global_tps: z.number().nonnegative(), success_rate: z.number().min(0).max(100),
    total_today: z.number().int().nonnegative(), active_threads: z.number().int().nonnegative(), max_threads: z.number().int().positive(),
    heap_memory_pct: z.number().min(0).max(100), db_pool_active: z.number().int().nonnegative(), db_pool_max: z.number().int().positive(),
  }).strict(),
  channels: z.array(channelSchema).length(5),
  queues: z.object({ inbound_depth: z.number().int().nonnegative(), dlq_count: z.number().int().nonnegative(), recent_dlq_items: z.array(dlqItemSchema) }).strict(),
  latest_incidents: z.array(incidentSchema),
}).strict().superRefine((value, ctx) => {
  if(new Set(value.channels.map(c=>c.id)).size !== 5) ctx.addIssue({code:'custom',message:'Each of the five channels must appear exactly once.'});
  if(value.system.active_threads > value.system.max_threads) ctx.addIssue({code:'custom',message:'Active threads exceed configured capacity.'});
  if(value.system.db_pool_active > value.system.db_pool_max) ctx.addIssue({code:'custom',message:'Database connections exceed pool capacity.'});
  if(value.queues.recent_dlq_items.length > value.queues.dlq_count) ctx.addIssue({code:'custom',message:'DLQ sample count exceeds inventory.'});
});
export type Telemetry = z.infer<typeof telemetrySchema>;
export type Channel = z.infer<typeof channelSchema>;
export type DlqItem = z.infer<typeof dlqItemSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type IncidentFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO' | 'RESOLVED';
export type HistoryPoint = { timestamp: string; tps: number; heap: number; queue: number; workers: number };
export const diagnosticsSchema = z.object({
  collected_at: z.string().datetime(), data_mode: z.enum(['mock', 'live']), source_status: z.enum(['fresh','stale']),
  channel_p95_ms: z.record(channelIdSchema, z.number().nonnegative().nullable()),
  ingestion_tps: z.number().nonnegative(), consumption_tps: z.number().nonnegative(), db_pool_idle: z.number().int().nonnegative(),
  heap_history: z.array(z.object({timestamp:z.string().datetime(),value:z.number().min(0).max(100),gc:z.boolean()})),
  scenario: scenarioSchema.nullable(),
}).strict();
export type Diagnostics = z.infer<typeof diagnosticsSchema>;
export type ActionResult = { ok: boolean; message: string };
export type AppConfig = { mode:'mock'|'live';actionsEnabled:boolean;scenario:Scenario|null;authenticationRequired:boolean };
