# agents.md — AI Agent Guidelines for the Transaction Processing Pipeline

**Project:** Homework 6 Capstone — AI-Powered Transaction Processing Pipeline
**Scope of this file:** Rules of engagement for any AI coding agent (Claude Code,
Copilot, Cursor, or similar) working in `homework-6/`.
**Companion documents:** `specification.md` (the authoritative spec), `TASKS.md`
(assignment), root `CLAUDE.md` (course/submission rules).

---

## 1. The four-agent workflow

Development of this project is split across four AI workflow agents. Each agent owns
its deliverables; an agent must not silently take over another agent's deliverable.

| Agent | Role | Owns | Powered by |
|---|---|---|---|
| **Agent 1 — Specification** | Produces/revises `specification.md` before any code exists | `specification.md`, this file | `.claude/agents/spec-writer.md` + `/write-spec` skill (`.claude/commands/write-spec.md`) |
| **Agent 2 — Code generation** | Implements the pipeline exactly as specified | `orchestrator.py`, `pipeline/*`, `frontend/*` | MCP **context7** for framework lookups; every query documented in `research-notes.md` (≥ 2) |
| **Agent 3 — Unit tests** | Test suite and quality gates | `tests/*` | `/run-pipeline` and `/validate-transactions` skills; **coverage gate hook blocks push < 80%** |
| **Agent 4 — Documentation** | README, HOWTORUN, presentation | `README.md`, `HOWTORUN.md`, `docs/` | README must include the author's name (Maksym Chykalo) |

**Protocol for any agent picking up a task:**

1. **Read `specification.md` first.** Every Low-Level Task ties to a Mid-Level
   Objective; know which objective you are serving.
2. **Spec is law.** If implementation reveals the spec is wrong or ambiguous, the fix
   is a spec change by Agent 1 (re-run `/write-spec` or edit `specification.md`),
   then code — never a silent divergence.
3. **Follow the conventions in this file verbatim.** Other artifacts (tests, skills,
   hooks, MCP server) depend on them.
4. **Ship tests with every change** (Agent 3 owns the suite, but a code change that
   breaks `pytest` is not done).
5. **Report honestly.** If a check could not be verified, say so; never declare
   success on a red run.

---

## 2. Project context (what this system is)

A **file-based transaction processing pipeline** in Node.js: raw banking transactions
from `sample-transactions.json` flow through three sequential stages —
**validator → fraud_detector → settlement** — communicating exclusively via JSON
message envelopes in `shared/{input,processing,output,results}/`. Every transaction
ends in `shared/results/` as `settled` (optionally `requires_review`) or `rejected`
with a machine-readable reason. A React dashboard behind an Express API (`frontend/`)
visualizes results; an MCP server (`mcp/`) makes them queryable.

Expected sample-data outcomes (the integration-test oracle — see `specification.md`
section 2): 5 settled (TXN002/TXN004/TXN005 flagged for review), 3 rejected
(TXN003 `FRAUD_SUSPECTED`, TXN006 `INVALID_CURRENCY`, TXN007 `INVALID_AMOUNT`).

---

## 3. Tech stack (fixed)

| Concern | Choice |
|---|---|
| Language / runtime | Node.js 20+ LTS, ES modules |
| Pipeline core | Node standard library + `decimal.js` (the only pipeline dependency) |
| Front-end | React 18 + Vite dashboard; Express API server over `shared/results/` |
| Testing | `node:test` + `c8`; coverage gate 80%, target ≥ 90% |
| MCP | context7 for docs lookups during code generation; custom MCP server in `mcp/` |

Do not add dependencies to the pipeline core beyond `decimal.js`. Framework needs
(Express, React/Vite) stay in `frontend/`; MCP dependencies stay in `mcp/`.

---

## 4. Domain rules (hard guardrails)

1. **Money is `decimal.js` `Decimal`, never a native JS `number`** — in parsing,
   arithmetic, tests, and JSON serialization (amounts travel as strings, e.g.
   `"amount": "1500.00"`, serialized via `.toFixed(2)`). Rounding happens once per
   calculation, `Decimal.ROUND_HALF_UP`, 2 decimal places.
2. **Currency codes are ISO 4217** against the explicit allowlist in the spec.
   Unknown code → `INVALID_CURRENCY` rejection, never a silent pass or conversion.
3. **PII: account numbers and names are sensitive.** No unmasked `source_account` /
   `destination_account` in logs, `summary.json`, final results, API responses, or
   MCP tool output — mask as `ACC-**01` via `common.mask_account`. `description`
   fields are never logged.
4. **Audit trail on every operation:** ISO 8601 UTC timestamp, stage name,
   transaction ID, outcome — one line, appended to `shared/results/audit.log`.
5. **Rejections are domain states, not errors.** Invalid input and suspected fraud
   produce `rejected` result files with `reason` codes; exceptions are reserved for
   infrastructure faults, which are logged as `stage_error` per record without
   aborting the run.
6. **Stages communicate only via the file protocol.** No direct function calls
   between stage modules, no shared in-memory state; envelopes are written atomically
   (temp file + `fs.renameSync`). The envelope schema in `specification.md` is fixed.
7. **Determinism for the demo.** Single process, sequential stages. Business logic
   takes timestamps from the transaction record, not the wall clock; wall-clock time
   appears only in audit lines, envelope metadata, and `settled_at`.

---

## 5. Code style

- Node.js 20+, ES modules, `camelCase` functions, `kebab-case.js` file names.
- Stage modules expose the same shape: `processTransaction(record) -> record`
  (pure decision logic, unit-testable without touching the filesystem) plus
  `run(...)` (file protocol I/O). Keep decision logic out of `run`.
- Constants (currency allowlist, watchlist, fee schedule, rule weights, thresholds)
  are exported module-level UPPER_CASE — tests import them rather than duplicating values.
- Reason/rule codes are `SCREAMING_SNAKE_CASE` strings, defined once.
- No console.log-debugging in pipeline code; use the `audit` helper.

---

## 6. Testing expectations (Agent 3)

- Unit tests per stage + at least 1 integration test of the full pipeline
  (`orchestrator.main`) — the expected-outcomes table in `specification.md` is the
  oracle.
- **Tests never touch the real `shared/`** — isolate with `fs.mkdtemp` + the
  orchestrator's `--root` flag.
- Boundary cases are mandatory: amount `0.00`/`0.01`/3-decimals, fraud thresholds
  29/30/69/70, wire-fee minimum at the 25,000.00 boundary, score cap at 100.
- Coverage: hook blocks push < 80%; aim ≥ 90% on `pipeline/` and `orchestrator.js`
  (`npm run coverage` = `c8 --check-coverage` over `node --test`).
- Every bug fix adds a regression test that fails before the fix and passes after.

---

## 7. Workflow tooling (skills, hooks, MCP)

- `/write-spec` — Agent 1 generates/updates `specification.md` from the template.
- `/run-pipeline` — clears `shared/`, runs the pipeline, summarizes results (Task 3).
- `/validate-transactions` — validator dry-run report without processing (Task 3).
- **Coverage gate hook** — runs the suite with coverage on push and blocks below 80%.
- **context7 (MCP)** — Agent 2 uses it for framework lookups; each query goes into
  `research-notes.md` (search, library ID, what was applied).
- **pipeline-status (MCP)** — custom MCP server in `mcp/` exposes
  `get_transaction_status`, `list_pipeline_results`, and resource `pipeline://summary`
  over `shared/results/`.

---

## 8. Definition of done (any task in this project)

- [ ] Scope traceable to a Low-Level Task / Mid-Level Objective in `specification.md`.
- [ ] No native-number money math; no unmasked accounts or names in any
      log/result/API output.
- [ ] Audit lines written for every record touched.
- [ ] `npm test` green; coverage not below the gate; new logic covered by new tests.
- [ ] `node orchestrator.js` still completes with all 8 sample transactions in
      `shared/results/` with the expected statuses.
- [ ] Docs updated if behavior changed (`README.md` keeps the author's name:
      **Maksym Chykalo**).
- [ ] Summary states what was built and any ambiguity resolved (conservatively).
