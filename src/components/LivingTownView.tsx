import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Code2,
  Combine,
  Factory,
  GitBranch,
  Sprout,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { domainLabels, domains } from "../../shared/enterprise";
import type {
  IntegrationService,
  Registry,
  ServiceDomain,
  TelemetryPayload,
} from "../../shared/enterprise";
import { toTownTelemetry, type TownViewMode } from "../../shared/town";
import {
  activityDetails,
  nodeActivity,
  type ProcessActivity,
} from "../../shared/processActivities";
import LivingTownCanvas from "./LivingTownCanvas";
import type { TownSelection } from "./LivingTownCanvas";
import { StatusBadge } from "./ServiceCatalog";

type Props = {
  data: TelemetryPayload;
  registry: Registry;
  selectedId: string;
  demo: boolean;
  stale: boolean;
  writable: boolean;
  onFocus: (id: string) => void;
  onPipeline: (id: string, nodeId?: string) => void;
  onConfigure: (id: string) => void;
  onQueues: (tab: "queues" | "dlq") => void;
};
export default function LivingTownView({
  data,
  registry,
  selectedId,
  demo,
  stale,
  writable,
  onFocus,
  onPipeline,
  onConfigure,
  onQueues,
}: Props) {
  const [selection, setSelection] = useState<TownSelection | null>(null);
  const [district, setDistrict] = useState<ServiceDomain | "ALL">("ALL");
  const [sceneChoice, setSceneChoice] = useState<{
    service: string;
    mode: TownViewMode;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const service =
    data.services.find((s) => s.id === selectedId) ?? data.services[0];
  useEffect(() => {
    if (selection) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selection]);
  useEffect(() => {
    setSelection(null);
  }, [service?.id]);
  if (!service)
    return (
      <div className="panel empty-state">
        <Sprout size={30} />
        <h2>Your village is ready for its first service</h2>
        <p>
          Register an integration in the NOC catalog to bring its workshop to
          life.
        </p>
      </div>
    );
  const scene = toTownTelemetry(data, service, demo);
  const mode =
    sceneChoice?.service === service.id
      ? sceneChoice.mode
      : service.id === "payment-gateway"
        ? "village"
        : "process";
  const stage =
    selection?.type === "node"
      ? scene.stages.find((s) => s.node.id === selection.id)
      : undefined;
  const examples: {
    activity: ProcessActivity;
    preferred: string;
    caption: string;
    icon: typeof Combine;
  }[] = [
    {
      activity: "aggregate",
      preferred: "customer-360-sync",
      caption: "Combine records into one result",
      icon: Combine,
    },
    {
      activity: "route",
      preferred: "notification-dispatcher",
      caption: "Dispatch messages to different paths",
      icon: GitBranch,
    },
    {
      activity: "transform",
      preferred: "general-ledger-ingestion",
      caption: "Map and reshape a payload",
      icon: WandSparkles,
    },
  ];
  const route =
    selection?.type === "channel"
      ? scene.channels.find((ch) => ch.id === selection.id)
      : undefined;
  const isDlq = selection?.type === "queue" && selection.id === "dlq";
  const occupied =
    selection?.type === "worker" &&
    Number(selection.id) <= service.worker_threads_active;
  const title = stage
    ? `${stage.building} · ${stage.node.name}`
    : selection?.type === "apps"
      ? "Town square · incoming traffic"
      : selection?.type === "workshop"
        ? "IBM ACE workshop"
        : selection?.type === "worker"
          ? `Craftsman ${selection.id}`
          : selection?.type === "queue"
            ? isDlq
              ? "Reject bin · dead letters"
              : "Grain silo · inbound queue"
            : (route?.name ?? "Trading dock");
  const detail = stage
    ? stage.description
    : selection?.type === "apps"
      ? "Couriers represent incoming work. More throughput brings more activity along the road."
      : selection?.type === "workshop"
        ? "Each bench represents a configured worker instance for this service. Occupied benches match its active worker count."
        : selection?.type === "worker"
          ? `${occupied ? "This slot represents an occupied worker." : "This slot represents available capacity."} Individual worker identity and task assignment are illustrative; the total occupancy comes from telemetry.`
          : selection?.type === "queue"
            ? isDlq
              ? "These messages exhausted their retries. Inspect and recover them in the existing DLQ manager."
              : "Grain rises with the selected service’s queue depth. More than 50 waiting messages is a warning; more than 200 is critical."
            : scene.routeSource;
  const stats: [string, string][] = stage
    ? [
        ["Operation", activityDetails[stage.activity].label],
        ["Node type", stage.node.type],
        [
          "Status",
          stage.status === "IDLE" ? "Flow stopped" : stage.node.status,
        ],
        [
          "Average latency",
          stage.status === "IDLE"
            ? "No active flow"
            : `${stage.node.average_latency_ms.toLocaleString()} ms`,
        ],
        ["Messages in", stage.node.in_count.toLocaleString()],
        ["Messages out", stage.node.out_count.toLocaleString()],
        ["Errors · cumulative", stage.node.error_count.toLocaleString()],
      ]
    : selection?.type === "queue"
      ? [
          ["Queue depth", String(service.queue_depth ?? "Not reported")],
          ["Dead letters", String(service.dlq_count ?? "Not reported")],
          ["Queue", service.queue_name ?? "Not reported"],
        ]
      : route
        ? [
            ["Status", route.status],
            [
              "Throughput",
              route.tps === null
                ? "Not reported"
                : `${route.tps.toFixed(1)} TPS`,
            ],
            [
              "Average latency",
              route.latency_ms === null
                ? "Not reported"
                : `${Math.round(route.latency_ms).toLocaleString()} ms`,
            ],
            [
              "Error rate",
              route.error_rate === null
                ? "Not reported"
                : `${route.error_rate.toFixed(2)}%`,
            ],
          ]
        : [
            ["Throughput", `${service.tps.toFixed(1)} TPS`],
            [
              "Workers",
              `${service.worker_threads_active} / ${service.worker_threads_max} occupied`,
            ],
            [
              "P95 latency",
              service.status === "STOPPED"
                ? "No active flow"
                : `${service.latency_p95_ms.toLocaleString()} ms`,
            ],
            [
              "JVM heap · global",
              `${data.global_summary.heap_memory_pct.toFixed(1)}%`,
            ],
          ];
  const raw =
    stage?.node ??
    route ??
    (selection?.type === "queue"
      ? {
          service_id: service.id,
          queue: service.queue_name,
          depth: service.queue_depth,
          dlq: service.dlq_count,
        }
      : {
          service_id: service.id,
          status: service.status,
          tps: service.tps,
          worker_threads_active: service.worker_threads_active,
          worker_threads_max: service.worker_threads_max,
          latency_p95_ms: service.latency_p95_ms,
          error_rate_pct: service.error_rate_pct,
        });
  function focus(s: IntegrationService) {
    onFocus(s.id);
    setSelection(null);
  }
  return (
    <div className="town-workspace">
      <div className="town-focus-bar">
        <div className="town-focus-title">
          <span className="town-leaf-icon">
            <Sprout size={21} />
          </span>
          <div>
            <small>YOUR INTEGRATION, ALIVE</small>
            <strong>{service.name}</strong>
          </div>
          <StatusBadge status={service.status} />
        </div>
        <div className="town-focus-actions">
          <label>
            <span className="sr-only">Choose village service</span>
            <select
              aria-label="Choose village service"
              value={service.id}
              onChange={(e) => onFocus(e.target.value)}
            >
              {domains.map((domain) => (
                <optgroup key={domain} label={domainLabels[domain]}>
                  {data.services
                    .filter((s) => s.domain === domain)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            className="subtle-button"
            onClick={() => onPipeline(service.id)}
          >
            <GitBranch size={14} /> Open service <ArrowRight size={13} />
          </button>
        </div>
      </div>
      <div className="town-patterns" aria-label="Explore integration patterns">
        {examples.map(({ activity, preferred, caption, icon: Icon }) => {
          const matching = data.services.filter((s) =>
            s.nodes.some((n) => nodeActivity(n) === activity),
          );
          const example =
            matching.find((s) => s.id === preferred) ?? matching[0];
          return (
            <button
              key={activity}
              disabled={!example}
              className="town-pattern"
              onClick={() => {
                if (example) {
                  focus(example);
                  setSceneChoice({ service: example.id, mode: "process" });
                }
              }}
            >
              <span style={{ color: activityDetails[activity].color }}>
                <Icon size={21} />
              </span>
              <div>
                <strong>{activityDetails[activity].building}</strong>
                <small>{caption}</small>
                <em>
                  {matching.length
                    ? `${matching.length} services · Explore ${example?.name}`
                    : "No matching nodes in this snapshot"}
                </em>
              </div>
              <ArrowRight size={14} />
            </button>
          );
        })}
      </div>
      <div className="town-scene-heading">
        <div>
          <span className="eyebrow">
            {mode === "process" ? "NODE-BY-NODE JOURNEY" : "SERVICE OVERVIEW"}
          </span>
          <p>
            {mode === "process"
              ? "Specialists turn an incoming message into a completed delivery."
              : "A whole-service view of workers, queues and downstream destinations."}
          </p>
        </div>
        <div className="view-mode-toggle" role="group" aria-label="Town scene">
          <button
            aria-pressed={mode === "village"}
            onClick={() =>
              setSceneChoice({ service: service.id, mode: "village" })
            }
          >
            <Sprout size={14} /> Village overview
          </button>
          <button
            aria-pressed={mode === "process"}
            onClick={() =>
              setSceneChoice({ service: service.id, mode: "process" })
            }
          >
            <GitBranch size={14} /> Process village
          </button>
        </div>
      </div>
      <LivingTownCanvas
        key={`${service.id}:${mode}`}
        telemetry={scene}
        mode={mode}
        stale={stale}
        onInspect={setSelection}
      />
      <div className="town-source-note">
        <Code2 size={13} />
        <span>
          {mode === "process"
            ? "Buildings use the node names, order, counters and latency in this snapshot. Crate merges, routing lanes and colors illustrate processing; they are not traced transactions or measured branch volumes."
            : scene.routeSource}{" "}
          Building inspections use the same enterprise snapshot as NOC.
        </span>
      </div>
      {mode === "process" && (
        <div className="town-activity-key" aria-label="Activity guide">
          {[...new Set(scene.stages.map((s) => s.activity))].map((activity) => (
            <span key={activity}>
              <i style={{ background: activityDetails[activity].color }} />
              {activityDetails[activity].label} ·{" "}
              {activityDetails[activity].building}
            </span>
          ))}
        </div>
      )}
      <section className="town-districts" aria-label="Village districts">
        <div className="town-section-heading">
          <div>
            <span className="eyebrow">ONE VILLAGE. EVERY INTEGRATION.</span>
            <h2>Explore your districts</h2>
          </div>
          <button
            className="subtle-button"
            aria-pressed={district === "ALL"}
            onClick={() => setDistrict("ALL")}
          >
            All {data.services.length} services
          </button>
        </div>
        <div className="town-district-grid">
          {domains.map((domain) => {
            const services = data.services.filter((s) => s.domain === domain),
              issues = services.filter((s) => s.status !== "HEALTHY").length;
            return (
              <button
                key={domain}
                className={`town-district ${district === domain ? "selected" : ""}`}
                aria-pressed={district === domain}
                onClick={() => setDistrict(domain)}
              >
                <span className="district-emblem">
                  <Factory size={18} />
                </span>
                <strong>{domainLabels[domain]}</strong>
                <span>
                  {services.length} services <i />{" "}
                  {services.reduce((n, s) => n + s.tps, 0).toFixed(1)} TPS
                </span>
                <small className={issues ? "warning-text" : "positive"}>
                  {issues ? `${issues} need attention` : "All services healthy"}
                </small>
              </button>
            );
          })}
        </div>
        <div className="town-service-list">
          {data.services
            .filter((s) => district === "ALL" || s.domain === district)
            .map((s) => (
              <button
                key={s.id}
                className={`town-service-link ${service.id === s.id ? "selected" : ""}`}
                aria-pressed={service.id === s.id}
                onClick={() => focus(s)}
              >
                <i
                  className={`dot ${s.status === "HEALTHY" ? "healthy" : s.status === "DEGRADED" ? "warning" : "stopped"}`}
                />
                <span>{s.name}</span>
                <small>{s.tps.toFixed(1)} TPS</small>
                <ArrowRight size={12} />
              </button>
            ))}
        </div>
      </section>
      <dialog
        ref={dialog}
        className="inspection-drawer town-inspector"
        aria-label="Village telemetry inspector"
        onCancel={() => setSelection(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelection(null);
        }}
      >
        <div className="drawer-inner">
          <div className="drawer-top">
            <span className="eyebrow">
              <Sprout size={14} /> VILLAGE INSPECTOR
            </span>
            <button
              className="icon-button"
              aria-label="Close village inspector"
              onClick={() => setSelection(null)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="drawer-kicker">
            {service.name} /{" "}
            {registry[service.id]?.integration_server ??
              service.integration_server}
          </div>
          <h2>{title}</h2>
          <p className="drawer-intro">{detail}</p>
          <dl className="drawer-definitions">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="town-inspector-actions">
            <button
              className="primary-btn"
              onClick={() => {
                setSelection(null);
                if (selection?.type === "queue")
                  onQueues(isDlq ? "dlq" : "queues");
                else onPipeline(service.id, stage?.node.id);
              }}
            >
              {selection?.type === "queue" ? (
                <Boxes size={14} />
              ) : (
                <GitBranch size={14} />
              )}{" "}
              {selection?.type === "queue"
                ? isDlq
                  ? "Open DLQ manager"
                  : "Open queue inventory"
                : stage
                  ? "Open node in NOC"
                  : "Open service pipeline"}
              <ArrowRight size={13} />
            </button>
            <button
              className="subtle-button"
              disabled={!writable}
              onClick={() => {
                setSelection(null);
                onConfigure(service.id);
              }}
            >
              <Users size={14} /> Configure service
            </button>
          </div>
          <h3>Underlying telemetry</h3>
          <pre>{JSON.stringify(raw, null, 2)}</pre>
          <p className="drawer-note">
            {stale
              ? "Snapshot is stale. Motion is stopped until data recovers."
              : `Snapshot: ${new Date(data.timestamp).toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" })} WIB`}
          </p>
          <div className="drawer-footer">
            <i className={`dot ${stale ? "warning" : "healthy"}`} />
            {demo ? "Simulated telemetry" : "Live collector"}
            <span>Same source as NOC</span>
          </div>
        </div>
      </dialog>
    </div>
  );
}
