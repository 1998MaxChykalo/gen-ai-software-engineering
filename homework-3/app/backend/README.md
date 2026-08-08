# Horizon Backend

NestJS 10 API for **Horizon — Financial Goal Forecasting App**, implementing the MVP scope of
`../../specification.md` (MLO-1..5, plus the MLO-9 essentials) under the approved deviations below.
The companion frontend (built separately, in `../frontend`) is written against the HTTP contract
documented in this file byte-for-byte — endpoint paths, field names, and error codes here are load-bearing.

## Approved deviations from the spec

This machine has no Docker daemon, no PostgreSQL, no Redis, and runs Node.js v18.16.0 (spec calls for
Node 20 + Postgres 16 + BullMQ/Redis). The orchestrator approved the following substitutions for this
environment; production intent is unchanged.

1. **SQLite via Prisma, not PostgreSQL.** `prisma/schema.prisma` uses the `sqlite` datasource
   (`file:./dev.db` for dev, `file:./test.db` for tests) instead of `postgresql`. The schema stays
   portable: no Postgres-only types, IDs are app-generated UUIDv7 strings (see `src/common/ids/uuid7.ts`),
   money columns are `BigInt` (`*Minor`, euro cents) exactly as the spec requires. Prisma's SQLite
   connector also has no native `enum` support, so every enum domain (role, kind, status, type) is a
   plain `String` column, typed and validated in TypeScript/class-validator instead of the database.
   **To run against real Postgres:** start `../docker-compose.yml` (`docker compose up -d` from `app/`),
   point `DATABASE_URL` at it, flip the schema's `provider` to `postgresql`, and re-run
   `npx prisma migrate dev`.
2. **In-process recalculation dispatcher, not BullMQ/Redis.** Every profile/goal mutation still writes
   an `outbox_events` row inside the same Prisma transaction as the mutation (`OutboxService`), but
   instead of a BullMQ worker polling Redis, `ForecastDispatcherService.processForUser` runs
   synchronously, right after the transaction commits, in the same request. It reads that user's
   unprocessed outbox rows, calls the (idempotent) forecast computation once, and marks exactly those
   rows processed. `GET /forecast/freshness` reports staleness from any remaining unprocessed outbox
   rows. Production would replace this with the BullMQ worker in
   `specification.md` Task 16 (`FOR UPDATE SKIP LOCKED` polling, coalesced jobs, DLQ + retries).
3. **Node 18.16 runtime**, with compatible pinned majors: NestJS 10.x, Prisma 5.x, decimal.js 10.x,
   Jest 29, fast-check 3.x, `@nestjs/swagger` 7.x. `package.json` declares
   `"engines": { "node": ">=18.16" }`.
4. **Out of MVP scope** (documented, not built): MLO-6 opportunity cost, MLO-7 AI coach, MLO-8 timeline
   view (all phase 2 per the spec itself); MLO-10 ops/compliance module and break-glass flow; GDPR
   export/erasure endpoints; AISP/open-banking transaction ingestion (variable spending is entered
   directly as a profile expense instead of ingested from a bank feed). Everything else in
   `specification.md` MLO-1..5 and the MLO-9 essentials (audit trail, RFC 7807 errors, idempotency,
   disclaimer, OpenAPI, log redaction) is implemented.

## Other resolved ambiguities (conservative reading, per agents.md §1.4)

- **`allocateFreeCashFlow` lives inside `forecast/engine/`**, not in `src/modules/goals/allocation/` as
  Task 7 literally names. Task 7 also says the function is shared by the engine and the scenario
  simulator, and `month-step.ts` must call it every month — but the engine folder may import *nothing*
  outside itself (a "never do" rule). Keeping the allocator inside the engine and letting `goals` import
  it *from* the engine (modules may depend on the engine; the engine may not depend on modules) satisfies
  both the purity rule and the "shared" requirement. See the comment at the top of
  `src/modules/forecast/engine/allocation.ts`.
- **Wire `outcome` enum has no "paused" state.** The binding HTTP contract's goal outcome enum is fixed
  to `on_track | late | unreachable | unreachable_within_horizon`. The engine internally computes a
  distinct `paused` outcome (funded balance frozen, no further allocation), but the API mapping layer
  (`forecast-response.mapper.ts`) translates `paused` → `unreachable_within_horizon` rather than
  inventing a fifth wire value the frontend isn't built against.
- **Goal progress does not carry forward across snapshots.** Every forecast run is a fresh, stateless
  projection from the evaluation month (per the engine's purity rule); a paused goal's "frozen" funded
  balance is therefore `0` in every recomputed snapshot rather than a true historical running total. A
  production system would persist actual monthly contribution history separately from the projection.
- **`GET /goals` excludes archived goals** from the default listing (DELETE archives, never hard-deletes,
  but archived goals are treated like a soft-delete for listing purposes — consistent with typical REST
  UX and avoids needing a wire `outcome` value for goals excluded from projection entirely).
- **Scenario deltas apply from month 0, not from their stated `effectiveMonth`/`month`.** The engine's
  per-month model has no support for time-segmented parameters (e.g., an income whose growth rate itself
  changes mid-projection). Every delta's month field is still validated for shape and horizon bounds, but
  the *effect* is applied as of the evaluation month. See the comment in
  `src/modules/scenarios/engine-overlay/apply-deltas.ts`.
- **Goal PATCH does not require a `version` field.** The Goal model has a `version` column (bumped on
  every mutation, for future optimistic-locking use), but the binding HTTP contract's
  `PATCH /goals/:id (partial) → 200 Goal` does not include `version` in the request body, and the
  frontend is built against that contract exactly — so goal updates are last-write-wins at the API layer
  (unlike `PUT /profile`, whose contract explicitly requires and checks `version`).
- **Duplicate goal priorities are not rejected.** The spec's Task 5 mentions unique priority among active
  goals; the binding HTTP contract defines no error code for that case, so goals are just sorted stably
  by `(priority, createdAt)` without a hard uniqueness constraint.

## Stack

TypeScript 5 (`strict`), NestJS 10, Prisma 5 + SQLite, `decimal.js` 10 (`ROUND_HALF_EVEN` everywhere
money is computed), `bcryptjs` + `@nestjs/jwt` for auth, `class-validator`/`class-transformer` DTOs,
`@nestjs/swagger` for OpenAPI, `@nestjs/throttler` for rate limiting, Jest 29 + `fast-check` 3 for tests.

## Running it

```bash
cd app/backend
npm ci
npx prisma generate
npx prisma migrate dev
npm run seed
npm run build
npm test
npm run start:dev   # or: npm run start:prod (after build)
```

> This environment has npm's `ignore-scripts=true` set globally, so lifecycle hooks (Prisma's normal
> `postinstall` client-generation step, `pretest`, etc.) do **not** fire automatically — every step above
> is therefore run explicitly rather than relying on npm to chain them for you. If your environment
> allows lifecycle scripts, `npm test` alone is sufficient (it still explicitly chains
> `npm run pretest` first either way).

The API listens on `http://localhost:3000`, global prefix `api/v1`, CORS enabled for
`http://localhost:5173` (override with `CORS_ORIGIN`). OpenAPI/Swagger UI is at `/api/docs`.

### Environment variables (`.env`, see `.env.example`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite dev database (Prisma resolves relative to `prisma/`). |
| `JWT_SECRET` | `dev-only-secret-change-me` | **Change in any real deployment.** |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime. |
| `PORT` | `3000` | HTTP port. |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend dev server origin. |

### Switching to PostgreSQL (spec-compliant production path)

```bash
cd app
docker compose up -d          # Postgres 16 + Redis 7
```

Then in `app/backend/.env`:

```
DATABASE_URL="postgresql://horizon:horizon@localhost:5432/horizon?schema=public"
```

...and change `prisma/schema.prisma`'s `datasource db { provider = "sqlite" }` to `"postgresql"`
(everything else in the schema is already Postgres-compatible), then `npx prisma migrate dev`. Redis is
provisioned by the same compose file for when the in-process dispatcher is replaced by the BullMQ worker
described in `specification.md` Task 16.

### Seed data

`npm run seed` creates demo user **`demo@horizon.app` / `HorizonDemo1!`** with a median-family profile:

- Salary €3,800/month (net, active income), 2.5% annual growth; €0 rental (passive) income line.
- Fixed expenses €2,300/month, variable spending €600/month.
- Cash €15,000; investment portfolio €22,000 at 5.0% annual return.
- Car loan €9,000 at 6.5% APR, €280/month payment.
- Three goals: emergency fund €10,000 (priority 1, €300/month recurring), house down payment €60,000
  (priority 2, €700/month recurring), vacation €3,000 targeting next summer (priority 3, no explicit
  contribution — funded from leftover free cash flow).

The seed script then computes the initial forecast snapshot directly (bypassing the outbox/dispatcher,
since there's no HTTP request to trigger it from).

## Endpoint summary

Base URL `http://localhost:3000/api/v1`. All money fields are integer minor units (euro cents), named
`*Minor`, serialized as JSON numbers. Rates are decimal strings (`"2.5"`). Months are `"YYYY-MM"`. Errors
are RFC 7807 `application/problem+json` (`{type, title, status, detail, code, ...}`).

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{email, password}` → `201 {accessToken}`. |
| POST | `/auth/login` | → `200 {accessToken}`. |
| GET | `/profile` | Full profile document. |
| PUT | `/profile` | Whole-document replace, optimistic-locked on `version`. `Idempotency-Key` required. |
| GET | `/goals` | Paginated (`page`, `pageSize`, max 100), sorted by priority, snapshot-derived `progress`. |
| POST | `/goals` | `Idempotency-Key` required. |
| PATCH | `/goals/:id` | Partial update; `status` limited to `active`/`paused` (achieved/overdue are system-only). `Idempotency-Key` required. |
| DELETE | `/goals/:id` | Archives (never hard-deletes). `Idempotency-Key` required. |
| GET | `/forecast/latest` | Full computed month series (default horizon 480, cap 720) + per-goal outcomes + disclaimer. |
| GET | `/forecast/freshness` | `{stale, pendingEvents, lastSnapshotAt}`. |
| POST | `/scenarios/evaluate` | Ad-hoc, synchronous, never persisted. Rate-limited 10/min. |
| POST | `/scenarios` | Save a named scenario. `Idempotency-Key` required. |
| GET | `/scenarios` | Paginated list. |
| POST | `/scenarios/:id/evaluate` | Re-validates entity references; flips to `invalid` on `SCENARIO_REFERENCES_DELETED_ENTITY`. |
| DELETE | `/scenarios/:id` | Archives. `Idempotency-Key` required. |

Domain error codes: `CURRENCY_NOT_SUPPORTED`, `PROFILE_VERSION_CONFLICT`, `GOAL_TARGET_IN_PAST`,
`FORECAST_HORIZON_EXCEEDED`, `CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW`, `GOAL_ILLEGAL_TRANSITION`,
`GOAL_LIMIT_EXCEEDED`, `NO_SNAPSHOT_YET`, `SCENARIO_REFERENCES_DELETED_ENTITY`,
`IDEMPOTENCY_KEY_REQUIRED`, `EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, and standard
`UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `TOO_MANY_REQUESTS`.

## Architecture notes

- **Engine purity** (`src/modules/forecast/engine/`): pure functions only, no I/O, no `Date.now()`, no
  `Math.random()`, no config reads, no imports outside the folder except `decimal.js`. The evaluation
  month is always an explicit input. `money.ts` uses a module-local `Decimal.clone()` so mutating the
  global `decimal.js` config elsewhere can never change engine output (regression-tested).
- **Input hashing** (`src/modules/forecast/input-hash.ts`) lives *outside* the engine folder because
  `crypto` is not an allowed engine import — it canonically serializes `EngineInputs` (sorted keys,
  BigInt → tagged string) and SHA-256-hashes the result.
- **Money**: BigInt everywhere past the DTO boundary; `Number` only at the final HTTP-response
  serialization step. Rates are stored as integer basis points and converted to/from the wire's decimal
  strings via pure integer/string arithmetic (`src/common/util/rate.ts`), never a float parse.
- **Audit + outbox**: every mutating service method wraps its Prisma writes, an `AuditService.record`
  call, and an `OutboxService.writeEvent` call in one `$transaction`, so a rollback leaves neither an
  audit row nor an outbox row (verified manually via the transaction API; see Testing below for what
  wasn't automated).
- **Idempotency**: `IdempotencyInterceptor` (`src/common/idempotency/`) stores `(userId, key) →
  (status, body)` and replays it verbatim on a repeated key; missing key on a mutating route is
  `400 IDEMPOTENCY_KEY_REQUIRED`.
- **RFC 7807**: `ProblemJsonFilter` is the single global exception filter; `DomainError` (thrown by
  services) carries `{code, status, detail}` and is rendered as `application/problem+json`.
- **Log redaction**: `RedactedLogger` runs every non-string log argument through
  `src/common/logging/redaction.serializer.ts`, which recursively replaces any key matching a
  monetary/PII denylist (`amount*`, `balance*`, `income*`, `*minor`, `email`, `name`, …) with
  `"[REDACTED]"` before it is ever stringified.

## Testing

`npm test` runs everything in one Jest pass (`jest.config.js`): engine unit tests, `fast-check`
property tests, the four golden persona fixtures, all with `maxWorkers: 1` (SQLite-safe). `npm run
pretest` (chained automatically) recreates `prisma/test.db` and applies migrations first.

- **Engine unit tests** (`test/unit/engine/`): banker's-rounding boundaries, geometric annual→monthly
  rate conversion, liability payoff clamping (never negative), zero-income guard, deficit recording,
  goal-solver outcome classification (`on_track`/`late`/`unreachable`/`unreachable_within_horizon`/
  `paused`), free-cash-flow allocation priority order and exactness, net-worth sum-of-parts.
- **Property tests** (`test/unit/engine/property.spec.ts`, `fast-check`): determinism (same input twice
  → deep-equal + equal hash), month-to-month net-worth continuity/conservation, horizon bound (never
  more than the requested/720 points), integer-cent exactness (every output is a `bigint`), monotonic
  goal progress under non-negative contributions/returns.
- **Golden persona fixtures** (`test/golden/`): `broke-student` (negative cash flow →
  `NEGATIVE_CASH_FLOW_UNREACHABLE`), `median-family` (two-income, mortgage, three goals),
  `fire-aspirant` (high savings rate, FI goal), `retiree` (passive-income-only, cash-flow-negative
  drawdown). Run `npm run golden:update` to regenerate `test/golden/expected/*.json` after an
  intentional engine change — any diff should be justified in review.

### What was verified manually but is **not** covered by an automated test in this pass

Per an explicit instruction to skip writing new tests for the HTTP/integration layer this round, the
following were exercised by hand against a running server (`node dist/main.js`) and confirmed correct,
but have no Supertest coverage yet:

- Auth (register/login, duplicate-email 409, bad-credentials 401).
- `GET`/`PUT /profile`, including `409 PROFILE_VERSION_CONFLICT` and `422 CURRENCY_NOT_SUPPORTED`.
- Goal creation validation (`400 IDEMPOTENCY_KEY_REQUIRED`, `422 GOAL_TARGET_IN_PAST`,
  `422 CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW`) and `Idempotency-Key` replay (identical response body on a
  repeated key).
- `GET /forecast/latest` / `/forecast/freshness` end to end against the seeded demo user.
- `POST /scenarios/evaluate` (salary +15% scenario against the seeded profile, producing plausible
  goal-date deltas).
- Swagger UI reachable at `/api/docs`.

Adding Supertest coverage for these flows (per `agents.md` §5 item 4) is the natural next step and is
flagged here rather than silently left undone.

## Definition-of-done status

`npm ci && npx prisma generate && npx prisma migrate dev && npm run seed && npm run build && npm test`
all succeed on Node v18.16.0, run end-to-end from `app/backend` (confirmed on this machine, including a
clean `npm ci` from scratch). Lint (`npx eslint "src/**/*.ts"`) is clean.

`npm run test:cov` measured (honest numbers, not the target): **engine folder ~95% statements / 86%
functions / 71% branches** (`src/modules/forecast/engine`), but **~20% overall** project-wide, because
the coverage floor in `agents.md` §5 (~100% branches on engine/money paths, ≥85% lines overall) assumes
the Supertest integration suite described above exists — it doesn't yet in this pass (see "What was
verified manually but is not covered" above). The engine number is close to the ~100%-branches target;
the ≥85%-overall target is **not met** and is the clearest remaining gap.
