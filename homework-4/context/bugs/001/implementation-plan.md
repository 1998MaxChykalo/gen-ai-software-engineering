# Implementation Plan — Bug Batch 001

Source: `context/bugs/001/research/verified-research.md` (Verification Summary: **PASS**,
Research Quality **SILVER**) and `context/bugs/001/research/codebase-research.md`.
Per the verifier's gate decision, Findings 1–3 are trustworthy and Discrepancy 3 (UTC vs.
local-time getters in `filterByMonth`) is folded into the Change 2 fix scope; Discrepancy 2
("type coercion") is downgraded to a hygiene note, not a separate defect to fix.

## Plan Summary

Three changes, applied and verified in this order so the test suite can be re-run after each
step:

1. **Change 1** — `src/utils.js`, `calculateTotal`: fix the off-by-one loop start
   (Bug Report #1 / Finding 1) so every expense, including the first, is summed.
2. **Change 2** — `src/utils.js`, `filterByMonth`: fix the 0-vs-1-indexed month comparison
   *and* switch from local-time getters to UTC getters in the same edit (Bug Report #2 /
   Finding 2, plus verifier Discrepancy 3), so the filter matches the correct calendar month
   regardless of the host machine's timezone.
3. **Change 3** — `src/auth.js`, `isAdmin`/`ADMIN_TOKEN`: remove the hardcoded admin
   credential in favor of `process.env.ADMIN_TOKEN` (deny access if unset) and replace the
   loose `==` comparison with a length-guarded, type-checked `crypto.timingSafeEqual` call
   (Security Concern #1 / Finding 3). **This change touches security-sensitive
   authentication code and must be reviewed by the Security Verifier before merge.**
   `src/server.js` calls `isAdmin(req.headers['x-admin-token'])` with the same signature and
   requires no change.

No other files (`src/server.js`, `src/store.js`, `tests/utils.test.js`) are modified by this
plan.

---

## Change 1 — `calculateTotal` off-by-one loop start

- **File:** `src/utils.js`
- **Location:** lines 3–9 (function `calculateTotal`)
- **Rationale:** The loop initializes `i = 1`, so `expenses[0]` is never added to `total`.
  This makes multi-item sums too low by the first element's amount, and makes single-item
  input always return `0` (the loop body never executes because `1 < 1` is false). Starting
  the loop at `i = 0` sums every element. Verified reproduction: `calculateTotal([{amount:42}])`
  currently returns `0`; a 3-item list `[10.50, 20.00, 4.25]` currently returns `24.25`
  instead of `34.75`.

**Before:**
```js
function calculateTotal(expenses) {
  let total = 0;
  for (let i = 1; i < expenses.length; i++) {
    total += expenses[i].amount;
  }
  return Math.round(total * 100) / 100;
}
```

**After:**
```js
function calculateTotal(expenses) {
  let total = 0;
  for (let i = 0; i < expenses.length; i++) {
    total += expenses[i].amount;
  }
  return Math.round(total * 100) / 100;
}
```

- **Test command:**
  ```
  node --test --test-name-pattern="calculateTotal" tests/
  ```
- **Expected test outcome:** All 3 `calculateTotal` tests in `tests/utils.test.js` pass:
  - `calculateTotal returns 0 for an empty list` (already passing, stays passing)
  - `calculateTotal sums every expense, including the first one` (currently failing —
    expected `34.75`, was `24.25` — now passes)
  - `calculateTotal of a single expense equals its amount` (currently failing — expected
    `42`, was `0` — now passes)

---

## Change 2 — `filterByMonth` month-indexing and timezone fix

- **File:** `src/utils.js`
- **Location:** lines 11–16 (function `filterByMonth`)
- **Rationale:** Two independent defects, fixed together:
  1. **0-vs-1-indexed month mismatch.** `d.getMonth()` is JavaScript's 0-indexed month
     (`0`–`11`), but `src/server.js:65-69` parses the `YYYY-MM` query parameter into a
     1-indexed `m` (e.g. `"2026-03"` → `m = 3`) and passes it straight through. Querying
     month `3` ("March") therefore matches `getMonth() === 3`, i.e. **April**; querying
     month `12` ("December") can never match since `getMonth()` tops out at `11`. The
     existing tests (`tests/utils.test.js:30,39`) pass 1-indexed months (`3` for March, `6`
     for June) and expect matches on that convention, confirming 1-indexed is the intended
     contract — so the fix belongs inside `filterByMonth`: compare `d.getUTCMonth() + 1`
     against `month` instead of `d.getMonth()` against `month`.
  2. **Local-time getters on UTC/ISO input (verifier Discrepancy 3).** The expense dates are
     UTC ISO strings (e.g. `2026-03-15T12:00:00Z`), but `getFullYear()`/`getMonth()` read
     components in the **host machine's local timezone**, not UTC. This makes the filter
     timezone-dependent independent of the indexing bug (e.g. under `TZ=America/New_York`,
     `new Date('2026-03-01').getMonth()` reads as February). Switching to
     `getUTCFullYear()`/`getUTCMonth()` reads the date components as authored, matching the
     UTC input format.

**Before:**
```js
function filterByMonth(expenses, year, month) {
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}
```

**After:**
```js
function filterByMonth(expenses, year, month) {
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
  });
}
```

- **Test command:**
  ```
  node --test --test-name-pattern="filterByMonth" tests/
  ```
- **Expected test outcome:** Both `filterByMonth` tests in `tests/utils.test.js` pass:
  - `filterByMonth returns expenses from the requested calendar month` (currently failing —
    expected ids `[1, 3]`, was `[2]` — now passes)
  - `filterByMonth respects the year` (currently failing — expected `[2]`, was `[]` — now
    passes)

---

## Change 3 — Remove hardcoded admin token; constant-time comparison

- **File:** `src/auth.js`
- **Location:** lines 1–9 (whole file: `ADMIN_TOKEN` constant and `isAdmin` function)
- **Rationale:** Two defects, fixed together:
  1. **Hardcoded credential in source control.** `ADMIN_TOKEN = 'admin123'` is a literal
     committed to the repository; anyone with read access to the repo or its git history can
     read it and use it to wipe production data via `POST /admin/reset`
     (`src/server.js:76-82` → `src/store.js:26-29`). The fix reads the credential from
     `process.env.ADMIN_TOKEN` at call time, with **no fallback secret** — if the
     environment variable is unset, `isAdmin` must deny access (return `false`) rather than
     falling back to any default value.
  2. **Non-constant-time, loosely-typed comparison.** `token == ADMIN_TOKEN` is a
     short-circuiting `==` comparison — not constant-time, so it is theoretically vulnerable
     to a timing side-channel that leaks how many leading characters match. The fix uses
     `crypto.timingSafeEqual`, which requires both buffers to be the same length (it throws
     on a length mismatch) and only accepts buffers/typed arrays — so the fix must (a)
     type-check that `token` is a `string` before use, and (b) guard for equal buffer length
     before calling `timingSafeEqual`, returning `false` early in either failure case instead
     of throwing.
  - Note (verifier Discrepancy 2): the loose `==` was not an exploitable type-coercion bypass
    (`isAdmin(undefined)`, `isAdmin(0)`, `isAdmin([])` all already return `false`) — the
    `timingSafeEqual` switch is a timing/hygiene hardening, not the closure of a coercion
    bypass. Framing it that way avoids overstating this part of the fix.
  - `src/server.js` calls `isAdmin(req.headers['x-admin-token'])` — an HTTP header value,
    which is always a `string` (or `undefined` if absent) — so the call site's contract with
    `isAdmin` is unchanged; **no change needed in `src/server.js`**.
  - **Flag for Security Verifier:** this change is security-sensitive (authentication/secret
    handling) and must be reviewed before merge. Deploying this fix additionally requires an
    `ADMIN_TOKEN` environment variable to be set wherever the server runs (including any
    test/CI environment that exercises `/admin/reset`) — otherwise all admin-reset requests
    will be denied by design.

**Before:**
```js
'use strict';

const ADMIN_TOKEN = 'admin123';

function isAdmin(token) {
  return token == ADMIN_TOKEN;
}

module.exports = { isAdmin };
```

**After:**
```js
'use strict';

const crypto = require('node:crypto');

function isAdmin(token) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return false;
  if (typeof token !== 'string') return false;

  const expected = Buffer.from(adminToken, 'utf8');
  const supplied = Buffer.from(token, 'utf8');
  if (expected.length !== supplied.length) return false;

  return crypto.timingSafeEqual(supplied, expected);
}

module.exports = { isAdmin };
```

- **Test command:** There is no baseline test covering `src/auth.js` / `isAdmin` (verified
  research Claim #21 — `tests/` contains only `utils.test.js`, no reference to `isAdmin` or
  `reset(`). Run the full suite to confirm this change does not regress the other two fixes:
  ```
  npm test
  ```
  Note: the Unit Test Generator stage (next in the pipeline, per
  `context/bugs/001/bug-context.md`) is responsible for adding regression tests for
  `isAdmin` — covering a correct token match, a wrong token, a missing/unset
  `ADMIN_TOKEN` env var, a non-string `token` input, and a length-mismatched token — since
  none exist yet.
- **Expected test outcome:** `npm test` shows no new failures introduced by this change (the
  existing 7 tests in `tests/utils.test.js` are unaffected, since none reference `isAdmin`).

---

## Out of scope

Do **not** touch:
- `src/server.js` — the `/summary` and `/admin/reset` route handlers call `calculateTotal`,
  `filterByMonth`, and `isAdmin` with signatures that are unchanged by this plan; no edit is
  needed there for any of the three fixes.
- `src/store.js` — verified research Claim #14: reviewed and confirmed to contain no defect
  relevant to this batch (`addExpense`/`listExpenses`/`reset` are correct; `listExpenses`
  returns a copy, no aliasing issue).
- `tests/utils.test.js` — the existing 7 tests already encode the correct expected behavior
  (1-indexed months, full sums) and are the acceptance criteria for Changes 1 and 2; they are
  not modified by this plan. New tests for `isAdmin` are the Unit Test Generator's
  responsibility, not this plan's.
- `validateExpense` in `src/utils.js` — not implicated by any of the three bug reports;
  verified research found no defect here.
- The `==` → type-coercion framing (verifier Discrepancy 2) is **not** treated as a distinct
  vulnerability to fix beyond the `timingSafeEqual` switch already in Change 3 — there is no
  exploitable bypass to close.

---

## Verification

After all three changes are applied, run the full suite:

```
npm test
```

**Expected result:** `# tests 7`, `# pass 7`, `# fail 0` — up from the documented baseline of
7 tests / 3 pass / 4 fail (`docs/test-results-before.txt`). All four previously failing tests
(`calculateTotal sums every expense, including the first one`, `calculateTotal of a single
expense equals its amount`, `filterByMonth returns expenses from the requested calendar
month`, `filterByMonth respects the year`) now pass, and the three previously passing tests
(`calculateTotal returns 0 for an empty list`, `validateExpense rejects a missing
description`, `validateExpense accepts a complete expense`) continue to pass.

Change 3 (`src/auth.js`) has no baseline test to flip from fail to pass — its correctness is
confirmed by `npm test` showing no regression, pending the Unit Test Generator stage adding
dedicated `isAdmin` regression tests, and by Security Verifier review of the auth-sensitive
diff before merge.
