# dm drugstore vending machine

A small full-stack application for a dm drugstore vending machine: 8 products, coin
payment with change, staff refills, and an in-memory machine state.

- **Backend:** Java 25, Spring Boot 4, Maven (REST API, RFC 9457 problem details, Swagger UI)
- **Frontend:** React 19, TypeScript (strict), Vite, hand-written CSS, Vitest + Testing Library
- **No database:** one machine aggregate lives in memory, as the task allows

The task description is kept in [TASK.md](TASK.md).

## Quick start

```bash
# terminal 1: backend on http://localhost:8080
./mvnw spring-boot:run

# terminal 2: frontend on http://localhost:5173 (/api is proxied to 8080)
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173. The **Customer** tab is the machine itself, the
**Staff** tab refills it and shows revenue.

API documentation: http://localhost:8080/swagger-ui.html

### One container for both

```bash
docker build -t dm-vending-machine .
docker run --rm -p 8080:8080 dm-vending-machine
# open http://localhost:8080
```

The frontend bundle is built first and copied into the Spring Boot static resources, then
the image runs the jar as a non-root user on a slim JRE.

### Tests and checks

```bash
./mvnw test                 # 40 backend tests: domain, HTTP integration, catalog, concurrency
cd frontend
npm test                    # 30 frontend tests: App flows, cart math, validation, views
npm run typecheck           # tsc -b, strict
npm run lint                # oxlint
npm run build               # production bundle
```

## Diagrams

PlantUML sources live in [`docs/`](docs/), render them with `plantuml docs/*.puml`
(or any PlantUML server):

| Diagram | What it shows |
|---|---|
| [`architecture.puml`](docs/architecture.puml) | Components: frontend, controller, service, aggregate, config |
| [`domain-model.puml`](docs/domain-model.puml) | Domain classes, records, enums and their relations |
| [`sequence-purchase.puml`](docs/sequence-purchase.puml) | Checkout flow: validation, all-or-nothing commit, error paths |
| [`sequence-refill.puml`](docs/sequence-refill.puml) | Staff refill flow with slot-capacity check |

## How the requirements are covered

| Requirement | Implementation |
|---|---|
| Manages 8 different products | `ProductCatalog` with the exact 8 products, groups and prices from the task |
| Machine can be filled | `POST /api/machine/refill` plus the Staff tab, slot capacity 10 |
| Customers buy and the machine calculates the total | Client-side cart, `POST /api/machine/purchase` charges the total and returns change |
| Only buy as many as are in the machine | Quantity is clamped to stock in the cart, and the backend rejects the whole cart with `409 INSUFFICIENT_STOCK` |
| API used by the frontend | `/api/machine/*`, see the table below |
| At least one view | Single page with a Customer and a Staff view |
| Functionality covered by tests | 40 backend tests (18 domain, 5 catalog, 16 HTTP, 1 context) and 30 frontend tests (4 files) |

## API

One machine, so there is no machine id in the paths. Every mutating call answers with the
new state, which means the UI never needs a follow-up request. Two exceptions: purchase
returns the receipt instead (the UI then fetches the state), and `credit/return` returns
the refunded amount.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/machine` | - | credit, products with stock/capacity/units sold, accepted coins, revenue |
| POST | `/api/machine/credit` | `{"amount": 0.50}` | updated state |
| POST | `/api/machine/credit/return` | - | `{"returned": 1.50}` |
| POST | `/api/machine/purchase` | `{"items": [{"productId": 1, "quantity": 2}]}` | `{"total": 1.10, "change": 0.90, "items": [...], "remainingCredit": 0.00}` |
| POST | `/api/machine/refill` | `{"items": [{"productId": 1, "quantity": 5}]}` | updated state |

Errors use `application/problem+json` with a stable `code`:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Only 1 unit(s) of 'Balea shower gel' left, 5 requested",
  "instance": "/api/machine/purchase",
  "code": "INSUFFICIENT_STOCK"
}
```

Codes: `INVALID_COIN`, `INVALID_QUANTITY`, `VALIDATION_ERROR`, `INVALID_REQUEST` (400),
`UNKNOWN_PRODUCT` (404), `INSUFFICIENT_STOCK`, `INSUFFICIENT_CREDIT`,
`SLOT_CAPACITY_EXCEEDED` (409).

Try it:

```bash
curl -X POST localhost:8080/api/machine/credit \
  -H 'Content-Type: application/json' -d '{"amount": 2.00}'
curl -X POST localhost:8080/api/machine/purchase \
  -H 'Content-Type: application/json' -d '{"items": [{"productId": 1, "quantity": 2}]}'
```

## Architecture

```
Controller (HTTP, validation)  ->  MachineService (bean)  ->  VendingMachine (aggregate)
                                     |                          |
                              ProductCatalog, MachineProperties   stock, credit, revenue
```

- `VendingMachine` is a plain domain aggregate with no Spring, HTTP or persistence code.
  All of its operations are `synchronized`: a real machine serves one customer at a time,
  and one monitor keeps stock, credit and revenue consistent. It is tested without a
  Spring context.
- `MachineService` is the only bean that owns a `VendingMachine` instance and wires it
  from `ProductCatalog` and `MachineProperties` (`machine.capacity-per-slot`,
  `machine.initial-stock-per-slot`).
- `MachineController` only translates HTTP to domain calls; `MachineExceptionHandler`
  maps domain errors to problem details.
- Purchase and refill are **all or nothing**: every position is validated before any
  stock or credit is touched, so a cart with one unavailable product changes nothing.
- The cart lives in the browser. The server never trusts it: stock and credit are
  re-checked on checkout, which is the only place where money and stock move.

### Money

Backend: `BigDecimal` with scale 2, prices are exact and multiplication by an integer
quantity stays exact.
Frontend: integer cents (`money.ts`), because `0.55 + 0.75` in floating point is exactly
the class of bug a vending machine must not have.

### Decisions worth discussing

- **Coins only** (5, 10, 20, 50 cents, 1 and 2 euro). All prices are below 16 EUR, so
  notes would only add change complexity. Invalid amounts are rejected by the domain, not
  by a range check on the DTO, so the error message can list the accepted coins.
- **Change is an amount, not denominations.** The machine has no coin hopper model, so it
  always returns the remaining credit.
- **Credit is returned on cancel** (`/credit/return`), which is the realistic "I changed
  my mind before paying" path.
- **Slot capacity 10, initial stock 3** (configurable). Starting empty would make the app
  useless on first load; starting full would hide the refill flow.
- **No persistence** as allowed by the task: restarting the backend resets stock and
  revenue.
- **RFC 9457 problem details** instead of a custom `{error: {...}}` envelope: it is the
  Spring standard, and the extra `code` property keeps client-side branching stable.

## What I would do next

- Persist the machine state (JPA or a small event log) so revenue survives restarts.
- Real change calculation, including which coins are in the hopper.
- Staff authentication for the refill endpoints (currently open, which would be a
  blocker for a real machine).
- Receipt printing or a QR code, and a machine id if several machines are managed.
- Playwright end-to-end test of the coin -> purchase -> change flow in a real browser.

## Project layout

```
docs/                          PlantUML diagrams (architecture, domain, purchase/refill flows)
src/main/java/de/dm/vendingmachine/
  api/        REST controller, request DTOs, problem-detail handler
  catalog/    products, product groups, accepted coins
  machine/    VendingMachine aggregate, service, view models, domain errors
  config/     machine properties, OpenAPI metadata
src/test/java/...             domain tests, HTTP integration tests
frontend/src/
  components/                   ProductCard, CartPanel, CustomerView, StaffView
  api.ts, validation.ts         typed API client + runtime response narrowing
  cart.ts, money.ts             pure cart rules and integer-cent money helpers
  *.test.ts(x)                  cart and view tests
```
