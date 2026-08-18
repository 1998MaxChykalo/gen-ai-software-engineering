# Test Report — Bug Batch 001 (Unit Test Generator)

## Scope

**Covered (changed code only, per `context/bugs/001/fix-summary.md`):**

- `src/utils.js` → `calculateTotal` (Change 1: off-by-one loop start fixed from `i = 1` to `i = 0`).
- `src/utils.js` → `filterByMonth` (Change 2: switched from local-time `getFullYear()`/`getMonth()` to `getUTCFullYear()`/`getUTCMonth() + 1`, fixing both the timezone dependency and the 0-indexed vs. 1-indexed month mismatch).
- `src/auth.js` → `isAdmin` (Change 3: removed the hardcoded `'admin123'` token; token now read from `process.env.ADMIN_TOKEN`; comparison hardened with a type check, a length check, and `crypto.timingSafeEqual` for constant-time comparison).

**Explicitly NOT covered, and why:**

- `validateExpense` (`src/utils.js`) — unchanged by this bug batch; already has baseline coverage in `tests/utils.test.js`. Out of scope per the agent's Timely rule (only code that changed in this pipeline run).
- `src/server.js`, `src/store.js` — fix-summary.md states these were verified with no defect and no changes were made; out of scope.
- `tests/utils.test.js` — existing tests are context/acceptance criteria, not a target; not modified, per instructions.
- Route-level/integration testing of `/admin/reset` (which presumably calls `isAdmin`) — out of scope; this agent tests the pure `isAdmin` function directly, not through the HTTP layer, per the Fast principle in the FIRST skill.

## Generated tests

### `tests/utils-fixes.generated.test.js` (13 tests)

| Test | Covers |
|---|---|
| `calculateTotal: regression — single-element list is not skipped (would be 0 under the pre-fix off-by-one loop)` | Regression for Change 1 — a single-element array is the sharpest reproduction of the old bug: pre-fix `for (i = 1; ...)` never executes for a 1-item array, returning `0` instead of the item's amount. |
| `calculateTotal: regression — first expense in a multi-item list contributes to the sum` | Regression for Change 1 — pre-fix code would total `10` instead of `15` for 3×5 by skipping index 0. |
| `calculateTotal: edge case — empty list returns 0` | Edge case: empty input. |
| `calculateTotal: edge case — single element list equals that element amount` | Edge case: single element. |
| `calculateTotal: rounds the sum to two decimal places` | Self-validating check on the existing `Math.round(total * 100) / 100` rounding behavior, exercised on the fixed loop. |
| `filterByMonth: regression — January (month=1) matches an item dated in January (...)` | Regression for Change 2 — pre-fix `getMonth() === month` compares `0 === 1` for January and always fails; new code (`getUTCMonth() + 1 === month`) matches. |
| `filterByMonth: regression — December (month=12) matches an item dated in December (...)` | Regression for Change 2 — pre-fix compares `11 === 12` and always fails for December; new code matches. |
| `filterByMonth: edge case — empty list returns an empty list` | Edge case: empty input. |
| `filterByMonth: edge case — single element list matching the month/year is returned` | Edge case: single element, matching. |
| `filterByMonth: edge case — single element list not matching the month/year is excluded` | Edge case: single element, non-matching. |
| `filterByMonth: excludes an item whose month matches but whose year does not` | Edge case: year mismatch with matching month. |
| `filterByMonth: UTC boundary — a timestamp late on the last day of March in UTC (2026-03-31T23:30:00Z) is counted as March, not April` | Boundary case for the UTC part of Change 2 — verifies the classification uses UTC fields (not local time), so a late-March UTC instant stays in March and is excluded from April. |

### `tests/auth.generated.test.js` (12 tests, inside `describe('isAdmin', ...)`)

| Test | Covers |
|---|---|
| `returns true for the correct token when ADMIN_TOKEN is set` | Happy path for Change 3 — env-driven comparison works. |
| `returns false for an incorrect token of the same length` | Wrong token, same length (exercises the `timingSafeEqual` branch). |
| `returns false for a token of a different (shorter) length` | Wrong length (short) — exercises the length-guard branch. |
| `returns false for a token of a different (longer) length` | Wrong length (long) — exercises the length-guard branch. |
| `returns false for a non-string token (number)` | Non-string input — exercises the `typeof token !== 'string'` guard. |
| `returns false for a non-string token (null)` | Non-string input (`null`). |
| `returns false for a non-string token (undefined)` | Non-string input (`undefined`). |
| `returns false for a non-string token (object)` | Non-string input (object). |
| `returns false for any token when ADMIN_TOKEN is unset` | Missing env var — exercises the `if (!adminToken) return false` guard. |
| `returns false for an empty-string token when ADMIN_TOKEN is unset` | Missing env var combined with empty supplied token. |
| `regression — the old hardcoded default token "admin123" no longer grants access when ADMIN_TOKEN is a different value` | Regression for Change 3 — the previously hardcoded credential `'admin123'` must no longer be a valid credential. |
| `regression — the old hardcoded default token "admin123" no longer grants access when ADMIN_TOKEN is unset` | Regression for Change 3, combined with the unset-env-var guard. |

## FIRST Compliance

| Principle | How the generated tests satisfy it |
|---|---|
| **F**ast | No network calls, timers, or disk I/O — pure function calls only. Full suite (`node --test tests/`) measured at **`duration_ms 153.299916`** internally (`real 0.46s` wall clock via `/usr/bin/time`), well under the < 2s target. |
| **I**ndependent | Each test builds its own fixtures inline (no shared mutable arrays/objects across tests). For `isAdmin`, `process.env.ADMIN_TOKEN` is saved in a `beforeEach` hook and restored in an `afterEach` hook (inside `describe('isAdmin', ...)`), and every test sets exactly the env value it needs before calling `isAdmin` — no test relies on another test's env mutation or execution order. |
| **R**epeatable | All dates use fixed ISO timestamps with explicit `Z` (UTC) offsets (e.g. `2026-03-31T23:30:00Z`) — no bare `new Date()`/`Date.now()`. `isAdmin` tests never depend on an ambient `ADMIN_TOKEN` from the environment; each test sets/unsets it itself and the original value is restored afterward, so the suite is safe to run in any environment or order. |
| **S**elf-validating | Every test ends in an explicit `assert.equal`/`assert.deepEqual` call against an exact expected value (booleans, numbers, or sorted/mapped id arrays) — no test merely executes code without asserting. |
| **T**imely | Tests were authored in this same pipeline run, targeting exactly the three changed functions listed in `fix-summary.md`. Each of the three fixed bugs has at least one test named `regression — ...` that documents, in the test name/comment, why it would fail against the pre-fix code. |

## Run results

**Command (generated tests only):**
```
node --test tests/utils-fixes.generated.test.js tests/auth.generated.test.js
```
**Result:** `# tests 13`, `# pass 13`, `# fail 0`

**Command (full suite):**
```
npm test
```
(`node --test tests/`)

**Result:** `# tests 20`, `# pass 20`, `# fail 0`, `# duration_ms 153.299916` (wall clock `real 0.46s`)

Breakdown: 13 new tests (`tests/utils-fixes.generated.test.js` + `tests/auth.generated.test.js`) + 7 pre-existing tests (`tests/utils.test.js`) = 20 total, all passing.

## Findings

None. No generated test exposed a defect in the Bug Fixer's changes to `calculateTotal`, `filterByMonth`, or `isAdmin`; all 13 new tests pass against the fixed code on the first run, and the full 20-test suite (new + pre-existing) passes with zero failures.
