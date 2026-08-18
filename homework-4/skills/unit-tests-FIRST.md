# Skill: Unit Tests — FIRST Principles

**Used by:** Unit Test Generator (`agents/unit-test-generator.agent.md`)
**Purpose:** Every generated test must satisfy **FIRST**. This skill defines what each
letter means concretely *in this repository* (Node.js built-in `node:test` runner, zero
dependencies) and how compliance is recorded in `test-report.md`.

## The FIRST principles

### F — Fast
- A unit test must not do real network calls, real timers, or disk I/O.
- Target: the whole suite finishes in **< 2 seconds** (`node --test tests/`).
- HTTP handlers are tested through `server` with an ephemeral port (`listen(0)`) or by
  testing the pure functions directly — never against a manually started dev server.

### I — Independent
- No test may depend on another test's side effects or execution order.
- Shared mutable state (the in-memory store) must be reset in `beforeEach`
  (`store.reset()` exists for this).
- Each test builds its own fixtures inline; no shared mutable fixture objects.

### R — Repeatable
- Same result on any machine, any timezone, any time of day.
- Never use `Date.now()` / `new Date()` without arguments in assertions; use fixed ISO
  timestamps with an explicit time and `Z` offset (e.g. `2026-03-15T12:00:00Z`).
- No dependence on environment variables unless the test sets them itself (and restores
  them afterwards).

### S — Self-validating
- Every test ends in explicit `assert` calls — a test that only "runs code" is not a test.
- Assert on exact values (`assert.equal`, `assert.deepEqual`), not just truthiness,
  wherever the expected value is known.
- No manual inspection required to know if the test passed.

### T — Timely
- Tests are written for the **code that just changed** (the diff in `fix-summary.md`), in
  the same pipeline run — not deferred.
- Every fixed bug gets at least one **regression test** that would fail on the pre-fix code.
- Do not generate tests for unchanged code (out of scope for this agent).

## Compliance recording

`test-report.md` MUST contain a **FIRST Compliance** section: a table with one row per
principle, stating how the generated tests satisfy it, plus the measured suite duration
for **F**.

## Repository conventions

- Framework: `node:test` + `node:assert/strict` (no new dependencies allowed).
- Location: `tests/` — generated files named `tests/<area>.generated.test.js`.
- Run command: `npm test`.
