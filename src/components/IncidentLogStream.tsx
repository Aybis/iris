import { logsToCsv } from "../../shared/logExport";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Download,
  FileArchive,
  Pause,
  Play,
  Search,
  Terminal,
} from "lucide-react";
import type {
  AuditEntry,
  EnterpriseIncident,
  IntegrationService,
} from "../../shared/enterprise";
export type LogRecord = {
  id: string;
  timestamp: string;
  service_id: string;
  level: string;
  raw: string;
  message: string;
  remediation: string;
  kind: "incident" | "audit";
};
export function downloadFile(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function IncidentLogStream({
  incidents,
  audit,
  services,
  onInspect,
  onBundle,
  initialSeverity = "ALL",
}: {
  incidents: EnterpriseIncident[];
  audit: AuditEntry[];
  services: IntegrationService[];
  onInspect: (log: LogRecord) => void;
  onBundle: () => void;
  initialSeverity?: string;
}) {
  const [query, setQuery] = useState(""),
    [severity, setSeverity] = useState(initialSeverity),
    [paused, setPaused] = useState(false),
    [frozen, setFrozen] = useState<LogRecord[]>([]),
    [auto, setAuto] = useState(true),
    [kind, setKind] = useState("ALL");
  const scroll = useRef<HTMLDivElement>(null);
  const live = useMemo(
    () =>
      [
        ...incidents.map((i) => ({
          id: i.id,
          timestamp: i.timestamp,
          service_id: i.service_id,
          level: i.level,
          raw: i.raw_bip_code,
          message: i.diagnostic_message,
          remediation: i.remediation_hint,
          kind: "incident" as const,
        })),
        ...audit.map((a) => ({
          id: a.id,
          timestamp: a.timestamp,
          service_id: a.service_id,
          level: a.level,
          raw: `${a.action} correlation_id=${a.correlation_id}; actor=${a.actor}; outcome=${a.outcome}`,
          message: a.reason,
          remediation: "Operator change recorded in the audit trail.",
          kind: "audit" as const,
        })),
      ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [incidents, audit],
  );
  const source = paused ? frozen : live;
  const records = source.filter(
    (i) =>
      (severity === "ALL" || i.level === severity) &&
      (kind === "ALL" || i.kind === kind) &&
      `${i.id} ${i.raw} ${i.message} ${i.service_id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (auto && !paused && scroll.current) scroll.current.scrollTop = 0;
  }, [live, auto, paused]);
  function exportLogs(format: "csv" | "json") {
    if (format === "json") {
      downloadFile("flowstead-logs.json", JSON.stringify(records, null, 2));
      return;
    }
    downloadFile(
      "flowstead-logs.csv",
      logsToCsv(records),
      "text/csv;charset=utf-8",
    );
  }
  return (
    <section className="panel log-console">
      <div className="panel-title-row">
        <div>
          <h2>Live logs & incident journal</h2>
          <p>
            Correlated events, plain-English BIP diagnostics, and operator audit
            history.
          </p>
        </div>
        <div className="log-export">
          <button className="subtle-button" onClick={() => exportLogs("csv")}>
            <Download size={12} /> CSV
          </button>
          <button className="subtle-button" onClick={() => exportLogs("json")}>
            JSON
          </button>
          <button className="subtle-button" onClick={onBundle}>
            <FileArchive size={12} /> Diagnostic bundle
          </button>
        </div>
      </div>
      <div className="log-tools">
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search logs and audit"
            placeholder="Correlation ID, transaction, account suffix or BIP code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Log source"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="ALL">All events</option>
          <option value="incident">Incidents</option>
          <option value="audit">Operator audit</option>
        </select>
        <button
          className="subtle-button"
          aria-pressed={auto}
          onClick={() => setAuto(!auto)}
        >
          <ArrowDownToLine size={12} /> Auto-scroll {auto ? "on" : "off"}
        </button>
        <button
          className="subtle-button"
          onClick={() => {
            if (!paused) setFrozen(live);
            setPaused(!paused);
          }}
          aria-label={paused ? "Resume live logs" : "Pause live logs"}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}{" "}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="severity-filters" aria-label="Log severity">
        {["ALL", "CRITICAL", "ERROR", "WARN", "INFO", "DEBUG"].map((level) => (
          <button
            key={level}
            className={severity === level ? "active" : ""}
            onClick={() => setSeverity(level)}
            aria-pressed={severity === level}
          >
            {level === "ALL"
              ? "All levels"
              : level === "WARN"
                ? "WARNING"
                : level}
            <span>
              {level === "ALL"
                ? source.length
                : source.filter((i) => i.level === level).length}
            </span>
          </button>
        ))}
        <span className="log-live-status">
          <i className={`dot ${paused ? "warning" : "healthy"}`} />
          {paused ? "Display paused" : "Live stream"}
        </span>
      </div>
      <div className="log-table-scroll" ref={scroll}>
        <table className="log-table">
          <thead>
            <tr>
              <th>TIME · WIB</th>
              <th>LEVEL</th>
              <th>SERVICE</th>
              <th>DIAGNOSIS / OPERATOR ACTION</th>
              <th>REFERENCE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((i) => (
              <tr key={i.id} className={i.kind === "audit" ? "audit-row" : ""}>
                <td className="mono">
                  {new Date(i.timestamp).toLocaleTimeString("en-GB", {
                    timeZone: "Asia/Jakarta",
                  })}
                </td>
                <td>
                  <span className={`log-level ${i.level.toLowerCase()}`}>
                    {i.level === "WARN" ? "WARNING" : i.level}
                  </span>
                </td>
                <td>
                  {services.find((s) => s.id === i.service_id)?.name ??
                    i.service_id}
                </td>
                <td>
                  <button className="log-message" onClick={() => onInspect(i)}>
                    {i.message}
                    <small>
                      {i.kind === "audit" ? "AUDIT · " : ""}
                      {i.raw.length > 140 ? i.raw.slice(0, 140) + "…" : i.raw}
                    </small>
                  </button>
                </td>
                <td className="mono muted">{i.id}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Inspect event ${i.id}`}
                    onClick={() => onInspect(i)}
                  >
                    <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && (
          <div className="empty-state">
            <Terminal size={24} />
            <h3>No matching events</h3>
            <p>Try another severity or search term.</p>
          </div>
        )}
      </div>
      <div className="catalog-footer">
        <span>
          {records.length} matching events <span>·</span> BIP interpretation
          uses local, context-aware rules
        </span>
        <span>Payload secrets are masked</span>
      </div>
    </section>
  );
}
