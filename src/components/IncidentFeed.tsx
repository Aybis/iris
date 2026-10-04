import { ArrowUpRight, CheckCheck, FileText, Radio, Search, Sparkles } from 'lucide-react';
import type { Incident, IncidentFilter } from '../../shared/types';
import { PanelHeader, StatusPill } from './ui';

interface IncidentFeedProps {
  incidents: Incident[];
  filter: IncidentFilter;
  onFilterChange: (filter: IncidentFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onInspect: (incident: Incident) => void;
}

const filters: { value: IncidentFilter; label: string }[] = [{ value: 'ALL', label: 'All events' }, { value: 'CRITICAL', label: 'Critical' }, { value: 'WARNING', label: 'Warning' }, { value: 'INFO', label: 'Info' }, { value: 'RESOLVED', label: 'Resolved' }];

export default function IncidentFeed({ incidents, filter, onFilterChange, query, onQueryChange, onInspect }: IncidentFeedProps) {
  const filtered = incidents.filter(incident => {
    const resolved = incident.raw_code.startsWith('RESOLVED');
    const matchesFilter = filter === 'ALL' || (filter === 'RESOLVED' ? resolved : !resolved && (filter === 'CRITICAL' ? incident.level === 'CRITICAL' || incident.level === 'ERROR' : filter === 'WARNING' ? incident.level === 'WARN' : incident.level === 'INFO'));
    return matchesFilter && `${incident.id} ${incident.timestamp} ${incident.service} ${incident.raw_code} ${incident.plain_message}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <section className="panel incident-feed" id="incidents" aria-label="Live incident feed">
    <PanelHeader zone="E" title="Live incident feed" subtitle="Technical signals, in plain English">
      <div className="flex flex-wrap items-center gap-4"><span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Sparkles size={13} className="text-violet-400" /> BIP interpretation <span className="text-slate-600">·</span> Local rules</span><span className="stream-indicator flex items-center gap-1.5 text-[11px] text-emerald-400"><Radio size={12} /> LIVE</span></div>
    </PanelHeader>
    <div className="incident-toolbar mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="filter-tabs flex flex-wrap items-center gap-1" role="group" aria-label="Incident severity">{filters.map(option => <button key={option.value} className={`filter-tab rounded-md px-3 py-2 text-xs ${filter === option.value ? 'active' : ''}`} aria-pressed={filter === option.value} onClick={() => onFilterChange(option.value)}>{option.label}</button>)}</div>
      <label className="search-field incident-search flex min-w-0 items-center gap-2"><Search size={14} aria-hidden="true" /><input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search transaction / correlation ID…" aria-label="Search incidents by transaction or correlation ID" className="w-full min-w-0 bg-transparent text-xs outline-none" /></label>
    </div>
    <div className="table-scroll overflow-x-auto">
      <table className="data-table incident-table w-full text-left text-xs">
        <thead><tr><th>Time</th><th>Severity</th><th>Service</th><th>Event / interpretation</th><th aria-label="Inspect incident" /></tr></thead>
        <tbody>{filtered.map(incident => {
          const resolved = incident.raw_code.startsWith('RESOLVED');
          const critical = incident.level === 'ERROR' || incident.level === 'CRITICAL';
          const tone = resolved ? 'healthy' : critical ? 'critical' : incident.level === 'WARN' ? 'warning' : 'info';
          const level = resolved ? 'Resolved' : critical ? 'Critical' : incident.level === 'WARN' ? 'Warning' : 'Info';
          const code = incident.raw_code.match(/BIP\d{4}[A-Z]?/)?.[0];
          return <tr key={incident.id}>
            <td className="whitespace-nowrap align-top"><span className="mono text-[11px] text-slate-400">{incident.timestamp.includes('T') ? new Date(incident.timestamp).toLocaleTimeString('en-GB') : incident.timestamp}</span></td>
            <td className="align-top"><StatusPill tone={tone}>{level}</StatusPill></td>
            <td className="align-top"><span className="block whitespace-nowrap text-xs font-medium text-slate-300">{incident.service}</span><span className="mono mt-1.5 block text-[11px] text-slate-500">{incident.id}</span></td>
            <td className="incident-message align-top"><button className="w-full text-left" onClick={() => onInspect(incident)} aria-label={`Inspect incident ${incident.id}`}><span className="block text-xs leading-relaxed text-slate-300">{incident.plain_message}</span><span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">{resolved ? <CheckCheck size={11} /> : <FileText size={11} />}<span className="mono">{code ?? (resolved ? 'RECOVERY EVENT' : 'SYSTEM EVENT')}</span><span className="text-slate-600">·</span><span>Inspect raw event</span></span></button></td>
            <td className="align-top"><button className="icon-button" onClick={() => onInspect(incident)} aria-label={`Open details for ${incident.id}`}><ArrowUpRight size={14} /></button></td>
          </tr>;
        })}</tbody>
      </table>
      {filtered.length === 0 && <div className="empty-state flex flex-col items-center gap-2 py-10 text-center"><CheckCheck size={26} className="text-slate-500" /><p className="text-sm text-slate-300">No matching incidents</p><p className="text-xs text-slate-500">{query || filter !== 'ALL' ? 'Adjust the severity filter or search to see more events.' : 'Incoming events will appear here automatically.'}</p>{(query || filter !== 'ALL') && <button className="subtle-button mt-2" onClick={() => { onQueryChange(''); onFilterChange('ALL'); }}>Clear filters</button>}</div>}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>{filtered.length} of {incidents.length} recent events</span><span>Interpretations provide guidance; inspect raw events for context.</span></div>
  </section>;
}
