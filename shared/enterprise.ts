import { z } from "zod";
export const domains = [
  "PAYMENTS",
  "CORE_BANKING",
  "CUSTOMER_CRM",
  "LOGISTICS",
  "ERP_OPS",
] as const;
export const domainLabels: Record<ServiceDomain, string> = {
  PAYMENTS: "Finance & Payments",
  CORE_BANKING: "Core Banking & Accounts",
  CUSTOMER_CRM: "Customer & Identity",
  LOGISTICS: "Orders & Logistics",
  ERP_OPS: "ERP & Enterprise Ops",
};
export const environments = ["Development", "SIT / UAT", "Production"] as const;
export type Environment = (typeof environments)[number];
export const environmentSchema = z.enum(environments);
export const protocols = [
  "REST/HTTP",
  "SOAP/XML",
  "IBM MQ",
  "Kafka",
  "SFTP",
] as const;
export const serviceStatusSchema = z.enum([
  "HEALTHY",
  "DEGRADED",
  "STOPPED",
  "ERROR",
]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type ServiceDomain = (typeof domains)[number];
export const nodeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum([
      "INPUT",
      "COMPUTE",
      "HTTP_REQUEST",
      "DATABASE",
      "MQ_OUTPUT",
      "REPLY",
    ]),
    average_latency_ms: z.number().nonnegative(),
    in_count: z.number().int().nonnegative(),
    out_count: z.number().int().nonnegative(),
    error_count: z.number().int().nonnegative(),
    status: z.enum(["HEALTHY", "BOTTLENECK", "ERROR"]),
  })
  .strict();
export const serviceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    domain: z.enum(domains),
    flow_name: z.string(),
    integration_server: z.string(),
    status: serviceStatusSchema,
    tps: z.number().nonnegative(),
    latency_p95_ms: z.number().nonnegative(),
    error_rate_pct: z.number().min(0).max(100),
    worker_threads_active: z.number().int().nonnegative(),
    worker_threads_max: z.number().int().min(1).max(50),
    queue_name: z.string().optional(),
    queue_depth: z.number().int().nonnegative().optional(),
    dlq_count: z.number().int().nonnegative().optional(),
    config: z
      .object({
        target_url: z.string(),
        timeout_ms: z.number().positive(),
        max_retries: z.number().int().nonnegative(),
        user_trace_enabled: z.boolean(),
      })
      .strict(),
    nodes: z.array(nodeSchema),
  })
  .strict();
export const enterpriseDlqSchema = z
  .object({
    id: z.string(),
    tx_id: z.string(),
    service_id: z.string(),
    timestamp: z.string().datetime(),
    reason: z.string(),
    raw_bip_code: z.string(),
    payload: z.string(),
  })
  .strict();
export const enterpriseIncidentSchema = z
  .object({
    id: z.string(),
    timestamp: z.string().datetime(),
    service_id: z.string(),
    level: z.enum(["CRITICAL", "ERROR", "WARN", "INFO"]),
    raw_bip_code: z.string(),
    diagnostic_message: z.string(),
    remediation_hint: z.string(),
  })
  .strict();
export const enterpriseTelemetrySchema = z
  .object({
    timestamp: z.string().datetime(),
    global_summary: z
      .object({
        total_services: z.number().int().nonnegative(),
        healthy_services: z.number().int().nonnegative(),
        degraded_services: z.number().int().nonnegative(),
        stopped_services: z.number().int().nonnegative(),
        global_tps: z.number().nonnegative(),
        success_rate_pct: z.number().min(0).max(100),
        total_today: z.number().int().nonnegative(),
        total_errors_today: z.number().int().nonnegative(),
        heap_memory_pct: z.number().min(0).max(100),
        cpu_pct: z.number().min(0).max(100),
      })
      .strict(),
    services: z.array(serviceSchema),
    queues: z
      .object({
        total_depth: z.number().int().nonnegative(),
        total_dlq: z.number().int().nonnegative(),
        dlq_items: z.array(enterpriseDlqSchema),
      })
      .strict(),
    incidents: z.array(enterpriseIncidentSchema),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.global_summary.total_services !== v.services.length)
      c.addIssue({
        code: "custom",
        message: "Service count does not match registry.",
      });
    if (new Set(v.services.map((s) => s.id)).size !== v.services.length)
      c.addIssue({ code: "custom", message: "Duplicate service IDs." });
    if (v.services.some((s) => s.worker_threads_active > s.worker_threads_max))
      c.addIssue({ code: "custom", message: "Worker capacity exceeded." });
    if (
      v.global_summary.healthy_services !==
        v.services.filter((s) => s.status === "HEALTHY").length ||
      v.global_summary.degraded_services !==
        v.services.filter((s) => s.status === "DEGRADED").length ||
      v.global_summary.stopped_services !==
        v.services.filter((s) => s.status === "STOPPED" || s.status === "ERROR")
          .length
    )
      c.addIssue({
        code: "custom",
        message: "Service status totals are inconsistent.",
      });
    if (v.global_summary.total_errors_today > v.global_summary.total_today)
      c.addIssue({ code: "custom", message: "Failures exceed daily volume." });
    if (
      v.queues.total_dlq < v.queues.dlq_items.length ||
      new Set(v.queues.dlq_items.map((i) => i.id)).size !==
        v.queues.dlq_items.length
    )
      c.addIssue({ code: "custom", message: "Invalid DLQ inventory." });
    if (
      v.queues.dlq_items.some(
        (i) => !v.services.some((s) => s.id === i.service_id),
      )
    )
      c.addIssue({
        code: "custom",
        message: "DLQ references unknown service.",
      });
  });
export type ProcessNode = z.infer<typeof nodeSchema>;
export type IntegrationService = z.infer<typeof serviceSchema>;
export type TelemetryPayload = z.infer<typeof enterpriseTelemetrySchema>;
export type EnterpriseIncident = z.infer<typeof enterpriseIncidentSchema>;
export type EnterpriseDlq = z.infer<typeof enterpriseDlqSchema>;
const endpointSchema = z
  .string()
  .url()
  .refine(
    (v) =>
      ["http:", "https:", "mq:", "kafka:", "sftp:"].includes(
        new URL(v).protocol,
      ),
    "Unsupported endpoint protocol.",
  )
  .refine((v) => {
    const url = new URL(v);
    return (
      !url.password &&
      !url.username &&
      ![...url.searchParams.keys()].some((k) =>
        /token|secret|password|api.?key/i.test(k),
      )
    );
  }, "Use a credential reference instead of embedding credentials in the URL.");
export const metadataSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    domain: z.enum(domains),
    protocol: z.enum(protocols),
    flow_name: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[A-Za-z0-9_.-]+$/),
    application: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[A-Za-z0-9_.-]+$/),
    integration_server: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[A-Za-z0-9_.-]+$/),
    owner: z.string().trim().min(2).max(100),
    sla_ms: z.number().int().min(1).max(300000),
    target_url: endpointSchema,
    failover_url: z.union([z.literal(""), endpointSchema]),
    timeout_ms: z.number().int().min(100).max(300000),
    worker_threads_max: z.number().int().min(1).max(50),
    max_retries: z.number().int().min(0).max(10),
    retry_interval_ms: z.number().int().min(100).max(60000),
    backoff_multiplier: z.number().min(1).max(10),
    audit_logging: z.enum(["Full Payload", "Metadata Only", "Disabled"]),
    trace: z.enum(["none", "normal", "debug"]),
  })
  .strict();
export type ServiceMetadata = z.infer<typeof metadataSchema>;
export type Registry = Record<string, ServiceMetadata>;
export type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  service_id: string;
  action: string;
  reason: string;
  outcome: string;
  correlation_id: string;
  level: "INFO" | "WARN" | "DEBUG" | "ERROR";
};
export type QueueMetric = {
  name: string;
  service_id: string;
  depth: number;
  max_depth: number;
  ingestion_rate: number;
  consumption_rate: number;
  oldest_age_seconds: number;
};
export type EnterpriseHistory = {
  timestamp: string;
  tps: number;
  heap: number;
  cpu: number;
  gc: boolean;
};
export type ControlAction = "start" | "stop" | "restart" | "archive";
export type ControlResult = { ok: boolean; message: string; id?: string };
const sensitiveField =
  /(password|secret|token|authorization|credential|account|customer|email|phone|(?:^|_)pan(?:$|_)|card.?number)/i;
export function maskPayload(raw: string): string {
  const source = raw.trim();
  // Decode only recognizable structured payloads; never expose an opaque binary body.
  if (
    source.length >= 16 &&
    source.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(source)
  ) {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(source), (c) => c.charCodeAt(0)),
      );
      if (/^[\s]*[\{\[<]/.test(decoded))
        return `Base64 decoded · masked\n${maskPayload(decoded)}`;
      return "[Opaque Base64 payload omitted]";
    } catch {
      return "[Opaque Base64 payload omitted]";
    }
  }
  try {
    const walk = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([key, value]) => [
                key,
                sensitiveField.test(key) ? "[REDACTED]" : walk(value),
              ]),
            )
          : v;
    return JSON.stringify(walk(JSON.parse(raw)), null, 2);
  } catch {
    return raw
      .replace(
        /(<((?:[\w.-]+:)?(?:password|secret|token|authorization|credential|account[\w-]*|customer[\w-]*|email|phone|pan|card[\w-]*))\b[^>]*>)[\s\S]*?(<\/\2>)/gi,
        "$1[REDACTED]$3",
      )
      .replace(
        /(\b(?:password|secret|token|authorization|credential|account[\w-]*|customer[\w-]*|email|phone|pan|card[\w-]*)\s*=\s*)(["'])(.*?)\2/gi,
        '$1"[REDACTED]"',
      )
      .replace(
        /((?:account|token|password|secret|email|phone)[\w-]*[=:]\s*)[^\s,;<>]+/gi,
        "$1[REDACTED]",
      )
      .replace(/\b\d{10,19}\b/g, "[REDACTED]");
  }
}
