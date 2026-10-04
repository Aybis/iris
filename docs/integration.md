# Connecting Flowstead to IBM ACE and IBM MQ

The checked-in application is immediately usable with simulated payments. Connecting it to an enterprise installation requires a telemetry collector that understands the organization's payment routes, success criteria, audit database, and monitoring configuration. The repository contains working read-only ACE and MQ clients, a validated collector transport, and an explicit interface for an audited action service. No IBM cluster or real bank credentials were available for end-to-end live verification.

## Runtime configuration

The server reads `.env` at startup. It defaults to loopback port 3001 and mock data. The development frontend proxies `/api` and `/ws` to that server. After building the frontend, the same server also serves `dist`.

| Variable | Purpose |
| --- | --- |
| `DATA_MODE` | `mock` (default) or `live`; invalid values prevent startup. |
| `PORT` / `HOST` | Defaults: `3001` / `127.0.0.1`. |
| `NODE_ENV` | Set `production` behind your HTTPS reverse proxy to enable secure cookies and the production content security policy. |
| `PUBLIC_ORIGIN` | Exact external origin, for example `https://payments-ops.example.com`. Development defaults to `http://localhost:5173`. |
| `OPERATOR_TOKEN` | Operator sign-in secret. Mandatory in live mode; optional for the local mock. Use a long random secret provided by your secret manager. |
| `TELEMETRY_COLLECTOR_URL` | Full URL of an authenticated endpoint returning the exact `Telemetry` object defined in `shared/types.ts`. |
| `DIAGNOSTICS_COLLECTOR_URL` | Optional full URL returning the separate `Diagnostics` object. Needed for real p95, ingestion/consumption, GC markers, and heap history. |
| `COLLECTOR_TOKEN` | Bearer token for both collector endpoints. |
| `COLLECTOR_USERNAME` / `COLLECTOR_PASSWORD` | Optional Basic authentication alternative to a collector bearer token. |
| `NODE_EXTRA_CA_CERTS` | Node's standard option for a private certificate authority. Certificate verification remains enabled. |

Use HTTPS for production collector URLs, keep credentials out of browser bundles, and forward the public Host and WebSocket Upgrade headers from the reverse proxy. If the proxy rewrites Host, configure `PUBLIC_ORIGIN` to match the browser. The browser, API and WebSocket must share one origin. Do not put secrets in a URL.

In live mode, unavailable credentials, an invalid payload, or a sample older than five seconds cause `/api/telemetry` to return `503`. WebSocket clients close with code `1013`; they receive no fabricated healthy snapshot. The server rejects samples more than five seconds in the future. Diagnostics are independently unavailable if their collector is absent or stale. Adapt the collector polling interval to the source's actual sampling capabilities; do not relabel old measurements as current.

## Authentication and API contract

`GET /api/config` is public and returns `{ mode, actionsEnabled, scenario, authenticationRequired }`. When authentication is configured, `POST /api/session` with JSON `{ "token": "…" }` creates an eight-hour, HttpOnly, SameSite=Strict session. Production cookies require HTTPS. `DELETE /api/session` revokes it. Tokens are compared using a constant-time digest comparison and never included in responses or normal logs. Cookies and sessions are process-local; restart signs users out.

| Endpoint | Result |
| --- | --- |
| `GET /api/telemetry` | Exact telemetry schema; no envelope or extra keys. |
| `GET /api/diagnostics` | Separate strict diagnostics schema. |
| `WS /ws/telemetry` | Immediate snapshot, then updates every 1,000ms. Session and origin checked at handshake; sessions rechecked during broadcast. |
| `POST /api/scenario` | `{ "scenario": "normal" }`; mock only. Other IDs: `flash_sale`, `bni_timeout`, `dlq_influx`, `bca_outage`, `thread_starvation`. |
| `POST /api/channels/:id/ping` | Simulated active check in mock mode; an explicitly supplied action provider in live mode. |
| `GET /api/dlq/:txId` | `{ "tx_id": "…", "payload": { … } }`. |
| `POST /api/dlq/:txId/retry` | Requeues one item with its idempotency key preserved. |
| `DELETE /api/dlq/:txId` | Discards one item. |

Actions return `{ "ok": boolean, "message": string }`. Invalid input is `400`, authentication failures `401`, disallowed actions/origins `403`, missing payloads `404`, unsuccessful/conflicting operations `409`, rate limits `429`, and unavailable sources `503`. An offline partner probe returns `409` with `ok: false`, not an invented successful ping. The mock rejects replay to an offline channel and rejects duplicate handling of the same transaction. Switching scenarios resets the demo inventory.

The API rejects foreign origins and cross-site requests, does not enable CORS, limits JSON bodies to 16KB, and limits actions/sign-in to 60 requests per client IP per minute. Payload reads also consume this action allowance. The server intentionally does not trust forwarded client IPs. Behind a reverse proxy the allowance is shared by clients of that proxy; use a perimeter rate limiter and a reviewed trusted-proxy configuration if per-user scaling is needed.

## IBM ACE adapter

`IbmAceAdminClient` in `server/adapters/ibm.ts` implements `AceAdminAdapter.listMessageFlows(server, application?)`. For a specified application it queries `/apiv2/servers/{server}/applications/{application}/messageflows`. Without an application it first discovers application, REST API and service containers, then reads each container's flow collection. Set `independentServer: true` to omit `/servers/{server}` for an independent server. Identifiers are URL-encoded; the client uses authenticated GET requests with a three-second timeout. Supply a base URL for the administration listener and server-side credentials.

The requested `/apiv2/servers/{server}/messageflows` shorthand is absent from the [official ACE 13.0.5 OpenAPI](https://github.com/ot4i/ace-admin-api/blob/main/13.0.5.0/openapi-appconnectenterprise.yaml); the implementation uses its documented scoped endpoints. This adapter lists directly contained flows. If your integrations package flows inside static libraries, extend discovery through those libraries using the corresponding documented library scope.

Inspect the deployed installation's `/apidocs` to confirm paths and flow scope for its exact version. Listing flows is an inventory operation; it does not supply payment TPS, final business success, or a latency percentile. See [IBM's message flow administration documentation](https://www.ibm.com/docs/en/app-connect/13.0.x?topic=mrbuara-administering-message-flows-by-using-administration-rest-api) and the [ACE administration API documentation location](https://www.ibm.com/docs/en/app-connect/13.0.x?topic=mrbuara-setting-message-flow-user-defined-properties-run-time-by-using-administration-rest-api).

ACE contains both native and Java processing. JVM heap is one resource, not total server resident memory. Enable resource statistics and read used/max heap plus actual cumulative GC counters; changes in these counters identify observed GC events. Do not infer GC events solely from an arbitrary heap dip. See [IBM JVM resource statistics](https://www.ibm.com/docs/en/app-connect/11.0.0?topic=data-java-virtual-machine-jvm).

## IBM MQ adapter

`IbmMqRestCollector` implements `MqStatisticsCollector.readQueue(queueManager, queue)`. It reads `/ibmmq/rest/v1/admin/qmgr/{qmgr}/queue/{queue}?status=status.currentDepth&attributes=storage.maximumDepth`, validates integer depths, and returns a collection timestamp. It never browses, consumes or requeues a message.

That queue resource is specifically an administrative REST **v1** endpoint and is unavailable in stand-alone mqweb installations. IBM directs v3 administration clients to the MQSC action resource. For such installations, implement the same collector interface using an approved PCF/MQSC collector; do not simply replace `v1` with `v3`. Required authorities include queue and queue-status inquiries. See [IBM MQ queue GET reference](https://www.ibm.com/docs/en/ibm-mq/9.4.x?topic=adminqmgrqmgrnamequeue-get).

Queue depth alone cannot tell ingestion and consumption rates. The collector must track appropriate MQ statistics counters and sample duration, handling queue-manager restarts and counter resets. Partner business health and payment completion also require application telemetry. A low queue depth does not prove that upstream traffic is reaching ACE.

## Building the enterprise collector and enabling actions

The default live transport polls your configured collector endpoints. The IBM client classes are reusable building blocks for that collector; they are not automatically combined into fabricated channel metrics. For each field, define the data source, aggregation window, and meaning:

- Aggregate TPS from the five channels with one consistent transaction boundary; avoid double-counting retries as distinct paid orders.
- Calculate daily volume and success from the payment audit store using the business-day timezone (the demonstration uses Asia/Jakarta).
- Calculate p95 from actual latency observations or an aggregatable histogram. Never multiply average latency by a guessed factor.
- Obtain thread capacity, JVM statistics and database pool usage from actual ACE/runtime instrumentation. Return unknown p95 as `null`; unavailable required telemetry must fail validation instead of silently becoming zero.
- Collect bank reachability from approved endpoint probes, and preserve transaction/correlation IDs through incident ingestion. Redact personal/payment details before returning payload snippets to the browser.
- Publish the exact primary schema and the separate diagnostics schema. The strict validator rejects unexpected fields, duplicate channel IDs, invalid counts, and impossible thread/pool occupancy.

Live replay and discard are disabled by default (`actionsEnabled: false`). To enable them, explicitly inject a `LiveActionProvider` into `createMonitoringServer`. The service implementation must reconcile the provider's payment outcome before replay, persist idempotency decisions across restarts, authorize operators, preserve original correlation and idempotency IDs, record an audit trail, and implement the organization's discard policy. A network timeout alone does not establish that the bank failed to execute a payment.

This repository's in-memory sessions, demo history, and simulated idempotency set are suitable for the immediately runnable demonstration and one application process. Production rollout additionally needs your identity/access integration, durable audit/replay service, collector deployment and validation, secret rotation, centralized logs, backup/retention policies, and operational ownership. None of those external systems are implied to be configured by starting the demo.

## Verification

`tests/server.test.ts` exercises real HTTP and WebSocket connections, strict schema output, scenarios, failed probes, blocked offline retries, concurrent duplicate replay, discard, protected payloads, operator sessions, WebSocket authentication, cross-origin rejection, body/rate limits, stale-live failure, and IBM adapter request paths. The tests use local simulated samples and injected HTTP responses; they do not contact payment providers.
