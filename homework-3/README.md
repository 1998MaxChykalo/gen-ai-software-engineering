# Homework 3 — Specification-Driven Design

## Student & task summary

**Author:** Maksym Chykalo

This homework delivers a **specification package** (documents only, no code) for **Horizon — a Financial Goal Forecasting App**: a future-oriented personal finance application that continuously forecasts a user's financial future — goal completion dates, monthly cash flow, net-worth trajectory — and recommends the fastest path to their goals. Unlike traditional budgeting apps that explain where money *went*, Horizon explains where finances are *heading*, like a GPS that recalculates the route every time the financial situation changes.

The package contains:

| File | Deliverable |
|------|-------------|
| [`specification.md`](specification.md) | Layered specification: high-level objective → 10 mid-level objectives → non-functional & policy requirements → implementation notes → beginning/ending context → 18-row edge-case table → per-objective verification strategy → performance budgets → **28 low-level tasks** with acceptance criteria → traceability matrix |
| [`agents.md`](agents.md) | AI-agent guidelines: stack assumptions, FinTech domain rules, code style, testing/verification expectations, security & compliance constraints, explicit edge-case rules, definition of done |
| [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Editor/AI rules for Claude Code: terse operational subset of `agents.md` — hard never-do list, conventions, per-change testing requirements |
| `README.md` (this file) | Rationale and industry best-practices mapping |

**Assumed stack** (spec is document-only; the stack anchors implementation notes and agent rules): TypeScript 5.x strict / Node.js 20 LTS / NestJS 10 / PostgreSQL 16 / Prisma / decimal.js / Jest + Supertest / BullMQ + Redis.

**Scoping decision:** full product covered, MVP-depth core. The financial profile, goal management, deterministic forecast engine, continuous recalculation pipeline, and scenario simulator (MLO-1…MLO-5) are decomposed into deep, acceptance-criteria-level tasks. Opportunity cost analysis, the AI financial coach, and the timeline view (MLO-6…MLO-8) are specified at objective level and explicitly marked **phase 2** — they all consume the same forecast snapshots, so their depth adds little design risk while the engine is the part where correctness can fail silently. Security/audit/GDPR and the ops/compliance view (MLO-9, MLO-10) are cross-cutting and specified for MVP.

---

## Rationale

### Why the specification is layered this way

- **The forecast engine gets the deepest decomposition** (6 tasks in `specification.md` §10, MLO-3) because it is the product's highest-risk component: a subtly wrong compounding step or rounding rule produces *plausible but wrong* numbers that users act on. Every engine task is a **pure function with an explicit evaluation-date input**, so each is independently testable and the whole run is reproducible from an input hash (spec §5.3).
- **"Unreachable goal" is modelled as a valid domain state, not an error** (spec §7 row 1, agents.md §7). A user whose expenses exceed income is a normal customer, not an exception path; the spec forces the honest answer ("this goal cannot complete under current inputs") instead of a 500.
- **Traceability is explicit end-to-end**: every low-level task carries a `Serves: MLO-x` line and 3–5 checkable acceptance criteria, and §11 closes the loop with an MLO → tasks → verification matrix, so an implementer (human or AI agent) can execute without guessing and a reviewer can verify coverage without reading prose.
- **Context is concrete even though hypothetical**: §6 pins an exact module tree (`src/modules/{auth,users,profile,goals,forecast,scenarios,insights,timeline,audit,ops}`) and a named list of database tables, so parallel AI agents working on different tasks converge on the same structure instead of inventing conflicting ones.

### How performance targets were chosen (spec §4.5 and §9 — all labelled *assumed targets*)

- **Read APIs p95 ≤ 200 ms / recompute p95 ≤ 500 ms** — the product promise is "GPS for finances"; a recalculation that feels instant (< 1 s end-to-end including transport) is what makes the continuous-forecast differentiator credible. 200 ms p95 for reads is a common interactive-dashboard budget in consumer FinTech.
- **Scenario simulation p95 ≤ 1 s (synchronous)** — a what-if answer is a conversational interaction; beyond ~1 s users need progress indication, which would push the design to async jobs and complicate the MVP for no user benefit.
- **Time-to-consistency ≤ 5 s after transaction ingestion** — open-banking (AISP) data already arrives with minutes of upstream latency, so sub-second freshness buys nothing; 5 s keeps the pipeline simple (outbox → queue → worker) while still feeling "live". The spec pairs this with a **staleness indicator** edge case (§7) so the UI never silently serves an outdated forecast.
- **Rate limits 60 req/min per user, 10 req/min on simulation** — simulation runs a full 720-month projection per call, an order of magnitude more compute than a read, so it gets its own budget to protect the recalc workers.
- Every number in §9 carries a one-sentence justification in the table itself, per the assignment's "not vague 'should be fast'" requirement.

### How verification depth was chosen (spec §8)

Verification effort follows risk, not uniformity:

- **Engine (MLO-3):** unit tests **plus property-based invariants** (net-worth continuity month-to-month, determinism, horizon bound) **plus four golden-file persona fixtures** (*broke-student, median-family, fire-aspirant, retiree*) with expected goal dates. Golden files catch regressions that unit tests miss — any diff must be justified in review (agents.md §5).
- **Pipeline (MLO-4):** integration tests for the outbox → queue → snapshot path, including worker-crash-mid-run and duplicate-delivery cases, because idempotency claims are worthless untested.
- **Compliance (MLO-9, MLO-10):** manual review checkpoints and audit-trail reconciliation, since GDPR-rights flows and break-glass access cannot be fully verified by automated tests alone.
- **Reconciliation checks** assert that snapshot aggregates equal input-ledger totals — a FinTech habit borrowed from ledger systems: never trust a derived number that can't be re-derived.

---

## Industry best practices — what was added and where

| Practice | Why it matters here | Where it appears |
|----------|--------------------|------------------|
| **Integer minor-unit money + decimal arithmetic, banker's rounding** | Floats silently corrupt financial math; ROUND_HALF_EVEN avoids systematic drift over 720-month projections | `specification.md` §5.2; `agents.md` §3.1; `.claude/CLAUDE.md` "Hard rules" |
| **Deterministic, pure calculation core with immutable, input-hashed snapshots** | Reproducibility = auditability: any historical forecast can be re-derived and disputed | `specification.md` §5.3, MLO-3 tasks; `agents.md` §3.2 |
| **Transactional outbox + idempotent consumers** | No lost or double-applied recalculations when the worker or broker fails | `specification.md` §5.4, MLO-4 tasks; edge-case rows 11–12 in §7 |
| **Idempotency keys on all mutating endpoints** | Safe client retries — a FinTech API baseline (Stripe-style) | `specification.md` §5.5; `agents.md` §7 |
| **RFC 7807 problem+json with stable domain error codes** | Machine-readable errors; expected business outcomes are typed results, never 500s | `specification.md` §5.5; `agents.md` §7; `.claude/CLAUDE.md` "Errors & results" |
| **Append-only audit trail; logs carry entity IDs only, never financial values** | Regulated-environment evidence without turning logs into a PII liability | `specification.md` §4.3, §5.7, MLO-9 tasks; `agents.md` §6 |
| **GDPR data-subject rights as first-class flows** (export, erasure, retention) | EU consumer product; erasure interacting with an in-flight recalculation is an explicit edge case, not an afterthought | `specification.md` §4.2 and §7 (row: export/erasure mid-recalculation) |
| **RBAC with pseudonymized ops views and audited break-glass access** | Least-privilege for internal staff; record-level access requires recorded justification | `specification.md` §2, MLO-10 tasks; `agents.md` §6 |
| **"Projection, not advice" disclaimer + assumption transparency** | Consumer-protection posture: every forecast exposes the inflation/return assumptions used and is never presented as regulated financial advice | `agents.md` §3.3–3.4; `specification.md` MLO-7 |
| **Explicit non-goal: no PAN/card data (PCI DSS out of scope), stated anyway as a defensive rule** | Scope clarity for auditors; defense-in-depth if integrations change | `specification.md` §1; `agents.md` §3.6 |
| **Golden-file persona fixtures + property-based testing** | Financial-correctness regressions surface as reviewable diffs; invariants cover the input space unit tests can't enumerate | `specification.md` §8; `agents.md` §5 |
| **Additive-only migrations with expand/contract for destructive changes** | Zero-downtime deploys and reversibility on financial data | `specification.md` §5.8; `agents.md` §2 |
| **SLOs as assumed targets with written rationale** | Performance is specified as measurable budgets, reviewable and testable, not "should be fast" | `specification.md` §4.5, §9 |
| **Graceful degradation of the LLM coach** | The AI insight layer may fail; forecasts must never depend on it (LLM off the critical path) | `specification.md` §7 (LLM-unavailable row); `agents.md` §7; `.claude/CLAUDE.md` "Hard rules" |
| **Goal-to-task traceability matrix** | Requirements-engineering practice: proves every objective is implemented and verified somewhere | `specification.md` §11 |

---

## AI-assisted workflow (how this package was produced)

The package was produced with **Claude Code** using a multi-agent workflow:

1. **Analysis & clarification** — Claude read `TASKS.md` and `specification-TEMPLATE-example.md`, then asked three scoping questions (tech stack, spec depth strategy, editor-rules format) before writing anything.
2. **Shared design brief** — before parallelizing, a fixed set of conventions was authored (money representation, ID/date formats, error codes, module layout, MLO numbering, performance targets) so independently produced documents could not drift apart.
3. **Parallel agents** — one background agent wrote `specification.md`, a second wrote `agents.md` + `.claude/CLAUDE.md`, both constrained by the same brief.
4. **Consistency review** — a cross-file check after both agents finished caught one real divergence (an invented error code `HORIZON_EXCEEDS_MAX` vs. the spec's `FORECAST_HORIZON_EXCEEDED`), which was fixed in the rules files. This README was then written by hand against the final section numbering.

What was verified manually: section structure against the assignment's minimum bar, MLO ↔ task ↔ verification traceability, and convention consistency (error codes, module layout, money rules) across all three documents.
