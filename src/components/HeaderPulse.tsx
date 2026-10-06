import {
  Activity,
  CheckCircle2,
  Cpu,
  Layers3,
  TriangleAlert,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import type {
  EnterpriseHistory,
  TelemetryPayload,
} from "../../shared/enterprise";
export default function HeaderPulse({
  data,
  history,
  onStatus,
}: {
  data: TelemetryPayload;
  history: EnterpriseHistory[];
  onStatus: (status: string) => void;
}) {
  const g = data.global_summary,
    active = data.services.reduce((n, s) => n + s.worker_threads_active, 0),
    max = data.services.reduce((n, s) => n + s.worker_threads_max, 0);
  return (
    <section className="enterprise-pulse" aria-label="Global telemetry">
      <article className="pulse-block">
        <div className="small-label">
          <Layers3 size={14} /> Integration services
        </div>
        <div className="pulse-main">
          <strong>{g.total_services}</strong>
          <span>registered services</span>
        </div>
        <div className="health-breakdown">
          <button onClick={() => onStatus("HEALTHY")}>
            <i className="dot healthy" />
            {g.healthy_services} healthy
          </button>
          <button onClick={() => onStatus("DEGRADED")}>
            <i className="dot warning" />
            {g.degraded_services} degraded
          </button>
          <button onClick={() => onStatus("STOPPED")}>
            <i className="dot stopped" />
            {g.stopped_services} stopped / error
          </button>
        </div>
      </article>
      <article className="pulse-block">
        <div className="small-label">
          <Activity size={14} /> Global throughput{" "}
          <span className="mono">60S</span>
        </div>
        <div className="tps-row">
          <div className="pulse-main">
            <strong>{g.global_tps.toFixed(1)}</strong>
            <span>TPS</span>
          </div>
          <div className="pulse-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="global-tps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{
                    background: "#111c2e",
                    border: "1px solid #334155",
                    fontSize: 11,
                  }}
                  labelFormatter={() => "Observed throughput"}
                  formatter={(v) => [Number(v).toFixed(1) + " TPS", "Global"]}
                />
                <Area
                  type="monotone"
                  dataKey="tps"
                  stroke="#38bdf8"
                  fill="url(#global-tps)"
                  isAnimationActive={false}
                  strokeWidth={1.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="pulse-caption">Across all running integration flows</p>
      </article>
      <article className="pulse-block">
        <div className="small-label">
          <CheckCircle2 size={14} /> Delivery performance
        </div>
        <div className="pulse-main">
          <strong>
            {g.success_rate_pct.toFixed(2)}
            <small>%</small>
          </strong>
          <span className="positive">success today</span>
        </div>
        <p className="pulse-caption">
          <b>{g.total_today.toLocaleString()}</b> processed <span>·</span>
          <b className="negative">
            {g.total_errors_today.toLocaleString()}
          </b>{" "}
          failed
        </p>
      </article>
      <article className="pulse-block">
        <div className="small-label">
          <Cpu size={14} /> Runtime capacity
        </div>
        <div className="infra-row">
          <div>
            <strong>
              {g.heap_memory_pct.toFixed(1)}
              <small>%</small>
            </strong>
            <span>JVM heap</span>
            <div className="meter">
              <i style={{ width: `${g.heap_memory_pct}%` }} />
            </div>
          </div>
          <div>
            <strong>
              {active}
              <small> / {max}</small>
            </strong>
            <span>Flow instances</span>
            <div className="meter">
              <i
                className={active / Math.max(1, max) > 0.85 ? "warning" : ""}
                style={{ width: `${(active / Math.max(1, max)) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <p className="pulse-caption">
          CPU {g.cpu_pct.toFixed(1)}% <span>·</span> <TriangleAlert size={10} />{" "}
          {data.queues.total_dlq} dead letters
        </p>
      </article>
    </section>
  );
}
