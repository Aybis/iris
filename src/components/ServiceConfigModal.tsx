import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Save, Settings2, Trash2, X } from "lucide-react";
import { defaultMetadata } from "../../shared/enterpriseModel";
import {
  domainLabels,
  domains,
  metadataSchema,
  protocols,
} from "../../shared/enterprise";
import type { ControlResult, ServiceMetadata } from "../../shared/enterprise";
export default function ServiceConfigModal({
  id,
  initial,
  onClose,
  onSave,
  onArchive,
  pending,
}: {
  id: string | null;
  initial?: ServiceMetadata;
  onClose: () => void;
  onSave: (
    id: string | null,
    data: ServiceMetadata,
    reason: string,
  ) => Promise<ControlResult>;
  onArchive: () => void;
  pending: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ServiceMetadata>(
      initial ?? defaultMetadata(),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"general" | "runtime" | "retry">("general");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const update = (key: keyof ServiceMetadata, value: string | number) =>
    setData((d) => ({ ...d, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = metadataSchema.safeParse(data);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
      return;
    }
    if (reason.trim().length < 5) {
      setError("Enter an audit reason of at least 5 characters.");
      return;
    }
    const result = await onSave(id, parsed.data, reason);
    if (result.ok) onClose();
    else setError(result.message);
  }
  const field = (
    label: string,
    key: keyof ServiceMetadata,
    type = "text",
    props: Record<string, number> = {},
  ) => (
    <label>
      {label}
      <input
        type={type}
        value={String(data[key])}
        onChange={(e) =>
          update(
            key,
            type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
        {...props}
      />
    </label>
  );
  return (
    <dialog
      className="config-modal"
      ref={dialog}
      aria-label={id ? "Service configuration" : "Register service"}
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <Settings2 size={18} />
            <span>
              <h2>
                {id
                  ? "Service configuration"
                  : "Register an integration service"}
              </h2>
              <p>
                {id
                  ? data.name
                  : "New services are registered in a stopped state."}
              </p>
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close configuration"
          >
            <X size={19} />
          </button>
        </header>
        <div className="config-tabs">
          {(["general", "runtime", "retry"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "general"
                ? "Metadata & ownership"
                : t === "runtime"
                  ? "Runtime & endpoints"
                  : "Retry, trace & audit"}
            </button>
          ))}
        </div>
        <div className="config-form-body">
          {tab === "general" && (
            <div className="form-grid">
              {field("Service name", "name")}
              <label>
                Business domain
                <select
                  value={data.domain}
                  onChange={(e) => update("domain", e.target.value)}
                >
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {domainLabels[d]}
                    </option>
                  ))}
                </select>
              </label>
              {field("Message flow name", "flow_name")}
              {field("Application name", "application")}
              {field("Integration server", "integration_server")}
              {field("Owner team", "owner")}
              <label>
                Protocol
                <select
                  value={data.protocol}
                  onChange={(e) => update("protocol", e.target.value)}
                >
                  {protocols.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {field("SLA target (ms)", "sla_ms", "number", {
                min: 1,
                max: 300000,
              })}
            </div>
          )}
          {tab === "runtime" && (
            <div className="form-grid">
              <div className="form-span">
                {field("Primary target endpoint", "target_url")}
              </div>
              <div className="form-span">
                {field("Failover endpoint (optional)", "failover_url")}
              </div>
              {field("Connection timeout (ms)", "timeout_ms", "number", {
                min: 100,
                max: 300000,
              })}
              {field(
                "Worker instances (1–50)",
                "worker_threads_max",
                "number",
                { min: 1, max: 50 },
              )}
              <div className="form-info form-span">
                <AlertTriangle size={16} />
                <p>
                  Endpoint credentials belong in the ACE vault. Changes update
                  the simulation registry; live runtime writes require an
                  audited administration provider.
                </p>
              </div>
            </div>
          )}
          {tab === "retry" && (
            <div className="form-grid">
              {field("Maximum retries", "max_retries", "number", {
                min: 0,
                max: 10,
              })}
              {field("Retry interval (ms)", "retry_interval_ms", "number", {
                min: 100,
                max: 60000,
              })}
              {field("Backoff multiplier", "backoff_multiplier", "number", {
                min: 1,
                max: 10,
                step: 0.5,
              })}
              <label>
                User trace level
                <select
                  value={data.trace}
                  onChange={(e) => update("trace", e.target.value)}
                >
                  <option value="none">None — disabled</option>
                  <option value="normal">Normal</option>
                  <option value="debug">Debug</option>
                </select>
              </label>
              <label className="form-span">
                Audit database logging
                <select
                  value={data.audit_logging}
                  onChange={(e) => update("audit_logging", e.target.value)}
                >
                  <option>Metadata Only</option>
                  <option>Full Payload</option>
                  <option>Disabled</option>
                </select>
              </label>
              {(data.trace === "debug" ||
                data.audit_logging === "Full Payload") && (
                <div className="form-info form-span">
                  <AlertTriangle size={16} />
                  <p>
                    Detailed tracing and full-payload logging can capture
                    sensitive data and add overhead. Apply only for a defined
                    troubleshooting window.
                  </p>
                </div>
              )}
            </div>
          )}
          <label className="reason-field">
            Audit reason <span>Required for every change</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={500}
              placeholder="Describe why this configuration is changing…"
              rows={2}
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          {id && (
            <button
              type="button"
              className="archive-button"
              onClick={onArchive}
              disabled={pending}
            >
              <Trash2 size={13} /> Archive service
            </button>
          )}
          <div>
            <button
              type="button"
              className="subtle-button"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button className="primary-btn" disabled={pending}>
              <Save size={13} />
              {pending
                ? "Saving…"
                : id
                  ? "Save configuration"
                  : "Register service"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
