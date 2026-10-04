import { useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, Eye, Inbox, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { Diagnostics, Telemetry } from '../../shared/types';
import { formatNumber, PanelHeader, StatusPill } from './ui';

interface QueueManagerProps {
  telemetry: Telemetry;
  diagnostics: Diagnostics | null;
  onPayload: (txId: string) => void;
  onRetry: (txId: string) => void;
  onDiscard: (txId: string) => void;
  pending: string | null;
}

export default function QueueManager({ telemetry, diagnostics, onPayload, onRetry, onDiscard, pending }: QueueManagerProps) {
  const [query, setQuery] = useState('');
  const { inbound_depth: depth, dlq_count: dlqCount, recent_dlq_items: items } = telemetry.queues;
  const tone = depth <= 50 ? 'healthy' : depth <= 200 ? 'warning' : 'critical';
  const filtered = items.filter(item => `${item.tx_id} ${item.channel} ${item.reason} ${item.timestamp}`.toLowerCase().includes(query.toLowerCase()));
  const backlogChange = diagnostics ? diagnostics.ingestion_tps - diagnostics.consumption_tps : null;
  return <section className="panel queue-manager" aria-label="IBM MQ queue and dead letter manager">
    <PanelHeader zone="C" title="Message queues" subtitle="IBM MQ · Buffer & recovery">
      <StatusPill tone={tone}>{tone === 'healthy' ? 'Within threshold' : tone === 'warning' ? 'Backlog growing' : 'Critical backlog'}</StatusPill>
    </PanelHeader>
    <div className="queue-summary grid gap-5 md:grid-cols-[1.25fr_1fr]">
      <div className="queue-depth-summary">
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Inbox size={15} /><span className="mono">PAYMENT.INBOUND</span></div><span className="small-label">Buffer queue</span></div>
        <div className="mb-4 mt-4 flex items-end gap-2"><strong className="metric-number text-[34px] leading-none">{formatNumber(depth)}</strong><span className="pb-1 text-xs text-slate-500">messages waiting</span></div>
        <div className={`queue-depth-meter ${tone}`} role="meter" aria-label="Inbound queue depth; normal through 50, warning through 200, critical above 200" aria-valuemin={0} aria-valuemax={Math.max(250, depth)} aria-valuenow={depth} aria-valuetext={`${depth} messages, ${tone === 'healthy' ? 'normal' : tone}`}>
          <span className="queue-meter-fill" style={{ width: `${Math.min(100, depth / 250 * 100)}%` }} /><span className="queue-threshold" style={{ left: '20%' }} /><span className="queue-threshold" style={{ left: '80%' }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>0 · NORMAL</span><span>51 · WARNING</span><span>201+ · CRITICAL</span></div>
      </div>
      <div className="queue-flow-summary rounded-lg border border-slate-700/40 bg-slate-950/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <div><span className="muted flex items-center gap-1 text-[11px]"><ArrowDownLeft size={13} className="text-cyan-400" /> Ingestion</span><div className="mt-2"><strong className="mono text-xl">{diagnostics ? formatNumber(diagnostics.ingestion_tps, 1) : '—'}</strong><span className="ml-1 text-[11px] text-slate-500">msg/s</span></div></div>
          <ArrowRight size={18} className="text-slate-600" />
          <div><span className="muted flex items-center gap-1 text-[11px]"><ArrowUpRight size={13} className="text-emerald-400" /> Consumption</span><div className="mt-2"><strong className="mono text-xl">{diagnostics ? formatNumber(diagnostics.consumption_tps, 1) : '—'}</strong><span className="ml-1 text-[11px] text-slate-500">msg/s</span></div></div>
        </div>
        <div className={`mt-3 border-t border-slate-700/40 pt-3 text-[11px] ${backlogChange != null && backlogChange > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
          {backlogChange == null ? 'Awaiting ingestion and consumption telemetry' : backlogChange > 0 ? `Arrivals exceed processing by ${formatNumber(backlogChange, 1)} msg/s` : backlogChange < 0 ? `Processing capacity exceeds arrivals by ${formatNumber(-backlogChange, 1)} msg/s` : 'Ingestion and consumption are balanced'}
        </div>
      </div>
    </div>
    <div className="dlq-heading mb-3 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/40 pt-5">
      <div className="flex items-center gap-2"><Boxes size={16} className={dlqCount ? 'text-amber-400' : 'text-slate-400'} /><h3 className="text-sm font-semibold">Dead letter queue</h3><span className={`count-badge ${dlqCount ? 'warning' : 'healthy'}`}>{formatNumber(dlqCount)}</span></div>
      <label className="search-field flex min-w-0 items-center gap-2"><Search size={14} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search dead letter messages" placeholder="Search transaction or channel…" className="w-full min-w-0 bg-transparent text-xs outline-none" /></label>
    </div>
    <div className="table-scroll overflow-x-auto">
      <table className="data-table dlq-table w-full text-left text-xs">
        <thead><tr><th>Transaction / time</th><th>Channel</th><th>Error reason</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.tx_id}>
          <td><button className="mono tx-link block text-left text-[11px] text-cyan-300" onClick={() => onPayload(item.tx_id)}>{item.tx_id}</button><span className="mono mt-1.5 block text-[11px] text-slate-500">{item.timestamp.includes('T') ? new Date(item.timestamp).toLocaleTimeString('en-GB') : item.timestamp}</span></td>
          <td><span className="channel-tag mono">{item.channel}</span></td>
          <td><span className="dlq-reason block max-w-[290px] text-[11px] leading-relaxed text-slate-400" title={item.reason}>{item.reason}</span></td>
          <td><div className="flex items-center justify-end gap-1.5">
            <button className="icon-button" title="View payload" aria-label={`View payload for ${item.tx_id}`} onClick={() => onPayload(item.tx_id)}><Eye size={14} /></button>
            <button className="icon-button retry-button" title="Re-queue / Retry" aria-label={`Retry ${item.tx_id}`} onClick={() => onRetry(item.tx_id)} disabled={pending !== null}><RefreshCw size={14} className={pending === `retry:${item.tx_id}` ? 'animate-spin' : ''} /></button>
            <button className="icon-button discard-button" title="Discard message" aria-label={`Discard ${item.tx_id}`} onClick={() => onDiscard(item.tx_id)} disabled={pending !== null}><Trash2 size={14} /></button>
          </div></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <div className="empty-state flex flex-col items-center gap-2 py-8 text-center"><CheckCircle2 size={24} className={dlqCount ? 'text-slate-500' : 'text-emerald-400'} /><p className="text-sm text-slate-300">{query ? 'No messages match your search' : dlqCount ? 'No recent message details available' : 'The dead letter queue is clear'}</p><p className="text-xs text-slate-500">{query ? 'Try a transaction ID, channel, or error reason.' : 'Failed messages appear here for inspection and recovery.'}</p></div>}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>Showing {filtered.length} of {items.length} available messages{dlqCount > items.length ? ` · ${formatNumber(dlqCount)} total in queue` : ''}</span><span className="flex items-center gap-1.5"><RefreshCw size={11} /> Retry returns a message to inbound</span></div>
  </section>;
}
