# CLAUDE.md — Horizon project rules

## What this repo is

Horizon is a financial goal forecasting app: it continuously projects a user's financial future (goal completion dates, cash flow, net-worth trajectory), simulates what-if scenarios, computes opportunity cost of purchases, and surfaces AI-coach insights. EU/GDPR context, EUR-only MVP, open-banking (AISP) read-only ingestion — Horizon is **not** a payment processor and never touches card data. The source of truth for requirements is `specification.md`; the full agent guardrails live in `agents.md`. Read both before implementing anything; this file is the terse operational subset.

## Hard rules (never do)

- Never use native JS floats (`number` arithmetic) for money — anywhere: storage, DTOs, engine, tests. Money is BIGINT euro cents; projection math is `decimal.js` with `ROUND_HALF_EVEN`.
- Never log monetary amounts, income figures, balances, transaction descriptions, or other financial PII. Logs carry entity IDs only.
- Never log request/response bodies of financial endpoints.
- Never handle, store, or log PAN/card data. If it appears in upstream data, redact at the ingestion boundary and alert.
- Never mutate or delete a `forecast_snapshot`. Snapshots are immutable and versioned; corrections are new snapshots.
- Never ship a mutating endpoint without `Idempotency-Key` support (retried key returns the original response) and an `audit_events` write.
- Never use `any` — explicit, implicit, or `as any`. Use `unknown` + narrowing or generics.
- Never write destructive migrations. Additive-only; destructive changes need a two-step expand/contract plan approved by a human.
- Never present forecast or insight output as financial advice, a recommendation, or a guarantee. Every forecast-bearing surface carries the projection disclaimer; insight copy uses "if these assumptions hold…" language, never "you should".
- Never put I/O, `Date.now()`, `Math.random()`, or config reads inside the forecast engine. Evaluation date is an input.
- Never hardcode secrets or put credentials in fixtures. Secret manager / env only.
- Never place an LLM call on the forecast critical path — forecasts must still work when insights are down.

## Conventions

**Stack**

- TypeScript 5.x `strict`, Node.js 20 LTS, NestJS 10.
- PostgreSQL 16 + Prisma; `decimal.js` for projection math.
- Jest + Supertest; `fast-check` for property tests; class-validator DTOs.
- OpenAPI via `@nestjs/swagger` on every endpoint.
- BullMQ + Redis for the recalculation queue; transactional outbox; idempotent consumers.

**Layout & dependencies**

- Modules: `src/modules/{auth,users,profile,goals,forecast,scenarios,insights,timeline,audit,ops}`.
- Forecast engine: `src/modules/forecast/engine/` — deterministic pure functions; depends on **nothing** (only `decimal.js`). Modules may import the engine; the engine imports nothing outside its folder.
- Controllers thin (transport + validation); business logic in services; no deep imports across modules.

**Naming**

- Files `kebab-case.ts`; classes `PascalCase` with role suffix (`GoalsService`, `CreateGoalDto`).
- DB `snake_case`; monetary columns suffixed `_minor` (e.g. `target_amount_minor`).
- Enums and domain codes `SCREAMING_SNAKE_CASE`.

**Money & dates**

- BIGINT minor units + ISO 4217 currency column; EUR-only MVP; currency mismatch is a domain error, never a conversion.
- Round once per projection step, `ROUND_HALF_EVEN`; percentages as `Decimal`, never floats.
- IDs: UUIDv7. Dates: ISO 8601, stored UTC. Projections at month granularity; max horizon 720 months (`FORECAST_HORIZON_EXCEEDED` beyond).

**Errors & results**

- RFC 7807 `problem+json` with domain codes (`GOAL_TARGET_IN_PAST`, `NEGATIVE_CASH_FLOW_UNREACHABLE`, …), mapped by a global filter.
- Expected business outcomes are **typed results**, not exceptions — an unreachable goal is a valid domain state, never a 500.
- DTO validation on every inbound payload; monetary fields `@IsInt()` minor units; no raw `req.body`.

**Access & transparency**

- Roles: `user`, `support`, `ops`, `compliance`. Users see only their own data; ops/compliance get aggregated/pseudonymized views; record-level access only via audited break-glass with justification.
- Every forecast response and snapshot exposes its assumptions (inflation, return, income growth) and a machine-readable `disclaimer` field.
- Defaults are conservative — understate progress, don't overstate; surface uncertainty bands, don't collapse them.

## Testing (every change)

- Every feature ships with tests; every bug fix adds a regression test that fails before the fix and passes after. No tests → not done.
- Engine changes: unit tests + property-based invariants (`fast-check`) — determinism (same input → deep-equal snapshot and equal input hash), month-to-month net-worth continuity, horizon ≤ 720 points, exact minor-unit outputs — plus golden-file persona fixtures. Golden diffs must be justified in the PR.
- Endpoint changes: Supertest integration tests covering DTO validation, RFC 7807 shapes/codes, idempotency replay, and RBAC boundaries.
- Queue changes: prove consumer idempotency — same message twice, exactly one effect.
- Keep performance budget tests green; never delete or loosen a budget to make a change pass — escalate instead.
- Coverage floor: ~100% branches on engine/money paths; ≥ 85% lines overall.

## Definition of done (quick check)

Before declaring a task complete, verify:

- Scope matches the task in `specification.md` and traces to its mid-level objective; no drive-by changes.
- Tests exist and pass per the section above; lint and `strict` typecheck clean.
- Mutations: idempotency + audit event covered by tests.
- Diff contains no logged amounts/PII, no floats for money, no `any`, no snapshot mutation, no destructive migration.
- New forecast/insight surfaces carry the disclaimer; OpenAPI and domain-code docs updated.

Full checklist lives in `agents.md` section 8.

## When unsure

- **Ask, don't guess** — especially on money semantics (rounding direction, partial-month proration, sign conventions, fee treatment) and anything compliance-adjacent (new personal-data fields, log content, retention, role access).
- If a task seems to require breaking a hard rule above, stop and ask a human before writing code.
- Resolve other ambiguity conservatively and state the interpretation you chose in your summary.
