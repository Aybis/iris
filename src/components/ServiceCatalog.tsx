import {
  ArrowUpRight,
  ChevronRight,
  Filter,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { domainLabels, domains, protocols } from "../../shared/enterprise";
import type {
  IntegrationService,
  Registry,
  ServiceDomain,
} from "../../shared/enterprise";
export interface CatalogFilters {
  query: string;
  domain: string;
  protocol: string;
  status: string;
}
export const emptyFilters: CatalogFilters = {
  query: "",
  domain: "ALL",
  protocol: "ALL",
  status: "ALL",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`service-state ${status.toLowerCase()}`}>
      <i />
      {{
        HEALTHY: "Running",
        DEGRADED: "Degraded",
        STOPPED: "Stopped",
        ERROR: "Error",
      }[status] ?? status}
    </span>
  );
}
export default function ServiceCatalog({
  services,
  registry,
  filters,
  onFilters,
  onSelect,
  onConfigure,
  onCreate,
  writable,
}: {
  services: IntegrationService[];
  registry: Registry;
  filters: CatalogFilters;
  onFilters: (f: CatalogFilters) => void;
  onSelect: (id: string) => void;
  onConfigure: (id: string) => void;
  onCreate: () => void;
  writable: boolean;
}) {
  const [view, setView] = useState<"table" | "grid">("table");
  const [trends, setTrends] = useState<Record<string, number[]>>({});
  useEffect(() => {
    setTrends((previous) =>
      Object.fromEntries(
        services.map((service) => [
          service.id,
          [...(previous[service.id] ?? []), service.tps].slice(-12),
        ]),
      ),
    );
  }, [services]);
  const filtered = services.filter((s) => {
    const m = registry[s.id],
      q = filters.query.toLowerCase();
    return (
      (filters.domain === "ALL" || s.domain === filters.domain) &&
      (filters.status === "ALL" ||
        s.status === filters.status ||
        (filters.status === "STOPPED" && s.status === "ERROR")) &&
      (filters.protocol === "ALL" || m?.protocol === filters.protocol) &&
      (!q ||
        `${s.name} ${s.flow_name} ${m?.application ?? ""}`
          .toLowerCase()
          .includes(q))
    );
  });
  const set = (key: keyof CatalogFilters, value: string) =>
    onFilters({ ...filters, [key]: value });
  return (
    <section className="catalog-panel">
      <div className="catalog-header">
        <div>
          <h2>
            Service health matrix <span>{services.length}</span>
          </h2>
          <p>Real-time status across your enterprise integration landscape.</p>
        </div>
        <button className="primary-btn" onClick={onCreate} disabled={!writable}>
          <Plus size={14} /> Register service
        </button>
      </div>
      <div className="domain-tabs" aria-label="Business domain">
        <button
          aria-pressed={filters.domain === "ALL"}
          onClick={() => set("domain", "ALL")}
        >
          All services <span>{services.length}</span>
        </button>
        {domains.map((d) => (
          <button
            key={d}
            aria-pressed={filters.domain === d}
            onClick={() => set("domain", d)}
          >
            {domainLabels[d]
              .replace(" & Accounts", "")
              .replace(" & Enterprise Ops", " / Ops")}
            <span>{services.filter((s) => s.domain === d).length}</span>
          </button>
        ))}
      </div>
      <div className="catalog-tools">
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search services"
            placeholder="Search service, flow ID or application…"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
          />
          {filters.query && (
            <button
              aria-label="Clear service search"
              onClick={() => set("query", "")}
            >
              ×
            </button>
          )}
        </label>
        <label className="filter-select">
          <Filter size={13} />
          <select
            aria-label="Filter by protocol"
            value={filters.protocol}
            onChange={(e) => set("protocol", e.target.value)}
          >
            <option value="ALL">All protocols</option>
            {protocols.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <i className="dot healthy" />
          <select
            aria-label="Filter by state"
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="ALL">All states</option>
            <option value="HEALTHY">Running</option>
            <option value="DEGRADED">Degraded</option>
            <option value="STOPPED">Stopped / Error</option>
            <option value="ERROR">Error only</option>
          </select>
        </label>
        <div className="table-view-switch">
          <button
            aria-label="Table view"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <List size={15} />
          </button>
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>
      {view === "table" ? (
        <div className="catalog-scroll">
          <table className="service-table">
            <thead>
              <tr>
                <th>SERVICE / MESSAGE FLOW</th>
                <th>STATUS</th>
                <th>PROTOCOL</th>
                <th>THROUGHPUT</th>
                <th>P95 LATENCY</th>
                <th>ERROR / 15M</th>
                <th>QUEUE</th>
                <th>OWNER</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, index) => (
                <tr
                  key={s.id}
                  className={
                    s.status === "DEGRADED"
                      ? "row-warning"
                      : s.status === "STOPPED"
                        ? "row-stopped"
                        : ""
                  }
                >
                  <td>
                    <button
                      className="service-name-button"
                      onClick={() => onSelect(s.id)}
                    >
                      <span
                        className={`service-glyph ${s.domain.toLowerCase()}`}
                      >
                        {(index + 1).toString().padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.flow_name}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>
                    <span className="protocol-tag">
                      {registry[s.id]?.protocol ?? "Not reported"}
                    </span>
                  </td>
                  <td className="mono">
                    <strong>{s.tps.toFixed(1)}</strong>
                    <small> /s</small>
                    <span
                      className={`inline-bars ${s.status === "STOPPED" ? "idle" : ""}`}
                      title="Most recent 12 throughput samples"
                      aria-hidden="true"
                    >
                      {(trends[s.id] ?? [s.tps]).map((n, i) => (
                        <i
                          key={i}
                          style={{
                            height: `${2 + (n / Math.max(1, ...(trends[s.id] ?? [s.tps]))) * 12}px`,
                          }}
                        />
                      ))}
                    </span>
                  </td>
                  <td
                    className={`mono ${s.latency_p95_ms > (registry[s.id]?.sla_ms ?? 1000) ? "warning-text" : ""}`}
                  >
                    {s.status === "STOPPED"
                      ? "—"
                      : s.latency_p95_ms.toLocaleString()}
                    <small> ms</small>
                  </td>
                  <td
                    className={`mono ${s.error_rate_pct > 0.5 ? "warning-text" : ""}`}
                  >
                    {s.status === "STOPPED"
                      ? "—"
                      : s.error_rate_pct.toFixed(2) + "%"}
                  </td>
                  <td>
                    <span
                      className={`queue-number ${(s.queue_depth ?? 0) > 200 ? "critical" : (s.queue_depth ?? 0) > 50 ? "warning" : ""}`}
                    >
                      {s.queue_depth ?? "—"}
                    </span>
                    {!!s.dlq_count && (
                      <span className="row-dlq">{s.dlq_count} DLQ</span>
                    )}
                  </td>
                  <td className="owner-cell">
                    {registry[s.id]?.owner ?? "Not reported"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        aria-label={`Configure ${s.name}`}
                        onClick={() => onConfigure(s.id)}
                        disabled={!writable}
                      >
                        <SlidersHorizontal size={13} />
                      </button>
                      <button
                        aria-label={`Inspect ${s.name}`}
                        onClick={() => onSelect(s.id)}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="service-card-grid">
          {filtered.map((s) => (
            <button
              key={s.id}
              className="service-tile"
              onClick={() => onSelect(s.id)}
            >
              <div>
                <StatusBadge status={s.status} />
                <ArrowUpRight size={14} />
              </div>
              <h3>{s.name}</h3>
              <p>{registry[s.id]?.application ?? s.flow_name}</p>
              <div className="service-tile-stats">
                <span>
                  <strong>{s.tps.toFixed(1)}</strong> TPS
                </span>
                <span>
                  <strong>{s.latency_p95_ms}</strong> ms p95
                </span>
                <span>
                  <strong>{s.queue_depth}</strong> queued
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {!filtered.length && (
        <div className="empty-state">
          <Search size={23} />
          <h3>No services match these filters</h3>
          <button
            className="subtle-button"
            onClick={() => onFilters(emptyFilters)}
          >
            Clear all filters
          </button>
        </div>
      )}
      <div className="catalog-footer">
        <span>
          Showing <b>{filtered.length}</b> of <b>{services.length}</b> services{" "}
          <span>·</span>{" "}
          {new Set(services.map((s) => s.integration_server)).size} integration
          servers
        </span>
        <span>
          <i className="dot info" /> Updates every second
        </span>
      </div>
    </section>
  );
}
