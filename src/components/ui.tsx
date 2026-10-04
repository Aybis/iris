import type { ReactNode } from 'react';

export type StatusTone = 'healthy' | 'warning' | 'critical' | 'info';
export type { IncidentFilter } from '../../shared/types';

export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const chartTooltipStyle = {
  background: '#0b1220',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
};

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`status-pill ${tone}`}><span className="status-dot" aria-hidden="true" />{children}</span>;
}

export function PanelHeader({ zone, title, subtitle, children }: { zone: string; title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="panel-head flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <span className="zone-label" aria-hidden="true">{zone}</span>
      <div><h2>{title}</h2>{subtitle && <p className="muted mt-1 text-xs">{subtitle}</p>}</div>
    </div>
    {children}
  </div>;
}

export function MiniMeter({ value, tone, label }: { value: number; tone: StatusTone; label: string }) {
  return <div className={`mini-meter ${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
    <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>;
}
