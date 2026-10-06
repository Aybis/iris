import { useState } from "react";
import { Boxes, Eye, Inbox, RefreshCw, Search, Trash2 } from "lucide-react";
import type {
  EnterpriseDlq,
  IntegrationService,
  QueueMetric,
} from "../../shared/enterprise";
export default function QueueAndDlqManager({
  initialTab = "dlq",
  services,
  queues,
  items,
  onPayload,
  onAction,
  writable,
  pending,
}: {
  initialTab?: "queues" | "dlq";
  services: IntegrationService[];
  queues: QueueMetric[];
  items: EnterpriseDlq[];
  onPayload: (id: string) => void;
  onAction: (ids: string[], action: "retry" | "discard") => void;
  writable: boolean;
  pending: boolean;
}) {
  const [tab, setTab] = useState<"queues" | "dlq">(initialTab),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const name = (id: string) => services.find((s) => s.id === id)?.name ?? id;
  const rows = items.filter((i) =>
    `${i.id} ${i.tx_id} ${name(i.service_id)} ${i.raw_bip_code} ${i.payload}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const queueRows = queues.filter((i) =>
    `${i.name} ${name(i.service_id)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const validSelected = selected.filter((id) => items.some((i) => i.id === id));
  const allSelected =
    rows.length > 0 && rows.every((r) => validSelected.includes(r.id));
  return (
    <section className="panel queue-console">
      <div className="panel-title-row">
        <div>
          <h2>Queue & dead-letter manager</h2>
          <p>
            Inspect waiting work and recover failed messages with an audit
            trail.
          </p>
        </div>
        <span className="count-badge">{items.length} dead letters</span>
      </div>
      <div className="queue-tabs">
        <button aria-pressed={tab === "dlq"} onClick={() => setTab("dlq")}>
          <Inbox size={14} /> Dead letters <span>{items.length}</span>
        </button>
        <button
          aria-pressed={tab === "queues"}
          onClick={() => setTab("queues")}
        >
          <Boxes size={14} /> Inbound queues <span>{queues.length}</span>
        </button>
      </div>
      <div className="queue-controls">
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search queues and dead letters"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "dlq"
                ? "Message, transaction, correlation or service…"
                : "Queue name or service…"
            }
          />
        </label>
        {tab === "dlq" && validSelected.length > 0 && (
          <div className="bulk-controls">
            <span>{validSelected.length} selected</span>
            <button
              className="subtle-button"
              disabled={!writable || pending}
              onClick={() => onAction(validSelected, "retry")}
            >
              <RefreshCw size={12} /> Re-queue selected
            </button>
            <button
              className="danger-button"
              disabled={!writable || pending}
              onClick={() => onAction(validSelected, "discard")}
            >
              <Trash2 size={12} /> Discard
            </button>
          </div>
        )}
      </div>
      <div className="managed-table-scroll">
        {tab === "dlq" ? (
          <table className="managed-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all visible dead letters"
                    checked={allSelected}
                    disabled={!rows.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [
                              ...new Set([
                                ...selected,
                                ...rows.map((r) => r.id),
                              ]),
                            ]
                          : selected.filter(
                              (id) => !rows.some((r) => r.id === id),
                            ),
                      )
                    }
                  />
                </th>
                <th>MESSAGE / CORRELATION</th>
                <th>ORIGINATING SERVICE</th>
                <th>FAILED STEP / ERROR</th>
                <th>PAYLOAD PREVIEW</th>
                <th>TIME · WIB</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${i.tx_id}`}
                      checked={validSelected.includes(i.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, i.id]
                            : s.filter((id) => id !== i.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong className="mono">{i.tx_id}</strong>
                    <small className="mono">
                      {i.payload.match(/CORR-[A-Za-z0-9-]+/)?.[0] ?? i.id}
                    </small>
                  </td>
                  <td>{name(i.service_id)}</td>
                  <td>
                    <strong>{i.reason.split(":")[0]}</strong>
                    <span className="error-code">
                      {i.raw_bip_code.match(/BIP\d{4}[A-Z]/)?.[0] ?? "FAILURE"}
                    </span>
                    <small>{i.reason}</small>
                  </td>
                  <td>
                    <button
                      className="payload-preview mono"
                      aria-label={`Preview payload ${i.tx_id}`}
                      onClick={() => onPayload(i.id)}
                    >
                      {i.payload.replace(/\s+/g, " ").slice(0, 64)}…
                    </button>
                  </td>
                  <td className="mono" title={i.timestamp}>
                    {new Date(i.timestamp).toLocaleTimeString("en-GB", {
                      timeZone: "Asia/Jakarta",
                    })}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        aria-label={`Inspect payload ${i.tx_id}`}
                        onClick={() => onPayload(i.id)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        aria-label={`Re-queue ${i.tx_id}`}
                        disabled={!writable || pending}
                        onClick={() => onAction([i.id], "retry")}
                      >
                        <RefreshCw size={13} />
                      </button>
                      <button
                        aria-label={`Discard ${i.tx_id}`}
                        disabled={!writable || pending}
                        onClick={() => onAction([i.id], "discard")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="managed-table">
            <thead>
              <tr>
                <th>QUEUE NAME / SERVICE</th>
                <th>DEPTH / MAX</th>
                <th>INGEST / SEC</th>
                <th>CONSUME / SEC</th>
                <th>OLDEST MESSAGE</th>
                <th>HEALTH</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map((q) => (
                <tr key={q.name}>
                  <td>
                    <strong className="mono">{q.name}</strong>
                    <small>{name(q.service_id)}</small>
                  </td>
                  <td className="mono">
                    {q.depth} / {q.max_depth.toLocaleString()}
                    <div
                      className={`queue-small-meter ${q.depth > 200 ? "critical" : q.depth > 50 ? "warning" : ""}`}
                    >
                      <i
                        style={{
                          width: `${Math.max(1, Math.min(100, (q.depth / q.max_depth) * 100))}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="mono">{q.ingestion_rate.toFixed(1)}</td>
                  <td className="mono">{q.consumption_rate.toFixed(1)}</td>
                  <td>
                    {Math.floor(q.oldest_age_seconds / 60)}m{" "}
                    {q.oldest_age_seconds % 60}s
                  </td>
                  <td>
                    <span
                      className={`service-state ${q.depth > 200 ? "error" : q.depth > 50 ? "degraded" : "healthy"}`}
                    >
                      <i />
                      {q.depth > 200
                        ? "Critical"
                        : q.depth > 50
                          ? "Warning"
                          : "Normal"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {((tab === "dlq" && !rows.length) ||
        (tab === "queues" && !queueRows.length)) && (
        <div className="empty-state">
          <Inbox size={24} />
          <h3>{query ? "No matching records" : "No records to display"}</h3>
          <p>
            {query
              ? "Try another transaction, correlation or service name."
              : "Queue data will appear when the collector reports it."}
          </p>
        </div>
      )}
      <div className="catalog-footer">
        <span>
          {tab === "dlq"
            ? "Payloads are masked. Replay preserves idempotency keys."
            : "Depth thresholds: 0–50 normal · 51–200 warning · >200 critical"}
        </span>
        <span>IBM MQ</span>
      </div>
    </section>
  );
}
