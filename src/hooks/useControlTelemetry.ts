import { useCallback, useEffect, useRef, useState } from "react";
import { EnterpriseModel } from "../../shared/enterpriseModel";
import { enterpriseTelemetrySchema } from "../../shared/enterprise";
import type {
  AuditEntry,
  ControlResult,
  EnterpriseHistory,
  Environment,
  QueueMetric,
  Registry,
  TelemetryPayload,
} from "../../shared/enterprise";
import type { AppConfig } from "../../shared/types";
export type Source =
  | "connecting"
  | "server"
  | "fallback"
  | "reconnecting"
  | "unauthorized"
  | "unavailable";
export function useControlTelemetry(environment: Environment) {
  const [snapshot, setSnapshot] = useState<TelemetryPayload | null>(null),
    [registry, setRegistry] = useState<Registry>({}),
    [queues, setQueues] = useState<QueueMetric[]>([]),
    [audit, setAudit] = useState<AuditEntry[]>([]),
    [history, setHistory] = useState<EnterpriseHistory[]>([]);
  const [source, setSource] = useState<Source>("connecting"),
    [config, setConfig] = useState<AppConfig | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [lastReceived, setLastReceived] = useState(0),
    [now, setNow] = useState(Date.now());
  const models = useRef(new Map<Environment, EnterpriseModel>()),
    sourceRef = useRef<Source>("connecting"),
    configRef = useRef<AppConfig | null>(null),
    lastRef = useRef(0),
    pendingRef = useRef(false),
    reconnectRef = useRef(() => {}),
    epoch = useRef(0),
    abortRef = useRef<AbortController | null>(null);
  if (!models.current.has(environment))
    models.current.set(environment, new EnterpriseModel(environment));
  const changeSource = useCallback((s: Source) => {
    sourceRef.current = s;
    setSource(s);
  }, []);
  const accept = useCallback((value: unknown) => {
    const data = enterpriseTelemetrySchema.parse(value);
    setSnapshot(data);
    lastRef.current = Date.now();
    setLastReceived(lastRef.current);
    setHistory((h) => {
      const prev = h[h.length - 1];
      return [
        ...h.filter(
          (p) =>
            p.timestamp !== data.timestamp &&
            Date.parse(p.timestamp) > Date.parse(data.timestamp) - 60000,
        ),
        {
          timestamp: data.timestamp,
          tps: data.global_summary.global_tps,
          heap: data.global_summary.heap_memory_pct,
          cpu: data.global_summary.cpu_pct,
          gc: !!prev && prev.heap - data.global_summary.heap_memory_pct > 5,
        },
      ].slice(-61);
    });
  }, []);
  const url = useCallback(
    (path: string) =>
      `${path}${path.includes("?") ? "&" : "?"}environment=${encodeURIComponent(environment)}`,
    [environment],
  );
  const request = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const response = await fetch(url(path), {
        credentials: "same-origin",
        ...options,
        signal: options.signal ?? AbortSignal.timeout(7000),
      });
      const value = await response
        .json()
        .catch(() => ({
          message: "The monitoring server returned an invalid response.",
        }));
      if (response.status === 401) {
        changeSource("unauthorized");
        throw new Error("Operator authentication required.");
      }
      if (!response.ok)
        throw new Error(
          value.message ?? `Request failed (${response.status}).`,
        );
      return value;
    },
    [url, changeSource],
  );
  const localDetails = useCallback(() => {
    const model = models.current.get(environment)!;
    setRegistry(model.getRegistry());
    setQueues(model.queueMetrics());
    setAudit(model.getAudit());
  }, [environment]);
  const refresh = useCallback(async () => {
    const version = epoch.current;
    const data = await request("/api/control/snapshot");
    if (version !== epoch.current) return;
    accept(data);
    const d = await request("/api/control/details");
    if (version !== epoch.current) return;
    setRegistry(d.registry);
    setQueues(d.queues);
    setAudit(d.audit);
  }, [request, accept]);
  useEffect(() => {
    epoch.current++;
    setSnapshot(null);
    setHistory([]);
    setRegistry({});
    setQueues([]);
    setAudit([]);
    lastRef.current = 0;
    setLastReceived(0);
    changeSource("connecting");
    setError("");
    let gone = false,
      ws: WebSocket | null = null,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempt = 0,
      busy = false;
    const fallback = () => {
      if (
        gone ||
        configRef.current?.mode === "live" ||
        configRef.current?.authenticationRequired
      )
        return;
      changeSource("fallback");
      accept(models.current.get(environment)!.snapshot());
      localDetails();
    };
    const schedule = () => {
      if (gone || sourceRef.current === "unauthorized") return;
      clearTimeout(retry);
      retry = setTimeout(
        connect,
        Math.min(30000, 1000 * 2 ** Math.min(5, attempt++)) +
          Math.random() * 250,
      );
    };
    const connect = async () => {
      if (gone || busy) return;
      busy = true;
      try {
        const settings: AppConfig = await request("/api/config");
        if (gone) return;
        configRef.current = settings;
        setConfig(settings);
        await refresh();
        if (gone) return;
        ws = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/telemetry?environment=${encodeURIComponent(environment)}`,
        );
        ws.onopen = () => {
          if (gone) return;
          attempt = 0;
          changeSource("server");
          setError("");
        };
        ws.onmessage = (event) => {
          if (gone) return;
          try {
            accept(JSON.parse(event.data));
            setError("");
          } catch {
            setError("Invalid telemetry schema. Previous snapshot retained.");
          }
        };
        ws.onclose = () => {
          if (gone) return;
          changeSource("reconnecting");
          schedule();
        };
        ws.onerror = () => {
          if (!gone)
            setError("Stream disconnected. Automatic reconnect is active.");
        };
      } catch (e) {
        if (gone) return;
        setError(
          e instanceof Error ? e.message : "Unable to reach monitoring server.",
        );
        if (sourceRef.current !== "unauthorized") {
          if (configRef.current?.mode === "live") {
            changeSource("unavailable");
          } else fallback();
          schedule();
        }
      } finally {
        busy = false;
      }
    };
    reconnectRef.current = () => {
      clearTimeout(retry);
      ws?.close();
      void connect();
    };
    void connect();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (sourceRef.current === "fallback") {
        accept(models.current.get(environment)!.tick());
        localDetails();
      }
    }, 1000);
    const detailTimer = setInterval(() => {
      if (sourceRef.current !== "server") return;
      void request("/api/control/details")
        .then((d) => {
          if (!gone) {
            setRegistry(d.registry);
            setQueues(d.queues);
            setAudit(d.audit);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => {
      gone = true;
      epoch.current++;
      clearTimeout(retry);
      clearInterval(timer);
      clearInterval(detailTimer);
      ws?.close();
      abortRef.current?.abort();
    };
  }, [environment, request, refresh, accept, localDetails, changeSource]);
  const stale =
    !lastReceived ||
    now - lastReceived > 5000 ||
    (!!snapshot && now - Date.parse(snapshot.timestamp) > 7000);
  const writable =
    (source === "fallback" ||
      (source === "server" && config?.mode === "mock")) &&
    !stale;
  const mutate = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      method = "POST",
    ): Promise<ControlResult> => {
      if (pendingRef.current)
        return {
          ok: false,
          message: "Wait for the current operation to finish.",
        };
      if (
        Date.now() - lastRef.current > 5000 ||
        !["server", "fallback"].includes(sourceRef.current)
      )
        return {
          ok: false,
          message: "Fresh telemetry is required before changing state.",
        };
      if (sourceRef.current === "server" && configRef.current?.mode !== "mock")
        return {
          ok: false,
          message: "Live administration provider is not configured.",
        };
      pendingRef.current = true;
      setPending(true);
      const version = epoch.current;
      try {
        let result: ControlResult;
        if (sourceRef.current === "fallback") {
          const model = models.current.get(environment)!;
          const segments = path.split("/");
          if (path.endsWith("/lifecycle"))
            result = model.lifecycle(
              segments[segments.length - 2],
              body.action as "start" | "stop" | "restart" | "archive",
              String(body.reason),
            );
          else if (path.endsWith("/dlq/actions"))
            result = model.handleDlq(
              body.ids as string[],
              body.action as "retry" | "discard",
              String(body.reason),
            );
          else
            result = model.saveService(
              method === "PUT" ? segments.at(-1)! : null,
              body.service,
              String(body.reason),
            );
          accept(model.snapshot());
          localDetails();
        } else {
          const controller = new AbortController();
          abortRef.current = controller;
          result = await request(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          });
          if (version === epoch.current) await refresh();
        }
        return result;
      } catch (e) {
        return {
          ok: false,
          message:
            e instanceof Error
              ? e.message
              : "Operation failed. Verify current state before retrying.",
        };
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [environment, request, accept, refresh, localDetails],
  );
  const payload = useCallback(
    async (id: string) =>
      sourceRef.current === "fallback"
        ? models.current.get(environment)!.payload(id)
        : request(`/api/control/dlq/${encodeURIComponent(id)}`),
    [environment, request],
  );
  const login = async (token: string) => {
    await request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    reconnectRef.current();
  };
  return {
    snapshot,
    registry,
    queues,
    audit,
    history,
    source,
    config,
    error,
    pending,
    stale,
    writable,
    lastReceived,
    mutate,
    payload,
    login,
    reconnect: () => reconnectRef.current(),
  };
}
