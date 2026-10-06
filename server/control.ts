import type { Express, Request } from "express";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { EnterpriseModel } from "../shared/enterpriseModel.ts";
import type { EnterpriseState } from "../shared/enterpriseModel.ts";
import {
  enterpriseTelemetrySchema,
  environmentSchema,
  environments,
  metadataSchema,
  maskPayload,
} from "../shared/enterprise.ts";
import type {
  ControlResult,
  Environment,
  TelemetryPayload,
} from "../shared/enterprise.ts";
import type { MonitoringRuntime, ServerOptions } from "./app.ts";

export class ControlRuntime {
  readonly models = new Map<Environment, EnterpriseModel>();
  private live = new Map<Environment, TelemetryPayload>();
  private collecting = false;
  constructor(readonly options: ServerOptions) {
    if (options.enterpriseCollectorUrl) {
      const u = new URL(options.enterpriseCollectorUrl);
      if (
        u.username ||
        u.password ||
        !["http:", "https:"].includes(u.protocol) ||
        (options.production && u.protocol !== "https:")
      )
        throw new Error(
          "Use an HTTPS collector URL without embedded credentials.",
        );
      if (options.mode === "live" && !options.enterpriseCollectorToken)
        throw new Error(
          "COLLECTOR_TOKEN is required for the enterprise collector.",
        );
    }
    let saved: Partial<Record<Environment, EnterpriseState>> = {};
    if (options.controlStatePath && existsSync(options.controlStatePath)) {
      const parsed = JSON.parse(readFileSync(options.controlStatePath, "utf8"));
      if (parsed.version !== 1 || !parsed.environments)
        throw new Error("Unsupported control state file.");
      saved = parsed.environments;
    }
    for (const environment of environments) {
      const state = saved[environment];
      if (state) {
        state.services.forEach((s) => {
          if (!metadataSchema.safeParse(state.registry[s.id]).success)
            throw new Error("Invalid persisted service configuration.");
        });
      }
      const model = new EnterpriseModel(environment, state);
      enterpriseTelemetrySchema.parse(model.snapshot());
      this.models.set(environment, model);
    }
  }
  model(env: Environment) {
    return this.models.get(env)!;
  }
  async tick() {
    if (this.options.mode !== "live") {
      for (const model of this.models.values()) model.tick();
      return;
    }
    if (this.collecting) return;
    this.collecting = true;
    try {
      await Promise.all(
        environments.map(async (env) => {
          try {
            if (!this.options.enterpriseCollectorUrl)
              throw new Error("No enterprise collector.");
            const url = new URL(this.options.enterpriseCollectorUrl);
            url.searchParams.set("environment", env);
            const response = await fetch(url, {
              headers: this.options.enterpriseCollectorToken
                ? {
                    Authorization: `Bearer ${this.options.enterpriseCollectorToken}`,
                  }
                : {},
              redirect: "error",
              signal: AbortSignal.timeout(4000),
            });
            if (!response.ok) throw new Error("Collector unavailable.");
            const snapshot = enterpriseTelemetrySchema.parse(
              await response.json(),
            );
            snapshot.queues.dlq_items = snapshot.queues.dlq_items.map((i) => ({
              ...i,
              payload: maskPayload(i.payload),
            }));
            this.live.set(env, snapshot);
          } catch {
            this.live.delete(env);
          }
        }),
      );
    } finally {
      this.collecting = false;
    }
  }
  snapshot(env: Environment) {
    if (this.options.mode !== "live") return this.model(env).snapshot();
    const data = this.live.get(env);
    const age = data ? Date.now() - Date.parse(data.timestamp) : Infinity;
    return data && age <= 5000 && age >= -5000 ? data : null;
  }
  mutate(env: Environment, action: (model: EnterpriseModel) => ControlResult) {
    const model = this.model(env),
      before = model.getState();
    const result = action(model);
    if (result.ok) {
      try {
        this.persist();
      } catch {
        this.models.set(env, new EnterpriseModel(env, before));
        throw new Error(
          "Could not persist operation. No state change was committed.",
        );
      }
    }
    return result;
  }
  persist() {
    if (!this.options.controlStatePath || this.options.mode === "live") return;
    mkdirSync(dirname(this.options.controlStatePath), { recursive: true });
    const tmp = `${this.options.controlStatePath}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify({
        version: 1,
        environments: Object.fromEntries(
          [...this.models].map(([key, value]) => [key, value.getState()]),
        ),
      }),
      { mode: 0o600 },
    );
    renameSync(tmp, this.options.controlStatePath);
  }
}
const mutationSchema = z.object({ reason: z.string().trim().min(5).max(500) });
const envOf = (req: Request) =>
  environmentSchema.safeParse(req.query.environment ?? "Production");
export function attachControlRoutes(
  app: Express,
  runtime: MonitoringRuntime,
  options: ServerOptions,
  control: ControlRuntime,
) {
  app.use("/api/control", (req, res, next) => {
    const env = envOf(req);
    if (!env.success) {
      res.status(400).json({ ok: false, message: "Unknown environment." });
      return;
    }
    res.locals.environment = env.data;
    next();
  });
  app.get("/api/control/snapshot", (_req, res) => {
    const data = control.snapshot(res.locals.environment);
    if (!data) {
      res.status(503).json({
        ok: false,
        message:
          "Enterprise collector is unavailable or stale. No demo data was substituted.",
      });
      return;
    }
    res.json(data);
  });
  app.get("/api/control/details", (_req, res) => {
    if (options.mode === "live") {
      res.json({
        registry: {},
        queues: [],
        audit: [],
        mode: "live",
        actionsEnabled: false,
      });
      return;
    }
    const model = control.model(res.locals.environment);
    res.json({
      registry: model.getRegistry(),
      queues: model.queueMetrics(),
      audit: model.getAudit(),
      mode: "mock",
      actionsEnabled: true,
    });
  });
  app.get("/api/control/dlq/:id", runtime.security.rateLimit, (req, res) => {
    if (options.mode === "live") {
      res.status(403).json({
        ok: false,
        message: "Live payload inspection requires a masked payload provider.",
      });
      return;
    }
    try {
      res.json(
        control.model(res.locals.environment).payload(String(req.params.id)),
      );
    } catch {
      res.status(404).json({ ok: false, message: "Message not found." });
    }
  });
  app.use("/api/control", (req, res, next) => {
    if (req.method === "GET") {
      next();
      return;
    }
    if (options.mode === "live") {
      res.status(403).json({
        ok: false,
        message:
          "Live configuration and lifecycle writes are disabled until an audited IBM administration provider is configured.",
      });
      return;
    }
    runtime.security.rateLimit(req, res, next);
  });
  app.post("/api/control/services", (req, res) => {
    const body = z
      .object({
        service: metadataSchema,
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        message: body.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    const result = control.mutate(res.locals.environment, (model) =>
      model.saveService(null, body.data.service, body.data.reason),
    );
    res.status(result.ok ? 201 : 409).json(result);
  });
  app.put("/api/control/services/:id", (req, res) => {
    const body = z
      .object({
        service: metadataSchema,
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        message: body.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    const result = control.mutate(res.locals.environment, (model) =>
      model.saveService(
        String(req.params.id),
        body.data.service,
        body.data.reason,
      ),
    );
    res.status(result.ok ? 200 : 409).json(result);
  });
  app.post("/api/control/services/:id/lifecycle", (req, res) => {
    const body = mutationSchema
      .extend({ action: z.enum(["start", "stop", "restart", "archive"]) })
      .strict()
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        message:
          "Provide a valid action and an audit reason of at least 5 characters.",
      });
      return;
    }
    const result = control.mutate(res.locals.environment, (model) =>
      model.lifecycle(
        String(req.params.id),
        body.data.action,
        body.data.reason,
      ),
    );
    res.status(result.ok ? 200 : 409).json(result);
  });
  app.post("/api/control/dlq/actions", (req, res) => {
    const body = mutationSchema
      .extend({
        action: z.enum(["retry", "discard"]),
        ids: z.array(z.string().min(1).max(160)).min(1).max(100),
      })
      .strict()
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        message:
          "Select 1–100 messages and provide an audit reason of at least 5 characters.",
      });
      return;
    }
    const result = control.mutate(res.locals.environment, (model) =>
      model.handleDlq(body.data.ids, body.data.action, body.data.reason),
    );
    res.status(result.ok ? 200 : 409).json(result);
  });
  app.get("/api/control/diagnostic-bundle", (_req, res) => {
    const env = res.locals.environment as Environment;
    const snapshot = control.snapshot(env);
    if (!snapshot) {
      res
        .status(503)
        .json({ ok: false, message: "No verified snapshot available." });
      return;
    }
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="flowstead-diagnostics.json"',
    );
    res.json({
      exported_at: new Date().toISOString(),
      environment: env,
      mode: options.mode ?? "mock",
      telemetry: snapshot,
      audit: options.mode === "live" ? [] : control.model(env).getAudit(),
      masking:
        "Known sensitive payload fields are redacted. Validate organization-specific masking policies before production use.",
    });
  });
}
