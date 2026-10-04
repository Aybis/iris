export type Scenario = 'outage' | 'healthy' | 'surge';
export type WindowMinutes = 15 | 60;
export type ReplayBatch = { count: number; tick: number };

export type Partner = {
  name: string;
  code: string;
  status: 'healthy' | 'warning' | 'down';
  completedRate: number;
  latency: number | null;
  timeout?: number;
  successes: number;
  failures: number;
};

export type Snapshot = {
  incomingRate: number;
  completedRate: number;
  successes: number;
  failures: number;
  successRate: number;
  averageLatency: number;
  p95: number;
  p99: number;
  queue: number;
  oldestSeconds: number;
  queueDelta: number;
  dlq: number;
  workers: number;
  totalWorkers: number;
  heap: number;
  cpu: number;
  partners: Partner[];
};

export type Incident = {
  id: string;
  time: string;
  service: string;
  message: string;
  status: 'active' | 'warning' | 'resolved';
};

type ScenarioData = {
  incomingRate: number;
  initialQueue: number;
  initialOldestSeconds: number;
  workers: number;
  heap: number;
  cpu: number;
  averageLatency: number;
  p95: number;
  p99: number;
  partners: Partner[];
};

const TICK_SECONDS = 5;
const INITIAL_DLQ = 5;

const scenarios: Record<Scenario, ScenarioData> = {
  outage: {
    incomingRate: 45,
    initialQueue: 1_450,
    initialOldestSeconds: 420,
    workers: 8,
    heap: 68,
    cpu: 42,
    averageLatency: 120,
    p95: 210,
    p99: 420,
    partners: [
      { name: 'BCA', code: 'BCA', status: 'healthy', completedRate: 24, latency: 90, successes: 18_000, failures: 0 },
      { name: 'Mandiri', code: 'MDR', status: 'healthy', completedRate: 12, latency: 120, successes: 11_988, failures: 12 },
      { name: 'BNI', code: 'BNI', status: 'down', completedRate: 0, latency: null, timeout: 30_000, successes: 0, failures: 110 },
      { name: 'AstraPay', code: 'ASP', status: 'healthy', completedRate: 6, latency: 160, successes: 10_390, failures: 0 },
    ],
  },
  healthy: {
    incomingRate: 45,
    initialQueue: 220,
    initialOldestSeconds: 90,
    workers: 6,
    heap: 54,
    cpu: 34,
    averageLatency: 108,
    p95: 180,
    p99: 310,
    partners: [
      { name: 'BCA', code: 'BCA', status: 'healthy', completedRate: 26, latency: 84, successes: 19_990, failures: 10 },
      { name: 'Mandiri', code: 'MDR', status: 'healthy', completedRate: 12, latency: 105, successes: 10_792, failures: 8 },
      { name: 'BNI', code: 'BNI', status: 'healthy', completedRate: 4, latency: 128, successes: 3_998, failures: 2 },
      { name: 'AstraPay', code: 'ASP', status: 'healthy', completedRate: 6, latency: 116, successes: 8_400, failures: 0 },
    ],
  },
  surge: {
    incomingRate: 120,
    initialQueue: 780,
    initialOldestSeconds: 92,
    workers: 10,
    heap: 83,
    cpu: 89,
    averageLatency: 480,
    p95: 980,
    p99: 1_800,
    partners: [
      { name: 'BCA', code: 'BCA', status: 'healthy', completedRate: 48, latency: 280, successes: 43_170, failures: 30 },
      { name: 'Mandiri', code: 'MDR', status: 'warning', completedRate: 30, latency: 620, successes: 26_910, failures: 90 },
      { name: 'BNI', code: 'BNI', status: 'warning', completedRate: 20, latency: 740, successes: 17_920, failures: 80 },
      { name: 'AstraPay', code: 'ASP', status: 'healthy', completedRate: 12, latency: 340, successes: 10_790, failures: 10 },
    ],
  },
};

const nonNegativeInteger = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/**
 * Illustrative rolling-window counts, not telemetry from a running middleware.
 * Rates describe the current simulation; historical counts do not grow with ticks.
 * Final outcomes count each transaction once, never individual retry attempts.
 * In the outage window, 5 of 122 failures entered DLQ; the other 117 are terminal
 * business rejections. DLQ is a current inventory, not the window's error count.
 * Latency is sampled from successful completions; timeouts are shown separately.
 * Without replayBatches, replayed represents messages requeued at interval start.
 * With batches, each replay enters the queue at its recorded five-second tick.
 * Batch counts are bounded by replayed; the app owns message-ID deduplication.
 */
export function getSnapshot(
  scenario: Scenario,
  windowMinutes: WindowMinutes,
  ticks: number,
  replayed: number,
  replayBatches?: ReplayBatch[],
): Snapshot {
  const data = scenarios[scenario];
  const countScale = windowMinutes / 15;
  const elapsedSeconds = nonNegativeInteger(ticks) * TICK_SECONDS;
  const replayCount = Math.min(INITIAL_DLQ, nonNegativeInteger(replayed));
  const partners = data.partners.map((partner) => ({
    ...partner,
    successes: partner.successes * countScale,
    failures: partner.failures * countScale,
  }));
  const capacity = partners.reduce((sum, partner) => sum + partner.completedRate, 0);
  const initialDelta = data.incomingRate - capacity;
  let queue = Math.max(0, data.initialQueue + replayCount + elapsedSeconds * initialDelta);

  if (replayBatches !== undefined) {
    const currentTick = nonNegativeInteger(ticks);
    const batches = replayBatches
      .map((batch) => ({ count: nonNegativeInteger(batch.count), tick: nonNegativeInteger(batch.tick) }))
      .filter((batch) => batch.tick <= currentTick)
      .sort((first, second) => first.tick - second.tick);
    let previousTick = 0;
    let remainingReplayCount = replayCount;
    queue = data.initialQueue;

    // Advance the same queue between events so processing capacity is never
    // spent twice or carried forward after a previously empty queue.
    for (const batch of batches) {
      queue = Math.max(0, queue + (batch.tick - previousTick) * TICK_SECONDS * initialDelta);
      const queuedCount = Math.min(remainingReplayCount, batch.count);
      queue += queuedCount;
      remainingReplayCount -= queuedCount;
      previousTick = batch.tick;
    }

    queue = Math.max(0, queue + (currentTick - previousTick) * TICK_SECONDS * initialDelta);
  }

  // Spare workers cannot finalize more new messages than arrive after a queue drains.
  if (queue === 0 && initialDelta < 0) {
    partners[0].completedRate += initialDelta;
  }

  const completedRate = partners.reduce((sum, partner) => sum + partner.completedRate, 0);
  const successes = partners.reduce((sum, partner) => sum + partner.successes, 0);
  const failures = partners.reduce((sum, partner) => sum + partner.failures, 0);
  const finalized = successes + failures;

  return {
    incomingRate: data.incomingRate,
    completedRate,
    successes,
    failures,
    successRate: finalized === 0 ? 0 : (successes / finalized) * 100,
    averageLatency: data.averageLatency,
    p95: data.p95,
    p99: data.p99,
    queue,
    oldestSeconds: queue === 0 ? 0 : Math.max(0, data.initialOldestSeconds + (initialDelta < 0 ? -elapsedSeconds : elapsedSeconds)),
    queueDelta: data.incomingRate - completedRate,
    dlq: INITIAL_DLQ - replayCount,
    workers: data.workers,
    totalWorkers: 10,
    heap: data.heap,
    cpu: data.cpu,
    partners,
  };
}

const incidents: Record<Scenario, Incident[]> = {
  outage: [
    { id: 'bni-timeout', time: '14:32:08', service: 'BNI', message: 'Bank API did not respond within 30 seconds. New transfers are waiting safely in the queue.', status: 'active' },
    { id: 'queue-growing', time: '14:31:42', service: 'Payment Gateway', message: 'Incoming payments exceed completed payments by 3 messages per second.', status: 'warning' },
    { id: 'dlq-review', time: '14:29:16', service: 'BNI', message: '5 messages exhausted their retry limit and need review in the reject bin.', status: 'warning' },
    { id: 'customer-sync', time: '14:27:05', service: 'Customer Sync', message: 'Customer updates caught up. All pending records were delivered.', status: 'resolved' },
  ],
  healthy: [
    { id: 'bni-recovered', time: '14:35:12', service: 'BNI', message: 'Bank connection restored. Successful transfers are completing again.', status: 'resolved' },
    { id: 'queue-draining', time: '14:34:48', service: 'Payment Gateway', message: 'Workers can process 3 more messages per second than arrive while the remaining queue drains.', status: 'resolved' },
    { id: 'dlq-review', time: '14:33:20', service: 'BNI', message: '5 messages from the earlier outage remain in the reject bin for review.', status: 'warning' },
    { id: 'order-processor', time: '14:32:05', service: 'Order Processor', message: 'Order delivery checks passed. All partner routes are reachable.', status: 'resolved' },
  ],
  surge: [
    { id: 'workers-full', time: '14:38:14', service: 'Payment Gateway', message: 'All 10 workers are busy. New requests are entering the queue.', status: 'active' },
    { id: 'queue-growing', time: '14:37:46', service: 'Order Processor', message: 'Traffic reached 120 messages per second. The queue is growing by 10 per second.', status: 'warning' },
    { id: 'partner-latency', time: '14:36:28', service: 'Mandiri / BNI', message: 'Successful replies are slower than usual during the traffic surge. Both banks remain reachable.', status: 'warning' },
    { id: 'customer-sync', time: '14:35:04', service: 'Customer Sync', message: 'Customer updates completed successfully; no sync backlog remains.', status: 'resolved' },
  ],
};

/** Fixed Jakarta (WIB) timestamps for the demo incident history. */
export function getIncidents(scenario: Scenario, remainingDlq = INITIAL_DLQ): Incident[] {
  const remaining = nonNegativeInteger(remainingDlq);

  return incidents[scenario].map((incident) => {
    if (incident.id !== 'dlq-review') return { ...incident };
    if (remaining === 0) {
      return {
        ...incident,
        message: 'All reject-bin messages were requeued for processing. The reject bin is empty.',
        status: 'resolved',
      };
    }

    return {
      ...incident,
      message: `${remaining} ${remaining === 1 ? 'message remains' : 'messages remain'} in the reject bin after exhausting retries and ${remaining === 1 ? 'needs' : 'need'} review.`,
      status: 'warning',
    };
  });
}
