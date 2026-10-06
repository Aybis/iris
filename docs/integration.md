# IBM ACE / IBM MQ integration

The enterprise console runs completely in simulation by default. A live deployment needs an authenticated collector that combines ACE flow statistics, MQ counters, resource instrumentation and business audit outcomes. No live IBM installation or bank credentials were available for verification.

## Runtime configuration

| Variable | Meaning |
| --- | --- |
| `DATA_MODE` | `mock` (default) or `live` |
| `HOST`, `PORT` | Bind address, default `127.0.0.1:3001` |
| `PUBLIC_ORIGIN` | Exact browser-facing origin; development defaults to `http://localhost:5173` |
| `OPERATOR_TOKEN` | Operator login secret; mandatory in live mode |
| `ENTERPRISE_COLLECTOR_URL` | Full endpoint returning the strict `TelemetryPayload` in `shared/enterprise.ts` |
| `COLLECTOR_TOKEN` | Required bearer token when an enterprise live collector is configured |
| `CONTROL_STATE_PATH` | Atomic mock state file, default `data/control-state.json` |
| `NODE_EXTRA_CA_CERTS` | Optional private CA certificate bundle; TLS validation stays enabled |

`npm run dev` starts API and frontend. `npm run build` creates `dist`; `npm start` serves it together with the API. Production should use an HTTPS reverse proxy with WebSocket Upgrade forwarding and one browser/API origin. Collector redirects and embedded URL credentials are rejected; production requires an HTTPS collector. Secrets stay on the server.

The collector receives `?environment=Development`, `?environment=SIT%20%2F%20UAT`, or `?environment=Production`. Each environment is collected and validated separately. Samples older than five seconds or more than five seconds in the future are unavailable. Failed live collection never substitutes a mock snapshot. WebSocket clients reconnect with bounded exponential backoff. Mutations are disabled without fresh data.

## Enterprise API

Every endpoint below accepts an `environment` query parameter, defaulting to `Production`. Authentication and origin checks apply to all of them.

| Endpoint | Contract |
| --- | --- |
| `GET /api/control/snapshot` | Exact enterprise `TelemetryPayload`, no envelope |
| `WS /ws/telemetry` | Immediate enterprise snapshot, then updates every 1,000 ms |
| `GET /api/control/details` | `{registry, queues, audit, mode, actionsEnabled}` |
| `POST /api/control/services` | `{service: ServiceMetadata, reason}`; registers a stopped service |
| `PUT /api/control/services/:id` | `{service: ServiceMetadata, reason}`; updates metadata/runtime configuration |
| `POST /api/control/services/:id/lifecycle` | `{action: "start" | "stop" | "restart" | "archive", reason}` |
| `GET /api/control/dlq/:id` | Masked payload inspection |
| `POST /api/control/dlq/actions` | `{ids: string[], action: "retry" | "discard", reason}` |
| `GET /api/control/diagnostic-bundle` | Masked telemetry and operator audit JSON |

Reasons must contain 5–500 characters. Bulk commands accept 1–100 unique message IDs. All targets are validated before mutation; a stopped/error target blocks the entire replay. Already-handled messages return a conflict. Archival requires a stopped service with empty queues and no dead letters. Restart simulates a graceful drain and restart; it does not invoke a real ACE node.

Mock commands synchronously persist their audit and state in an atomically replaced file with mode 0600. Persistence failure rolls back the in-memory operation. This is a single-process demonstration store, not a distributed transaction or immutable production audit system. Environment namespaces isolate the data; their names do not imply that real clusters are connected.

Live `/details` currently exposes no configuration, queue-rate enrichment or audit provider. The main telemetry contract still supplies service status, node statistics, queue depths and masked DLQ summaries. Live administration and full payload inspection return 403 until an organizational provider is implemented. Do not simply remove that guard.

The earlier five-bank telemetry API remains available for compatibility at `/api/telemetry`, `/api/diagnostics` and `/ws/payments`. Its scenario, ping and payment replay routes are separate from the enterprise registry and are not used by the enterprise UI.

## Authentication and transport

Public `GET /api/config` reports data mode and authentication requirements. `POST /api/session` with `{token}` establishes an eight-hour HttpOnly, SameSite=Strict cookie. Production cookies are Secure; use HTTPS. `DELETE /api/session` revokes the session. Server tokens are compared using a constant-time digest check and never saved in browser storage. Sessions are process-local and expire on restart.

The server checks HTTP and WebSocket origins, rechecks authentication during broadcasts, rejects cross-site requests, limits JSON bodies to 16 KB, and rate-limits actions and sign-in. Status codes: 400 validation, 401 authentication, 403 disallowed operation/origin, 404 missing payload, 409 conflict, 429 rate limit, 503 unavailable telemetry. Forwarded client addresses are intentionally not trusted; configure a reviewed perimeter limiter when deploying behind a proxy.

## ACE and MQ adapters

`server/adapters/ibm.ts` contains `IbmAceAdminClient` and `IbmMqRestCollector`. ACE inventory discovers application, REST API and service containers before reading scoped message-flow collections. An independent integration server omits `/servers/{server}`. IDs are URL-encoded and calls use authentication, timeouts and TLS verification.

For ACE 13.0.5, application-scoped lifecycle routes include:

```
POST /apiv2/servers/{server}/applications/{application}/messageflows/{messageflow}/start
POST /apiv2/servers/{server}/applications/{application}/messageflows/{messageflow}/stop
```

Confirm scope and properties using your installed version's `/apidocs`. UDP changes, additional instances and user trace have version- and scope-specific administration behavior; per-service trace controls in this demo must not be mapped blindly to a server-wide trace endpoint. See [IBM message-flow administration](https://www.ibm.com/docs/en/app-connect/13.0.x?topic=mrbuara-administering-message-flows-by-using-administration-rest-api) and the [official ACE OpenAPI](https://github.com/ot4i/ace-admin-api/blob/main/13.0.5.0/openapi-appconnectenterprise.yaml).

The MQ client queries administrative REST v1 queue depth and maximum depth. That resource is not available in standalone mqweb; v3 uses MQSC action resources, so use an approved PCF/MQSC collector where appropriate. The read-only client never browses or requeues messages. See [IBM MQ queue GET](https://www.ibm.com/docs/en/ibm-mq/9.4.x?topic=adminqmgrqmgrnamequeue-get).

## Telemetry and masking semantics

- TPS must use consistent transaction boundaries across services, with retries distinguished from unique business outcomes.
- Daily volume uses Asia/Jakarta in the demo. Success/failure counts must come from reconciled final outcomes in a real installation.
- Compute p95 from measured latency samples or histograms. The seeded p95 values are simulated measurements, not multiples of an average.
- Sequential node-average waterfalls show relative time spent. They are not individual distributed traces. Error terminal counters are aggregated in the provided contract.
- JVM heap is one part of ACE resource usage. Heap dips do not prove garbage collection; a rising snapshot does not establish a memory leak.
- MQ ingestion, consumption and oldest-message age require instrumentation beyond queue depth. Mock queue metrics are illustrative; unreported live enrichment is left unavailable.
- JSON fields, known XML elements/attributes and recognized Base64 structured bodies are masked before payload transmission. Opaque Base64 is withheld. Extend the policy for organization-specific fields and enforce redaction at collection time. Do not put credentials in node URLs, logs or audit reasons.
- BIP translation is context-aware local rule matching. A wrapper code alone does not establish a root cause. Remediation should use nested exceptions and actual partner/network evidence.

## Production rollout boundary

Connect enterprise SSO/RBAC, durable audit and session storage, retention controls, collector monitoring, and a reviewed ACE/MQ administration provider. A payment timeout does not establish whether the partner executed the payment: reconcile the business outcome before retry, and preserve correlation and idempotency identifiers in a durable replay service.

Host the persistent Node WebSocket/API process on infrastructure that supports long-lived connections. The frontend may be hosted separately only with a deliberately reviewed API/authentication/proxy configuration. Installing the Vercel plugin does not deploy the service or configure that architecture.

## Living Town

The optional visual view uses the same enterprise snapshot and existing administration flows. `shared/town.ts` projects selected-service telemetry without modifying it. Demo Payment Gateway bank traffic is an illustrative distribution, clearly labeled in the UI; live bank-level values are unknown rather than inferred from aggregate flow health. Other services use measured node latency and status. Stale telemetry freezes motion; pausing motion does not pause monitoring.

Process village renders all supplied nodes, in source order, with extra rows for longer flows. `shared/processActivities.ts` classifies node types and descriptive names into receiving, validation, transformation, routing, aggregation, partner requests, storage, delivery or generic computation. Unknown Compute nodes remain generic. A stopped flow is idle; error nodes block downstream visual traffic; bottleneck latency slows crates. Node inspector values are the original snapshot counters and latencies. Routing branches, aggregation batch sizes, worker assignment and message colors are illustrative, not observed traces or branch-level telemetry.

The mock model now seeds business-specific Compute operations across the 26 services. On loading saved demo state it updates names/types only for untouched legacy sample pipelines. It preserves lifecycle state, configuration, metrics, DLQ decisions and audit history; custom node definitions and live collector data are not rewritten. This does not modify any deployed ACE flows.

## Verification

`tests/enterprise.test.ts` exercises domain counts, node counter conservation, schema validation, configuration constraints, lifecycle/archive guards, atomic bulk replay, persistent duplicate protection, rollback on failed persistence, masking, environment isolation, HTTP authentication, strict WebSocket updates and fail-closed live mode. Payment compatibility and adapter request tests remain in `tests/server.test.ts` and `tests/simulator.test.ts`. Browser verification covers catalog navigation, configuration, pipeline inspection, queue actions, incident filters and responsive layout.
