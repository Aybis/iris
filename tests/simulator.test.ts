import { describe, it, expect } from 'vitest';
import { Simulator } from '../shared/simulator';
import { scenarioIds,telemetrySchema,diagnosticsSchema } from '../shared/types';
import { translateBip } from '../shared/translator';

describe('telemetry contract and accounting',()=>{
  for(const scenario of scenarioIds) it(`${scenario} conforms and rates reconcile`,()=>{
    const sim=new Simulator(scenario,new Date('2026-10-05T05:15:00Z'));
    const initial=sim.getTelemetry().queues.inbound_depth;
    for(let t=0;t<8;t++){sim.tick();const state=sim.getTelemetry();expect(telemetrySchema.safeParse(state).success).toBe(true);expect(diagnosticsSchema.safeParse(sim.getDiagnostics()).success).toBe(true);expect(state.system.global_tps).toBeCloseTo(state.channels.reduce((n,c)=>n+c.tps,0),1);}
    const state=sim.getTelemetry();expect(state.system.active_threads).toBeLessThanOrEqual(state.system.max_threads);
    if(scenario==='normal')expect(state.queues.inbound_depth).toBe(0);else expect(state.queues.inbound_depth).toBeGreaterThan(initial);
  });
  it('never invents successful p95 samples for offline banks',()=>{
    const sim=new Simulator('bni_timeout');for(let i=0;i<3;i++)sim.tick();expect(sim.getDiagnostics().channel_p95_ms.BNI).toBeNull();expect(sim.getTelemetry().channels.find(c=>c.id==='BNI')?.tps).toBe(0);
  });
  it('blocks offline replay and prevents duplicated successful replay',()=>{
    const blocked=new Simulator('bni_timeout');const bni=blocked.getTelemetry().queues.recent_dlq_items.find(i=>i.channel==='BNI')!;
    expect(blocked.retry(bni.tx_id).ok).toBe(false);expect(blocked.getTelemetry().queues.dlq_count).toBe(3);
    const sim=new Simulator();const item=sim.getTelemetry().queues.recent_dlq_items[0];const depth=sim.getTelemetry().queues.inbound_depth;
    expect(sim.retry(item.tx_id).ok).toBe(true);expect(sim.retry(item.tx_id).ok).toBe(false);expect(sim.getTelemetry().queues.inbound_depth).toBe(depth+1);expect(sim.getTelemetry().queues.dlq_count).toBe(2);
  });
  it('discards only the selected message',()=>{const sim=new Simulator();const id=sim.getTelemetry().queues.recent_dlq_items[0].tx_id;expect(sim.discard(id).ok).toBe(true);expect(()=>sim.getPayload(id)).toThrow();expect(sim.getTelemetry().queues.dlq_count).toBe(2);});
  it('resets daily totals at Jakarta midnight',()=>{const sim=new Simulator('normal',new Date('2026-10-05T16:59:59Z'));sim.tick(new Date('2026-10-05T17:00:00Z'));expect(sim.getTelemetry().system.total_today).toBeLessThan(100);});
  it('marks GC drops without exceeding heap bounds',()=>{const sim=new Simulator();for(let i=0;i<25;i++)sim.tick();const h=sim.getDiagnostics().heap_history;const gc=h.findIndex(v=>v.gc);expect(gc).toBeGreaterThan(0);expect(h[gc].value).toBeLessThan(h[gc-1].value);});
  it('rejects malformed and extra websocket fields',()=>{const s=new Simulator().getTelemetry();expect(telemetrySchema.safeParse({...s,untracked:true}).success).toBe(false);s.channels[1].id='BCA';expect(telemetrySchema.safeParse(s).success).toBe(false);});
});
describe('BIP interpretation',()=>{
  it('uses nested timeout context and does not diagnose from BIP alone',()=>{expect(translateBip("BIP2230E: SocketTimeoutException on Node 'HTTP_BCA_Call' timeout=30000ms").message).toContain('BCA payment endpoint did not respond within 30 seconds');expect(translateBip('BIP2230E').confidence).toBe('unknown');});
  it('interprets security context without assuming token expiration',()=>{const result=translateBip("BIP3722E: Security signature verification failed for Client ID 'INTERNAL_APP'");expect(result.confidence).toBe('contextual');expect(result.message).toContain('signing key');});
});
