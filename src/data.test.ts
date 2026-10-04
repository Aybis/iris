import { describe, expect, it } from 'vitest';
import { getIncidents, getSnapshot } from './data';
import type { Scenario } from './data';

const scenarios: Scenario[] = ['outage', 'healthy', 'surge'];

describe('dashboard snapshots', () => {
  it.each(scenarios)('aggregates unique final outcomes and rates for %s', (scenario) => {
    const snapshot = getSnapshot(scenario, 15, 0, 0);
    const sum = (field: 'successes' | 'failures' | 'completedRate') =>
      snapshot.partners.reduce((total, partner) => total + partner[field], 0);

    expect(snapshot.successes).toBe(sum('successes'));
    expect(snapshot.failures).toBe(sum('failures'));
    expect(snapshot.completedRate).toBe(sum('completedRate'));
    expect(snapshot.successRate).toBeCloseTo((snapshot.successes / (snapshot.successes + snapshot.failures)) * 100);
  });

  it('distinguishes outage transaction failures, DLQ inventory, and missing successful samples', () => {
    const snapshot = getSnapshot('outage', 15, 0, 0);
    const bni = snapshot.partners.find((partner) => partner.name === 'BNI');

    expect(snapshot.successes).toBe(40_378);
    expect(snapshot.failures).toBe(122);
    expect(snapshot.successes + snapshot.failures).toBe(40_500);
    expect(snapshot.successRate).toBeCloseTo(99.6988, 4);
    expect(snapshot.dlq).toBe(5);
    expect(bni).toMatchObject({ status: 'down', completedRate: 0, latency: null, timeout: 30_000, successes: 0, failures: 110 });
    expect(snapshot.averageLatency).toBeLessThan(snapshot.p95);
    expect(snapshot.p95).toBeLessThan(snapshot.p99);
  });

  it.each(scenarios)('scales historical counts without scaling live metrics for %s', (scenario) => {
    const quarterHour = getSnapshot(scenario, 15, 2, 1);
    const hour = getSnapshot(scenario, 60, 2, 1);

    expect(hour.successes).toBe(quarterHour.successes * 4);
    expect(hour.failures).toBe(quarterHour.failures * 4);
    expect(hour.successRate).toBe(quarterHour.successRate);
    expect(hour.queue).toBe(quarterHour.queue);
    expect(hour.dlq).toBe(quarterHour.dlq);
    expect(hour.completedRate).toBe(quarterHour.completedRate);
  });

  it.each(scenarios)('changes backlog by the arrival/completion difference over five-second ticks for %s', (scenario) => {
    const initial = getSnapshot(scenario, 15, 0, 0);
    const afterTenSeconds = getSnapshot(scenario, 15, 2, 0);

    expect(initial.queueDelta).toBe(initial.incomingRate - initial.completedRate);
    expect(afterTenSeconds.queue - initial.queue).toBe(initial.queueDelta * 10);
  });

  it('stops draining at zero and finalizes only arriving traffic when healthy', () => {
    const snapshot = getSnapshot('healthy', 15, 1_000, 0);

    expect(snapshot.queue).toBe(0);
    expect(snapshot.oldestSeconds).toBe(0);
    expect(snapshot.queueDelta).toBe(0);
    expect(snapshot.completedRate).toBe(snapshot.incomingRate);
    expect(snapshot.partners.every((partner) => partner.status === 'healthy')).toBe(true);
  });

  it('requeues selected messages once, caps replay at inventory, and never makes DLQ negative', () => {
    const initial = getSnapshot('outage', 15, 0, 0);
    const partial = getSnapshot('outage', 15, 0, 2);
    const excessive = getSnapshot('outage', 15, 0, 999);

    expect(partial.dlq).toBe(3);
    expect(partial.queue).toBe(initial.queue + 2);
    expect(excessive.dlq).toBe(0);
    expect(excessive.queue).toBe(initial.queue + 5);
    expect(partial.successes).toBe(initial.successes);
    expect(partial.failures).toBe(initial.failures);
  });

  it('keeps subsequent snapshots isolated from UI edits and invalid counters', () => {
    const snapshot = getSnapshot('outage', 15, 0, 0);
    snapshot.partners[0].completedRate = 999;
    const fresh = getSnapshot('outage', 15, -10, -2);

    expect(fresh.completedRate).toBe(42);
    expect(fresh.queue).toBe(1_450);
    expect(fresh.dlq).toBe(5);
  });

  it('shows a replay immediately after healthy backlog drained, then drains it on the next tick', () => {
    const batches = [{ count: 2, tick: 20 }];
    const beforeReplay = getSnapshot('healthy', 15, 20, 0, []);
    const immediate = getSnapshot('healthy', 15, 20, 2, batches);
    const nextTick = getSnapshot('healthy', 15, 21, 2, batches);

    expect(beforeReplay.queue).toBe(0);
    expect(immediate.queue).toBe(2);
    expect(immediate.dlq).toBe(3);
    expect(immediate.queueDelta).toBe(-3);
    expect(nextTick.queue).toBe(0);
    expect(nextTick.queueDelta).toBe(0);
    expect(nextTick.dlq).toBe(3);
  });

  it('uses capacity once across the existing queue and separate replay batches', () => {
    const batches = [{ count: 3, tick: 20 }, { count: 2, tick: 14 }];
    const duringOriginalBacklog = getSnapshot('healthy', 15, 14, 5, batches);
    const betweenBatches = getSnapshot('healthy', 15, 15, 5, batches);
    const atLaterBatch = getSnapshot('healthy', 15, 20, 5, batches);

    expect(duringOriginalBacklog.queue).toBe(12);
    expect(betweenBatches.queue).toBe(0);
    expect(atLaterBatch.queue).toBe(3);
    expect(getSnapshot('healthy', 15, 21, 5, batches).queue).toBe(0);
    expect(batches[0].tick).toBe(20);
  });

  it.each(['outage', 'surge'] as const)('adds replay batches to the growing %s backlog', (scenario) => {
    const base = getSnapshot(scenario, 15, 20, 0);
    const replay = getSnapshot(scenario, 15, 20, 5, [{ count: 2, tick: 8 }, { count: 3, tick: 20 }]);

    expect(replay.queue).toBe(base.queue + 5);
    expect(replay.dlq).toBe(0);
  });

  it('bounds batch queue contributions by replay inventory and sanitizes invalid counters', () => {
    const snapshot = getSnapshot('outage', 15, -5, 999, [{ count: -2, tick: -5 }, { count: 999, tick: 0 }]);
    const bounded = getSnapshot('healthy', 15, 20, 2, [{ count: 2, tick: 20 }, { count: 2, tick: 20 }]);

    expect(snapshot.queue).toBe(1_455);
    expect(snapshot.dlq).toBe(0);
    expect(bounded.queue).toBe(2);
    expect(bounded.dlq).toBe(3);
  });
});

describe('incident feed', () => {
  it.each(scenarios)('provides four independent incident records for %s', (scenario) => {
    const rows = getIncidents(scenario);

    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.id)).size).toBe(4);
    expect(rows.every((row) => /^14:\d{2}:\d{2}$/.test(row.time))).toBe(true);
    rows[0].status = 'warning';
    expect(getIncidents(scenario)[0]).not.toBe(rows[0]);
  });

  it.each(['outage', 'healthy'] as const)('keeps the %s reject-bin incident consistent with remaining inventory', (scenario) => {
    const remaining = getIncidents(scenario, 2).find((incident) => incident.id === 'dlq-review');
    const empty = getIncidents(scenario, 0).find((incident) => incident.id === 'dlq-review');
    const negative = getIncidents(scenario, -4).find((incident) => incident.id === 'dlq-review');

    expect(remaining).toMatchObject({ status: 'warning' });
    expect(remaining?.message).toContain('2 messages remain');
    expect(empty).toMatchObject({ status: 'resolved' });
    expect(empty?.message).toContain('reject bin is empty');
    expect(negative).toEqual(empty);
  });
});
