import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { EnterpriseModel, defaultMetadata } from "../shared/enterpriseModel";
import {
  domains,
  enterpriseTelemetrySchema,
  maskPayload,
  metadataSchema,
} from "../shared/enterprise";
import { logsToCsv } from "../shared/logExport";
import { ControlRuntime } from "../server/control";
import { createMonitoringServer } from "../server/app";
import type { MonitoringServer, ServerOptions } from "../server/app";

const tempDirs: string[] = [];
const servers: MonitoringServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  tempDirs
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true }));
});
const temporary = () => {
  const path = mkdtempSync(join(tmpdir(), "enterprise-test-"));
  tempDirs.push(path);
  return path;
};
const registration = () => ({
  ...defaultMetadata(),
  name: "QA Reconciliation",
  flow_name: "QaReconciliationFlow",
});
async function start(options: ServerOptions = {}) {
  const server = createMonitoringServer({
    staticDir: false,
    pollMs: 60000,
    ...options,
  });
  servers.push(server);
  return `http://127.0.0.1:${await server.listen(0)}`;
}
const post = (url: string, path: string, body: unknown, cookie = "") =>
  fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });

describe("Enterprise inventory and operational invariants", () => {
  it("seeds all 26 services in their correct domains and validates every tick", () => {
    const model = new EnterpriseModel();
    const initial = model.snapshot();
    expect(
      domains.map((d) => initial.services.filter((s) => s.domain === d).length),
    ).toEqual([6, 5, 5, 5, 5]);
    expect(initial.global_summary).toMatchObject({
      total_services: 26,
      healthy_services: 23,
      degraded_services: 2,
      stopped_services: 1,
    });
    expect(model.getRegistry()["e-wallet-settlement"].owner).toBe(
      "Payments Engineering",
    );
    expect(model.getRegistry()["overdraft-check"].owner).toBe("Core Banking");
    for (let tick = 0; tick < 65; tick++)
      expect(enterpriseTelemetrySchema.safeParse(model.tick()).success).toBe(
        true,
      );
    const current = model.snapshot();
    expect(current.global_summary.global_tps).toBeCloseTo(
      current.services.reduce((sum, s) => sum + s.tps, 0),
      1,
    );
    const nodes = current.services[0].nodes;
    nodes.forEach((n) => expect(n.in_count).toBe(n.out_count + n.error_count));
    nodes
      .slice(1)
      .forEach((n, i) => expect(n.in_count).toBe(nodes[i].out_count));
  });
  it("rejects inconsistent collector health summaries and invalid worker capacity", () => {
    const data = new EnterpriseModel().snapshot();
    data.global_summary.healthy_services++;
    expect(enterpriseTelemetrySchema.safeParse(data).success).toBe(false);
    data.global_summary.healthy_services--;
    data.services[0].worker_threads_active = 51;
    expect(enterpriseTelemetrySchema.safeParse(data).success).toBe(false);
  });
  it("registers, configures, starts, stops and archives services with an audit trail", () => {
    const model = new EnterpriseModel();
    const result = model.saveService(
      null,
      registration(),
      "Register QA integration",
    );
    expect(result.ok).toBe(true);
    const id = result.id!;
    expect(model.snapshot().services.find((s) => s.id === id)?.status).toBe(
      "STOPPED",
    );
    expect(
      model.saveService(null, registration(), "Duplicate registration").ok,
    ).toBe(false);
    expect(model.lifecycle(id, "start", "Begin test processing").ok).toBe(true);
    expect(model.lifecycle(id, "archive", "Try archive running").ok).toBe(
      false,
    );
    expect(
      model.saveService(
        id,
        { ...registration(), worker_threads_max: 1, trace: "debug" },
        "Limit concurrency for diagnosis",
      ).ok,
    ).toBe(true);
    expect(model.snapshot().services.find((s) => s.id === id)).toMatchObject({
      worker_threads_active: 1,
      worker_threads_max: 1,
      config: { user_trace_enabled: true },
    });
    expect(model.lifecycle(id, "restart", "Apply revised settings").ok).toBe(
      true,
    );
    expect(model.lifecycle(id, "stop", "Conclude test processing").ok).toBe(
      true,
    );
    expect(model.lifecycle(id, "archive", "Archive test integration").ok).toBe(
      true,
    );
    expect(model.snapshot().services).toHaveLength(26);
    expect(
      model
        .getAudit()
        .filter((a) => a.service_id === id)
        .map((a) => a.action),
    ).toEqual([
      "ARCHIVE",
      "STOP",
      "RESTART",
      "UPDATE_CONFIG",
      "START",
      "REGISTER",
    ]);
  });
  it("validates both endpoint URLs and rejects credentials or unsupported protocols", () => {
    for (const endpoint of [
      "https://user:secret@bank.example",
      "https://bank.example?api_key=secret",
      "file:///etc/passwd",
    ]) {
      expect(
        metadataSchema.safeParse({ ...registration(), target_url: endpoint })
          .success,
      ).toBe(false);
      expect(
        metadataSchema.safeParse({ ...registration(), failover_url: endpoint })
          .success,
      ).toBe(false);
    }
    expect(
      metadataSchema.safeParse({ ...registration(), worker_threads_max: 51 })
        .success,
    ).toBe(false);
    expect(
      new EnterpriseModel().saveService(null, registration(), "x").ok,
    ).toBe(false);
  });
  it("blocks archives with outstanding queues and makes bulk replay atomic", () => {
    const model = new EnterpriseModel();
    const before = model.snapshot();
    const ids = before.queues.dlq_items.slice(0, 3).map((i) => i.id);
    model.lifecycle("kyc-verification-adapter", "stop", "Investigate failure");
    expect(model.handleDlq(ids, "retry", "Replay available messages").ok).toBe(
      false,
    );
    expect(model.snapshot().queues).toEqual(before.queues);
    expect(
      model.lifecycle(
        "kyc-verification-adapter",
        "archive",
        "Archive failed service",
      ).ok,
    ).toBe(false);
    model.lifecycle("kyc-verification-adapter", "start", "Recovery completed");
    expect(
      model.handleDlq(ids, "retry", "Downstream recovery verified").ok,
    ).toBe(true);
    expect(model.snapshot().queues.total_depth).toBe(
      before.queues.total_depth + 3,
    );
    expect(model.snapshot().queues.total_dlq).toBe(1);
    expect(model.handleDlq(ids, "retry", "Duplicate retry request").ok).toBe(
      false,
    );
  });
  it("masks nested JSON, namespaced XML, attributes and Base64 payloads", () => {
    const raw = JSON.stringify({
      account_number: "123456789012",
      nested: [{ password: "topsecret", authorization: "Bearer secret" }],
      amount: 150000,
      idempotency_key: "unique-1",
    });
    const masked = maskPayload(raw);
    expect(masked).not.toContain("123456789012");
    expect(masked).not.toContain("topsecret");
    expect(masked).toContain("unique-1");
    expect(
      maskPayload(
        '<p:accountNumber>123456789012</p:accountNumber><user token="topsecret"/>',
      ),
    ).not.toContain("topsecret");
    expect(
      maskPayload("<customer_name>Example Person</customer_name>"),
    ).not.toContain("Example Person");
    const encoded = maskPayload(Buffer.from(raw).toString("base64"));
    expect(encoded).toContain("Base64 decoded");
    expect(encoded).not.toContain("topsecret");
    expect(
      maskPayload(Buffer.from("opaque binary secret").toString("base64")),
    ).toContain("omitted");
  });
  it("persists registry changes, audit history and handled DLQ decisions", () => {
    const file = join(temporary(), "state.json");
    const first = new ControlRuntime({ controlStatePath: file });
    const id = first.model("Development").snapshot().queues.dlq_items[0].id;
    first.mutate("Development", (model) =>
      model.handleDlq([id], "discard", "Invalid test payload"),
    );
    first.mutate("Development", (model) =>
      model.saveService(null, registration(), "Register durable service"),
    );
    const restored = new ControlRuntime({ controlStatePath: file });
    expect(
      restored.model("Development").snapshot().global_summary.total_services,
    ).toBe(27);
    expect(
      restored.model("Production").snapshot().global_summary.total_services,
    ).toBe(26);
    expect(restored.model("Development").getAudit()).toHaveLength(2);
    expect(
      restored
        .model("Development")
        .handleDlq([id], "retry", "Attempt duplicate replay").ok,
    ).toBe(false);
  });
  it("rolls back a mutation if disk persistence fails", () => {
    const file = join(temporary(), "state.json");
    const control = new ControlRuntime({ controlStatePath: file });
    mkdirSync(file);
    expect(() =>
      control.mutate("Production", (model) =>
        model.saveService(null, registration(), "Register persistence check"),
      ),
    ).toThrow("No state change was committed");
    expect(
      control.model("Production").snapshot().global_summary.total_services,
    ).toBe(26);
    expect(control.model("Production").getAudit()).toHaveLength(0);
  });
});

describe("Enterprise HTTP and WebSocket workflows", () => {
  it("isolates environments and rejects malformed commands", async () => {
    const url = await start();
    expect(
      (
        await post(url, "/api/control/services?environment=Development", {
          service: registration(),
          reason: "Register integration test",
        })
      ).status,
    ).toBe(201);
    const development = await (
      await fetch(url + "/api/control/snapshot?environment=Development")
    ).json();
    const production = await (
      await fetch(url + "/api/control/snapshot?environment=Production")
    ).json();
    expect(development.global_summary.total_services).toBe(27);
    expect(production.global_summary.total_services).toBe(26);
    expect(
      (await fetch(url + "/api/control/snapshot?environment=unknown")).status,
    ).toBe(400);
    expect(
      (
        await post(url, "/api/control/services/payment-gateway/lifecycle", {
          action: "stop",
          reason: "x",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(url, "/api/control/services/payment-gateway/lifecycle", {
          action: "delete",
          reason: "invalid action",
        })
      ).status,
    ).toBe(400);
  });
  it("handles a concurrent replay once and records every successfully discarded message", async () => {
    const url = await start();
    const before = await (await fetch(url + "/api/control/snapshot")).json();
    const ids = before.queues.dlq_items
      .slice(0, 2)
      .map((i: { id: string }) => i.id);
    const results = await Promise.all(
      [1, 2].map(() =>
        post(url, "/api/control/dlq/actions", {
          ids,
          action: "retry",
          reason: "Partner is available again",
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await (await fetch(url + "/api/control/snapshot")).json();
    expect(after.queues.total_depth).toBe(before.queues.total_depth + 2);
    const remaining = after.queues.dlq_items.map((i: { id: string }) => i.id);
    expect(
      (
        await post(url, "/api/control/dlq/actions", {
          ids: remaining,
          action: "discard",
          reason: "Discard invalid test messages",
        })
      ).status,
    ).toBe(200);
    const detail = await (await fetch(url + "/api/control/details")).json();
    expect(
      detail.audit.map((a: { action: string }) => a.action).sort(),
    ).toEqual(["DISCARD", "DISCARD", "REQUEUE", "REQUEUE"]);
    expect((await fetch(url + `/api/control/dlq/${ids[0]}`)).status).toBe(404);
  });
  it("streams the exact enterprise contract for the selected environment", async () => {
    const url = await start({ pollMs: 40 });
    await post(url, "/api/control/services?environment=Development", {
      service: registration(),
      reason: "Test websocket environment",
    });
    const socket = new WebSocket(
      url.replace("http:", "ws:") + "/ws/telemetry?environment=Development",
    );
    const messages: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WebSocket timed out")),
        3000,
      );
      socket.on("message", (message) => {
        messages.push(JSON.parse(message.toString()));
        if (messages.length === 2) {
          clearTimeout(timer);
          resolve();
        }
      });
      socket.on("error", reject);
    });
    socket.close();
    for (const message of messages)
      expect(
        enterpriseTelemetrySchema.parse(message).global_summary.total_services,
      ).toBe(27);
  });
  it("protects enterprise payloads, exports and commands behind operator sessions", async () => {
    const url = await start({ operatorToken: "enterprise-test-access-token" });
    expect((await fetch(url + "/api/control/diagnostic-bundle")).status).toBe(
      401,
    );
    expect((await fetch(url + "/api/control/dlq/MSG-1204")).status).toBe(401);
    const response = await post(url, "/api/session", {
      token: "enterprise-test-access-token",
    });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const exported = await (
      await fetch(url + "/api/control/diagnostic-bundle", {
        headers: { Cookie: cookie },
      })
    ).text();
    expect(exported).toContain("[REDACTED]");
    expect(exported).not.toContain("demo-sensitive-token");
    expect(
      (
        await post(
          url,
          "/api/control/services/payment-gateway/lifecycle",
          { action: "stop", reason: "Authorized maintenance" },
          cookie,
        )
      ).status,
    ).toBe(200);
  });
  it("never substitutes demo telemetry or enables administration in live mode", async () => {
    const url = await start({
      mode: "live",
      operatorToken: "enterprise-live-test-token",
    });
    const session = await post(url, "/api/session", {
      token: "enterprise-live-test-token",
    });
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    expect(
      (
        await fetch(url + "/api/control/snapshot", {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await post(
          url,
          "/api/control/services",
          { service: registration(), reason: "Unconfigured live action" },
          cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      () =>
        new ControlRuntime({
          mode: "live",
          enterpriseCollectorUrl: "https://collector.example",
        }),
    ).toThrow("COLLECTOR_TOKEN");
    expect(
      () =>
        new ControlRuntime({
          production: true,
          enterpriseCollectorUrl: "http://collector.example",
        }),
    ).toThrow("HTTPS");
  });
});

it("exports quoted CSV with embedded newlines and guards formula-like event text", () => {
  const csv = logsToCsv([
    {
      timestamp: "2026-10-06T01:00:00Z",
      level: "INFO",
      service_id: "payment-gateway",
      kind: "audit",
      message: ' =HYPERLINK("bad")',
      raw: 'First line\n"quoted", second line',
      remediation: "Inspect the source",
    },
  ]);
  expect(csv).toContain('"Timestamp","Level","Service"');
  expect(csv).toContain('"\' =HYPERLINK(""bad"")"');
  expect(csv).toContain('"First line\n""quoted"", second line"');
});

it("drains recovered queues and handles an empty registry without phantom failures", () => {
  const model = new EnterpriseModel();
  for (let i = 0; i < 10; i++) model.tick();
  expect(
    model.snapshot().services.find((s) => s.id === "qris-dynamic")?.queue_depth,
  ).toBe(0);
  const state = model.getState();
  state.services = [];
  state.registry = {};
  state.dlq = [];
  state.total = 0;
  state.errors = 0;
  const empty = new EnterpriseModel("Development", state);
  for (let i = 0; i < 20; i++)
    expect(enterpriseTelemetrySchema.safeParse(empty.tick()).success).toBe(
      true,
    );
  expect(empty.snapshot().global_summary.total_errors_today).toBe(0);
});
