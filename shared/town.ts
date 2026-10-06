import type {
  IntegrationService,
  ProcessNode,
  TelemetryPayload,
} from "./enterprise";
import {
  activityDetails,
  nodeActivity,
  type ProcessActivity,
} from "./processActivities";

export type TownStage = {
  node: ProcessNode;
  activity: ProcessActivity;
  building: string;
  description: string;
  color: string;
  status: "UP" | "DEGRADED" | "DOWN" | "IDLE";
};
export type TownViewMode = "village" | "process";

export type TownRoute = {
  id: string;
  name: string;
  label: string;
  status: "UP" | "DEGRADED" | "DOWN" | "IDLE" | "UNKNOWN";
  tps: number | null;
  latency_ms: number | null;
  error_rate: number | null;
  node_id?: string;
};
export type TownTelemetry = {
  service: IntegrationService;
  title: string;
  routeTitle: string;
  routeSource: string;
  system: {
    status: string;
    global_tps: number;
    active_threads: number;
    max_threads: number;
    heap_memory_pct: number;
  };
  queues: { inbound_depth: number; dlq_count: number };
  channels: TownRoute[];
  stages: TownStage[];
};

/** A presentation of the current enterprise snapshot, with an explicitly labeled demo bank split. */
export function toTownTelemetry(
  data: TelemetryPayload,
  service: IntegrationService,
  demo: boolean,
): TownTelemetry {
  const idle = service.status === "STOPPED";
  const banks = ["BCA", "Mandiri", "BNI", "AstraPay", "QRIS"];
  const weights = [0.46, 0.23, 0.11, 0.12, 0.08];
  const bankFocus = service.id === "payment-gateway";
  const request = service.nodes.find((node) => node.type === "HTTP_REQUEST");
  const channels: TownRoute[] = bankFocus
    ? banks.map((bank, i) => ({
        id: bank.toUpperCase(),
        name: `${bank} payment route`,
        label: bank.toUpperCase(),
        status: !demo
          ? "UNKNOWN"
          : idle
            ? "IDLE"
            : service.status === "ERROR"
              ? "DOWN"
              : i === 0 && service.status === "DEGRADED"
                ? "DEGRADED"
                : "UP",
        tps: demo ? service.tps * weights[i] : null,
        latency_ms:
          !demo || idle
            ? null
            : i === 0
              ? (request?.average_latency_ms ?? 110)
              : [110, 145, 130, 95, 120][i],
        error_rate:
          demo && !idle
            ? i === 0
              ? Math.min(100, service.error_rate_pct / weights[0])
              : 0
            : null,
        node_id: request?.id,
      }))
    : service.nodes.slice(1, 6).map((node, i) => ({
        id: node.id,
        name: node.name,
        label: activityDetails[nodeActivity(node)].label.toUpperCase(),
        status: idle
          ? "IDLE"
          : node.status === "ERROR"
            ? "DOWN"
            : node.status === "BOTTLENECK"
              ? "DEGRADED"
              : "UP",
        tps: service.tps,
        latency_ms: idle ? null : node.average_latency_ms,
        error_rate: node.in_count
          ? (node.error_count / node.in_count) * 100
          : 0,
        node_id: node.id,
      }));
  return {
    service,
    title: bankFocus ? "THE PAYMENT VILLAGE" : "THE INTEGRATION VILLAGE",
    routeTitle: bankFocus ? "PARTNER HARBOUR" : "PROCESSING STOPS",
    routeSource: bankFocus
      ? demo
        ? "Illustrative bank split of simulated Payment Gateway traffic. Live bank measurements are not connected."
        : "Bank-level telemetry is not supplied by the enterprise collector."
      : "Stops show the selected flow’s node telemetry. Carts illustrate activity; they are not individual traced transactions.",
    system: {
      status:
        service.status === "HEALTHY"
          ? "HEALTHY"
          : service.status === "DEGRADED"
            ? "DEGRADED"
            : "OUTAGE",
      global_tps: service.tps,
      active_threads: service.worker_threads_active,
      max_threads: service.worker_threads_max,
      heap_memory_pct: data.global_summary.heap_memory_pct,
    },
    queues: {
      inbound_depth: service.queue_depth ?? 0,
      dlq_count: service.dlq_count ?? 0,
    },
    channels,
    stages: service.nodes.map((node) => {
      const activity = nodeActivity(node);
      return {
        node,
        activity,
        ...activityDetails[activity],
        status: idle
          ? "IDLE"
          : node.status === "ERROR"
            ? "DOWN"
            : node.status === "BOTTLENECK"
              ? "DEGRADED"
              : "UP",
      };
    }),
  };
}
