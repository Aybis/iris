import { Activity, ArrowUpRight, Cable, Check, Radio, RefreshCw, Wallet } from 'lucide-react';
import type { ChannelId, Diagnostics, Telemetry } from '../../shared/types';
import { formatNumber, PanelHeader, StatusPill } from './ui';

const channelPresentation: Record<ChannelId, { initials: string; type: string; color: string }> = {
  BCA: { initials: 'BCA', type: 'Virtual account', color: '#60a5fa' },
  MANDIRI: { initials: 'M', type: 'Bill payment', color: '#fbbf24' },
  BNI: { initials: 'BNI', type: 'Virtual account', color: '#fb923c' },
  ASTRAPAY: { initials: 'A', type: 'E-wallet', color: '#a78bfa' },
  QRIS: { initials: 'QR', type: 'National QR', color: '#2dd4bf' },
};

interface ChannelMatrixProps {
  telemetry: Telemetry;
  diagnostics: Diagnostics | null;
  onInspect: (id: ChannelId) => void;
  onPing: (id: ChannelId) => Promise<void>;
  pending: string | null;
}

export default function ChannelMatrix({ telemetry, diagnostics, onInspect, onPing, pending }: ChannelMatrixProps) {
  const online = telemetry.channels.filter(channel => channel.status === 'UP').length;
  return <section className="panel channel-matrix" aria-label="Payment channel health">
    <PanelHeader zone="B" title="Payment channels" subtitle="Five routes. One clear picture.">
      <div className="flex items-center gap-2 text-xs text-slate-400"><Cable size={14} /><span><strong className="text-slate-200">{online}/5</strong> channels online</span></div>
    </PanelHeader>
    <div className="channel-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {telemetry.channels.map(channel => {
        const presentation = channelPresentation[channel.id];
        const tone = channel.status === 'UP' ? 'healthy' : channel.status === 'DEGRADED' ? 'warning' : 'critical';
        const status = channel.status === 'UP' ? 'Online' : channel.status === 'DEGRADED' ? 'Degraded' : 'Offline';
        const checking = pending === `ping:${channel.id}`;
        const p95 = diagnostics?.channel_p95_ms[channel.id];
        return <article key={channel.id} className={`channel-card ${tone}`}>
          <div className="flex items-start justify-between gap-2">
            <button className="channel-identity flex items-center gap-2.5 text-left" onClick={() => onInspect(channel.id)} aria-label={`Inspect ${channel.name}`}>
              <span className="channel-monogram" style={{ color: presentation.color, backgroundColor: `${presentation.color}12`, borderColor: `${presentation.color}30` }}>{presentation.initials}</span>
              <span><strong className="block text-sm">{channel.id === 'MANDIRI' ? 'Mandiri' : channel.id === 'ASTRAPAY' ? 'AstraPay' : channel.id}</strong><span className="muted mt-0.5 block text-[11px]">{presentation.type}</span></span>
            </button>
            <button className="icon-button" aria-label={`Open ${channel.name} telemetry`} onClick={() => onInspect(channel.id)}><ArrowUpRight size={15} /></button>
          </div>
          <div className="mt-4"><StatusPill tone={tone}>{status}</StatusPill></div>
          <div className="my-4 flex items-end justify-between gap-2">
            <div><span className="metric-number text-[28px] leading-none">{formatNumber(channel.tps, 1)}</span><span className="ml-1.5 text-xs text-slate-500">TPS</span></div>
            <Activity size={25} className={`channel-pulse ${tone}`} strokeWidth={1.4} aria-hidden="true" />
          </div>
          <div className="channel-stats space-y-2.5 border-t border-slate-700/40 pt-3 text-xs">
            <div className="flex items-center justify-between"><span className="muted">Avg latency</span><span className={`mono ${channel.latency_ms > 1000 ? 'text-amber-400' : 'text-slate-200'}`}>{formatNumber(channel.latency_ms)} <span className="text-slate-500">ms</span></span></div>
            <div className="flex items-center justify-between"><span className="muted">p95 latency</span><span className="mono text-slate-300">{p95 == null ? '—' : formatNumber(p95)} <span className="text-slate-500">ms</span></span></div>
            <div className="flex items-center justify-between"><span className="muted">Error rate</span><span className={`mono ${channel.error_rate > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatNumber(channel.error_rate, 2)}%</span></div>
          </div>
          <button className="subtle-button mt-4 w-full justify-center text-xs" onClick={() => void onPing(channel.id)} disabled={pending !== null} aria-label={`Ping ${channel.name}`}>
            {checking ? <RefreshCw size={13} className="animate-spin" /> : <Radio size={13} />} {checking ? 'Checking endpoint…' : 'Ping endpoint'}
          </button>
        </article>;
      })}
    </div>
    <div className="channel-footnote mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5"><Check size={12} /> Status from current telemetry</span><span className="flex items-center gap-1.5"><Activity size={12} /> Latency measures partner response</span><span className="ml-auto flex items-center gap-1.5"><Wallet size={12} /> Multi-bank payment gateway</span>
    </div>
  </section>;
}
