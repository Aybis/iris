# Flowstead Enterprise Control Plane

A professional, dark-mode observability and operations console for IBM ACE and IBM MQ. It starts with 26 simulated enterprise services across Finance & Payments, Core Banking, Customer & Identity, Logistics, and ERP. Switch between a professional NOC console and a Harvest Moon-inspired Living Town. Both views share the same enterprise telemetry and operational tools.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies the Express API and WebSocket server on port 3001. The default is an explicitly labeled simulation: it never contacts banks or modifies an IBM installation.

```sh
npm test
npm run build
npm start
```

`npm start` serves the compiled frontend and API together on port 3001. Production cookies require HTTPS; configure the external `PUBLIC_ORIGIN` when running behind a reverse proxy. Copy `.env.example` to `.env` to configure the server.

## Included workflows

- Living Town opens by default, with animated craftsmen, couriers, crates, chimney smoke, an MQ grain silo, a reject bin and trading docks. Choose any service through five business districts; inspect buildings or worker slots and jump directly to its NOC tools. The top bar switches between both views. Pause, zoom, reduced-motion support and stale-telemetry freezing are built in.
- Every service also has a **Process village**: a numbered journey through its actual node list. Aggregation barns merge crates, routing offices split deliveries, transformation mills change payload colors, validation gates check arrivals, and record libraries/depot buildings store and deliver work. Quick links open representative aggregator, router and transformation services. Inspect a building for node counters, latency and errors, then open that same node in NOC. Non-payment services open this scene by default; both village scenes remain available for every service.

- Global health counts, daily volume, failures, success rate, a rolling 60-second throughput chart, JVM heap, CPU and worker occupancy.
- A searchable service catalog with five domain groups, protocol/state filters, table/grid views, owners and queue metrics.
- Per-service node pipelines, sequential latency waterfalls, terminal counters, configuration context and masked request/response examples.
- Service registration, metadata/runtime editing, trace settings, start/stop/restart and guarded archival. Every operation requires an audit reason.
- Queue inventory, searchable dead letters, JSON/XML/Base64 masking, single/bulk replay and discard. Bulk replay validates every target before changing any message; duplicate handling is rejected.
- Live incident and operator audit streams, severity/search/source filters, pause, auto-scroll, BIP diagnostics, CSV/JSON exports and a diagnostic bundle.
- Separate Development, SIT/UAT and Production simulation namespaces. Mock operations persist to `data/control-state.json`; browser fallback state is temporary.
- Authenticated, same-origin REST/WebSocket support, strict runtime schema checks, stale-source detection, rate/body limits and automatic reconnect.

## Component map

| Component | Responsibility |
| --- | --- |
| `LivingTownView` / `LivingTownCanvas` / `townProcessScene` | Interactive service and process villages, specialist animations and node telemetry inspection |
| `HeaderPulse` | Global telemetry and health filtering |
| `ServiceCatalog` | 26-service discovery and operational navigation |
| `ProcessFlowInspector` | Node pipeline, waterfall and inspection |
| `ServiceConfigModal` | Metadata, runtime, retry, trace and audit configuration |
| `QueueAndDlqManager` | Inbound inventory and bulk DLQ workflows |
| `IncidentLogStream` | Unified incident/audit stream and exports |
| `useControlTelemetry` | Strict validation, environment state, reconnect and fallback |

`shared/enterprise.ts` defines the exact requested `TelemetryPayload` contract. `shared/enterpriseModel.ts` powers both the backend simulation and offline browser fallback. `server/control.ts` implements environment-scoped REST operations and durable mock state.

## Live integration boundary

The complete local workflow runs out of the box. Live observability accepts your authenticated enterprise collector through `ENTERPRISE_COLLECTOR_URL`. The repository also includes read-only ACE inventory and MQ queue clients. No live IBM deployment was available to verify.

Live lifecycle/configuration/DLQ writes remain disabled. Wire these to a reviewed administration and replay service, with organizational identity/RBAC, a durable audit store, idempotency reconciliation and version-specific ACE/MQ behavior before operational deployment. The browser's code and payload comparisons are explicitly labeled examples, not captured production source or messages. BIP explanations use local deterministic rules, not an external AI model.

See [the integration guide](docs/integration.md) for endpoints, collector configuration, security boundaries, and deployment notes.

## Town telemetry semantics

Worker occupancy, flow throughput and queue inventory use the selected service from the same `TelemetryPayload` as NOC. The furnace displays global JVM heap. Carts illustrate activity and are not individual distributed traces. Payment Gateway shows BCA, Mandiri, BNI, AstraPay and QRIS docks; in demo mode their explicitly labeled bank split is illustrative and conserves the flow total. Live bank metrics remain unknown until a collector provides them. Other services display their actual process nodes as stops. Individual craftsman identities are visual slots, not observed thread IDs.
