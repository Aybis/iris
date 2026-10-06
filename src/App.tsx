import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  FileJson,
  GitBranch,
  Grid2X2,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LivingTownView from "./components/LivingTownView";
import HeaderPulse from "./components/HeaderPulse";
import ServiceCatalog, { emptyFilters } from "./components/ServiceCatalog";
import type { CatalogFilters } from "./components/ServiceCatalog";
import ProcessFlowInspector from "./components/ProcessFlowInspector";
import ServiceConfigModal from "./components/ServiceConfigModal";
import QueueAndDlqManager from "./components/QueueAndDlqManager";
import IncidentLogStream, {
  downloadFile,
} from "./components/IncidentLogStream";
import type { LogRecord } from "./components/IncidentLogStream";
import { useControlTelemetry } from "./hooks/useControlTelemetry";
import { environments, maskPayload } from "../shared/enterprise";
import type {
  ControlAction,
  ControlResult,
  Environment,
  ServiceMetadata,
} from "../shared/enterprise";
import { translateBip } from "../shared/translator";

type Page = "town" | "overview" | "catalog" | "detail" | "queues" | "logs";
type Inspect =
  | { type: "event"; event: LogRecord }
  | { type: "payload"; id: string }
  | { type: "connection" }
  | { type: "help" };
type Confirmation =
  | { kind: "lifecycle"; serviceId: string; action: ControlAction }
  | { kind: "dlq"; ids: string[]; action: "retry" | "discard" };
const pageNames: Record<Page, string> = {
  town: "Living Town",
  overview: "Global overview",
  catalog: "Service catalog",
  detail: "Service deep dive",
  queues: "Queues & dead letters",
  logs: "Logs & audit explorer",
};
export default function App() {
  const [environment, setEnvironment] = useState<Environment>("Production"),
    [page, setPage] = useState<Page>("town"),
    [selectedId, setSelectedId] = useState("payment-gateway"),
    [filters, setFilters] = useState<CatalogFilters>(emptyFilters),
    [configId, setConfigId] = useState<string | null | undefined>(undefined),
    [inspect, setInspect] = useState<Inspect | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [reason, setReason] = useState(""),
    [actionError, setActionError] = useState(""),
    [toast, setToast] = useState<ControlResult | null>(null),
    [payload, setPayload] = useState<unknown>(null),
    [payloadError, setPayloadError] = useState(""),
    [token, setToken] = useState(""),
    [authPending, setAuthPending] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [clock, setClock] = useState(new Date());
  const feed = useControlTelemetry(environment),
    data = feed.snapshot;
  const lastNocPage = useRef<Page>("overview");
  const [queueTab, setQueueTab] = useState<"queues" | "dlq">("dlq");
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>();
  const selected = data?.services.find((s) => s.id === selectedId);
  const drawer = useRef<HTMLDialogElement>(null),
    confirmDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (inspect) drawer.current?.showModal();
    else drawer.current?.close();
  }, [inspect]);
  useEffect(() => {
    if (confirmation) {
      setReason("");
      setActionError("");
      confirmDialog.current?.showModal();
    } else confirmDialog.current?.close();
  }, [confirmation]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (inspect?.type !== "payload") return;
    let cancelled = false;
    setPayload(null);
    setPayloadError("");
    feed
      .payload(inspect.id)
      .then((value) => {
        if (!cancelled) setPayload(value);
      })
      .catch((e) => {
        if (!cancelled)
          setPayloadError(
            e instanceof Error ? e.message : "Payload unavailable.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [inspect, feed.payload]);
  const source =
    feed.source === "fallback"
      ? "Local fallback simulation"
      : feed.config?.mode === "live"
        ? "Live collector"
        : "Server simulation";
  const demo = feed.config?.mode !== "live";
  const sourceUp = feed.source === "server" && !feed.stale;
  function go(next: Page) {
    if (next !== "town") lastNocPage.current = next;
    setPage(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function chooseService(id: string, nodeId?: string) {
    setSelectedId(id);
    setFocusNodeId(nodeId);
    go("detail");
  }
  function changeEnvironment(value: Environment) {
    setEnvironment(value);
    setInspect(null);
    setConfirmation(null);
    setConfigId(undefined);
    setFilters(emptyFilters);
    setSelectedId("payment-gateway");
    setPage((p) => (p === "town" ? "town" : "overview"));
  }
  async function saveService(
    id: string | null,
    service: ServiceMetadata,
    auditReason: string,
  ) {
    const result = await feed.mutate(
      id
        ? `/api/control/services/${encodeURIComponent(id)}`
        : "/api/control/services",
      { service, reason: auditReason },
      id ? "PUT" : "POST",
    );
    setToast(result);
    return result;
  }
  function lifecycle(id: string, action: ControlAction) {
    setConfigId(undefined);
    setConfirmation({ kind: "lifecycle", serviceId: id, action });
  }
  async function perform() {
    if (!confirmation) return;
    if (reason.trim().length < 5) {
      setActionError("Enter an audit reason of at least 5 characters.");
      return;
    }
    const result =
      confirmation.kind === "lifecycle"
        ? await feed.mutate(
            `/api/control/services/${encodeURIComponent(confirmation.serviceId)}/lifecycle`,
            { action: confirmation.action, reason },
          )
        : await feed.mutate("/api/control/dlq/actions", {
            action: confirmation.action,
            ids: confirmation.ids,
            reason,
          });
    setToast(result);
    if (result.ok) {
      if (
        confirmation.kind === "lifecycle" &&
        confirmation.action === "archive"
      )
        go("catalog");
      setConfirmation(null);
    } else setActionError(result.message);
  }
  function bundle() {
    if (!data) return;
    downloadFile(
      `flowstead-${environment.replaceAll(/[^A-Za-z]/g, "-")}-diagnostics.json`,
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          environment,
          source,
          telemetry: data,
          registry: feed.registry,
          audit: feed.audit,
          masking: "Payload credentials and personal fields are redacted.",
        },
        null,
        2,
      ),
    );
    setToast({ ok: true, message: "Masked diagnostic bundle exported." });
  }
  const nav = [
    { page: "town" as Page, label: "Living Town", icon: Sprout },
    { page: "overview" as Page, label: "Global overview", icon: Grid2X2 },
    {
      page: "catalog" as Page,
      label: "Service catalog",
      icon: Layers3,
      count: data?.global_summary.total_services ?? 26,
    },
    { page: "detail" as Page, label: "Service deep dive", icon: GitBranch },
    {
      page: "queues" as Page,
      label: "Queues & DLQ",
      icon: Boxes,
      count: data?.queues.total_dlq,
    },
    { page: "logs" as Page, label: "Logs & audit", icon: Terminal },
  ];
  return (
    <div className="control-plane">
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`enterprise-sidebar ${sidebarOpen ? "open" : ""}`}>
        <a
          href="#"
          className="enterprise-brand"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span>
            <Layers3 size={24} />
          </span>
          <strong>
            flowstead<span>CONTROL PLANE</span>
          </strong>
        </a>
        <div className="workspace-picker">
          <span className="workspace-symbol">
            <Database size={18} />
          </span>
          <div>
            <strong>Enterprise middleware</strong>
            <small>IBM ACE & IBM MQ</small>
          </div>
          <ChevronDown size={12} />
        </div>
        <p className="nav-caption">OBSERVABILITY</p>
        <nav>
          {nav.map((item) => (
            <button
              key={item.page}
              aria-current={page === item.page ? "page" : undefined}
              className={page === item.page ? "active" : ""}
              onClick={() => go(item.page)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.count !== undefined && (
                <b
                  className={
                    item.page === "queues" && item.count ? "warn-count" : ""
                  }
                >
                  {item.count}
                </b>
              )}
            </button>
          ))}
        </nav>
        <p className="nav-caption management-caption">MANAGEMENT</p>
        <button
          className="sidebar-link"
          onClick={() => {
            setPage("catalog");
            setConfigId(
              feed.registry[selectedId]
                ? selectedId
                : (Object.keys(feed.registry)[0] ?? null),
            );
          }}
          disabled={!feed.writable}
        >
          <SlidersHorizontal size={17} />
          Service configuration
        </button>
        <button
          className="sidebar-link"
          onClick={() => setInspect({ type: "connection" })}
        >
          <Server size={17} />
          Connections & access
        </button>
        <div className="sidebar-bottom">
          <div className="cluster-mini">
            <span>
              <i className={`dot ${sourceUp ? "healthy" : "warning"}`} />
              <strong>
                {sourceUp ? "Telemetry connected" : "Telemetry status"}
              </strong>
            </span>
            <p>{source}</p>
            <small>
              {demo
                ? "SANDBOX DATA · NO LIVE WRITES"
                : "LIVE COLLECTOR · READ ONLY"}
            </small>
          </div>
          <button
            className="sidebar-link"
            onClick={() => setInspect({ type: "help" })}
          >
            <BookOpen size={16} />
            Platform guide <ArrowRight size={12} />
          </button>
          <div className="operator-info">
            <span>OP</span>
            <div>
              <strong>Platform operator</strong>
              <small>Operations workspace</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="enterprise-main">
        <header className="enterprise-topbar">
          <div className="breadcrumb">
            <button
              className="mobile-nav-button icon-button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-controls">
            <div
              className="view-mode-toggle"
              role="group"
              aria-label="Dashboard view mode"
            >
              <button
                aria-pressed={page !== "town"}
                onClick={() => go(lastNocPage.current)}
              >
                <Grid2X2 size={13} />
                <span>NOC Operations</span>
              </button>
              <button aria-pressed={page === "town"} onClick={() => go("town")}>
                <Sprout size={14} />
                <span>Living Town</span>
              </button>
            </div>
            <span className="telemetry-stream">
              <i className={`dot ${sourceUp ? "healthy" : "warning"}`} />
              {sourceUp ? "Live updates" : "Reconnecting"}
            </span>
            <span className="topbar-divider" />
            <label className="environment-select">
              <span
                className={`environment-dot ${environment === "Production" ? "prod" : ""}`}
              />
              <select
                aria-label="Environment"
                value={environment}
                onChange={(e) =>
                  changeEnvironment(e.target.value as Environment)
                }
                disabled={feed.pending}
              >
                {environments.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
              <ChevronDown size={12} />
            </label>
            <button
              className="icon-button"
              aria-label="Connection details"
              onClick={() => setInspect({ type: "connection" })}
            >
              <Radio size={16} />
            </button>
          </div>
        </header>
        <main className="enterprise-content">
          <div className="enterprise-page-heading">
            <div>
              <div className="eyebrow">ENTERPRISE INTEGRATION PLATFORM</div>
              <h1>{pageNames[page]}</h1>
              <p>
                {page === "town"
                  ? "Watch your integrations come to life. Follow the crates, find the bottleneck."
                  : page === "overview"
                    ? "A unified view of every service, transaction, and integration runtime."
                    : page === "catalog"
                      ? "Discover, inspect, and manage your enterprise integration services."
                      : page === "detail"
                        ? "Follow every processing step. Isolate the bottleneck."
                        : page === "queues"
                          ? "Manage message backlogs and recover failed transactions."
                          : "Investigate incidents and review every operator change."}
              </p>
            </div>
            <div className="page-time">
              <span className="demo-tag">
                {demo ? "SIMULATED ENVIRONMENT" : "LIVE COLLECTOR"}
              </span>
              <span>
                <Clock3 size={12} />
                {clock.toLocaleTimeString("en-GB", {
                  timeZone: "Asia/Jakarta",
                })}{" "}
                WIB <small>·</small>{" "}
                {clock.toLocaleDateString("en-GB", {
                  timeZone: "Asia/Jakarta",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          {(feed.source === "fallback" ||
            feed.stale ||
            feed.source === "unauthorized") && (
            <div className="connection-banner" role="status">
              <TriangleAlert size={16} />
              <div>
                <strong>
                  {feed.source === "fallback"
                    ? "Local fallback simulation"
                    : feed.source === "unauthorized"
                      ? "Operator access required"
                      : feed.source === "connecting"
                        ? "Connecting to the telemetry service"
                        : "Telemetry is stale"}
                </strong>
                <span>
                  {feed.source === "fallback"
                    ? "Backend unavailable. Demo state runs locally; actions are not persisted to the server."
                    : feed.error ||
                      "Waiting for a fresh, validated enterprise snapshot."}
                </span>
              </div>
              <button
                onClick={() =>
                  feed.source === "unauthorized"
                    ? setInspect({ type: "connection" })
                    : feed.reconnect()
                }
              >
                {feed.source === "unauthorized" ? "Authenticate" : "Reconnect"}
                <ArrowRight size={13} />
              </button>
            </div>
          )}
          {data && feed.source !== "unauthorized" ? (
            <>
              <HeaderPulse
                data={data}
                history={feed.history}
                onStatus={(status) => {
                  setFilters({ ...emptyFilters, status });
                  go("catalog");
                }}
              />
              {page === "town" && (
                <LivingTownView
                  key={environment}
                  data={data}
                  registry={feed.registry}
                  selectedId={selectedId}
                  demo={demo}
                  stale={feed.stale}
                  writable={feed.writable && !feed.pending}
                  onFocus={setSelectedId}
                  onPipeline={chooseService}
                  onConfigure={setConfigId}
                  onQueues={(tab) => {
                    setQueueTab(tab);
                    go("queues");
                  }}
                />
              )}
              {(page === "overview" || page === "catalog") && (
                <>
                  {page === "overview" &&
                    data.global_summary.degraded_services > 0 && (
                      <div className="overview-alert">
                        <span>
                          <TriangleAlert size={16} />
                          <strong>
                            {data.global_summary.degraded_services} services
                            need attention
                          </strong>
                          <small>
                            Inspect degraded services to identify latency and
                            processing failures.
                          </small>
                        </span>
                        <button
                          onClick={() => {
                            setFilters({ ...emptyFilters, status: "DEGRADED" });
                            go("catalog");
                          }}
                        >
                          Investigate services <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                  <ServiceCatalog
                    services={data.services}
                    registry={feed.registry}
                    filters={filters}
                    onFilters={setFilters}
                    onSelect={chooseService}
                    onConfigure={setConfigId}
                    onCreate={() => setConfigId(null)}
                    writable={feed.writable && !feed.pending}
                  />
                  {page === "overview" && (
                    <div className="overview-bottom">
                      <section className="panel">
                        <div className="panel-title-row">
                          <div>
                            <h3>Integration runtime</h3>
                            <p>JVM heap allocation · last 60 seconds</p>
                          </div>
                          <span
                            className={`status-pill ${data.global_summary.heap_memory_pct > 85 || data.global_summary.cpu_pct > 85 ? "warning" : "healthy"}`}
                          >
                            <span className="status-dot" />{" "}
                            {data.global_summary.heap_memory_pct > 85 ||
                            data.global_summary.cpu_pct > 85
                              ? "Capacity warning"
                              : "Within capacity"}
                          </span>
                        </div>
                        <div className="overview-heap-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={feed.history}
                              margin={{
                                top: 10,
                                right: 12,
                                left: -24,
                                bottom: 0,
                              }}
                            >
                              <CartesianGrid
                                stroke="#26344a"
                                strokeDasharray="3 4"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="timestamp"
                                tickFormatter={(v) =>
                                  new Date(v).toLocaleTimeString("en-GB", {
                                    timeZone: "Asia/Jakarta",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })
                                }
                                tick={{ fontSize: 9, fill: "#7084a1" }}
                                minTickGap={65}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                domain={[0, 100]}
                                ticks={[0, 50, 100]}
                                tick={{ fontSize: 9, fill: "#7084a1" }}
                                tickFormatter={(v) => `${v}%`}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "#101b2d",
                                  border: "1px solid #31435c",
                                  fontSize: 11,
                                }}
                                labelFormatter={(v) =>
                                  new Date(String(v)).toLocaleTimeString(
                                    "en-GB",
                                    { timeZone: "Asia/Jakarta" },
                                  )
                                }
                              />
                              <Area
                                dataKey="heap"
                                stroke="#38bdf8"
                                fill="#38bdf819"
                                strokeWidth={1.5}
                                isAnimationActive={false}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="section-footnote">
                          Heap drops may indicate garbage collection; a single
                          value does not identify a memory leak.
                        </p>
                      </section>
                      <section className="panel recent-events">
                        <div className="panel-title-row">
                          <h3>Latest signals</h3>
                          <button onClick={() => go("logs")}>
                            Open journal <ArrowRight size={12} />
                          </button>
                        </div>
                        {data.incidents.slice(0, 4).map((i) => (
                          <button
                            key={i.id}
                            onClick={() =>
                              setInspect({
                                type: "event",
                                event: {
                                  id: i.id,
                                  timestamp: i.timestamp,
                                  service_id: i.service_id,
                                  level: i.level,
                                  raw: i.raw_bip_code,
                                  message: i.diagnostic_message,
                                  remediation: i.remediation_hint,
                                  kind: "incident",
                                },
                              })
                            }
                          >
                            <i
                              className={`dot ${i.level === "WARN" ? "warning" : i.level === "INFO" ? "info" : "critical"}`}
                            />
                            <span>
                              <strong>
                                {data.services.find(
                                  (s) => s.id === i.service_id,
                                )?.name ?? i.service_id}
                              </strong>
                              <small>{i.diagnostic_message}</small>
                            </span>
                            <time>
                              {new Date(i.timestamp).toLocaleTimeString(
                                "en-GB",
                                {
                                  timeZone: "Asia/Jakarta",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </time>
                          </button>
                        ))}
                      </section>
                    </div>
                  )}
                </>
              )}
              {page === "detail" &&
                (selected ? (
                  <ProcessFlowInspector
                    initialNodeId={focusNodeId}
                    key={`${environment}:${selected.id}`}
                    service={selected}
                    metadata={feed.registry[selected.id]}
                    onBack={() => go("catalog")}
                    onConfigure={() => setConfigId(selected.id)}
                    onAction={(action) => lifecycle(selected.id, action)}
                    writable={feed.writable && !feed.pending}
                  />
                ) : (
                  <div className="panel empty-state">
                    <Layers3 size={25} />
                    <h3>Select a service to inspect</h3>
                    <button
                      className="primary-btn"
                      onClick={() => go("catalog")}
                    >
                      Open catalog
                    </button>
                  </div>
                ))}
              {page === "queues" && (
                <QueueAndDlqManager
                  key={`${environment}:${queueTab}`}
                  initialTab={queueTab}
                  services={data.services}
                  queues={feed.queues}
                  items={data.queues.dlq_items}
                  onPayload={(id) => setInspect({ type: "payload", id })}
                  onAction={(ids, action) =>
                    setConfirmation({ kind: "dlq", ids, action })
                  }
                  writable={feed.writable}
                  pending={feed.pending}
                />
              )}
              {page === "logs" && (
                <IncidentLogStream
                  key={environment}
                  incidents={data.incidents}
                  audit={feed.audit}
                  services={data.services}
                  onInspect={(event) => setInspect({ type: "event", event })}
                  onBundle={bundle}
                />
              )}
            </>
          ) : (
            <section className="panel unavailable-panel">
              <Server size={35} />
              <h2>
                {feed.source === "unauthorized"
                  ? "Authenticate to access telemetry"
                  : "Waiting for verified telemetry"}
              </h2>
              <p>
                {feed.error ||
                  "Connecting to the enterprise monitoring service."}
              </p>
              <button
                className="primary-btn"
                onClick={() => setInspect({ type: "connection" })}
              >
                Connection settings
              </button>
            </section>
          )}
          <footer className="enterprise-footer">
            <span>
              <ShieldCheck size={12} />
              {source} <b>·</b> {environment} <b>·</b>{" "}
              {feed.source === "server" ? "WebSocket / 1s" : "Local runtime"}
            </span>
            <span>
              All times in Asia/Jakarta <b>·</b> Flowstead Control Plane
            </span>
          </footer>
        </main>
      </div>
      {configId !== undefined && (
        <ServiceConfigModal
          key={configId ?? "new"}
          id={configId}
          initial={configId ? feed.registry[configId] : undefined}
          onClose={() => setConfigId(undefined)}
          onSave={saveService}
          onArchive={() => {
            if (configId) lifecycle(configId, "archive");
          }}
          pending={feed.pending}
        />
      )}
      <dialog
        ref={confirmDialog}
        className="confirmation-modal"
        aria-label="Confirm operational action"
        onCancel={(e) => {
          if (feed.pending) e.preventDefault();
          else setConfirmation(null);
        }}
      >
        <header>
          <TriangleAlert size={19} />
          <h2>Confirm {confirmation?.action}</h2>
          <button
            className="icon-button"
            aria-label="Cancel operation"
            disabled={feed.pending}
            onClick={() => setConfirmation(null)}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          {confirmation?.kind === "lifecycle" ? (
            <>
              <strong>
                {data?.services.find((s) => s.id === confirmation.serviceId)
                  ?.name ?? confirmation.serviceId}
              </strong>
              <br />
              {confirmation.action === "restart"
                ? "The simulation drains in-flight work, stops the flow, and starts it again."
                : "This updates the selected service lifecycle state."}
            </>
          ) : (
            <>
              <strong>{confirmation?.ids.length} selected message(s)</strong>
              <br />
              {confirmation?.action === "retry"
                ? "Move messages to their service inbound queues with existing idempotency keys. Duplicate replay is rejected."
                : "Permanently discard these messages from the demo DLQ. This cannot be undone through this dashboard."}
            </>
          )}
        </p>
        {confirmation?.kind === "dlq" && (
          <pre className="selection-preview">{confirmation.ids.join("\n")}</pre>
        )}
        <div className="environment-confirm">
          Target: <strong>{environment}</strong>
          <span>{demo ? "Simulation only" : "Live environment"}</span>
        </div>
        <label className="reason-field">
          Operator audit reason
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={5}
            maxLength={500}
            placeholder="Why is this operation required?"
          />
        </label>
        {actionError && (
          <div className="error-message" role="alert">
            {actionError}
          </div>
        )}
        <footer>
          <button
            className="subtle-button"
            onClick={() => setConfirmation(null)}
            disabled={feed.pending}
          >
            Cancel
          </button>
          <button
            className={
              confirmation?.action === "discard" ||
              confirmation?.action === "archive"
                ? "danger-button"
                : "primary-btn"
            }
            onClick={() => void perform()}
            disabled={
              !feed.writable || feed.pending || reason.trim().length < 5
            }
          >
            {feed.pending ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            Confirm {confirmation?.action}
          </button>
        </footer>
      </dialog>
      <dialog
        ref={drawer}
        className="inspection-drawer"
        aria-label="Operational inspector"
        onCancel={() => {
          setInspect(null);
          setToken("");
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setInspect(null);
            setToken("");
          }
        }}
      >
        <div className="drawer-inner">
          <div className="drawer-top">
            <span className="eyebrow">
              <Terminal size={14} /> OPERATIONAL INSPECTOR
            </span>
            <button
              className="icon-button"
              aria-label="Close inspector"
              onClick={() => {
                setInspect(null);
                setToken("");
              }}
            >
              <X size={19} />
            </button>
          </div>
          {inspect?.type === "payload" && (
            <>
              <div className="drawer-kicker">IBM MQ / MASKED PAYLOAD</div>
              <h2>{inspect.id}</h2>
              <p className="drawer-intro">
                Sensitive fields are masked on the server before transmission.
                The original idempotency key is preserved for replay.
              </p>
              {payloadError ? (
                <div className="error-message">{payloadError}</div>
              ) : payload ? (
                <pre>
                  {typeof payload === "object" &&
                  payload !== null &&
                  "payload" in payload
                    ? String(payload.payload)
                    : JSON.stringify(payload, null, 2)}
                </pre>
              ) : (
                <div className="drawer-loading">
                  <LoaderCircle size={18} className="animate-spin" /> Loading
                  payload…
                </div>
              )}
              <div className="drawer-action-row">
                <button
                  className="primary-btn"
                  disabled={!feed.writable || !!payloadError || !payload}
                  onClick={() => {
                    setInspect(null);
                    setConfirmation({
                      kind: "dlq",
                      ids: [inspect.id],
                      action: "retry",
                    });
                  }}
                >
                  <RefreshCw size={13} /> Re-queue message
                </button>
              </div>
            </>
          )}
          {inspect?.type === "event" && (
            <>
              <div className="drawer-kicker">
                {inspect.event.kind.toUpperCase()} / {inspect.event.id}
              </div>
              <h2>
                {data?.services.find((s) => s.id === inspect.event.service_id)
                  ?.name ?? inspect.event.service_id}
              </h2>
              <span
                className={`log-level ${inspect.event.level.toLowerCase()}`}
              >
                {inspect.event.level}
              </span>
              <h3>Diagnosis</h3>
              <p className="drawer-intro">{inspect.event.message}</p>
              <h3>Recommended action</h3>
              <p className="drawer-note">{inspect.event.remediation}</p>
              <h3>Raw event</h3>
              <pre>{inspect.event.raw}</pre>
              <div className="translation-disclosure">
                <Code2 size={15} />
                <span>
                  Local context-aware BIP rules. A BIP code alone does not
                  establish the cause; inspect its nested exceptions. No
                  external AI service receives event data.
                </span>
              </div>
              <button
                className="primary-btn"
                onClick={() => {
                  chooseService(inspect.event.service_id);
                  setInspect(null);
                }}
              >
                Inspect service pipeline <ArrowRight size={13} />
              </button>
            </>
          )}
          {inspect?.type === "connection" && (
            <>
              <div className="drawer-kicker">DATA SOURCE / OPERATOR ACCESS</div>
              <h2>{source}</h2>
              <p className="drawer-intro">
                Validated enterprise telemetry streams every second over the
                same-origin WebSocket. Development, SIT/UAT, and Production are
                isolated registry namespaces.
              </p>
              <dl className="drawer-definitions">
                <div>
                  <dt>Stream</dt>
                  <dd className="mono">/ws/telemetry</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{environment}</dd>
                </div>
                <div>
                  <dt>Manual actions</dt>
                  <dd>{feed.writable ? "Simulation enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>Authentication</dt>
                  <dd>
                    {feed.config?.authenticationRequired
                      ? "Operator session required"
                      : "Local demo access"}
                  </dd>
                </div>
              </dl>
              {feed.error && <div className="error-message">{feed.error}</div>}
              {feed.source === "unauthorized" ||
              feed.config?.authenticationRequired ? (
                <form
                  className="operator-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthPending(true);
                    try {
                      await feed.login(token);
                      setToken("");
                      setInspect(null);
                    } catch (err) {
                      setToast({
                        ok: false,
                        message:
                          err instanceof Error
                            ? err.message
                            : "Authentication failed.",
                      });
                    } finally {
                      setAuthPending(false);
                    }
                  }}
                >
                  <label htmlFor="operator-token">Operator token</label>
                  <input
                    id="operator-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    required
                  />
                  <button
                    className="primary-btn"
                    disabled={authPending || !token}
                  >
                    <LockKeyhole size={13} />
                    {authPending ? "Authenticating…" : "Establish session"}
                  </button>
                  <p>
                    Exchanged for an HttpOnly session cookie. Tokens are not
                    stored in browser storage.
                  </p>
                </form>
              ) : (
                <button className="primary-btn" onClick={feed.reconnect}>
                  <RefreshCw size={13} /> Reconnect telemetry
                </button>
              )}
              <h3>Production integration</h3>
              <p className="drawer-note">
                Configure ENTERPRISE_COLLECTOR_URL and operator authentication
                for live data. Lifecycle/configuration writes remain disabled
                until a verified administration provider is connected. Failed
                live collectors never substitute mock data.
              </p>
            </>
          )}
          {inspect?.type === "help" && (
            <>
              <div className="drawer-kicker">ENTERPRISE CONTROL PLANE</div>
              <h2>Operational clarity, end to end.</h2>
              <div className="guide-items">
                <div>
                  <Layers3 />
                  <span>
                    <strong>Service catalog</strong>26 seeded services across
                    five domains. Search by name, flow or application; narrow by
                    domain, protocol and health.
                  </span>
                </div>
                <div>
                  <GitBranch />
                  <span>
                    <strong>Process inspector</strong>Inspect node latency,
                    terminal counts, masked payload transformations and sample
                    code context.
                  </span>
                </div>
                <div>
                  <Settings2 />
                  <span>
                    <strong>Audited administration</strong>Registration,
                    configuration, lifecycle and DLQ actions require reasons and
                    are recorded in the operator audit trail.
                  </span>
                </div>
                <div>
                  <ShieldCheck />
                  <span>
                    <strong>Explicit data provenance</strong>Environment names
                    identify separate namespaces. All built-in data is
                    simulated; live credentials and an enterprise collector must
                    be configured separately.
                  </span>
                </div>
              </div>
              <p className="drawer-note">
                Demo server state is persisted on disk. Local browser fallback
                state is temporary and never synchronizes mutations back to a
                server automatically.
              </p>
            </>
          )}
          <div className="drawer-footer">
            <i className={`dot ${sourceUp ? "healthy" : "warning"}`} />
            {source}
            <span>{environment}</span>
          </div>
        </div>
      </dialog>
      {toast && (
        <div
          className={`toast ${toast.ok ? "success" : "failure"}`}
          role={toast.ok ? "status" : "alert"}
        >
          {toast.ok ? <Check size={17} /> : <TriangleAlert size={17} />}
          <p>{toast.message}</p>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
