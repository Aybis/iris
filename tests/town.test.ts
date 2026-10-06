import { describe, expect, it } from "vitest";
import { EnterpriseModel, makeNodes } from "../shared/enterpriseModel";
import { toTownTelemetry } from "../shared/town";
import { nodeActivity } from "../shared/processActivities";
import { enterpriseTelemetrySchema } from "../shared/enterprise";

describe("Living Town shares the enterprise telemetry", () => {
  it("uses selected-service workers and queue inventory rather than global totals", () => {
    const data = new EnterpriseModel().snapshot();
    const payment = data.services.find((s) => s.id === "payment-gateway")!;
    const scene = toTownTelemetry(data, payment, true);
    expect(scene.system.active_threads).toBe(payment.worker_threads_active);
    expect(scene.system.max_threads).toBe(payment.worker_threads_max);
    expect(scene.system.global_tps).toBe(payment.tps);
    expect(scene.queues.inbound_depth).toBe(payment.queue_depth);
    expect(scene.queues.dlq_count).toBe(2);
    expect(data.queues.total_dlq).toBe(4);
    expect(scene.channels.reduce((n, ch) => n + (ch.tps ?? 0), 0)).toBeCloseTo(
      payment.tps,
      8,
    );
    expect(scene.channels[0].status).toBe("DEGRADED");
    expect(scene.routeSource).toContain("Illustrative");
  });
  it("never fabricates bank telemetry for a live enterprise collector", () => {
    const data = new EnterpriseModel().snapshot();
    const scene = toTownTelemetry(data, data.services[0], false);
    expect(scene.channels).toHaveLength(5);
    for (const route of scene.channels) {
      expect(route.status).toBe("UNKNOWN");
      expect(route.tps).toBeNull();
      expect(route.latency_ms).toBeNull();
      expect(route.error_rate).toBeNull();
    }
  });
  it("reflects lifecycle changes without declaring a bank outage when a flow stops", () => {
    const model = new EnterpriseModel();
    model.lifecycle(
      "payment-gateway",
      "stop",
      "Scheduled simulation maintenance",
    );
    const data = model.snapshot(),
      scene = toTownTelemetry(data, data.services[0], true);
    expect(scene.system.global_tps).toBe(0);
    expect(scene.system.active_threads).toBe(0);
    expect(
      scene.channels.every((ch) => ch.status === "IDLE" && ch.tps === 0),
    ).toBe(true);
  });
  it("maps other service nodes to stops with their measured latency and health", () => {
    const data = new EnterpriseModel().snapshot();
    const kyc = data.services.find((s) => s.id === "kyc-verification-adapter")!;
    const scene = toTownTelemetry(data, kyc, false);
    const bottleneck = kyc.nodes.find((n) => n.status === "BOTTLENECK")!;
    expect(
      scene.channels.find((ch) => ch.node_id === bottleneck.id),
    ).toMatchObject({
      status: "DEGRADED",
      latency_ms: bottleneck.average_latency_ms,
      name: bottleneck.name,
    });
    expect(scene.routeTitle).toBe("PROCESSING STOPS");
    expect(scene.channels.map((ch) => ch.node_id)).toEqual(
      kyc.nodes.slice(1, 6).map((n) => n.id),
    );
  });
  it("preserves configured worker capacity and leaves the original snapshot untouched", () => {
    const model = new EnterpriseModel();
    const metadata = model.getRegistry()["payment-gateway"];
    model.saveService(
      "payment-gateway",
      { ...metadata, worker_threads_max: 50 },
      "Scale demo worker capacity",
    );
    const data = model.snapshot(),
      before = JSON.stringify(data);
    const scene = toTownTelemetry(data, data.services[0], true);
    expect(scene.system.max_threads).toBe(50);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("gives every service its entire node journey and identifies specialist operations", () => {
    const data = new EnterpriseModel().snapshot();
    expect(enterpriseTelemetrySchema.safeParse(data).success).toBe(true);
    for (const service of data.services) {
      const scene = toTownTelemetry(data, service, true);
      expect(scene.stages.map((s) => s.node)).toEqual(service.nodes);
      expect(scene.stages[0].activity).toBe("input");
      expect(scene.stages.at(-1)?.activity).toBe("output");
    }
    for (const [id, activity] of [
      ["customer-360-sync", "aggregate"],
      ["notification-dispatcher", "route"],
      ["general-ledger-ingestion", "transform"],
    ]) {
      const service = data.services.find((s) => s.id === id)!;
      expect(
        toTownTelemetry(data, service, true).stages.some(
          (s) => s.activity === activity,
        ),
      ).toBe(true);
    }
  });
  it("preserves live node order, arbitrary flow lengths and unknown Compute nodes", () => {
    const data = new EnterpriseModel().snapshot();
    const service = data.services[0];
    service.nodes.push({
      ...service.nodes[2],
      id: "custom-node-7",
      name: "Custom Business Logic",
    });
    service.nodes.push({
      ...service.nodes[2],
      id: "custom-node-8",
      name: "Route by Region",
    });
    const before = JSON.stringify(data);
    const scene = toTownTelemetry(data, service, false);
    expect(scene.stages).toHaveLength(8);
    expect(scene.stages[6].activity).toBe("compute");
    expect(scene.stages[7].activity).toBe("route");
    expect(scene.stages.map((s) => s.node)).toEqual(service.nodes);
    expect(JSON.stringify(data)).toBe(before);
    expect(
      toTownTelemetry(data, { ...service, nodes: [] }, false).stages,
    ).toEqual([]);
  });
  it("keeps node faults and stopped flows distinct and retains historical counts", () => {
    const data = new EnterpriseModel().snapshot();
    const service = data.services[11];
    service.nodes[3].status = "ERROR";
    service.nodes[3].error_count = 9;
    expect(toTownTelemetry(data, service, false).stages[3].status).toBe("DOWN");
    service.status = "STOPPED";
    const idle = toTownTelemetry(data, service, false);
    expect(idle.stages.every((s) => s.status === "IDLE")).toBe(true);
    expect(idle.stages[3].node.error_count).toBe(9);
    expect(
      nodeActivity({ ...service.nodes[3], name: "Custom Business Logic" }),
    ).toBe("compute");
  });
  it("upgrades only untouched legacy demo pipelines without resetting saved operations", () => {
    const model = new EnterpriseModel();
    model.lifecycle("customer-360-sync", "stop", "Test saved service state");
    const state = model.getState();
    const customer = state.services.find((s) => s.id === "customer-360-sync")!;
    customer.nodes = makeNodes(11, "Kafka");
    customer.nodes[3].in_count = 99000;
    customer.nodes[3].out_count = 98999;
    customer.nodes[3].error_count = 1;
    const custom = state.services.find(
      (s) => s.id === "notification-dispatcher",
    )!;
    custom.nodes = makeNodes(14, "IBM MQ");
    custom.nodes[3].name = "My Custom Node";
    const before = JSON.stringify(state);
    const restored = new EnterpriseModel("Production", state);
    const result = restored.snapshot();
    expect(result.services.find((s) => s.id === customer.id)).toMatchObject({
      status: "STOPPED",
      worker_threads_active: 0,
    });
    expect(
      result.services.find((s) => s.id === customer.id)?.nodes[3],
    ).toMatchObject({
      name: "Aggregate Customer Records",
      type: "COMPUTE",
      in_count: 99000,
      out_count: 98999,
      error_count: 1,
    });
    expect(result.services.find((s) => s.id === custom.id)?.nodes).toEqual(
      custom.nodes,
    );
    expect(restored.getAudit()).toEqual(model.getAudit());
    expect(result.queues.total_dlq).toBe(model.snapshot().queues.total_dlq);
    expect(JSON.stringify(state)).toBe(before);
  });
});
