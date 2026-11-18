# dm vending machine - NestJS backend

A second, interchangeable backend for the dm drugstore vending machine. It answers the
same `/api/machine` contract as the Java 25 / Spring Boot backend in `../src/main/java`,
and adds a real, file-backed InfluxDB 3 Core database plus a Monitoring tab in the React
frontend. The Java backend is untouched and keeps working.

- One NestJS process, one InfluxDB binary, no Docker and no external services.
- Products, stock, credit and the coin guards live in memory and in code.
- The database holds telemetry only: fridge vitals and business events.
- Telemetry is fail-open. A database outage never blocks a sale.

## Layout

```
src/
  catalog/      products, groups, accepted coins (code only)
  machine/      aggregate, money, coin ledger, guards, service, controller
  metrics/      time-series port, Influx adapter, line protocol, writer,
                circuit breaker, temperature simulator, size guard
  monitoring/   summary, series, events, SSE stream, demo endpoints
  config/       validated environment configuration
test/           integration specs (supertest + fake time-series port)
e2e/            Playwright specs (real backend, real InfluxDB, real browser)
docs/           PlantUML sources and rendered SVGs
scripts/        Influx lifecycle, dev server, e2e server, diagram generation
.data/          InfluxDB data directory (gitignored)
.tools/         influxdb3 binary (gitignored)
```

## Ports

| Component | Port | Notes |
|---|---|---|
| NestJS | 8081 | Java backend stays on 8080, so both can run at once |
| InfluxDB 3 Core | 8181 | `--object-store file --without-auth` |
| Vite dev server | 5173 | `/api` target comes from `VITE_API_TARGET`, default Java on 8080 |

## Quick start

Prerequisites: Node >= 22, Java (only for rendering diagrams), and Homebrew on macOS for
the InfluxDB install script.

```bash
cd nestjs
npm install
npm run influx:install   # downloads influxdb3 into .tools/ (once)
npm run db:reset         # optional: start from empty telemetry databases
npm run dev              # starts InfluxDB, then NestJS on 8081
```

In another terminal, point the frontend at the NestJS backend:

```bash
cd frontend
npm install
VITE_API_TARGET=http://localhost:8081 npm run dev
```

Then open <http://localhost:5173>. The Monitoring tab probes
`GET /api/monitoring/capabilities`; against the Java backend it gets a 404 and explains
that time-series monitoring needs NestJS, so one frontend build serves either backend.

Stop InfluxDB with `npm run influx:stop`.

## API

Unchanged and Java-compatible:

```
GET  /api/machine
POST /api/machine/credit          {amount}
POST /api/machine/credit/return
POST /api/machine/purchase        {items:[{productId, quantity}]}
POST /api/machine/refill          {items:[{productId, quantity}]}
```

New in NestJS:

```
POST /api/machine/collect                     -> MachineState
GET  /api/monitoring/capabilities             -> signals, retention, database health
GET  /api/monitoring/summary                  -> temperature, coins/min, hopper, alerts
GET  /api/monitoring/series?signal=temperature&range=15m
GET  /api/monitoring/events?limit=50
GET  /api/monitoring/stream                   -> text/event-stream
POST /api/monitoring/simulate/flood           {count}
POST /api/monitoring/simulate/excursion       {seconds}
GET  /health/live, GET /health/ready
```

All mutating routes answer HTTP 200 on success. Errors use RFC 9457
`application/problem+json` with a stable `code`, the same shape as the Java backend.
New codes: `COIN_RATE_EXCEEDED`, `HOPPER_FULL`. Money is integer cents internally and a
two-decimal number on the wire.

## Guards

- Rolling 60 s coin window: more than 20 inserts or more than EUR 25 gives
  `409 COIN_RATE_EXCEEDED`. The window is replayed from the event log on boot so a restart
  cannot reset the abuse limit.
- Hopper capacity EUR 50: an insert that would exceed it gives `409 HOPPER_FULL`.
  `POST /api/machine/collect` empties the box and records a `hopper_collected` event.

## Storage budget

Two databases keep short-lived high-frequency samples away from long-lived business events:

| Database | Retention | Measurement | Content |
|---|---|---|---|
| `vitals` | 1 h | `vending` | temperature, humidity, setpoint, compressor every 2 s |
| `events` | 7 d | `machine_event` | one point per business event and alert |

Retention is immutable per database in InfluxDB Core. Writes use `no_sync`, a bounded
1,000-point queue that drops the oldest point on overflow, and a circuit breaker that
opens after 3 consecutive failures for 10 s. `GET /api/monitoring/summary` exposes
`tsdb.reachable`, `bytes`, `maxBytes`, `queuedPoints` and `droppedPoints`. On a brand-new
database the missing event table means an empty coin window, not an outage.

## Environment variables

All are optional and validated once at boot. Values shown are the defaults.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8081` | HTTP port |
| `INFLUX_URL` | `http://127.0.0.1:8181` | InfluxDB HTTP endpoint |
| `INFLUX_TOKEN` | empty | token (server runs `--without-auth` locally) |
| `INFLUX_TIMEOUT_MS` | `2000` | outbound HTTP timeout |
| `TSDB_DATA_DIR` | `.data/influxdb3` | InfluxDB data directory |
| `INFLUX_VITALS_DB` / `INFLUX_EVENTS_DB` | `vitals` / `events` | database names |
| `INFLUX_VITALS_RETENTION` / `INFLUX_EVENTS_RETENTION` | `1h` / `7d` | retention periods |
| `TSDB_MAX_BYTES` | `64mb` | hard budget reported by the size guard |
| `HOPPER_CAPACITY_EUROS` | `50` | coin box capacity |
| `COIN_WINDOW_SECONDS` | `60` | abuse window length |
| `COIN_MAX_INSERTS` | `20` | maximum inserts in the window |
| `COIN_MAX_EUROS` | `25` | maximum inserted value in the window |
| `MACHINE_CAPACITY_PER_SLOT` | `10` | maximum stock per slot |
| `MACHINE_INITIAL_STOCK_PER_SLOT` | `3` | starting stock per slot |
| `TEMPERATURE_SIMULATION` | `true` | enable the 2 s vitals simulator |
| `TEMPERATURE_INTERVAL_MS` | `2000` | simulator tick |
| `TEMPERATURE_MIN_C` / `TEMPERATURE_MAX_C` | `4` / `8` | alert band |
| `TEMPERATURE_SETPOINT_C` | `6` | fridge target, shown on the chart |
| `TEMPERATURE_STEP_C` | `0.4` | random-walk step |
| `TEMPERATURE_HUMIDITY_BASE` | `40` | base humidity percentage |
| `TEMPERATURE_EXCURSION_C` | `3` | demo excursion amplitude |

The frontend reads `VITE_API_TARGET` (default `http://localhost:8080`) in its Vite config.

## Tests

```bash
npm run lint
npm run typecheck
npm test                 # unit, Jest, 90% line coverage gate
npm run test:int         # integration specs only
npm run test:coverage
npm run test:e2e         # Playwright: real backend + InfluxDB + Chrome
```

The e2e suite starts its own backend on 8091 with dedicated `vitals_e2e` / `events_e2e`
databases and a Vite server on 5174, so it never touches development telemetry. The opt-in
`test/real-influx.int-spec.ts` runs only when `INFLUX_URL` is set.

## Diagrams

`npm run diagrams` regenerates `docs/test-map.puml` from the verbatim `it(...)` / `test(...)`
names, then renders all six sources to SVG with the `plantuml` CLI (`brew install plantuml`).

- [architecture.svg](docs/architecture.svg) - runtime topology and both backends
- [backend-classes.svg](docs/backend-classes.svg) - classes, layers and ports
- [metrics-pipeline.svg](docs/metrics-pipeline.svg) - write, read and boot warm-up
- [sequence-coin-decision.svg](docs/sequence-coin-decision.svg) - the two coin guards
- [sequence-monitoring-stream.svg](docs/sequence-monitoring-stream.svg) - probe, SSE, polling
- [test-map.svg](docs/test-map.svg) - every test name, grouped by layer

The approved design and its deliberate decisions are in
[`../docs/superpowers/specs/2026-11-18-dm-vending-nestjs-design.md`](../docs/superpowers/specs/2026-11-18-dm-vending-nestjs-design.md).
Code is reviewed against [`~/ZCodeProject/NODEJS_CODE_REVIEW.md`](../../../NODEJS_CODE_REVIEW.md).
