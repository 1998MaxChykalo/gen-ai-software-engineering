# agents.md — AI Agent Guidelines for Horizon

**Project:** Horizon — Financial Goal Forecasting App
**Scope of this file:** Rules of engagement for any AI coding agent (Claude Code, Copilot, Cursor, or similar) working in the Horizon repository.
**Companion documents:** `specification.md` (the product/feature spec), `.claude/CLAUDE.md` (terse editor-rules subset of this file).

---

## 1. Purpose & How to Use This File

This document tells an AI agent how to behave in the Horizon codebase. It encodes the domain rules, conventions, and guardrails that the specification depends on. Guardrails here are not style preferences — the spec, the data model, and the test fixtures all assume them.

**Protocol for any agent picking up a task:**

1. **Read `specification.md` first.** Every low-level task in the spec ties to a mid-level objective; understand which objective you are serving before writing code.
2. **Follow the conventions in this file verbatim.** Do not "improve" a convention unilaterally — other artifacts depend on it.
3. **Ask before violating a guardrail.** If a task appears to require breaking a rule in sections 3, 6, or 7 (e.g., logging a monetary value to debug something), stop and ask a human. Never silently deviate, and never rationalize a one-off exception.
4. **Prefer the narrower interpretation.** When a requirement is ambiguous, implement the conservative reading and flag the ambiguity in your summary — especially anything touching money semantics, user data, or compliance.
5. **Ship tests with every change.** See section 5. A change without tests is not done.
6. **Report honestly.** If part of a task could not be completed or a check could not be verified, say so explicitly; do not declare success.

---

## 2. Tech Stack Assumptions

| Concern | Choice |
|---|---|
| Language | TypeScript 5.x, `strict: true` — no exceptions, no `// @ts-ignore` without a linked issue |
| Runtime | Node.js 20 LTS |
| Framework | NestJS 10 |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Decimal math | `decimal.js` for all projection arithmetic |
| Testing | Jest + Supertest; `fast-check` for property-based tests |
| Validation | `class-validator` DTOs on every inbound payload |
| API docs | OpenAPI via `@nestjs/swagger` decorators |
| Async jobs | BullMQ + Redis (forecast recalculation queue) |

**Module layout (fixed):**

```
src/modules/
  auth/        users/       profile/     goals/       forecast/
  scenarios/   insights/    timeline/    audit/       ops/
```

The forecast engine lives in `src/modules/forecast/engine/` — see 3.2 and 4 for its special rules.

**Data conventions (fixed, spec-wide):**

- **Money:** `BIGINT` minor units (euro cents) + ISO 4217 currency column.
  - EUR-only for the MVP, but the currency column exists from day one.
  - All projection arithmetic in `decimal.js` with banker's rounding (`ROUND_HALF_EVEN`).
  - **Native JS floats for money are forbidden** — in storage, computation, DTOs, and tests.
- **IDs:** UUIDv7 everywhere.
- **Dates:** ISO 8601, stored UTC.
  - Projections are computed at **month granularity**.
  - Maximum forecast horizon is **720 months**; longer horizons are rejected with a domain error.
- **Errors:** RFC 7807 `application/problem+json` with domain codes, e.g. `GOAL_TARGET_IN_PAST`, `NEGATIVE_CASH_FLOW_UNREACHABLE`, `FORECAST_HORIZON_EXCEEDED`.
- **Migrations:** additive-only. Destructive changes (drop/rename column, type narrowing) require a two-step expand/contract plan reviewed by a human.

---

## 3. Domain Rules (Personal Finance / FinTech)

### 3.1 Money handling

- Every monetary value is an integer number of euro cents paired with a currency code.
- Never parse, format, or compute money with `Number` arithmetic.
- Rounding happens **once, at the end** of a projection step, using `ROUND_HALF_EVEN`. Intermediate `decimal.js` values keep full precision.
- Percentages (interest, inflation, expected return) are stored and computed as decimal strings / `Decimal` instances, never floats.
- Currency mismatch is a domain error, not a silent conversion. The MVP has no FX; do not add any.

### 3.2 Determinism of forecasts

- The forecast engine (`src/modules/forecast/engine/`) is a set of **deterministic pure functions**: same inputs → same outputs, byte-for-byte.
- The engine performs **no I/O** and never calls `Date.now()`, `Math.random()`, or reads env/config. The evaluation date is an explicit input parameter.
- Every forecast run is persisted as an **immutable, versioned `forecast_snapshot`** with a hash of its inputs.
- Snapshots are never updated or deleted — a correction or re-run creates a new snapshot. Reproducibility is a compliance feature, not a nicety.

### 3.3 Forecast is a projection, not advice

- Horizon is **not** a regulated financial adviser. No output — API response, UI copy, insight text, notification — may present a forecast as a recommendation, guarantee, or regulated financial advice.
- **Mandatory disclaimer rule:** every surface that shows forecast or insight output must carry the projection disclaimer (exact copy lives in the spec).
- Any endpoint returning forecast data includes a machine-readable `disclaimer` field.
- An agent adding a new forecast-consuming surface must wire the disclaimer in; omitting it is a spec violation.
- Insight/coach text must use projection language ("if these assumptions hold, the goal completes around…") and must never say "you should invest/buy/sell".

### 3.4 Assumption transparency

- Every forecast exposes the assumptions it used: inflation rate, expected return, income growth, contribution schedule.
- Assumptions are part of the persisted snapshot **and** part of the API response — a user (and an auditor) can always answer "what did this projection assume?"
- Assumptions have documented, conservative defaults; user overrides are validated within documented bounds.

### 3.5 Conservative defaults

- When a default must be chosen (assumed return, inflation, rounding of user-facing summaries), choose the value that **understates** progress rather than overstates it. A forecast that surprises users positively is fine; one that overpromised a goal date is a trust failure.
- Uncertainty is surfaced, not hidden: where the spec calls for ranges/bands, do not collapse them to a single optimistic number.

### 3.6 Not a payment processor

- Horizon ingests transaction data via open-banking (AISP) APIs, read-only. It **never** initiates payments and never touches card data.
- PCI DSS is out of scope by design — but as a defensive default the rule stands anyway: **never handle, store, or log PAN/card data.**
- If upstream data unexpectedly contains card numbers, redact at the ingestion boundary and raise an alert.

---

## 4. Code Style & Structure Conventions

**Module structure:**

- One folder per module under `src/modules/`, each with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and (where relevant) Prisma-facing repositories.
- Controllers stay thin — transport and validation only. Business logic lives in services. Forecast math lives in the engine.
- Cross-module access goes through exported module services, never deep imports into another module's internals.

**Dependency direction (hard rule):**

- The forecast engine depends on **nothing** — not NestJS, not Prisma, not other modules, not config. Its only allowed external import is `decimal.js`.
- Modules may depend on the engine; the engine may not import from anywhere outside its own folder.

**Validation & types:**

- Every inbound payload is a `class-validator` DTO with explicit decorators; whitelist/forbid-unknown-properties is on globally. No raw `req.body` access.
- Monetary DTO fields are integer minor units (`@IsInt()`), never floats.
- **No `any`.** No implicit `any`, no explicit `any`, no `as any`. Use `unknown` + narrowing, or proper generics. Same rule in tests.

**Naming:**

- Files: `kebab-case.ts`.
- Classes: `PascalCase` with role suffixes — `GoalsService`, `CreateGoalDto`, `ForecastSnapshotRepository`.
- DB tables/columns: `snake_case`; monetary columns suffixed `_minor` (e.g. `target_amount_minor`).
- Enums and domain error codes: `SCREAMING_SNAKE_CASE`.

**Errors & results:**

- Business outcomes that are valid domain states (see section 7) are returned as **typed results** (discriminated unions), not thrown. Exceptions are for programmer errors and infrastructure failures.
- Services return domain results or throw domain exceptions; a global filter maps them to RFC 7807 responses. No hand-rolled `{ error: string }` shapes.

**API documentation:**

- Every endpoint carries `@nestjs/swagger` decorators, including error responses with their domain codes.

---

## 5. Testing & Verification Expectations

**Policy: every feature ships with tests; every bug fix ships with a regression test that fails before the fix and passes after.** Non-negotiable.

Test categories:

1. **Unit tests** — services, guards, mappers; engine functions tested as pure functions with explicit inputs (including evaluation date).
2. **Property-based tests (engine invariants)** — using `fast-check`:
   - **Continuity:** net-worth trajectory is continuous month-to-month — each month's value equals the previous month plus that month's modeled flows; no gaps, no jumps unexplained by inputs.
   - **Determinism:** same input object twice → deep-equal snapshots and equal input hashes.
   - **Monotonicity:** with non-negative net contributions and non-negative return, goal progress never decreases.
   - **Horizon bound:** the engine never emits more than 720 monthly points; horizon > 720 is rejected before the engine runs.
   - **Exactness:** engine outputs serialize to integer minor units exactly — no float residue.
3. **Golden-file persona fixtures** — canonical personas (e.g., steady saver, negative cash flow, irregular income, near-retirement) with committed expected snapshot outputs. Any engine change that alters a golden file must justify the diff in the PR; unexplained golden diffs block merge.
4. **Integration tests** — Supertest over HTTP: DTO validation, RFC 7807 error shapes and domain codes, idempotency-key replay behavior, RBAC boundaries per role.
5. **Queue/consumer tests** — outbox relay and BullMQ consumers are idempotent: delivering the same message twice produces exactly one effect.
6. **Performance budget tests** — the spec defines latency/throughput budgets (e.g., single-goal forecast compute time, recalculation queue throughput) as assumed targets. Budgets are encoded as tests; a change that blows a budget fails CI rather than silently regressing. Never delete or loosen a budget to make a change pass — escalate instead.

**Coverage expectations:**

- Engine and money-handling code paths: ~100% branch coverage.
- Overall project: ≥ 85% lines.
- Coverage is a floor, not the goal — invariants and golden files are the real safety net.

---

## 6. Security & Compliance Constraints

**Context: EU/GDPR. Horizon processes financial personal data — treat it with special care throughout.**

**GDPR data-subject rights:**

- Export (Art. 20) and erasure (Art. 17) flows are first-class features in the spec, not afterthoughts.
- Any new personal-data field must be registered in the data inventory and included in export/erasure handling.
- Erasure uses documented anonymization for rows that must survive for audit integrity.

**Log redaction (hard rule):**

- Application logs contain **entity IDs only** — never monetary amounts, income figures, balances, goal targets, transaction descriptions, account numbers, or other financial PII.
- Never log request/response bodies of financial endpoints.
- Never log PAN/card data (defensive rule; see 3.6).
- If you need a value to debug, log its ID and look the value up through an audited channel.

**Audit trail:**

- All state-changing operations append to the append-only `audit_events` table (actor, timestamp, entity, action, before/after diff).
- Audit rows are never updated or deleted.
- New mutating endpoints must write audit events — verify this in tests and review.

**Encryption:**

- TLS 1.2+ in transit everywhere, including service↔DB and service↔Redis.
- Encryption at rest for the database and backups.
- Open-banking consent tokens encrypted at the application layer, with keys held in the secret manager.

**Secrets:**

- Never in code, never in the repo, never in test fixtures. Environment/secret-manager only.
- An agent must never hardcode a credential "temporarily".

**RBAC:**

- Roles: `user`, `support`, `ops`, `compliance`.
- Users see only their own data.
- `ops`/`compliance` get **aggregated/pseudonymized** views by default.
- Record-level access exists only via an audited **break-glass** flow requiring a justification string, which itself lands in `audit_events`.
- Never add a route that bypasses this model.

**Data minimization:**

- Don't persist fields the spec doesn't call for; don't widen API responses "for convenience".

---

## 7. Edge-Case Rules (Explicit)

An agent must treat these as hard rules, checked on every change:

1. **Never log financial values or PII.** IDs only. This overrides debugging convenience, always.
2. **Never handle or log PAN/card data.** Redact at the boundary if it ever appears upstream.
3. **Always prefer idempotent writes.** Every mutating endpoint accepts an `Idempotency-Key` header; a retried key returns the original response (same status, same body). Queue consumers are idempotent. A new mutation without idempotency handling is incomplete.
4. **Never mutate forecast snapshots.** Snapshots are immutable and versioned. Corrections are new snapshots; there is no `UPDATE` path, and no code should acquire one.
5. **An unreachable goal is a valid domain state, not an exception.** Negative cash flow or an impossible target yields a typed result (e.g., `{ status: 'UNREACHABLE', code: 'NEGATIVE_CASH_FLOW_UNREACHABLE', ... }`) rendered honestly to the user — never a 500, never a thrown error inside the engine.
6. **Reject horizon > 720 months with a domain error** (`FORECAST_HORIZON_EXCEEDED`, RFC 7807) at validation time, before any computation.
7. **Goal target date in the past** → `GOAL_TARGET_IN_PAST` domain error at validation time.
8. **On ambiguity about money semantics, stop and ask a human.** Rounding direction, proration of partial months, sign conventions, fee treatment — never guess; an unasked question here becomes a financial correctness bug.
9. **Graceful degradation when LLM insights are down.** The insights module is an enhancement layer. If the LLM provider fails or times out, forecasts, goals, scenarios, and timeline **must still work**; the insights surface degrades to an explicit "insights temporarily unavailable" state. Never place an LLM call on the forecast critical path, and never feed LLM output back into projection math.
10. **Stale ingested data is a labeled state.** If open-banking data is older than the spec's freshness threshold, forecasts still compute but are flagged as based on stale data — degrade transparently; don't refuse, don't hide it.
11. **Concurrent recalculation is safe by construction.** Transactional outbox + idempotent consumers mean a duplicate or racing recalculation job converges to one snapshot per input hash. Don't introduce non-outbox side effects inside transaction scopes.
12. **Empty states are designed, not accidental.** A user with no linked account or no transactions gets defined behavior per the spec (onboarding prompts, empty forecast state), not errors.

---

## 8. Definition of Done

A task picked up by an agent is done only when **all** of the following hold:

- [ ] Implements exactly the task's scope from `specification.md`, traceable to its mid-level objective; no unrelated drive-by changes.
- [ ] All conventions in sections 2–4 respected: money as minor units, UUIDv7, RFC 7807, module layout, no `any`, engine purity and dependency direction.
- [ ] Tests shipped per section 5:
  - unit tests for new logic;
  - engine changes add/adjust property tests and golden fixtures, with golden diffs justified;
  - endpoint changes add integration tests covering validation, error codes, idempotency, and RBAC.
- [ ] Mutating endpoints: `Idempotency-Key` support and `audit_events` writes verified by tests.
- [ ] No forbidden log content introduced — grep the diff for logging of amounts or PII.
- [ ] Migrations additive-only; any destructive need documented as an expand/contract plan and escalated to a human.
- [ ] OpenAPI annotations updated; any new domain error codes documented.
- [ ] Disclaimer wiring present on any new forecast- or insight-bearing surface.
- [ ] Lint, typecheck (`strict`), full test suite, and performance budget tests pass.
- [ ] Summary states what was built, which guardrails were touched, and any ambiguity that was resolved conservatively (with the interpretation chosen).

If any box cannot be checked, the task is not done — say so explicitly rather than declaring success.
