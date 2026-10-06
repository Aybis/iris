import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  CheckCircle2,
  Code2,
  Database,
  FileJson,
  GitBranch,
  Globe,
  Play,
  RotateCcw,
  Settings2,
  Square,
  TriangleAlert,
} from "lucide-react";
import type {
  ControlAction,
  IntegrationService,
  ProcessNode,
  ServiceMetadata,
} from "../../shared/enterprise";
import { StatusBadge } from "./ServiceCatalog";
import { nodeActivity } from "../../shared/processActivities";
const nodeIcons = {
  INPUT: Globe,
  COMPUTE: Code2,
  HTTP_REQUEST: Globe,
  DATABASE: Database,
  MQ_OUTPUT: GitBranch,
  REPLY: CheckCircle2,
};
const snippets: Record<ProcessNode["type"], string> = {
  INPUT:
    "-- HTTPInput node\n-- Input message validation: Content + Value\n-- Parse timing: On demand",
  COMPUTE:
    "CREATE COMPUTE MODULE TransformPayment\n  CREATE FUNCTION Main() RETURNS BOOLEAN\n  BEGIN\n    SET OutputRoot.JSON.Data.payment.amount =\n      InputRoot.JSON.Data.amount;\n    SET OutputRoot.JSON.Data.payment.currency = 'IDR';\n    RETURN TRUE;\n  END;\nEND MODULE;",
  HTTP_REQUEST:
    "// HTTPRequest node properties\nrequestMethod = POST\nrequestTimeout = service.timeout_ms\nsecurityIdentity = paymentPartnerIdentity\n// Credentials resolved by ACE vault at runtime",
  DATABASE:
    "INSERT INTO audit.payment_events\n  (transaction_id, status, created_at)\nVALUES (?, ?, CURRENT_TIMESTAMP);\n-- Parameterized statement; metadata only.",
  MQ_OUTPUT:
    "-- MQOutput properties\nTransaction mode: Yes\nPersistence: As queue definition\nDestination queue: configured service queue",
  REPLY:
    "-- HTTPReply node\nHTTP status code: 200\nReply identifier: input local environment\nPayload: transformed response",
};
export default function ProcessFlowInspector({
  service,
  metadata,
  onBack,
  onConfigure,
  onAction,
  writable,
  initialNodeId,
}: {
  service: IntegrationService;
  metadata?: ServiceMetadata;
  onBack: () => void;
  onConfigure: () => void;
  onAction: (action: ControlAction) => void;
  writable: boolean;
  initialNodeId?: string;
}) {
  const [nodeId, setNodeId] = useState(
      initialNodeId ??
        service.nodes.find((n) => n.status !== "HEALTHY")?.id ??
        service.nodes[0]?.id,
    ),
    [tab, setTab] = useState<"nodes" | "payload">("nodes");
  const node = service.nodes.find((n) => n.id === nodeId) ?? service.nodes[0];
  const total = service.nodes.reduce((n, v) => n + v.average_latency_ms, 0);
  let offset = 0;
  return (
    <section className="detail-workspace">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={14} /> All services
      </button>
      <div className="detail-heading">
        <div>
          <div className="eyebrow">
            {service.integration_server} /{" "}
            {metadata?.application ?? "APPLICATION"}
          </div>
          <h2>
            {service.name} <StatusBadge status={service.status} />
          </h2>
          <p className="mono">{service.flow_name}</p>
        </div>
        <div className="detail-toolbar">
          <button
            className="subtle-button"
            onClick={() =>
              onAction(service.status === "STOPPED" ? "start" : "stop")
            }
            disabled={!writable}
          >
            {service.status === "STOPPED" ? (
              <Play size={13} />
            ) : (
              <Square size={12} />
            )}{" "}
            {service.status === "STOPPED" ? "Start flow" : "Stop flow"}
          </button>
          <button
            className="subtle-button"
            onClick={() => onAction("restart")}
            disabled={!writable}
          >
            <RotateCcw size={13} /> Restart
          </button>
          <button
            className="primary-btn"
            onClick={onConfigure}
            disabled={!writable}
          >
            <Settings2 size={13} /> Configure
          </button>
        </div>
      </div>
      <div className="detail-kpis">
        <div>
          <span>THROUGHPUT</span>
          <strong>
            {service.tps.toFixed(1)}
            <small> TPS</small>
          </strong>
        </div>
        <div>
          <span>P95 LATENCY</span>
          <strong
            className={service.status === "DEGRADED" ? "warning-text" : ""}
          >
            {service.status === "STOPPED"
              ? "—"
              : service.latency_p95_ms.toLocaleString()}
            <small> ms</small>
          </strong>
        </div>
        <div>
          <span>ERROR RATE · 15M</span>
          <strong>
            {service.status === "STOPPED"
              ? "—"
              : service.error_rate_pct.toFixed(2)}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span>WORKER INSTANCES</span>
          <strong>
            {service.worker_threads_active}
            <small> / {service.worker_threads_max}</small>
          </strong>
        </div>
        <div>
          <span>SLA TARGET</span>
          <strong>
            {metadata?.sla_ms ?? "—"}
            <small> ms</small>
          </strong>
        </div>
      </div>
      <div className="panel flow-pipeline">
        <div className="panel-title-row">
          <div>
            <h3>Message flow pipeline</h3>
            <p>Average execution time per node · select a node to inspect</p>
          </div>
          <span className="protocol-tag">{service.nodes.length} nodes</span>
        </div>
        <div className="pipeline-scroll">
          <div className="pipeline-nodes">
            {service.nodes.map((n, index) => {
              const Icon = nodeIcons[n.type];
              return (
                <div className="node-and-connector" key={n.id}>
                  <button
                    className={`pipeline-node ${n.status.toLowerCase()} ${nodeId === n.id ? "selected" : ""}`}
                    onClick={() => setNodeId(n.id)}
                    aria-pressed={nodeId === n.id}
                  >
                    <span className="node-order">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Icon size={18} />
                    <strong>{n.name}</strong>
                    <span className="mono">
                      {n.average_latency_ms.toLocaleString()} <small>ms</small>
                      {n.status !== "HEALTHY" && <TriangleAlert size={12} />}
                    </span>
                  </button>
                  {index < service.nodes.length - 1 && (
                    <ArrowRight className="node-connector" size={20} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="pipeline-legend">
          <span>
            <i className="dot healthy" /> Healthy node
          </span>
          <span>
            <i className="dot warning" /> Bottleneck
          </span>
          <span>
            <i className="dot critical" /> Error terminal
          </span>
          <b>
            Total average:{" "}
            {total.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms
          </b>
        </div>
      </div>
      <div className="detail-subtabs">
        <button aria-pressed={tab === "nodes"} onClick={() => setTab("nodes")}>
          <GitBranch size={14} /> Node waterfall & configuration
        </button>
        <button
          aria-pressed={tab === "payload"}
          onClick={() => setTab("payload")}
        >
          <FileJson size={14} /> Payload transformation
        </button>
      </div>
      {tab === "nodes" ? (
        <div className="node-detail-grid">
          <div className="panel">
            <div className="panel-title-row">
              <h3>Execution waterfall</h3>
              <span className="muted">ms / avg</span>
            </div>
            <div className="waterfall">
              {service.nodes.map((n) => {
                const start = offset;
                offset += n.average_latency_ms;
                return (
                  <button
                    key={n.id}
                    onClick={() => setNodeId(n.id)}
                    aria-label={`Inspect node ${n.name}`}
                    className={nodeId === n.id ? "selected" : ""}
                  >
                    <span>{n.name}</span>
                    <div>
                      <i
                        className={n.status.toLowerCase()}
                        style={{
                          marginLeft: `${total ? (start / total) * 100 : 0}%`,
                          width: `${Math.max(0.6, total ? (n.average_latency_ms / total) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                    <b className="mono">{n.average_latency_ms}</b>
                  </button>
                );
              })}
            </div>
            <div className="waterfall-axis">
              <span>0 ms</span>
              <span>{Math.round(total / 2)} ms</span>
              <span>{Math.round(total)} ms</span>
            </div>
            <p className="section-footnote">
              Sequential averages show where time is spent. They are not a
              sampled distributed trace.
            </p>
          </div>
          <div className="panel node-config">
            <div className="panel-title-row">
              <h3>{node?.name ?? "No node selected"}</h3>
              <span className="protocol-tag">{node?.type}</span>
            </div>
            {node && (
              <>
                <div className="terminal-counts">
                  <div>
                    <span>IN</span>
                    <strong>{node.in_count.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>OUT</span>
                    <strong>{node.out_count.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>FAILURE / CATCH / ERROR</span>
                    <strong className={node.error_count ? "negative" : ""}>
                      {node.error_count.toLocaleString()}
                    </strong>
                  </div>
                </div>
                <dl className="config-definitions">
                  <div>
                    <dt>Node type</dt>
                    <dd>
                      {node.type === "INPUT"
                        ? `${node.name.replaceAll(" ", "")}Node`
                        : node.type === "REPLY"
                          ? `${node.name.replaceAll(" ", "")}Node`
                          : {
                              COMPUTE: "ComputeNode",
                              HTTP_REQUEST: "HTTPRequestNode",
                              DATABASE: "DatabaseNode",
                              MQ_OUTPUT: "MQOutputNode",
                            }[node.type]}
                    </dd>
                  </div>
                  <div>
                    <dt>Configured URI</dt>
                    <dd>
                      {node.type === "DATABASE"
                        ? "jdbc:db2://audit-db.internal.example:50000/AUDIT"
                        : service.config.target_url}
                    </dd>
                  </div>
                  <div>
                    <dt>Credential reference</dt>
                    <dd>Example: ace-vault://partner-identity</dd>
                  </div>
                  <div>
                    <dt>User trace</dt>
                    <dd>
                      {metadata?.trace ??
                        (service.config.user_trace_enabled ? "normal" : "none")}
                    </dd>
                  </div>
                </dl>
                <div className="code-caption">
                  <Braces size={12} /> Sample configuration / code context
                </div>
                <pre className="code-block">
                  {nodeActivity(node) === "route"
                    ? "-- Illustrative routing logic\nCASE InputRoot.JSON.Data.destination\n  WHEN 'primary' THEN PROPAGATE TO TERMINAL 'out1';\n  ELSE PROPAGATE TO TERMINAL 'out2';\nEND CASE;\n-- Inspect deployed flow for actual routes."
                    : nodeActivity(node) === "aggregate"
                      ? "-- Illustrative aggregation context\n-- Correlate related input messages\n-- Collect expected responses or wait for timeout\n-- Merge collected records into the output contract\n-- Batch size and correlation state are not in this telemetry."
                      : snippets[node.type]}
                </pre>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="payload-comparison">
          <div className="panel">
            <h3>Incoming request · masked sample</h3>
            <p className="section-footnote">Application contract</p>
            <pre className="code-block">
              {JSON.stringify(
                {
                  transaction_id: "TX-DEMO-4201",
                  account_number: "[REDACTED]",
                  customer_name: "[REDACTED]",
                  amount: 150000,
                  currency: "IDR",
                  channel: "BCA_VA",
                },
                null,
                2,
              )}
            </pre>
          </div>
          <div className="panel">
            <h3>Outgoing request · translated sample</h3>
            <p className="section-footnote">Downstream partner contract</p>
            <pre className="code-block">
              {JSON.stringify(
                {
                  payment: {
                    reference: "TX-DEMO-4201",
                    beneficiary: { account: "[REDACTED]" },
                    instructedAmount: { value: "150000.00", currency: "IDR" },
                  },
                  metadata: { source: "ACE", idempotency_key: "TX-DEMO-4201" },
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
