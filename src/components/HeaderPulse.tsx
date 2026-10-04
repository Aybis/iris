import { Activity, ArrowUpRight, CircleCheck, Grid2X2, Sprout, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { HistoryPoint, IncidentFilter, Telemetry } from '../../shared/types';
import { chartTooltipStyle, formatNumber, StatusPill } from './ui';

interface HeaderPulseProps {
  telemetry: Telemetry;
  history: HistoryPoint[];
  onSeverity: (severity: IncidentFilter) => void;
  mode: 'noc' | 'town';
  onModeChange: (mode: 'noc' | 'town') => void;
}

export default function HeaderPulse({ telemetry, history, onSeverity, mode, onModeChange }: HeaderPulseProps) {
  const { system, latest_incidents: incidents } = telemetry;
  const healthTone = system.status === 'HEALTHY' ? 'healthy' : system.status === 'DEGRADED' ? 'warning' : 'critical';
  const healthLabel = system.status === 'HEALTHY' ? 'Operational' : system.status === 'DEGRADED' ? 'Degraded' : 'Outage';
  const alerts = [
    { id: 'CRITICAL', title: 'Critical', count: incidents.filter(i => (i.level === 'CRITICAL' || i.level === 'ERROR') && !i.raw_code.startsWith('RESOLVED')).length, tone: 'critical' },
    { id: 'WARNING', title: 'Warning', count: incidents.filter(i => i.level === 'WARN' && !i.raw_code.startsWith('RESOLVED')).length, tone: 'warning' },
    { id: 'RESOLVED', title: 'Resolved', count: incidents.filter(i => i.raw_code.startsWith('RESOLVED')).length, tone: 'healthy' },
  ] as const;
  const onlineCount = telemetry.channels.filter(c => c.status === 'UP').length;
  return <section className="executive-pulse" aria-label="Executive pulse">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><span className="eyebrow text-slate-500">A / Executive pulse</span><span className="h-1 w-1 rounded-full bg-slate-600"/><span className="text-xs text-slate-400">Your gateway, at a glance</span></div>
      <div className="view-mode-switch inline-flex rounded-lg border border-slate-700/60 bg-slate-950/30 p-1" role="group" aria-label="Dashboard view">
        <button onClick={() => onModeChange('noc')} aria-pressed={mode === 'noc'} className={`view-mode-button flex items-center gap-2 rounded-md px-3 py-2 text-xs ${mode === 'noc' ? 'active' : ''}`}><Grid2X2 size={14} /> NOC Matrix <span className="hidden sm:inline">View</span></button>
        <button onClick={() => onModeChange('town')} aria-pressed={mode === 'town'} className={`view-mode-button flex items-center gap-2 rounded-md px-3 py-2 text-xs ${mode === 'town' ? 'active' : ''}`}><Sprout size={14} /> Living Town <span className="hidden sm:inline">View</span></button>
      </div>
    </div>
    <div className="pulse-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article className={`panel pulse-card system-health ${healthTone}`}>
        <div className="mb-4 flex items-center justify-between"><p className="small-label">Global health</p><Activity size={16} className={healthTone === 'healthy' ? 'text-emerald-400' : healthTone === 'warning' ? 'text-amber-400' : 'text-rose-400'} /></div>
        <div className="flex items-center gap-3"><span className={`health-orb ${healthTone}`} aria-hidden="true" /><strong className="text-2xl font-semibold tracking-tight">{healthLabel}</strong></div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="muted">{onlineCount} of 5 channels online</span><StatusPill tone={healthTone}>{system.status === 'HEALTHY' ? 'All systems go' : onlineCount < 5 ? `${5 - onlineCount} need attention` : 'Check resources'}</StatusPill></div>
      </article>
      <article className="panel pulse-card relative overflow-hidden">
        <div className="mb-4 flex items-center justify-between"><p className="small-label">Global throughput</p><span className="mono text-[11px] text-slate-500">LAST 60S</span></div>
        <div className="flex items-center justify-between gap-2">
          <div className="shrink-0"><span className="metric-number text-[32px] leading-none">{formatNumber(system.global_tps, 1)}</span><span className="ml-2 text-xs text-slate-500">TPS</span></div>
          <div className="h-[46px] w-[45%] min-w-0" aria-label="Throughput trend over the last 60 seconds"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}><defs><linearGradient id="pulse-tps-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.28} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs><Tooltip contentStyle={chartTooltipStyle} labelFormatter={value => history[Number(value)]?.timestamp ? new Date(history[Number(value)].timestamp).toLocaleTimeString('en-GB') : 'Throughput'} formatter={value => [`${formatNumber(Number(value), 1)} TPS`, 'Transactions']} /><Area type="monotone" dataKey="tps" stroke="#34d399" strokeWidth={1.8} fill="url(#pulse-tps-fill)" isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
        </div>
        <p className="muted mt-3 flex items-center gap-1.5 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Transactions processed per second</p>
      </article>
      <article className="panel pulse-card">
        <div className="mb-4 flex items-center justify-between"><p className="small-label">Transactions today</p><ArrowUpRight size={16} className="text-slate-500" /></div>
        <div className="metric-number text-[32px] leading-none">{formatNumber(system.total_today)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className={`inline-flex items-center gap-1.5 ${system.success_rate >= 99 ? 'text-emerald-400' : 'text-amber-400'}`}><CircleCheck size={13} /><strong className="mono">{formatNumber(system.success_rate, 2)}%</strong> success</span><span className="text-slate-600">/</span><span className="muted">Daily total</span></div>
      </article>
      <article className="panel pulse-card">
        <div className="mb-4 flex items-center justify-between"><p className="small-label">Incident overview</p><TriangleAlert size={15} className="text-slate-500" /></div>
        <div className="grid grid-cols-3 gap-2">{alerts.map(alert => <button key={alert.id} className={`alert-count ${alert.tone}`} onClick={() => onSeverity(alert.id)} aria-label={`Show ${alert.count} ${alert.title.toLowerCase()} alerts`}><strong className="mono block text-[27px] leading-none">{alert.count}</strong><span className="mt-2 block text-[11px]">{alert.title}</span></button>)}</div>
        <p className="muted mt-3 text-[11px]">Select a severity to inspect the feed</p>
      </article>
    </div>
  </section>;
}
