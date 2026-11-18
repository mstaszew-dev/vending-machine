# dm vending machine, NestJS backend with InfluxDB telemetry

Date: 2026-11-18
Status: approved (design), implementation on branch `feat/nestjs-backend`

## Goal

A second, interchangeable backend for the dm drugstore vending machine, written in
TypeScript with NestJS, that adds a file-backed InfluxDB 3 Core time-series database for
operational data and a Monitoring tab in the existing React frontend.

The Java 25 / Spring Boot 4 backend in `src/main/java` stays untouched and keeps working.
Both backends answer the same `/api/machine` contract, so one frontend can talk to either.

## Constraints

- TypeScript strict, no `any` at the boundaries.
- Standalone: one NestJS process, one InfluxDB binary, no Docker, no external services.
- Products and stock stay in memory and in code. The database holds telemetry only.
- The database is bounded: high-frequency series expire after 1 hour, business events
  after 7 days, and a size guard reports the data directory against a hard budget.
- The machine must keep selling when the database is down. Telemetry is fail-open.

## Repository layout

```
nestjs/
  src/
    catalog/      products, groups, accepted coins (code only)
    machine/      domain aggregate, money, coin ledger, service, controller, DTOs
    metrics/      time-series port, Influx adapter, line protocol, writer, breaker,
                  temperature simulator, size guard
    monitoring/   summary, series, events, SSE stream, simulate endpoints
    common/       env config, problem-details filter, health
  test/           integration specs (supertest)
  e2e/            Playwright specs
  scripts/        influx install/start/stop, dev, db reset, diagrams
  docs/           PlantUML sources and rendered images
  .data/          InfluxDB data directory (gitignored)
  .tools/         influxdb3 binary (gitignored)
```

Frontend change is additive: a Monitoring tab plus monitoring API calls in
`frontend/src/monitoring/`.

## Runtime

| Component | Port | Notes |
|---|---|---|
| NestJS | 8081 | so the Java backend on 8080 can run at the same time |
| InfluxDB 3 Core | 8181 | single binary, `--object-store file --without-auth` |
| Vite dev server | 5173 | `/api` target from `VITE_API_TARGET`, default `http://localhost:8080` |

InfluxDB start flags matter for the size budget:

```
influxdb3 serve --node-id dm-vending --object-store file --data-dir .data/influxdb3 \
  --without-auth --http-bind 127.0.0.1:8181 --disable-telemetry-upload \
  --wal-flush-interval 100ms --retention-check-interval 1m --delete-grace-period 1h
```

Retention is enforced periodically (default 30 min) and physical deletion waits behind a
grace period (default 24 h), so both are shortened. Retention is immutable per database in
Core, and Core has no row-level delete: the size story is retention plus a reset script,
not pruning rows.

Databases are created by the app on boot through the HTTP API, idempotently:

- `vitals`, retention `1h`, measurement `vending`, temperature every 2 s (~1 800 points).
- `events`, retention `7d`, measurement `machine_event`, one point per business event.

## Domain

Same behaviour as the Java aggregate:

- 8 products, groups and prices from `TASK.md`; slot capacity 10; initial stock 3.
- Coins 5, 10, 20, 50 cents and 1, 2 euro.
- Purchase and refill are all or nothing; cart lives in the browser; the server re-checks
  stock and credit.
- Money is integer cents internally and serialised as a number with two decimals, matching
  the Java response shape.

New state and rules:

- **Hopper**: total value inserted since the last staff collection. Capacity defaults to
  5000 cents (EUR 50). `POST /api/machine/collect` empties it and records a staff event.
- **Coin rate guard**: a rolling 60 s window; more than 20 inserts or more than 2500 cents
  in the window rejects the insert with `409 COIN_RATE_EXCEEDED`.
- **Hopper guard**: an insert that would push the hopper above capacity is rejected with
  `409 HOPPER_FULL`.
- Both limits are configurable environment variables.

Errors stay RFC 9457 `application/problem+json` with a stable `code`, identical to the Java
backend plus the two new codes. `retryAfterSeconds` is included for rate rejections.

## Telemetry pipeline

```
domain event -> MetricsWriter (bounded queue, batch 500 ms / 100 points)
             -> InfluxTimeSeriesAdapter (line protocol, no_sync)
             -> InfluxDB 3 Core (events, vitals)

CoinLedger (ring buffer, 60 s) -> guard decisions, warmed from `events` on boot
```

- Writes never block a purchase. Queue cap 1 000 points; overflow drops the oldest and
  increments `droppedPoints`.
- Circuit breaker opens after 3 consecutive write failures for 10 s. `GET
  /api/monitoring/summary` exposes `tsdb.reachable`, `tsdb.bytes`, `droppedPoints`.
- Answers are produced by SQL over the v3 query API (`POST /api/v3/query_sql`), wrapped by
  one adapter method so a version difference touches one file.
- Boot warm-up replays the last 60 s of coin inserts so a restart cannot reset the abuse
  window. If the database is unreachable, the ledger starts empty and an alert is raised.

Point schemas (stable field types, low cardinality tags):

```
machine_event,type=coin_inserted,code=...,product_id=...
  value_cents=50i,quantity=1i,credit_cents=150i,revenue_cents=0i <ms>

vending,sensor=cabinet temperature_c=5.4,humidity_pct=41.2,setpoint_c=6.0,compressor_on=true <ms>
```

Event types: `coin_inserted`, `credit_returned`, `purchase`, `refill`, `hopper_collected`,
`insert_rejected`, `alert`.

## Simulation and alerts

`TemperatureSimulator` runs every 2 s when enabled (default on, disabled in tests),
writing a smoothly drifting value between 4 and 8 C with random excursions. A seeded RNG
makes tests deterministic.

Alerts are derived from the same stream: `TEMP_HIGH` / `TEMP_LOW` after 3 consecutive
samples outside 4-8 C, `COIN_RATE_EXCEEDED`, `HOPPER_FULL`, `TSDB_UNAVAILABLE`. Each alert
is pushed over SSE and written to `events`.

## API

Unchanged, Java-compatible:

```
GET  /api/machine
POST /api/machine/credit          {amount}
POST /api/machine/credit/return
POST /api/machine/purchase        {items:[{productId, quantity}]}
POST /api/machine/refill          {items:[{productId, quantity}]}
```

New:

```
POST /api/machine/collect                     -> MachineState
GET  /api/monitoring/capabilities             -> availability, signals, retention, tsdb
GET  /api/monitoring/summary                  -> temperature, coins/min, hopper, alerts
GET  /api/monitoring/series?signal=temperature&range=15m
GET  /api/monitoring/events?limit=50
GET  /api/monitoring/stream                   -> text/event-stream
POST /api/monitoring/simulate/flood           {count}
POST /api/monitoring/simulate/excursion       {seconds}
GET  /health/live, GET /health/ready
```

Monitoring endpoints return `503 TSDB_UNAVAILABLE` when the database cannot answer; the
machine endpoints keep working.

## Frontend

A third tab, Monitoring, sharing the existing state and styling:

- Capability probe on mount. Against the Java backend `capabilities` 404s, so the tab shows
  "Time-series monitoring requires the NestJS backend" and does not start a stream.
- Temperature chart, coin-rate chart, health strip and event list, drawn as hand-written SVG
  (no chart library).
- Live updates through `EventSource`, falling back to 5 s polling.
- Two demo buttons: "simulate coin flood" and "simulate temperature excursion".
- The Staff view gains a hopper card and a "collect coins" action.

## Tests

- Unit: money, catalog, stock clamp, coin validation, ledger window boundaries, hopper
  boundary, line protocol escaping, batching, breaker, drop-oldest, simulator determinism,
  size guard, problem mapping.
- Integration (supertest, fake time-series port): every machine flow and error code, the new
  guards, monitoring endpoints with the port down, response-shape parity with the Java
  backend. One opt-in test against a real InfluxDB, gated by `INFLUX_URL`.
- E2E (Playwright, real browser, real services): buy with coins, flood trips the rate guard,
  excursion raises an alert, hopper fills and is collected, restart does not reset the window.

Coverage gate: 90% lines for `src/`, measured by Jest.

## Diagrams

`nestjs/docs/`: `architecture`, `backend-classes`, `metrics-pipeline`,
`sequence-coin-decision`, `sequence-monitoring-stream`, `test-map`. All high level except
`test-map`, which lists the verbatim test names grouped by layer so it explains what is
verified without reading code. Rendered SVGs are committed next to the sources.

## Deliberate decisions

- **Two databases instead of one** so short-lived high-frequency vitals cannot push the
  long-lived business events out of the retention window.
- **Fail-open telemetry** because a vending machine must sell during an observability
  outage; the in-memory projection still enforces the coin rules.
- **SSE instead of WebSocket** for one-way updates with no extra dependency.
- **Capability probe instead of feature flags** so one frontend can serve both backends.
- **No chart library** to keep the frontend dependency surface unchanged.
