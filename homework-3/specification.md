# Horizon — Financial Goal Forecasting App: Specification

> Ingest the information from this file, implement the Low-Level Tasks, and generate the code that will satisfy the High and Mid-Level Objectives.

---

## 1. High-Level Objective

Build **Horizon**, a personal finance application that continuously forecasts a user's financial future from their income, assets, liabilities, and spending, and recommends the fastest path to their user-defined financial goals — a "GPS for personal finances" that answers *"when will I get there, and what changes if I take this turn?"*

**Scope boundary:** The MVP covers the financial profile, goal management, the deterministic forecast engine, the continuous recalculation pipeline, and the scenario simulator (MLO-1..MLO-5); opportunity-cost analysis, the AI financial coach, and the timeline view (MLO-6..MLO-8) are specified at objective level as **phase 2**; payment execution, money movement, investment brokerage, tax advice, and multi-currency support are **out of scope entirely**.

Horizon is **not a payment processor**: it never initiates payments and never stores PAN/card data, therefore **PCI DSS does not apply**. Transaction ingestion happens read-only via a licensed AISP aggregator under PSD2 (integration assumption). GDPR fully applies (EU users, EUR).

---

## 2. Stakeholders & Views

| Stakeholder | What they see | What they may do |
|---|---|---|
| **End-user** (`user` role) | Their own financial profile, goals, latest forecast snapshot, scenario results, (phase 2: opportunity-cost prompts, coach insights, timeline). Full record-level detail of their own data only. | CRUD their profile inputs and goals; run scenarios; connect/disconnect bank accounts via the AISP; export their data; request account erasure. |
| **Customer support** (`support` role) | Pseudonymized account metadata (account status, subscription state, last-forecast health, error codes, connection status of AISP link). **No monetary amounts, income figures, goal targets, or transaction details** without break-glass. | Look up an account by support ticket reference; trigger a forecast re-run on the user's behalf; escalate to break-glass with recorded justification when the user explicitly asks for help with their numbers. |
| **Ops** (`ops` role) | Aggregated system health: recalc queue depth, worker throughput, snapshot lag distribution, error-rate dashboards, AISP ingestion failure counts. All figures aggregated across users; no record-level financial data by default. | Replay dead-lettered recalc jobs; pause/resume ingestion for an aggregator incident; view SLO dashboards. Record-level access only via break-glass. |
| **Compliance** (`compliance` role) | The append-only `audit_events` stream (pseudonymized by default), break-glass access log, GDPR request queue (export/erasure status), data-retention reports. | Review and close audit findings; approve/deny break-glass requests; verify completion of GDPR export/erasure requests; run retention-policy reports. |

**Break-glass rule (applies to `support`, `ops`, `compliance`):** any record-level access to a user's financial data requires an explicit break-glass request with a free-text justification and (for `support`) a ticket reference; the grant is time-boxed (60 min), scoped to one user, and every read under it is written to `audit_events`.

---

## 3. Mid-Level Objectives

Each MLO states the **observable change in the world** when it succeeds and its verification method. MLO-1..5 receive deep task decomposition (MVP); MLO-6..8 are **phase 2** (objective-level only); MLO-9..10 are cross-cutting with their own tasks.

### MLO-1 — Financial profile management (MVP)
A user can register their complete financial picture — active/passive income sources, assets (cash, investments, real estate), liabilities (loans, mortgages, credit cards), fixed monthly expenses, variable-spending categories fed by AISP transactions, savings/investment accounts, and growth/inflation/return assumptions — and every stored figure is a validated EUR amount in minor units that survives round-trips unchanged.
**Verified by:** integration tests exercising CRUD + validation on every profile entity, plus a reconciliation check that the persisted ledger totals equal the submitted inputs.

### MLO-2 — Goal management (MVP)
A user can create, prioritize, edit, pause, and archive financial goals (house, car, emergency fund, net-worth target, financial independence, retirement, vacation, custom) with target amount, optional target date, priority, and one-time or recurring contributions — and invalid goals (target date in the past, non-positive amounts) are rejected with typed domain errors before they can pollute a forecast.
**Verified by:** integration tests for the full goal lifecycle and every validation error code; state-machine unit tests for allowed transitions.

### MLO-3 — Deterministic forecast engine (MVP)
Given a frozen profile, goal set, assumptions, and an explicit evaluation date, the engine produces the identical month-by-month projection (cash flow, net worth, per-goal funded balance, goal completion dates) on every run, on every machine — pure functions, no I/O, no clock reads, decimal.js arithmetic only.
**Verified by:** property-based unit tests (determinism, monotonicity, conservation of money) and golden-file fixtures for four persona profiles with expected goal-completion dates checked byte-for-byte.

### MLO-4 — Continuous recalculation pipeline (MVP)
Whenever a profile input, transaction, or goal changes, a new immutable `forecast_snapshots` row (with full input hash) appears within 5 seconds, and the API always tells the client whether the snapshot it is serving is fresh or stale relative to the latest write.
**Verified by:** e2e test that writes a transaction and polls until a new snapshot with the expected input hash appears within the 5 s budget; chaos test that kills the worker mid-run and asserts exactly-once snapshot semantics via outbox retry.

### MLO-5 — Scenario simulator (MVP)
A user can pose "what if" deltas — salary +15%, restaurant spending −€200/month, invest cash at X% instead of holding, buy a car this year, pay off a loan early — and receive, synchronously (p95 ≤ 1 s), a side-by-side comparison of baseline vs. scenario goal dates and net-worth curves, without the scenario ever mutating the real profile.
**Verified by:** integration tests asserting scenario runs leave the profile and baseline snapshots untouched; golden fixtures for each of the five canonical scenario types; load test against the 1 s p95 budget.

### MLO-6 — Opportunity cost analysis (**phase 2**)
When a user contemplates a significant purchase, Horizon quantifies the goal impact ("this €2,000 laptop delays your house purchase by ~2 months") by running a purchase-delta scenario against the current baseline snapshot.
**Verified by:** golden fixtures comparing purchase-delta output to manually computed goal-date shifts.

### MLO-7 — AI financial coach (**phase 2**)
Users receive personalized, LLM-generated insights grounded exclusively in their own forecast snapshots ("you save 38% of income; +€250/month brings your house goal forward 7 months"); the coach degrades gracefully to nothing — it never blocks or alters a forecast.
**Verified by:** contract tests that the insights module reads only snapshot data, redaction tests on prompts, and a kill-switch test proving forecasts are unaffected when the LLM API is down.

### MLO-8 — Timeline view (**phase 2**)
A user sees their financial life as a chronological milestone timeline (emergency fund complete → car → house down payment → mortgage payoff → passive income €1,000/month → FI → retirement) derived entirely from the latest forecast snapshot.
**Verified by:** snapshot-derived rendering tests: milestone order and dates must equal the goal-completion dates in the underlying snapshot.

### MLO-9 — Security, audit & GDPR compliance (cross-cutting, MVP)
Every mutating action lands in the append-only `audit_events` table with actor and before/after diff; application logs never contain monetary amounts or financial PII; a user can export all their data (machine-readable) and have it erased, with both operations completing and being provably recorded.
**Verified by:** automated log-scanning test that greps structured logs for currency patterns after a full e2e run; audit-completeness integration test (every mutation ⇒ ≥1 audit event); GDPR export/erasure e2e flow reviewed at a manual compliance checkpoint.

### MLO-10 — Ops/compliance internal view (cross-cutting, MVP)
Ops and compliance staff can do their jobs — queue health, SLO dashboards, audit review, GDPR request handling — from aggregated/pseudonymized data alone, and any record-level access leaves a break-glass trail that compliance can review.
**Verified by:** authorization matrix integration tests (every role × every endpoint), plus an e2e break-glass flow test asserting denial without justification and full audit capture with it.

---

## 4. Non-Functional & Policy Requirements

### 4.1 Security

- **AuthN:** OIDC/OAuth 2.1 with short-lived access tokens (≤ 15 min) and rotating refresh tokens; MFA required for `support`/`ops`/`compliance` roles.
- **AuthZ:** role-based (`user`, `support`, `ops`, `compliance`) enforced by NestJS guards at the controller layer *and* row-level ownership checks in services (defense in depth). `user` may only ever access rows where `user_id` matches the token subject.
- **Break-glass:** record-level access for internal roles requires a recorded justification, is time-boxed to 60 minutes, scoped to a single user, and every read under the grant is audited (see MLO-10).
- **Data at rest:** PostgreSQL with encryption at rest; AISP consent tokens encrypted column-level (AES-256-GCM) with keys in a KMS, never in the schema or env files committed to the repo.
- **Data in transit:** TLS 1.2+ everywhere, including Redis and worker connections.
- **No card data:** Horizon stores no PAN, CVV, or card credentials of any kind; **PCI DSS is explicitly out of scope**. The AISP aggregator holds the banking credentials; Horizon holds only a revocable consent token.
- **Secrets:** injected via environment/secret manager; a pre-commit scanner blocks committed secrets.

### 4.2 Privacy & GDPR

- **Lawful basis:** contract (providing the forecasting service) for profile/goal data; explicit consent for AISP transaction ingestion, revocable in-app at any time (revocation stops ingestion within one polling cycle and is audited).
- **Data subject rights:**
  - *Access/portability:* self-service export producing a machine-readable JSON archive of all profile, goal, transaction, scenario, and snapshot data, delivered ≤ 72 h (assumed target; typically minutes).
  - *Erasure:* self-service deletion erases all personal and financial data; `audit_events` rows are retained but re-keyed to an irreversible pseudonym (legitimate interest: fraud/audit defense), documented in the record of processing activities.
  - *Rectification:* all profile inputs are user-editable (MLO-1); edits trigger re-forecast (MLO-4).
- **Retention:** raw ingested transactions 24 months rolling; forecast snapshots 36 months then downsampled to quarterly; audit events 7 years (pseudonymized after account erasure); all values are **assumed targets** pending DPO sign-off and must be configuration, not code constants.
- **Data minimization:** the insights module (phase 2) sends the LLM only derived aggregates (ratios, month deltas), never raw transactions, account identifiers, or names.
- **Processors:** AISP aggregator and LLM provider are documented processors with DPAs; EU data residency for the primary database.

### 4.3 Audit & logging

- Append-only `audit_events` table: `id` (UUIDv7), `actor_id`, `actor_role`, `occurred_at` (UTC), `entity_type`, `entity_id`, `action`, `before` (JSONB diff), `after` (JSONB diff), `justification` (break-glass only), `request_id`. No UPDATE or DELETE grants on this table for the application role; enforced by DB permissions, not convention.
- Every mutating endpoint writes its audit event **in the same DB transaction** as the mutation.
- Application logs are structured JSON containing entity IDs, error codes, and timings only — **never monetary amounts, income figures, balances, goal targets, or other financial PII**. A redaction serializer enforces this centrally (see Task 25).
- All requests carry a `request_id` propagated to worker jobs for end-to-end traceability.

### 4.4 Reliability (assumed targets)

| Target | Value | Rationale |
|---|---|---|
| Availability | 99.9% monthly | Personal-finance users check daily, not continuously; 43 min/month of allowable downtime is compatible with a small on-call rotation and single-region HA Postgres. |
| RPO | ≤ 5 min | Continuous WAL archiving makes 5 min cheap; losing more than a few minutes of financial inputs would force users to re-enter data and erode trust. |
| RTO | ≤ 1 h | Forecasts are recomputable from inputs, so recovery is restore-and-replay; 1 h is achievable with automated failover plus outbox replay. |
| Recalc durability | No forecast update lost | Transactional outbox guarantees at-least-once delivery; idempotent snapshot writes upgrade this to effectively-once. |

Degradation order under partial failure: reads of the latest snapshot (with staleness flag) keep working → writes keep working with delayed recalculation → scenario simulation sheds load first (it is synchronous and CPU-bound) → phase-2 insights disappear silently.

### 4.5 Performance budget (all values are **assumed targets** — see §9 for per-row rationale)

| Metric | Target |
|---|---|
| Forecast recompute (720 months, ≤ 10 goals) | p95 ≤ 500 ms |
| Read APIs | p95 ≤ 200 ms, p99 ≤ 500 ms |
| Scenario simulation request (synchronous) | p95 ≤ 1 s |
| Time-to-consistency (transaction → fresh forecast) | ≤ 5 s |
| Pagination | default 25, max 100 per page |
| Rate limits | 60 req/min per user; 10 req/min on simulation endpoints |
| Recalc worker throughput | ≥ 50 forecast recomputes/s per worker instance |

---

## 5. Implementation Notes

Rules an implementing agent **must not violate**. Anything below overrides local convenience.

### 5.1 Stack (fixed)

- TypeScript 5.x with `strict: true`; Node.js 20 LTS; NestJS 10; PostgreSQL 16 via Prisma ORM; BullMQ + Redis for the recalculation queue; Jest + Supertest for tests; class-validator DTOs; OpenAPI via `@nestjs/swagger`; `decimal.js` for all projection math.
- Module layout is fixed: `src/modules/{auth,users,profile,goals,forecast,scenarios,insights,timeline,audit,ops}`.

### 5.2 Money

- All monetary values are stored as **BIGINT minor units (euro cents)** with an ISO 4217 `currency` column. MVP is **EUR-only**; any other currency is rejected at the DTO boundary with `CURRENCY_NOT_SUPPORTED`.
- All projection arithmetic goes through `decimal.js` configured with **banker's rounding (`ROUND_HALF_EVEN`)**. **JavaScript floats for money are forbidden** — no `number` may hold a monetary amount past the DTO boundary; use `bigint` for storage values and `Decimal` for math. A lint rule / type-brand enforces this.
- Rounding happens exactly once per projected month per value, at the month boundary — never mid-formula.

### 5.3 Determinism of the forecast engine

- The engine lives in `src/modules/forecast/engine/` and consists of **pure functions only**: no I/O, no database access, no `Date.now()`, no `Math.random()`, no environment reads. The **evaluation date is an input parameter**.
- Same inputs ⇒ byte-identical output, on any machine. This is a tested invariant (property-based test), not an aspiration.
- Projections are at **month granularity** with a **maximum horizon of 720 months (60 years)**; exceeding it raises `FORECAST_HORIZON_EXCEEDED`.

### 5.4 Recalculation pipeline

- Recalculation is event-driven via a **transactional outbox**: the domain mutation and its outbox row commit in one transaction; a relay publishes to BullMQ; the worker computes and persists.
- Each forecast run is persisted as an **immutable, versioned `forecast_snapshots` row** carrying the SHA-256 **input hash** of the canonical serialized inputs (profile + goals + assumptions + evaluation date). Snapshots are never updated or deleted within retention.
- Snapshot writes are **idempotent** on `(user_id, input_hash)`: a retried job that recomputes an already-persisted hash is a no-op success.

### 5.5 API semantics

- **Idempotency:** every mutating endpoint accepts an `Idempotency-Key` header; a retried key returns the original response (stored response replay, 24 h window). Missing key on POST ⇒ `400 IDEMPOTENCY_KEY_REQUIRED`.
- **Errors:** RFC 7807 `application/problem+json` with stable domain codes, e.g. `GOAL_TARGET_IN_PAST`, `FORECAST_HORIZON_EXCEEDED`, `NEGATIVE_CASH_FLOW_UNREACHABLE`, `CURRENCY_NOT_SUPPORTED`, `CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW`, `PROFILE_VERSION_CONFLICT`, `SCENARIO_REFERENCES_DELETED_ENTITY`, `BREAK_GLASS_REQUIRED`. Error responses never echo monetary amounts into logs.
- **Concurrency:** profile and goal entities carry an integer `version`; writes require the expected version and fail with `409 PROFILE_VERSION_CONFLICT` on mismatch (optimistic locking).
- **Staleness:** every forecast read response includes `snapshot_created_at`, `input_hash`, and `stale: boolean` (true when a newer outbox event exists than the served snapshot).

### 5.6 IDs, dates, formats

- IDs are **UUIDv7** everywhere (sortable, index-friendly).
- Dates/times are **ISO 8601, stored UTC**; month-granularity fields use `YYYY-MM`. No local-time storage anywhere.
- JSON field naming: `snake_case` on the wire, `camelCase` in TypeScript, mapped centrally.

### 5.7 Logging & redaction

- Structured JSON logs via a central logger with a **redaction serializer**: any field matching the monetary/PII denylist (`amount*`, `balance*`, `income*`, `target*`, `iban`, `name`, `email`, …) is replaced with `"[REDACTED]"` before emission. Entity IDs and error codes are always safe to log.
- Log-scanning CI test asserts zero currency-shaped values in logs after the full e2e suite.

### 5.8 Database & migrations

- Migrations are **additive-only** in normal operation: no destructive column drops or type narrows without a documented two-phase expand/contract migration approved in review.
- `audit_events` has INSERT-only grants for the app role. All FK relationships `ON DELETE RESTRICT` except user-owned data covered by the erasure flow.
- All timestamps `timestamptz`; all money columns `BIGINT` + `currency CHAR(3)` (constraint: `currency = 'EUR'` in MVP).

### 5.9 Testing policy

- Every task ships with its tests; bug fixes add regression tests that fail before the fix. Engine code additionally requires property-based tests and golden fixtures (see §8).

---

## 6. Context

### 6.1 Beginning context

- An **empty monorepo** containing only the specification package: `homework-3/specification.md` (this file), `homework-3/agents.md`, editor/AI rules, `homework-3/README.md`.
- **Hypothetical resources available** (assume provisioned, credentials via secret manager):
  - PostgreSQL 16 instance (EU region) — empty database `horizon`.
  - Redis 7 instance for BullMQ.
  - AISP aggregator **sandbox** credentials (PSD2-licensed provider; webhook + polling APIs for read-only transaction/account data).
  - OpenAI-compatible LLM API endpoint for phase-2 insights (**hypothetical**; not required for MVP).
- No application code, no schema, no CI exists yet.

### 6.2 Ending context

**Expected file tree (MVP; phase-2 modules present as stubs with objective-level docs):**

```
horizon/
├── package.json / tsconfig.json / .eslintrc.cjs / jest.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/            # additive-only migration history
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── logging/redaction.serializer.ts
│   │   ├── errors/problem-json.filter.ts     # RFC 7807
│   │   ├── idempotency/idempotency.interceptor.ts
│   │   └── auth/roles.guard.ts
│   └── modules/
│       ├── auth/
│       ├── users/
│       ├── profile/           # income, assets, liabilities, expenses, assumptions, AISP ingestion
│       ├── goals/
│       ├── forecast/
│       │   ├── engine/        # PURE functions only — money.ts, month-step.ts,
│       │   │                  # goal-solver.ts, net-worth.ts, types.ts
│       │   ├── snapshot.service.ts
│       │   ├── outbox/        # outbox writer + relay
│       │   └── worker/        # BullMQ recalc processor
│       ├── scenarios/
│       ├── insights/          # phase-2 stub
│       ├── timeline/          # phase-2 stub
│       ├── audit/
│       └── ops/
├── test/
│   ├── unit/                  # engine property + unit tests
│   ├── integration/           # Supertest per-module API tests
│   ├── e2e/                   # full flows incl. GDPR export/erasure, break-glass
│   ├── golden/
│   │   ├── fixtures/          # persona inputs: broke-student, median-family,
│   │   │                      # fire-aspirant, retiree (JSON)
│   │   └── expected/          # expected snapshots incl. goal completion dates
│   └── load/                  # k6/artillery scripts against §9 budgets
├── docs/
│   ├── openapi.json           # generated via @nestjs/swagger
│   └── adr/                   # decision records (money, outbox, break-glass)
└── seed/
    └── demo-fixtures.ts       # seeds the four personas for demos
```

**Database tables (Prisma models):** `users`, `income_sources`, `assets`, `liabilities`, `fixed_expenses`, `spending_categories`, `transactions`, `assumption_sets`, `goals`, `goal_contributions`, `forecast_snapshots`, `outbox_events`, `scenarios`, `audit_events`, `break_glass_grants`, `idempotency_keys`, `gdpr_requests`.

**Other deliverables in the ending state:** generated OpenAPI document covering all MVP endpoints; seeded demo fixtures for the four personas; green Jest suite (unit + integration + e2e + golden); load-test scripts with recorded baseline runs.

---

## 7. Edge Cases & Failure Modes

| # | Case | Expected behavior (user-visible) | Audit/compliance implication |
|---|---|---|---|
| 1 | **Negative monthly cash flow** — expenses exceed income, goal mathematically unreachable | Forecast completes; affected goals marked `unreachable` with code `NEGATIVE_CASH_FLOW_UNREACHABLE` and an explanation ("your monthly cash flow is negative; this goal cannot complete within the 60-year horizon"); no error thrown | Snapshot persisted normally with `unreachable` flags; no special audit event — this is a valid financial state, not a fault |
| 2 | **Goal target date in the past** | Creation/update rejected `422` with `GOAL_TARGET_IN_PAST`; existing goals whose date passes naturally are flagged `overdue`, never auto-deleted | Rejection not audited (no state change); the natural `active → overdue` transition is audited |
| 3 | **Zero income profile** | Profile is valid; forecast runs; all contribution-dependent goals `unreachable`; UI banner suggests adding an income source | None beyond standard mutation audit; engine must not divide by zero (guarded, unit-tested) |
| 4 | **Inflation > investment return rate** | Forecast runs with negative real growth; goal dates extend or become `unreachable`; assumption panel shows a "negative real return" warning | Assumption change audited with before/after values in the audit diff (DB-only; never logged) |
| 5 | **Recurring contribution exceeds free cash flow** | Write rejected `422` `CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW`, response states available free cash flow; user may override with explicit `allow_deficit: true`, which flags the goal plan as deficit-funded | Override is audited including the `allow_deficit` flag — relevant if the product ever gives regulated advice |
| 6 | **Concurrent profile edits** (two sessions) | Second write with stale `version` fails `409 PROFILE_VERSION_CONFLICT`; client refetches and re-applies; no silent last-write-wins | Only the successful write is audited; conflict counter is an ops metric |
| 7 | **Retroactive transaction edit** (aggregator corrects a past transaction) | Correction ingested; recalculation triggered; new snapshot supersedes; goal dates may shift, UI shows "forecast updated — recent transaction correction" | Both original and corrected transaction rows kept (immutable ledger + correction link); audit event records the correction source |
| 8 | **Deleted income source referenced by an active saved scenario** | Deletion succeeds (user owns it); scenario is marked `invalid` with `SCENARIO_REFERENCES_DELETED_ENTITY` and cannot be run until edited; running it returns `422` with the same code | Deletion and scenario invalidation are both audited, linked by `request_id` |
| 9 | **Forecast horizon > 720 months** (e.g., retirement goal 65 years out) | Request rejected `422 FORECAST_HORIZON_EXCEEDED` stating the 720-month limit; goals with no target date are solved only within the horizon and reported `unreachable_within_horizon` beyond it | None beyond standard audit; the cap itself is documented as a stated product limit |
| 10 | **Currency other than EUR submitted** | Rejected at DTO boundary `422 CURRENCY_NOT_SUPPORTED` ("MVP supports EUR only"); AISP accounts in other currencies are listed as unsupported and excluded from ingestion | Excluded-account decision recorded so support can explain missing transactions; no mixed-currency rows can exist (DB constraint) |
| 11 | **Duplicate transaction ingestion from the aggregator** (webhook retry / overlapping poll) | Silently deduplicated on `(aisp_account_id, provider_transaction_id)`; no duplicate spending, no duplicate recalc job for identical input hash | Dedup counter is an ops metric; a spike may signal an aggregator incident to raise with the processor |
| 12 | **Recalc worker crash mid-run** | User sees the previous snapshot with `stale: true`; outbox delivery retries with backoff; idempotent snapshot write on `(user_id, input_hash)` prevents duplicates; dead-letter after N attempts alerts ops | Dead-lettered event retains full payload reference for replay; replay action by ops is itself audited |
| 13 | **Stale forecast served after a write** | Read succeeds immediately with `stale: true` and `snapshot_created_at`; client may poll or subscribe until `stale: false` (≤ 5 s budget) | None — staleness transparency is the compliance-friendly behavior (never present stale numbers as current) |
| 14 | **LLM coach unavailable** (phase 2) | Insights section shows "insights temporarily unavailable"; forecasts, goals, scenarios fully functional — the coach can never block or alter a forecast | Outage window logged (no user data); demonstrates the advice layer is decoupled from the calculation layer |
| 15 | **Support agent attempts record-level access without break-glass** | Request denied `403 BREAK_GLASS_REQUIRED`; agent UI offers the break-glass flow (justification + ticket ref) | Denied attempt is itself written to `audit_events` (attempted access is a reviewable signal); repeated denials trigger a compliance review flag |
| 16 | **GDPR export requested mid-recalculation** | Export waits for queue quiescence for that user (≤ 5 s budget) or snapshots the consistent state at request time; archive contains a manifest with `input_hash` values proving internal consistency | `gdpr_requests` row tracks request → fulfillment timestamps for the 72 h SLA evidence trail |
| 17 | **GDPR erasure requested mid-recalculation** | Erasure flag stops new recalc jobs for the user immediately; in-flight job results are discarded (snapshot write checks the flag); all personal/financial rows deleted; login disabled; confirmation email sent | Audit rows re-keyed to an irreversible pseudonym and retained 7 years; erasure completion event is the last non-pseudonymized entry |
| 18 | **AISP consent revoked by user (at the bank or in-app)** | Ingestion stops within one polling cycle; profile keeps manual entries; UI shows "bank connection ended — spending data frozen as of DATE"; forecasts continue on last-known + manual data | Consent revocation timestamp audited — required PSD2/GDPR evidence that processing stopped on withdrawal |

---

## 8. Verification Strategy

Test categories are specified **as documentation** (homework scope): they define how each MLO would be proven, not code to write now.

**Persona golden fixtures (used throughout):** `broke-student` (zero savings, negative some months, one small goal), `median-family` (two incomes, mortgage, three goals), `fire-aspirant` (high savings rate, investment-heavy, FI goal), `retiree` (passive income only, drawdown). Each fixture is a frozen JSON input set plus an expected snapshot file including exact goal-completion dates (`YYYY-MM`); golden tests fail on any byte difference.

| MLO | How we know it is met |
|---|---|
| **MLO-1** Profile | Integration tests (Supertest) for CRUD + validation on every entity type; DTO validation unit tests for every rejection path incl. `CURRENCY_NOT_SUPPORTED`; **reconciliation check**: sum of persisted ledger minor units equals sum of submitted inputs after a scripted 50-operation session; optimistic-locking conflict test. |
| **MLO-2** Goals | Lifecycle integration tests (create → prioritize → pause → archive); state-machine unit tests enumerating all transitions incl. illegal ones; validation tests for `GOAL_TARGET_IN_PAST` and `CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW`; fixture goals appear correctly in persona golden snapshots. |
| **MLO-3** Engine | **Property-based unit tests** (fast-check): determinism (run twice ⇒ identical), conservation (net worth delta per month = income − expenses + returns − contributions to nothing external), monotonicity (raising income never delays any goal), horizon cap; **golden-file fixtures** for all four personas; decimal-rounding unit tests (banker's rounding at month boundary, cent-exact); mutation test that any float sneaking into money math fails the type-brand lint. |
| **MLO-4** Recalc pipeline | E2E: POST transaction → poll snapshot endpoint → new snapshot with expected `input_hash` within 5 s; **chaos test**: SIGKILL worker mid-job, assert outbox redelivery and exactly one snapshot per input hash; staleness-flag integration test (write, immediately read, assert `stale: true`, then `false`); load test at ≥ 50 recomputes/s/worker. |
| **MLO-5** Scenarios | Integration tests: scenario run mutates neither profile rows nor baseline snapshots (row-count and hash assertions); golden fixtures for the five canonical scenarios (salary +15%, spend −€200, invest-vs-cash, buy-car, early-payoff) with expected goal-date deltas; load test at p95 ≤ 1 s; rate-limit test at 10 req/min. |
| **MLO-6** (P2) Opportunity cost | Golden fixtures: purchase deltas vs. manually computed goal-date shifts; boundary test at the "significant purchase" threshold. |
| **MLO-7** (P2) Coach | Prompt-redaction contract tests (no raw transactions/PII in LLM payloads); kill-switch e2e (LLM down ⇒ forecasts unaffected); insight claims traceable to snapshot fields. |
| **MLO-8** (P2) Timeline | Derivation tests: milestone order/dates equal goal-completion dates in the underlying snapshot; empty-state test (no goals). |
| **MLO-9** Security/GDPR | **Log-scanning CI test**: grep structured logs for currency/PII patterns after the full e2e suite ⇒ zero hits; audit-completeness test (every mutating e2e call ⇒ matching `audit_events` row in same transaction); GDPR export e2e (archive completeness vs. DB rows) and erasure e2e (post-erasure DB scan finds only pseudonymized audit rows); **manual compliance review checkpoint** before release: DPO walks the export archive, erasure evidence, and retention config. |
| **MLO-10** Ops view | Authorization-matrix integration test: every role × every endpoint, expected allow/deny (incl. `403 BREAK_GLASS_REQUIRED`); break-glass e2e: request → grant → time-boxed access → expiry → audit trail completeness; ops aggregation endpoints return no record-level financial fields (schema assertion). |

**Cross-cutting reconciliation check (release gate):** for every persona fixture, `forecast_snapshots` month-0 opening balances must equal the input ledger totals cent-for-cent, and the export archive totals must equal both.

---

## 9. Expected Performance

All numbers are **assumed targets**, to be validated by the load tests in `test/load/` and revised with production telemetry.

| Metric | Assumed target | Why reasonable |
|---|---|---|
| Forecast recompute (720 months, ≤ 10 goals) | p95 ≤ 500 ms | ~7,200 pure decimal month-steps is CPU-bound arithmetic with no I/O; 500 ms leaves generous headroom on one Node worker core while keeping the 5 s end-to-end budget achievable. |
| Read APIs | p95 ≤ 200 ms, p99 ≤ 500 ms | Reads serve a pre-computed snapshot by indexed key; 200 ms is the standard "feels instant" bar for consumer FinTech dashboards. |
| Scenario simulation (synchronous) | p95 ≤ 1 s | One extra engine run over an in-memory overlay; users tolerate ~1 s for an explicitly requested "what if", and staying synchronous avoids job-queue UX complexity. |
| Time-to-consistency (transaction → fresh forecast) | ≤ 5 s | Outbox relay + queue hop + one recompute; 5 s means the forecast is already fresh by the time a user navigates from a bank notification into the app. |
| Pagination | default 25, max 100 | Bounds worst-case row serialization on transaction lists, keeping read latencies inside budget regardless of account history size. |
| Rate limits | 60 req/min per user; 10 req/min on simulation | 60/min exceeds any human browsing pattern while capping scripted abuse; simulations are ~10× costlier (full engine run), so a 10× stricter cap protects worker CPU fairly. |
| Recalc worker throughput | ≥ 50 recomputes/s per worker instance | At p95 500 ms/compute, ~25 concurrent computations per instance sustains 50/s, letting a small worker pool absorb batch AISP webhook bursts without breaching the 5 s consistency budget. |
| Availability / RPO / RTO | 99.9% / ≤ 5 min / ≤ 1 h | See §4.4 — daily-use (not continuous-use) product, WAL archiving, restore-and-replay recovery. |

---

## 10. Low-Level Tasks

Numbered 1–28. Each task names the MLO it serves, the AI prompt, target file(s), target function(s)/class(es), driving details, and acceptance criteria.

---

### MLO-1 — Financial profile management (deep, MVP)

#### 1. Prisma schema for the financial profile

Serves: MLO-1

What prompt would you run to complete this task?
"Create the Prisma schema models for Horizon's financial profile: `User`, `IncomeSource` (kind: active|passive, gross monthly amount, expected annual growth bps), `Asset` (kind: cash|investment|real_estate, current value, expected annual return bps), `Liability` (kind: loan|mortgage|credit_card, principal, annual interest bps, monthly payment, end date), `FixedExpense`, `SpendingCategory`, `Transaction` (from AISP: provider ids, booked date, amount, category), `AssumptionSet` (inflation bps, default return bps). All monetary columns are BigInt minor units with a `currency Char(3)` column constrained to 'EUR', all ids are UUIDv7 strings, all timestamps timestamptz UTC, every user-owned model has `userId` and an integer `version` for optimistic locking. Add indexes on `(userId)` and unique `(aispAccountId, providerTransactionId)` on Transaction. Migrations must be additive-only."

What file do you want to CREATE or UPDATE?
`prisma/schema.prisma` (+ generated `prisma/migrations/`)

What function do you want to CREATE or UPDATE?
Prisma models `User`, `IncomeSource`, `Asset`, `Liability`, `FixedExpense`, `SpendingCategory`, `Transaction`, `AssumptionSet`

What are details you want to add to drive the code changes?
- BIGINT minor units + `currency` on every money column; DB CHECK `currency = 'EUR'`.
- UUIDv7 primary keys (app-generated, `@db.Uuid`).
- `version Int @default(1)` on every user-editable model.
- `Transaction` rows are immutable; corrections reference the original via `correctsTransactionId`.
- No cascading deletes except through the erasure flow; default `onDelete: Restrict`.

Acceptance criteria:
- [ ] `prisma migrate dev` produces a single additive migration that applies cleanly to an empty PostgreSQL 16 database.
- [ ] Every monetary column is `BigInt` with a paired `currency` column and CHECK constraint; no `Float`/`Decimal` Prisma money fields exist.
- [ ] Unique constraint `(aispAccountId, providerTransactionId)` exists on `Transaction`.
- [ ] All user-owned models have `userId` FK + `version` column, verified by a schema unit test.

#### 2. Profile CRUD service with validated DTOs

Serves: MLO-1

What prompt would you run to complete this task?
"Implement the NestJS `profile` module: `ProfileService` with CRUD for income sources, assets, liabilities, fixed expenses, and the assumption set, plus `ProfileController` REST endpoints. DTOs use class-validator: amounts arrive as integer minor-unit strings, currency must equal 'EUR' (reject others with problem+json `CURRENCY_NOT_SUPPORTED`), growth/return/inflation rates as integer basis points within [-10000, 50000]. Every mutation requires the entity's current `version` and increments it; on mismatch throw `PROFILE_VERSION_CONFLICT` (409). Every mutation writes an `audit_events` row and an outbox event in the same Prisma transaction. All mutating routes require the `Idempotency-Key` header."

What file do you want to CREATE or UPDATE?
`src/modules/profile/profile.service.ts`, `src/modules/profile/profile.controller.ts`, `src/modules/profile/dto/*.dto.ts`

What function do you want to CREATE or UPDATE?
`ProfileService.createIncomeSource/updateAsset/updateLiability/updateAssumptions/...` (full CRUD set), `ProfileController` route handlers

What are details you want to add to drive the code changes?
- Ownership guard: every query filters by `userId` from the JWT subject; no cross-user access path exists.
- Mutation + audit event + outbox event in one `prisma.$transaction`.
- OpenAPI decorators on every route; problem+json error filter applied globally.
- Amount parsing: string → `bigint`; reject non-integer or negative where domain requires positive.

Acceptance criteria:
- [ ] Integration tests cover create/read/update/archive for all five entity groups, including all validation rejections (`CURRENCY_NOT_SUPPORTED`, negative amounts, out-of-range bps).
- [ ] A stale-`version` update returns `409 PROFILE_VERSION_CONFLICT` and leaves the row unchanged.
- [ ] Each successful mutation produces exactly one `audit_events` row and one `outbox_events` row, committed atomically (verified by a transaction-rollback test).
- [ ] Replaying a request with the same `Idempotency-Key` returns the original response body and creates no second row.

#### 3. AISP transaction ingestion with deduplication

Serves: MLO-1

What prompt would you run to complete this task?
"Implement `IngestionService` in the profile module that receives AISP webhook payloads (and a polling fallback) for booked transactions. Verify the webhook HMAC signature, map provider fields to the `Transaction` model (EUR only — non-EUR accounts are marked unsupported and skipped), deduplicate on `(aispAccountId, providerTransactionId)` via upsert-ignore, handle retroactive corrections by inserting a new row linked via `correctsTransactionId` (never mutate the original), auto-assign a `SpendingCategory` from the provider category code with 'uncategorized' fallback, and emit one outbox recalc event per affected user per batch. Consent revocation must stop ingestion for that connection."

What file do you want to CREATE or UPDATE?
`src/modules/profile/ingestion/ingestion.service.ts`, `src/modules/profile/ingestion/ingestion.controller.ts` (webhook endpoint)

What function do you want to CREATE or UPDATE?
`IngestionService.handleWebhookBatch`, `IngestionService.applyCorrection`, `IngestionService.verifySignature`

What are details you want to add to drive the code changes?
- Duplicate delivery must be a silent no-op with a `dedup_count` metric increment.
- One recalc outbox event per user per batch, not per transaction (coalescing).
- Consent state checked per connection before insert; revoked ⇒ drop with audit note.
- Webhook responds 2xx fast (< 200 ms) — heavy work happens after enqueue.

Acceptance criteria:
- [ ] Replaying the same webhook batch twice yields identical DB state (idempotent) and no extra recalc events for unchanged input.
- [ ] A correction payload creates a linked correction row, keeps the original immutable, and triggers exactly one recalc event.
- [ ] Non-EUR account transactions are skipped, counted, and surfaced on the connection status endpoint.
- [ ] Invalid HMAC signature returns 401 and writes no rows.

#### 4. Profile reconciliation endpoint and check

Serves: MLO-1

What prompt would you run to complete this task?
"Implement `ProfileService.reconcile(userId)` returning the profile's ledger totals — sum of asset values, sum of liability principals, monthly fixed income/expenses — computed directly from DB rows as bigint sums, alongside the same totals recorded in the latest `forecast_snapshots` row's input echo. Expose it as `GET /profile/reconciliation` (user role) and reuse it in tests as the reconciliation gate: totals must match cent-for-cent."

What file do you want to CREATE or UPDATE?
`src/modules/profile/reconciliation.service.ts`, `test/integration/profile-reconciliation.spec.ts`

What function do you want to CREATE or UPDATE?
`ReconciliationService.reconcile`, `ReconciliationService.compareWithSnapshot`

What are details you want to add to drive the code changes?
- All sums in `bigint`; any float in the code path fails lint.
- Response includes `matches: boolean` and per-category diffs (IDs and cent deltas only — safe for support diagnostics under break-glass).
- Used as the §8 release-gate check against all four persona fixtures.

Acceptance criteria:
- [ ] For each seeded persona, reconciliation reports `matches: true` after seeding + one recalc.
- [ ] Deliberately corrupting one snapshot input echo in a test causes `matches: false` with the correct category flagged.
- [ ] Endpoint denies access to other users' data (ownership guard test).

---

### MLO-2 — Goal management (deep, MVP)

#### 5. Goal and contribution schema + DTOs

Serves: MLO-2

What prompt would you run to complete this task?
"Add Prisma models `Goal` (userId, type enum: house|car|emergency_fund|net_worth|financial_independence|retirement|vacation|custom; name; targetAmount BigInt minor units EUR; optional targetMonth `YYYY-MM`; priority int 1–100 unique per user among active goals; status enum: active|paused|achieved|overdue|archived; version) and `GoalContribution` (goalId, kind: one_time|recurring_monthly, amount BigInt, startMonth, optional endMonth, allowDeficit boolean default false). Create class-validator DTOs: targetAmount > 0, targetMonth must not be in the past relative to the request's evaluation date (reject with `GOAL_TARGET_IN_PAST`), horizon ≤ 720 months from evaluation date (reject with `FORECAST_HORIZON_EXCEEDED`)."

What file do you want to CREATE or UPDATE?
`prisma/schema.prisma` (update), `src/modules/goals/dto/create-goal.dto.ts`, `src/modules/goals/dto/contribution.dto.ts`

What function do you want to CREATE or UPDATE?
Prisma models `Goal`, `GoalContribution`; DTO classes `CreateGoalDto`, `UpdateGoalDto`, `ContributionDto`

What are details you want to add to drive the code changes?
- `targetMonth` is month-granularity `YYYY-MM` (regex + semantic validation), stored as first-of-month UTC date.
- Priority uniqueness enforced among `active` goals per user (partial unique index).
- Max 10 active goals per user in MVP (aligned with the perf budget); 11th returns `422 GOAL_LIMIT_EXCEEDED`.

Acceptance criteria:
- [ ] DTO unit tests cover every rejection: past target month, horizon overflow, non-positive amount, duplicate priority, 11th active goal.
- [ ] Migration is additive and applies over Task 1's schema without edits to prior migrations.
- [ ] `YYYY-MM` fields round-trip through the API without timezone drift (UTC test at year boundaries).

#### 6. Goal CRUD service with lifecycle state machine

Serves: MLO-2

What prompt would you run to complete this task?
"Implement `GoalsService` and `GoalsController` with CRUD plus explicit lifecycle transitions. State machine: `active ↔ paused`, `active → achieved` (engine-determined only, never user-set), `active → overdue` (targetMonth passes without completion; system transition during recalc), any → `archived` (terminal). Illegal transitions return `422 GOAL_ILLEGAL_TRANSITION`. All mutations: optimistic locking on `version`, audit event + outbox recalc event in the same transaction, `Idempotency-Key` required."

What file do you want to CREATE or UPDATE?
`src/modules/goals/goals.service.ts`, `src/modules/goals/goals.controller.ts`, `src/modules/goals/goal-state.machine.ts`

What function do you want to CREATE or UPDATE?
`GoalsService.create/update/pause/resume/archive`, `GoalStateMachine.assertTransition`, `GoalStateMachine.systemTransition`

What are details you want to add to drive the code changes?
- `achieved` and `overdue` are system transitions invoked by the recalc worker, not exposed as user endpoints.
- Archiving a goal removes it from future forecasts but never deletes historical snapshots referencing it.
- Pause excludes the goal's contributions from projections while keeping its funded balance visible.

Acceptance criteria:
- [ ] State-machine unit tests enumerate all transitions (legal and illegal) with expected outcomes.
- [ ] Attempting to PATCH status to `achieved` via the API returns `422 GOAL_ILLEGAL_TRANSITION`.
- [ ] Every lifecycle change emits an audit event and (except archive of a paused goal) an outbox recalc event.
- [ ] Optimistic-locking conflict on concurrent goal edits returns 409 (integration test with two parallel requests).

#### 7. Contribution allocation policy

Serves: MLO-2

What prompt would you run to complete this task?
"Implement the pure function `allocateFreeCashFlow(freeCashFlowCents: bigint, goals: GoalPlanInput[]): AllocationResult` in the goals module: after honoring explicit recurring contributions, remaining free cash flow is allocated to active goals in strict priority order (highest priority first, fill until on-track for targetMonth, then next). Explicit contributions exceeding free cash flow are rejected upstream with `CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW` unless `allowDeficit` is set. The function is deterministic, decimal.js-based with ROUND_HALF_EVEN, and shared by the forecast engine and the scenario simulator."

What file do you want to CREATE or UPDATE?
`src/modules/goals/allocation/allocate-free-cash-flow.ts`, `test/unit/allocation.spec.ts`

What function do you want to CREATE or UPDATE?
`allocateFreeCashFlow`, types `GoalPlanInput`, `AllocationResult`

What are details you want to add to drive the code changes?
- Pure function, no I/O; ties in priority are impossible by schema (unique priority).
- Sum of allocations must equal min(freeCashFlow, total need) exactly — no lost or created cents (property test).
- Negative free cash flow ⇒ zero allocations, deficit amount reported for the `NEGATIVE_CASH_FLOW_UNREACHABLE` flag.

Acceptance criteria:
- [ ] Property-based test: allocations always sum exactly to the allocatable amount in cents (no rounding leakage).
- [ ] Priority-order tests: higher-priority goal fully funded before any lower-priority allocation.
- [ ] Negative and zero cash-flow inputs return zero allocations with correct deficit reporting.

#### 8. Goal progress read model

Serves: MLO-2

What prompt would you run to complete this task?
"Implement `GET /goals` and `GET /goals/:id/progress` returning each goal joined with its latest snapshot-derived progress: funded amount, percent complete, projected completion month, `unreachable`/`unreachable_within_horizon` flags, and the snapshot's `input_hash` + `stale` indicator. Paginated (default 25, max 100), sorted by priority. Read-only, p95 ≤ 200 ms."

What file do you want to CREATE or UPDATE?
`src/modules/goals/goal-progress.service.ts`, `src/modules/goals/goals.controller.ts` (update)

What function do you want to CREATE or UPDATE?
`GoalProgressService.listWithProgress`, `GoalProgressService.getProgress`

What are details you want to add to drive the code changes?
- Progress comes only from the latest `forecast_snapshots` row — never recomputed inline on read.
- Staleness flag per §5.5 (newer outbox event than served snapshot ⇒ `stale: true`).
- Pagination cursor-based on `(priority, id)`.

Acceptance criteria:
- [ ] Response for each persona fixture matches the golden snapshot's goal-completion months exactly.
- [ ] `stale: true` appears immediately after a profile write and clears once the new snapshot lands (integration test).
- [ ] Pagination enforces max 100 and returns a stable cursor (no skipped/duplicated goals across pages).

---

### MLO-3 — Deterministic forecast engine (deep, MVP)

#### 9. Money/decimal utility

Serves: MLO-3

What prompt would you run to complete this task?
"Create the engine's money utility: a branded `Cents` type (bigint), constructors `centsFromBigInt`/`centsFromString`, converters `toDecimal(cents): Decimal` and `toCents(d: Decimal): Cents` applying ROUND_HALF_EVEN exactly once, and rate helpers `monthlyRateFromAnnualBps(bps): Decimal` (geometric conversion: (1+r)^(1/12)−1, 20 significant digits). Configure a module-local Decimal clone (precision 28, ROUND_HALF_EVEN) so global decimal.js config cannot affect the engine. Export nothing float-typed; add an ESLint rule forbidding `number` in any type position within `src/modules/forecast/engine/` money paths."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/engine/money.ts`, `test/unit/engine/money.spec.ts`

What function do you want to CREATE or UPDATE?
`centsFromString`, `toDecimal`, `toCents`, `monthlyRateFromAnnualBps`, branded type `Cents`

What are details you want to add to drive the code changes?
- Banker's rounding verified on the classic half-cent cases (0.5 → 0, 1.5 → 2, 2.5 → 2 pattern).
- Geometric (not linear) annual→monthly rate conversion; document why in JSDoc.
- Local `Decimal.clone()` prevents cross-module config bleed (regression test mutates global config and asserts engine output unchanged).

Acceptance criteria:
- [ ] Half-even rounding unit tests pass for positive and negative half-cent boundaries.
- [ ] `monthlyRateFromAnnualBps(500)` compounds over 12 months back to 5.00% annual within 1e-12 relative error.
- [ ] ESLint fails the build if a `number` is used for a money value inside the engine (demonstrated by a fixture lint test).
- [ ] Global decimal.js reconfiguration in a test does not change engine results.

#### 10. Projection month-step function

Serves: MLO-3

What prompt would you run to complete this task?
"Implement the pure function `projectMonth(state: MonthState, inputs: EngineInputs, monthIndex: number): MonthState` in the engine. Per month, in fixed order: (1) apply income (active sources with annual growth compounded monthly from their anchor month, passive income), (2) subtract fixed expenses and inflation-adjusted variable spending baseline, (3) accrue liability interest and apply scheduled payments (payoff month clamps the final payment to remaining principal), (4) apply investment returns to investment assets, (5) allocate free cash flow to goal contributions via `allocateFreeCashFlow`, (6) round each stored value once. No I/O, no Date.now(); the evaluation month is part of `EngineInputs`. Return a new immutable state object."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/engine/month-step.ts`, `src/modules/forecast/engine/types.ts`

What function do you want to CREATE or UPDATE?
`projectMonth`, types `MonthState`, `EngineInputs`

What are details you want to add to drive the code changes?
- Operation order is normative and documented — changing it changes results and breaks golden files by design.
- Liability payoff: final payment = min(scheduled payment, principal + accrued interest); principal never goes negative.
- Inflation applies to variable-spending baseline and fixed expenses flagged `inflationAdjusted`.
- Negative free cash flow: draw down cash assets first; if cash exhausted, record deficit (no implicit borrowing).

Acceptance criteria:
- [ ] Conservation property test: closing net worth − opening net worth = income − expenses − interest + returns, cent-exact, over randomized inputs.
- [ ] Determinism property test: two runs over identical inputs produce deep-equal states.
- [ ] Liability payoff month clamps correctly (no negative principal) in unit tests including edge amounts of 1 cent.
- [ ] Zero-income and negative-cash-flow inputs produce valid states with deficits recorded, never exceptions.

#### 11. Goal completion solver

Serves: MLO-3

What prompt would you run to complete this task?
"Implement `solveGoalCompletion(projection: MonthState[], goals: GoalPlanInput[]): GoalOutcome[]`: for each goal, scan the month series for the first month where cumulative funded amount ≥ targetAmount and return `{ goalId, completionMonth | null, status: on_track|late|unreachable|unreachable_within_horizon, monthsLate? }`. `late` = completes after targetMonth; `unreachable` = free cash flow ≤ 0 permanently under current inputs (maps to `NEGATIVE_CASH_FLOW_UNREACHABLE`); `unreachable_within_horizon` = not funded within the 720-month horizon but cash flow is positive. Pure function."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/engine/goal-solver.ts`, `test/unit/engine/goal-solver.spec.ts`

What function do you want to CREATE or UPDATE?
`solveGoalCompletion`, type `GoalOutcome`

What are details you want to add to drive the code changes?
- Distinguish `unreachable` from `unreachable_within_horizon` — different user messaging and error codes.
- A goal already funded at month 0 completes at month 0 (`on_track`).
- Paused goals are skipped with status `paused` echoed, funded balance preserved.

Acceptance criteria:
- [ ] Unit tests cover: completes exactly on targetMonth, one month late, never (both unreachable variants), pre-funded at month 0, paused.
- [ ] Property test: increasing monthly allocation never produces a later completion month (monotonicity).
- [ ] Output months use `YYYY-MM` and match golden persona fixtures.

#### 12. Net-worth aggregation

Serves: MLO-3

What prompt would you run to complete this task?
"Implement `aggregateNetWorth(state: MonthState): NetWorthBreakdown` returning cash, investments, real estate, total assets, total liabilities, and net worth as `Cents`, plus a monthly cash-flow summary (income, expenses, savings amount, savings rate in basis points). Savings rate = savings/income in bps, ROUND_HALF_EVEN, defined as 0 bps when income is zero (guarded division). Pure function used per projected month to build the snapshot's month series."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/engine/net-worth.ts`, `test/unit/engine/net-worth.spec.ts`

What function do you want to CREATE or UPDATE?
`aggregateNetWorth`, type `NetWorthBreakdown`

What are details you want to add to drive the code changes?
- Total = sum of parts, cent-exact (asserted, not assumed).
- Zero-income guard returns 0 bps savings rate, never NaN/Infinity/throw.
- Breakdown feeds MLO-8 timeline milestones ("passive income ≥ €1,000/month") in phase 2 — include passive-income subtotal now.

Acceptance criteria:
- [ ] Sum-of-parts equals totals in a property test over randomized states.
- [ ] Zero-income state yields 0 bps savings rate (regression test for divide-by-zero).
- [ ] Breakdown for `median-family` month 0 matches the golden fixture exactly.

#### 13. Forecast orchestrator and snapshot persistence

Serves: MLO-3

What prompt would you run to complete this task?
"Implement `ForecastService.runForecast(userId, evaluationMonth)`: load profile + active/paused goals + assumptions, canonically serialize inputs (sorted keys, stable field order), compute SHA-256 `input_hash`, run the engine (`projectMonth` loop up to min(needed, 720) months, `solveGoalCompletion`, `aggregateNetWorth` per month), and persist one immutable `forecast_snapshots` row: `id` UUIDv7, `userId`, `inputHash`, `engineVersion`, `evaluationMonth`, `inputsEcho` JSONB, `monthSeries` JSONB, `goalOutcomes` JSONB, `createdAt`. Idempotent on unique `(userId, inputHash, engineVersion)` — conflict is a successful no-op returning the existing row. Apply system goal transitions (`achieved`, `overdue`) via `GoalStateMachine.systemTransition` after persisting."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/snapshot.service.ts`, `src/modules/forecast/forecast.service.ts`, `prisma/schema.prisma` (add `ForecastSnapshot`, additive)

What function do you want to CREATE or UPDATE?
`ForecastService.runForecast`, `SnapshotService.persistIdempotent`, `canonicalizeInputs`

What are details you want to add to drive the code changes?
- Engine invocation stays pure: service gathers inputs, engine computes, service persists — no Prisma import anywhere under `engine/`.
- `engineVersion` is a semver constant bumped whenever engine math changes, so old snapshots remain interpretable (reproducibility).
- Snapshot rows have no UPDATE/DELETE path in application code; retention cleanup is a separate documented job.
- p95 ≤ 500 ms for 720 months × 10 goals, benchmarked in a perf test.

Acceptance criteria:
- [ ] Running the forecast twice with unchanged inputs creates exactly one snapshot row (idempotency integration test).
- [ ] `input_hash` is stable across process restarts and key-order permutations of the same logical inputs.
- [ ] A benchmark test confirms 720-month/10-goal compute+persist under 500 ms p95 on CI hardware (recorded, non-blocking threshold documented).
- [ ] Goal state transitions to `achieved`/`overdue` occur through the state machine and are audited.

#### 14. Golden-fixture harness

Serves: MLO-3

What prompt would you run to complete this task?
"Create the golden-fixture test harness: load each persona input JSON from `test/golden/fixtures/` (broke-student, median-family, fire-aspirant, retiree), run the pure engine with a fixed evaluation month (2026-01), serialize the resulting snapshot payload canonically, and byte-compare against `test/golden/expected/<persona>.json`. Provide `npm run golden:update` to regenerate expected files, printing a loud diff summary; CI runs compare-only. Expected files include exact goal completion months per persona (e.g. median-family house goal: 2031-04)."

What file do you want to CREATE or UPDATE?
`test/golden/golden.harness.ts`, `test/golden/golden.spec.ts`, `test/golden/fixtures/*.json`, `test/golden/expected/*.json`, `seed/demo-fixtures.ts`

What function do you want to CREATE or UPDATE?
`runGoldenFixture`, `canonicalSerialize`, npm scripts `golden:check` / `golden:update`

What are details you want to add to drive the code changes?
- Personas per §8: broke-student (zero savings, occasional negative months, one small goal), median-family (two incomes, mortgage, three goals), fire-aspirant (high savings rate, FI goal), retiree (passive-only, drawdown).
- The same fixture files seed the demo database (`seed/demo-fixtures.ts` imports them) — one source of truth.
- Any diff fails CI with a human-readable month/goal delta report, not just a byte mismatch.

Acceptance criteria:
- [ ] All four personas produce byte-identical output across two consecutive CI runs and across macOS/Linux runners.
- [ ] Expected files contain explicit goal-completion months that a reviewer can sanity-check by hand.
- [ ] Changing ROUND_HALF_EVEN to ROUND_HALF_UP in a scratch branch breaks at least one golden test (proves sensitivity).
- [ ] `seed/demo-fixtures.ts` seeds all personas and reconciliation (Task 4) passes for each.

---

### MLO-4 — Continuous recalculation pipeline (deep, MVP)

#### 15. Transactional outbox writer and relay

Serves: MLO-4

What prompt would you run to complete this task?
"Add the `outbox_events` Prisma model (id UUIDv7, aggregateType, aggregateId, userId, eventType e.g. `PROFILE_CHANGED`/`GOAL_CHANGED`/`TRANSACTIONS_INGESTED`, payload JSONB with entity IDs only — no amounts, createdAt, publishedAt nullable, attempts int) and `OutboxService.writeEvent(tx, event)` used inside the same Prisma transaction as every domain mutation. Implement `OutboxRelay`: poll unpublished rows (batch 100, `FOR UPDATE SKIP LOCKED`), coalesce multiple pending events per user into one BullMQ `recalc` job keyed `recalc:{userId}`, mark published. At-least-once delivery; exponential backoff on publish failure."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/outbox/outbox.service.ts`, `src/modules/forecast/outbox/outbox.relay.ts`, `prisma/schema.prisma` (additive)

What function do you want to CREATE or UPDATE?
`OutboxService.writeEvent`, `OutboxRelay.publishPending`, `OutboxRelay.coalesceByUser`

What are details you want to add to drive the code changes?
- Payloads carry entity IDs and event types only — never monetary values (log-redaction policy extends to queue payloads).
- `SKIP LOCKED` enables multiple relay instances without double-publish of the same row.
- Relay poll interval ≤ 500 ms to protect the 5 s end-to-end consistency budget.
- BullMQ job id `recalc:{userId}:{latestOutboxId}` gives natural dedupe for coalesced bursts.

Acceptance criteria:
- [ ] A rolled-back domain transaction leaves no outbox row (atomicity test).
- [ ] Killing the relay after publish but before `publishedAt` update causes redelivery, and the worker handles the duplicate safely (at-least-once demonstrated).
- [ ] 50 rapid profile edits by one user coalesce into far fewer recalc jobs (coalescing test asserts ≤ 5).
- [ ] Queue payload schema test proves no monetary fields are present.

#### 16. BullMQ recalculation worker

Serves: MLO-4

What prompt would you run to complete this task?
"Implement the BullMQ processor `RecalcProcessor.process(job)` in `src/modules/forecast/worker/`: check the user's GDPR erasure flag (skip + ack if set), call `ForecastService.runForecast(userId, currentEvaluationMonth)`, rely on idempotent snapshot persistence for exactly-once effect, apply system goal transitions, and emit metrics (duration histogram, queue lag, snapshots/s). Retries: 5 attempts, exponential backoff from 1 s, then dead-letter queue with an ops alert. Concurrency and instance count sized for ≥ 50 recomputes/s per worker instance."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/worker/recalc.processor.ts`, `src/modules/forecast/worker/recalc.module.ts`

What function do you want to CREATE or UPDATE?
`RecalcProcessor.process`, `RecalcProcessor.onFailed` (DLQ + alert hook)

What are details you want to add to drive the code changes?
- The worker is the only writer of forecast snapshots (single write path).
- Evaluation month derives from job data enqueue time truncated to month, passed into the engine (no Date.now() inside engine).
- SIGTERM handling: finish or abandon the in-flight job cleanly; abandoned jobs are retried (chaos-tested per §8 MLO-4).
- Worker logs contain userId, jobId, duration, inputHash — no financial values.

Acceptance criteria:
- [ ] Chaos test: SIGKILL mid-job ⇒ job retried, exactly one snapshot per input hash exists afterward.
- [ ] Erasure-flagged user's job is acked without writing a snapshot (integration test).
- [ ] Load test sustains ≥ 50 recomputes/s on one worker instance with persona-sized inputs.
- [ ] After 5 failed attempts a job lands in the DLQ and the ops alert hook fires (test double).

#### 17. Forecast read API with staleness indicator

Serves: MLO-4

What prompt would you run to complete this task?
"Implement `GET /forecast/latest` and `GET /forecast/snapshots/:id` in `ForecastController`: return the latest (or specified) snapshot's month series, goal outcomes, `input_hash`, `engine_version`, `snapshot_created_at`, and `stale: boolean` computed by `StalenessService.isStale(userId)` (true iff an outbox event for the user is newer than the served snapshot's creation). Add `GET /forecast/freshness` returning `{stale, pending_events, last_snapshot_at}` for cheap client polling. Read-only, p95 ≤ 200 ms; month series paginated in year chunks (12 months/page semantics documented in OpenAPI)."

What file do you want to CREATE or UPDATE?
`src/modules/forecast/forecast.controller.ts`, `src/modules/forecast/staleness.service.ts`

What function do you want to CREATE or UPDATE?
`ForecastController.getLatest/getSnapshot/getFreshness`, `StalenessService.isStale`

What are details you want to add to drive the code changes?
- Staleness check is one indexed query on `(userId, createdAt)` over outbox vs. snapshot — no engine work on the read path.
- 404 with problem+json `NO_SNAPSHOT_YET` for brand-new users before first recalc; clients show onboarding state, not an error toast.
- Snapshot detail endpoint enforces ownership (or break-glass grant for internal roles).

Acceptance criteria:
- [ ] Write-then-read integration test observes `stale: true` immediately after a mutation and `stale: false` within the 5 s budget.
- [ ] New user with no snapshot gets `NO_SNAPSHOT_YET`, not a 500.
- [ ] Read latency benchmark meets p95 ≤ 200 ms with a 720-month snapshot.
- [ ] Ownership test: user B requesting user A's snapshot id gets 404 (not 403, to avoid existence leak).

---

### MLO-5 — Scenario simulator (deep, MVP)

#### 18. Scenario delta model and validation

Serves: MLO-5

What prompt would you run to complete this task?
"Define the scenario delta schema: Prisma model `Scenario` (userId, name, status active|invalid, deltas JSONB, version) and a discriminated-union DTO `ScenarioDeltaDto` with variants: `income_change` (incomeSourceId, percentBps or absolute cents, effectiveMonth), `expense_change` (categoryId or fixedExpenseId, monthly delta cents, effectiveMonth), `asset_reallocation` (fromAssetId, toAssetKind, amount cents, returnBps), `one_time_purchase` (amount cents, month, fundedFromAssetId), `early_liability_payoff` (liabilityId, payoffMonth). class-validator on each variant; referenced entity IDs must exist and belong to the user, else `422 SCENARIO_REFERENCES_DELETED_ENTITY`. Cap 10 deltas per scenario, 20 saved scenarios per user."

What file do you want to CREATE or UPDATE?
`src/modules/scenarios/dto/scenario-delta.dto.ts`, `src/modules/scenarios/scenarios.service.ts` (validation part), `prisma/schema.prisma` (additive)

What function do you want to CREATE or UPDATE?
`ScenarioDeltaDto` union, `ScenariosService.validateDeltas`, Prisma model `Scenario`

What are details you want to add to drive the code changes?
- The five variants map 1:1 to the canonical product questions (salary +15%, cut restaurants €200, invest vs. cash, buy a car, early payoff).
- Entity-reference validation re-runs at execution time, not just save time (entities may be deleted later — edge case #8).
- Effective months validated against the 720-month horizon (`FORECAST_HORIZON_EXCEEDED`).

Acceptance criteria:
- [ ] DTO tests cover all five variants, valid and invalid (bad refs, out-of-horizon months, both percent and absolute set).
- [ ] A scenario referencing another user's entity is rejected with no existence leak (same error as missing).
- [ ] Deleting a referenced income source flips saved scenarios to `invalid` (integration test for edge case #8).

#### 19. Scenario evaluation service (overlay + synchronous run)

Serves: MLO-5

What prompt would you run to complete this task?
"Implement `ScenarioEvaluationService.evaluate(userId, deltas, evaluationMonth)`: load the same inputs as `ForecastService.runForecast`, apply deltas as a pure in-memory overlay (`applyDeltasToInputs(inputs, deltas): EngineInputs` — new object, source inputs untouched), run the engine synchronously, and return baseline vs. scenario comparison: per-goal completion months and deltas in months, net-worth series both curves, monthly-cash-flow deltas. Baseline comes from the latest snapshot when its input hash matches current inputs, else a fresh baseline run. Never persist snapshots or mutate profile rows. Enforce 10 req/min rate limit and p95 ≤ 1 s."

What file do you want to CREATE or UPDATE?
`src/modules/scenarios/scenario-evaluation.service.ts`, `src/modules/scenarios/engine-overlay/apply-deltas.ts`

What function do you want to CREATE or UPDATE?
`ScenarioEvaluationService.evaluate`, `applyDeltasToInputs`, type `ScenarioComparison`

What are details you want to add to drive the code changes?
- `applyDeltasToInputs` is pure and lives beside (not inside) the engine; the engine itself stays scenario-agnostic.
- `one_time_purchase` reduces the funding asset in the purchase month; insufficient funds ⇒ deficit semantics identical to Task 10 (no hidden credit).
- `early_liability_payoff` clamps to remaining principal at payoff month; interest saved is reported.
- Response includes both `input_hash`es (baseline + scenario) for reproducibility claims.

Acceptance criteria:
- [ ] Row-count and content-hash assertions prove zero writes to profile, goals, or snapshots during evaluation.
- [ ] Golden fixtures for all five canonical scenarios on `median-family` produce expected goal-date deltas (e.g. salary +15% ⇒ house goal ~7 months earlier — exact months in expected files).
- [ ] Load test: p95 ≤ 1 s for a 720-month, 10-goal, 10-delta evaluation.
- [ ] 11th simulation request within a minute returns 429 with problem+json and `Retry-After`.

#### 20. Scenario endpoints and persistence of saved scenarios

Serves: MLO-5

What prompt would you run to complete this task?
"Implement `ScenariosController`: `POST /scenarios/evaluate` (ad-hoc, synchronous, no persistence), `POST /scenarios` (save named scenario), `GET /scenarios` (paginated list with validity status), `POST /scenarios/:id/evaluate` (run saved), `DELETE /scenarios/:id` (archive). Saving and archiving are audited and idempotent; ad-hoc evaluation is not audited as a mutation (read-like) but is rate-limited and access-logged. OpenAPI documents every delta variant with examples matching the five canonical questions."

What file do you want to CREATE or UPDATE?
`src/modules/scenarios/scenarios.controller.ts`, `src/modules/scenarios/scenarios.service.ts` (update)

What function do you want to CREATE or UPDATE?
`ScenariosController.evaluateAdHoc/create/list/evaluateSaved/archive`

What are details you want to add to drive the code changes?
- Running a saved scenario revalidates entity references (edge case #8) and returns `422 SCENARIO_REFERENCES_DELETED_ENTITY` when broken, with the offending delta index.
- Saved-scenario results are never cached beyond the response — profile may change anytime.
- `Idempotency-Key` required on save/archive; not on evaluate (safe to repeat).

Acceptance criteria:
- [ ] Full CRUD + evaluate integration tests, including saved-scenario invalidation and re-edit flow.
- [ ] Audit events exist for save/archive but not for ad-hoc evaluations.
- [ ] OpenAPI examples for all five canonical scenario questions render in Swagger UI.

---

### MLO-6 — Opportunity cost analysis (phase 2, coarse)

#### 21. Opportunity-cost estimate endpoint (phase 2)

Serves: MLO-6 — **phase 2; do not build in MVP; module ships as a documented stub.**

What prompt would you run to complete this task?
"Phase 2: Implement `POST /insights/opportunity-cost` accepting `{amount_cents, description?, funded_from_asset_id}`: internally construct a `one_time_purchase` scenario delta (reusing Task 18/19 machinery), evaluate against the latest baseline, and return per-goal delay in months plus a headline string template ('this €X purchase delays GOAL by ~N months') with all figures computed server-side from the comparison. Significant-purchase threshold (default ≥ €500, configurable) gates whether clients proactively show the prompt; below threshold the endpoint still answers on demand."

What file do you want to CREATE or UPDATE?
`src/modules/insights/opportunity-cost.service.ts`, `src/modules/insights/insights.controller.ts`

What function do you want to CREATE or UPDATE?
`OpportunityCostService.estimate`

What are details you want to add to drive the code changes?
- Zero new math: strictly a thin composition over the scenario evaluator — keeps one deterministic calculation core.
- Delay reported per goal, rounded to whole months toward "worse" (conservative messaging).
- Rate-limited with the simulation bucket (10 req/min).

Acceptance criteria:
- [ ] Golden fixture: €2,000 laptop for `median-family` delays the house goal by the expected ~2 months (exact value in expected file).
- [ ] Response contains no data not derivable from the scenario comparison (contract test).
- [ ] Endpoint is feature-flagged off by default in MVP config.

---

### MLO-7 — AI financial coach (phase 2, coarse)

#### 22. Coach insight generation with grounding and graceful degradation (phase 2)

Serves: MLO-7 — **phase 2; do not build in MVP; module ships as a documented stub.**

What prompt would you run to complete this task?
"Phase 2: Implement `CoachService.generateInsights(userId)`: build a redacted feature summary from the latest snapshot only (savings-rate bps, goal-date deltas under standard what-if increments, months-to-goal — no raw transactions, no names, no account identifiers, no absolute income unless the user opted in), call the OpenAI-compatible LLM API with a fixed system prompt forbidding financial advice framing (insights, not advice — no tax/investment recommendations), validate the response against a claims schema (every number must match a provided feature within tolerance 0), and store accepted insights. On any LLM failure or validation failure: return empty insights; never retry into the forecast path; never block or alter forecasts."

What file do you want to CREATE or UPDATE?
`src/modules/insights/coach.service.ts`, `src/modules/insights/coach-prompt.ts`

What function do you want to CREATE or UPDATE?
`CoachService.generateInsights`, `buildRedactedFeatures`, `validateClaims`

What are details you want to add to drive the code changes?
- LLM provider is a documented GDPR processor; EU endpoint required; prompts/completions retained ≤ 30 days (assumed target).
- Numeric claims validation: any figure in the output not exactly matching a supplied feature rejects the whole insight (no hallucinated numbers reach users).
- Kill switch env flag; the insights module has no imports from `forecast/engine` write paths.

Acceptance criteria:
- [ ] Redaction contract test: captured LLM payloads contain no denylisted fields across all persona fixtures.
- [ ] LLM outage e2e: forecasts, goals, scenarios fully functional; insights endpoint returns an empty list with `degraded: true`.
- [ ] An LLM response containing a fabricated number is rejected by `validateClaims` (fixture test).

---

### MLO-8 — Timeline view (phase 2, coarse)

#### 23. Milestone timeline derivation (phase 2)

Serves: MLO-8 — **phase 2; do not build in MVP; module ships as a documented stub.**

What prompt would you run to complete this task?
"Phase 2: Implement `TimelineService.buildTimeline(userId)` deriving a chronological milestone list purely from the latest snapshot: each goal's projected completion (emergency fund complete, car, house down payment), liability payoff months (mortgage payoff), threshold crossings computed from the month series (passive income ≥ €1,000/month, FI: passive income ≥ expenses, configured retirement month), sorted by month with `achieved|projected|unreachable` status. Expose `GET /timeline`. No new math — thresholds are scans over `NetWorthBreakdown` month series; unreachable goals appear in a distinct 'not yet on the map' section."

What file do you want to CREATE or UPDATE?
`src/modules/timeline/timeline.service.ts`, `src/modules/timeline/timeline.controller.ts`

What function do you want to CREATE or UPDATE?
`TimelineService.buildTimeline`, `findThresholdCrossing`

What are details you want to add to drive the code changes?
- Milestone months must equal the snapshot's goal-outcome months exactly (single source of truth).
- Threshold definitions (passive-income level, FI rule) are configuration, not code constants.
- Includes snapshot `input_hash` + `stale` flag like all forecast-derived reads.

Acceptance criteria:
- [ ] Derivation test: timeline milestone months equal snapshot goal-completion months for all personas.
- [ ] `fire-aspirant` fixture produces the FI crossing at the expected month (golden value).
- [ ] Empty-goals user gets a valid empty timeline, not an error.

---

### MLO-9 — Security, audit & GDPR compliance (cross-cutting, MVP)

#### 24. Append-only audit trail

Serves: MLO-9

What prompt would you run to complete this task?
"Implement the audit module: Prisma model `AuditEvent` (id UUIDv7, actorId, actorRole, occurredAt UTC, entityType, entityId, action, before JSONB, after JSONB, justification nullable, requestId) with a migration that additionally REVOKEs UPDATE/DELETE on the table from the application DB role; `AuditService.record(tx, event)` callable only inside a domain transaction; and a NestJS interceptor that injects `requestId` and enforces that every request hitting a mutating route handler results in ≥ 1 audit record (assertion in test middleware, not production crash). Before/after diffs contain full field values in the DB (including amounts — the DB is the protected store) but the audit module's own logging uses the redaction serializer."

What file do you want to CREATE or UPDATE?
`src/modules/audit/audit.service.ts`, `src/modules/audit/audit.interceptor.ts`, `prisma/schema.prisma` + raw-SQL migration for grants

What function do you want to CREATE or UPDATE?
`AuditService.record`, `AuditInterceptor.intercept`, `diffEntities`

What are details you want to add to drive the code changes?
- Same-transaction guarantee: `record` takes the Prisma transaction client, never the root client.
- `diffEntities` produces minimal before/after field diffs; unchanged fields omitted.
- Denied break-glass attempts are audited too (edge case #15) — `action: 'ACCESS_DENIED'`.

Acceptance criteria:
- [ ] Attempting UPDATE/DELETE on `audit_events` as the app role fails at the DB level (integration test with raw SQL).
- [ ] Audit-completeness test: every mutating e2e call in the suite has a matching audit row with the same `requestId`.
- [ ] A rolled-back mutation leaves no audit row (atomicity test).
- [ ] Audit rows for money-field changes exist in DB while the log-scanning test still finds no amounts in logs.

#### 25. Logging redaction serializer and CI log-scan gate

Serves: MLO-9

What prompt would you run to complete this task?
"Implement the central structured logger with a redaction serializer: a denylist of key patterns (`amount*`, `balance*`, `income*`, `target*`, `principal*`, `payment*`, `iban`, `email`, `name`, `payload.deltas`) replaced with `[REDACTED]` recursively before emission, applied to app logs, worker logs, and BullMQ job logging. Then add the CI gate `test/e2e/log-scan.spec.ts`: run the full e2e suite with logs captured to a file, then assert zero matches for currency-shaped patterns (`\\d+\\.\\d{2}`, `€`, cent values adjacent to denylisted keys) and zero raw emails/IBANs."

What file do you want to CREATE or UPDATE?
`src/common/logging/redaction.serializer.ts`, `src/common/logging/logger.module.ts`, `test/e2e/log-scan.spec.ts`

What function do you want to CREATE or UPDATE?
`redact(obj): obj`, `LoggerModule.forRoot`, log-scan test `assertNoFinancialPiiInLogs`

What are details you want to add to drive the code changes?
- Redaction is allow-fail-closed: unknown deep objects are stringified through the redactor, never raw.
- Entity IDs, error codes, durations, hashes are explicitly allowed (needed for ops).
- The scan gate runs in CI after e2e and fails the pipeline on any hit, printing the offending line's location (not content).

Acceptance criteria:
- [ ] Unit tests: nested objects, arrays, and circular references are redacted without throwing.
- [ ] Deliberately logging a profile entity in a test yields `[REDACTED]` for every monetary field.
- [ ] CI log-scan passes on the full suite and demonstrably fails when a test plant logs an amount (canary test).

#### 26. GDPR export and erasure flows

Serves: MLO-9

What prompt would you run to complete this task?
"Implement `GdprService` and endpoints `POST /users/me/export` and `POST /users/me/erasure` (user role, re-authentication required): export gathers all rows for the user (profile, transactions, goals, scenarios, snapshots, audit events about them) into a JSON archive with a manifest of counts and `input_hash`es, delivered via time-limited signed URL, tracked in `gdpr_requests` (requested/fulfilled timestamps, 72 h SLA field). Erasure: set the erasure flag first (stops recalc per Task 16), cancel pending outbox events, delete user-owned rows in FK-safe order, re-key the user's audit rows to an irreversible pseudonym (HMAC of userId with a compliance-held key), disable login, write the final audit event, mark the request fulfilled."

What file do you want to CREATE or UPDATE?
`src/modules/users/gdpr.service.ts`, `src/modules/users/gdpr.controller.ts`, `prisma/schema.prisma` (add `GdprRequest`, additive)

What function do you want to CREATE or UPDATE?
`GdprService.exportUserData`, `GdprService.eraseUser`, `GdprService.pseudonymizeAuditTrail`

What are details you want to add to drive the code changes?
- Mid-recalculation handling per edge cases #16/#17: export waits for per-user queue quiescence (≤ 5 s) or snapshots consistent state; erasure flag discards in-flight results before the snapshot write.
- Export archive must be internally consistent: manifest hash-checks each section.
- Pseudonymization is one-way; the compliance key is not available to the application role at runtime after erasure completes.

Acceptance criteria:
- [ ] Export e2e: archive row counts equal DB row counts per table for a seeded persona; manifest hashes verify.
- [ ] Erasure e2e: post-erasure full-DB scan finds zero rows containing the user's PII; audit rows remain, pseudonymized; login is disabled.
- [ ] Erasure requested while a recalc job is in flight results in no post-erasure snapshot (race test).
- [ ] `gdpr_requests` rows capture request→fulfilment timestamps for SLA evidence.

---

### MLO-10 — Ops/compliance internal view (cross-cutting, MVP)

#### 27. Role guards and break-glass access flow

Serves: MLO-10

What prompt would you run to complete this task?
"Implement the roles guard for `user|support|ops|compliance` and the break-glass flow: `POST /ops/break-glass` (justification required, ticket ref required for support role) creates a `break_glass_grants` row (grantee, targetUserId, scope, expiresAt = now + 60 min, justification); a `BreakGlassGuard` on record-level internal endpoints admits internal roles only with an unexpired matching grant, else `403 BREAK_GLASS_REQUIRED`; every read performed under a grant writes an `audit_events` row (`action: 'BREAK_GLASS_READ'`, justification copied); denied attempts are audited as `ACCESS_DENIED`. Compliance role can list and review all grants."

What file do you want to CREATE or UPDATE?
`src/common/auth/roles.guard.ts`, `src/modules/ops/break-glass.service.ts`, `src/modules/ops/break-glass.guard.ts`, `prisma/schema.prisma` (add `BreakGlassGrant`, additive)

What function do you want to CREATE or UPDATE?
`RolesGuard.canActivate`, `BreakGlassService.requestGrant`, `BreakGlassGuard.canActivate`

What are details you want to add to drive the code changes?
- Grants are scoped to exactly one target user and non-renewable — a new request (new justification) is required after expiry.
- The authorization matrix (every role × every endpoint) lives as a test fixture so drift is caught automatically.
- `user` role can never hold a grant; internal roles can never access record-level financial endpoints without one.

Acceptance criteria:
- [ ] Authorization-matrix integration test covers every registered route × all four roles with expected allow/deny.
- [ ] Support access without a grant returns `403 BREAK_GLASS_REQUIRED` and writes an `ACCESS_DENIED` audit row (edge case #15).
- [ ] Reads under a grant each produce a `BREAK_GLASS_READ` audit row; access at expiry+1 s is denied.
- [ ] Compliance can list grants; support cannot list others' grants.

#### 28. Ops aggregated dashboards and queue administration

Serves: MLO-10

What prompt would you run to complete this task?
"Implement the ops module read endpoints (roles `ops`, `compliance`): `GET /ops/health` (recalc queue depth, DLQ size, oldest unpublished outbox age, snapshot lag p50/p95, worker throughput, AISP ingestion failure counts, dedup counters) and `GET /ops/slo` (rolling read-latency percentiles, time-to-consistency distribution vs. the 5 s budget) — all metrics aggregated across users with counts and percentiles only, never record-level financial values (response DTOs make monetary fields unrepresentable). Add `POST /ops/dlq/replay` (ops only) replaying dead-lettered recalc jobs, audited per replayed job, idempotent via the snapshot input-hash guarantee."

What file do you want to CREATE or UPDATE?
`src/modules/ops/ops.controller.ts`, `src/modules/ops/ops-metrics.service.ts`, `src/modules/ops/dlq-admin.service.ts`

What function do you want to CREATE or UPDATE?
`OpsMetricsService.getHealth/getSlo`, `DlqAdminService.replay`

What are details you want to add to drive the code changes?
- DTO schema assertion test: no field of the ops responses can carry a monetary amount or a single user's financial figure.
- DLQ replay is safe by construction (idempotent snapshot writes) and each replay is audited with the operator's identity.
- These endpoints power the §4.4 degradation decisions during incidents.

Acceptance criteria:
- [ ] Ops endpoints deny `user` and `support` roles (matrix test) and return only aggregates (schema assertion test).
- [ ] DLQ replay of a poisoned-then-fixed job produces exactly one snapshot and one audit row per replay.
- [ ] Health endpoint reflects induced queue backlog in a test (enqueue 100 jobs with worker paused ⇒ depth and lag rise).

---

## 11. Traceability Matrix

| MLO | Scope | Low-level tasks | Verification method (see §8) |
|---|---|---|---|
| MLO-1 Financial profile management | MVP, deep | 1, 2, 3, 4 | CRUD/validation integration tests; reconciliation gate; optimistic-locking tests; ingestion idempotency tests |
| MLO-2 Goal management | MVP, deep | 5, 6, 7, 8 | Lifecycle + state-machine tests; validation error-code tests; allocation property tests; golden progress checks |
| MLO-3 Deterministic forecast engine | MVP, deep | 9, 10, 11, 12, 13, 14 | Property-based tests (determinism, conservation, monotonicity); golden persona fixtures; rounding unit tests; snapshot idempotency + perf benchmark |
| MLO-4 Continuous recalculation pipeline | MVP, deep | 15, 16, 17 | E2e 5 s consistency test; worker chaos/kill test; coalescing test; staleness-flag test; throughput load test |
| MLO-5 Scenario simulator | MVP, deep | 18, 19, 20 | No-mutation assertions; five canonical golden scenarios; p95 ≤ 1 s load test; rate-limit test |
| MLO-6 Opportunity cost analysis | Phase 2 | 21 | Golden purchase-delta fixtures; contract test over scenario comparison; feature-flag check |
| MLO-7 AI financial coach | Phase 2 | 22 | Prompt-redaction contract tests; LLM-outage degradation e2e; hallucinated-number rejection test |
| MLO-8 Timeline view | Phase 2 | 23 | Snapshot-derivation equality tests; FI-crossing golden value; empty-state test |
| MLO-9 Security, audit & GDPR | MVP, cross-cutting | 24, 25, 26 | DB-level append-only test; audit-completeness test; CI log-scan gate; GDPR export/erasure e2e; manual compliance review checkpoint |
| MLO-10 Ops/compliance internal view | MVP, cross-cutting | 27, 28 | Authorization-matrix tests; break-glass e2e incl. denial auditing; aggregate-only schema assertions; DLQ replay test |

---

*End of specification. Companion documents in this package: `agents.md` (agent behavior rules), editor/AI rules, and `README.md` (rationale and industry-practice mapping).*
