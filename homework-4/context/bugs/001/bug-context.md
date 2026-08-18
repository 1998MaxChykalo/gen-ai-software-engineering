# Bug Batch 001 — Context

Incoming bug reports and a security concern for **Tiny Expense Tracker** (`homework-4/src/`).
This file is the *input* to the pipeline: it describes symptoms only (as a user/QA would),
not root causes. The Bug Researcher locates the causes in code.

## Bug Report #1 — Monthly summary total is too low

> **Reporter:** QA
> **Severity:** High
> **Symptom:** `GET /summary` consistently reports a total that is lower than the sum of
> the expenses returned by `GET /expenses`. Example: after adding expenses of 10.50, 20.00
> and 4.25, the summary total is **24.25** instead of **34.75**. With a single expense the
> total is always **0**.
> **Repro:** `npm start`, POST three expenses, `curl localhost:3000/summary`.

## Bug Report #2 — Month filter returns the wrong month

> **Reporter:** QA
> **Severity:** High
> **Symptom:** `GET /summary?month=2026-03` returns expenses dated **April 2026**, not
> March. Filtering for December (`month=2026-12`) always returns an empty result even when
> December expenses exist.
> **Repro:** POST expenses dated `2026-03-15` and `2026-04-10`, then
> `curl 'localhost:3000/summary?month=2026-03'` — the April expense is counted.

## Security Concern #1 — Admin reset endpoint

> **Reporter:** Security review (internal)
> **Severity:** Critical
> **Symptom:** The `POST /admin/reset` endpoint wipes all data. The credential protecting
> it is suspected to be **hardcoded in the repository** and compared with a loose,
> non-constant-time comparison. Anyone with read access to the source can reset production
> data.

## Failing baseline tests (evidence)

`npm test` before any fix: **7 tests, 3 pass, 4 fail** — see
[`docs/test-results-before.txt`](../../../docs/test-results-before.txt).

## Expected pipeline flow for this batch

1. `research/codebase-research.md` — Bug Researcher output
2. `research/verified-research.md` — Bug Research Verifier output (uses `skills/research-quality-measurement.md`)
3. `implementation-plan.md` — Bug Planner output
4. `fix-summary.md` — Bug Fixer output
5. `security-report.md` — Security Vulnerabilities Verifier output
6. `test-report.md` — Unit Test Generator output (uses `skills/unit-tests-FIRST.md`)
