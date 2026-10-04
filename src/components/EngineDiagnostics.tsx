import { Cpu, Database, MemoryStick, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Diagnostics, HistoryPoint, Telemetry } from '../../shared/types';
import { chartTooltipStyle, formatNumber, PanelHeader, StatusPill } from './ui';

interface EngineDiagnosticsProps {
  telemetry: Telemetry;
  diagnostics: Diagnostics | null;
  history: HistoryPoint[];
}

export default function EngineDiagnostics({ telemetry, diagnostics, history }: EngineDiagnosticsProps) {
  const { system } = telemetry;
  const threadPct = system.active_threads / system.max_threads * 100;
  const threadTone = threadPct >= 100 ? 'critical' : threadPct > 85 ? 'warning' : 'healthy';
  const threadColor = threadTone === 'critical' ? '#fb7185' : threadTone === 'warning' ? '#fbbf24' : '#34d399';
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const heap = diagnostics?.heap_history.length ? diagnostics.heap_history : history.map(point => ({ timestamp: point.timestamp, value: point.heap, gc: false }));
  const gcEvents = heap.filter(point => point.gc);
  const idle = diagnostics?.db_pool_idle ?? system.db_pool_max - system.db_pool_active;
  const poolPct = system.db_pool_active / system.db_pool_max * 100;
  return <section className="panel engine-diagnostics" aria-label="IBM ACE engine diagnostics">
    <PanelHeader zone="D" title="Engine room" subtitle="IBM ACE · Integration server">
      <Cpu size={16} className="text-slate-500" />
    </PanelHeader>
    <div className="thread-section flex items-center gap-5 border-b border-slate-700/40 pb-5">
      <div className="worker-gauge relative h-[112px] w-[112px] shrink-0" role="meter" aria-label="Worker thread saturation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(threadPct)} aria-valuetext={`${system.active_threads} of ${system.max_threads} threads active`}>
        <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="56" cy="56" r={radius} fill="none" stroke="#203044" strokeWidth="7" /><circle cx="56" cy="56" r={radius} fill="none" stroke={threadColor} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(100, threadPct) / 100)} style={{ transition: 'stroke-dashoffset .5s ease, stroke .5s ease' }} /></svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="metric-number text-[25px] leading-none">{formatNumber(threadPct)}<span className="text-sm text-slate-500">%</span></strong><span className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-500">Busy</span></div>
      </div>
      <div className="min-w-0"><p className="small-label">Worker threads</p><p className="mb-2.5 mt-2 text-sm"><strong className="mono text-lg">{system.active_threads}</strong><span className="text-slate-500"> / {system.max_threads} active</span></p><StatusPill tone={threadTone}>{threadTone === 'healthy' ? 'Capacity available' : threadTone === 'critical' ? 'Fully saturated' : 'High saturation'}</StatusPill><p className="muted mt-2 text-[11px]">Warning above 85% utilization</p></div>
    </div>
    <div className="heap-section border-b border-slate-700/40 py-5">
      <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><MemoryStick size={15} className="text-violet-400" /><span className="text-xs text-slate-300">JVM heap memory</span></div><strong className={`mono text-lg ${system.heap_memory_pct > 85 ? 'text-amber-400' : 'text-slate-100'}`}>{formatNumber(system.heap_memory_pct, 1)}<span className="ml-0.5 text-xs text-slate-500">%</span></strong></div>
      <div className="heap-chart h-[112px] w-full min-w-0" aria-label="Heap memory usage history with garbage collection markers"><ResponsiveContainer width="100%" height="100%"><AreaChart data={heap} margin={{ top: 4, bottom: 0, left: -28, right: 8 }}>
        <defs><linearGradient id="engine-heap-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0.015} /></linearGradient></defs>
        <CartesianGrid stroke="#334155" strokeOpacity={0.28} vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="timestamp" hide /><YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={value => `${value}%`} />
        <Tooltip contentStyle={chartTooltipStyle} labelFormatter={value => new Date(String(value)).toLocaleTimeString('en-GB')} formatter={value => [`${formatNumber(Number(value), 1)}%`, 'Heap memory']} />
        <ReferenceLine y={85} stroke="#fbbf24" strokeOpacity={0.35} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={1.8} fill="url(#engine-heap-fill)" isAnimationActive={false} />
        {gcEvents.map((point, index) => <ReferenceDot key={`${point.timestamp}-${index}`} x={point.timestamp} y={point.value} r={3.5} fill="#2dd4bf" stroke="#111c2e" strokeWidth={2} />)}
      </AreaChart></ResponsiveContainer></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> GC events <span className="mono text-slate-300">{gcEvents.length}</span></span><span>85% warning threshold</span></div>
    </div>
    <div className="pool-section pt-5">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Database size={15} className="text-cyan-400" /><span className="text-xs text-slate-300">Audit database pool</span></div><span className="mono text-xs text-slate-400">{system.db_pool_active}<span className="text-slate-600"> / {system.db_pool_max}</span></span></div>
      <div className="db-connection-slots mt-4 flex gap-1" role="meter" aria-label="Database connections in use" aria-valuemin={0} aria-valuemax={system.db_pool_max} aria-valuenow={system.db_pool_active}>{Array.from({ length: Math.min(system.db_pool_max, 24) }, (_, i) => <span key={i} className={`h-4 min-w-0 flex-1 rounded-sm ${i < Math.ceil(poolPct / 100 * Math.min(system.db_pool_max, 24)) ? poolPct > 85 ? 'bg-amber-400/75' : 'bg-cyan-400/65' : 'bg-slate-700/60'}`} aria-hidden="true" />)}</div>
      <div className="mt-3 flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5 text-slate-400"><span className="h-1.5 w-1.5 rounded-sm bg-cyan-400" /><strong className="mono text-slate-200">{system.db_pool_active}</strong> active</span><span className="flex items-center gap-1.5 text-slate-500"><span className="h-1.5 w-1.5 rounded-sm bg-slate-600" /><strong className="mono text-slate-400">{idle}</strong> idle</span></div>
      {poolPct > 85 && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-400"><TriangleAlert size={12} /> Connection pool nearing capacity</p>}
    </div>
  </section>;
}
