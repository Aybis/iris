# Flowstead

A Harvest Moon inspired operational dashboard for middleware, built with React, TypeScript, and Vite. Original SVG village artwork connects the operational metrics to an interactive scene.

## Run locally

```sh
npm install
npm run dev
```

The development server defaults to http://localhost:5173.

```sh
npm run build
npm test
```

## What is included

- Four operational zones: service health, traffic and partner latency, queues and dead letters, worker and server capacity.
- An incident journal with status filtering, detail views, and acknowledgment that does not falsely resolve an incident.
- Interactive partner stalls, service details, queue inspection, and a selectable dead-letter list.
- Three demo scenarios: partner outage, healthy recovery, and a traffic surge.
- A paused/live simulation, 15-minute and 60-minute reporting windows, and responsive layouts.
- Demo replay with confirmation, unavailable-partner blocking, and message ID deduplication.

## Data semantics

This is a frontend prototype, not a live IBM ACE monitoring integration. All values and incidents are simulated. Scenario changes reset simulation state; refreshing also resets it. No real requests are replayed.

Current rates represent a rolling 60-second sample; historical final-outcome counts use the selected reporting window. Counts are weighted and aggregated from partner data. Retries do not inflate unique transaction counts. Five-second simulation ticks update queue inventory, with ingress minus completions determining growth or drainage. Historical counts are fixed illustrative windows rather than accumulated real events.

Latency metrics cover successful responses. The BNI outage has no successful samples, so it displays a separate 30-second timeout. Final failures include business rejections; the DLQ is current failed-message inventory and is not equal to the selected window's failures. JVM heap and server CPU are separate signals; a snapshot alone is not evidence of a memory leak.

The production integration boundary is `src/data.ts`. Replace the snapshot and incident providers with authenticated server-side telemetry and replay endpoints before operational use. The existing field guide explains the demo behavior in the interface.
