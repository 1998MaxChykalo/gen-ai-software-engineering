# Codebase Research — Bug Batch 001

## Scope

Reports investigated (from `context/bugs/001/bug-context.md`):

1. Bug Report #1 — Monthly summary total is too low
2. Bug Report #2 — Month filter returns the wrong month
3. Security Concern #1 — Admin reset endpoint

Request path traced for all three: `src/server.js` → `src/utils.js` / `src/auth.js` (with
`src/store.js` inspected as a non-offending supporting module).

---

## Findings

### Finding 1 — Bug Report #1: Monthly summary total is too low

**Symptom:** `GET /summary` total is lower than the sum of expenses from `GET /expenses`.
Three expenses of 10.50, 20.00, 4.25 produce a total of 24.25 instead of 34.75. A single
expense always produces a total of 0.

**Root Cause:** `calculateTotal` in `src/utils.js` starts its summation loop at index `1`
instead of `0`, so the first element of the `expenses` array is never added to the running
total.

**Evidence:**

`src/utils.js:3-9`
```js
function calculateTotal(expenses) {
  let total = 0;
  for (let i = 1; i < expenses.length; i++) {
    total += expenses[i].amount;
  }
  return Math.round(total * 100) / 100;
}
```
The loop initializer `let i = 1` skips `expenses[0]`.

Call path: `src/server.js:72` — `total: calculateTotal(result)` — passes the full
`listExpenses()` (optionally month-filtered) array straight into the buggy function, so the
skipped element is always the first expense in whatever array is passed, i.e. list order
determines which expense's amount is dropped.

**Affected code paths:**
- `GET /summary` → `src/server.js:63-74` → `calculateTotal` (`src/utils.js:3-9`)
- Any future caller of `calculateTotal` with more than one element inherits the same
  off-by-one loss; with exactly one element the loop body never executes at all
  (`i = 1` fails `i < 1`), so `total` stays `0` — this matches the reported "single expense
  → total is always 0" symptom exactly.

**Suggested fix direction:** Initialize the loop counter at `0` (`for (let i = 0; i <
expenses.length; i++)`), or replace the manual loop with `expenses.reduce((sum, e) => sum +
e.amount, 0)` and keep the existing rounding step; no other part of the summary/expense
pipeline needs to change.

---

### Finding 2 — Bug Report #2: Month filter returns the wrong month

**Symptom:** `GET /summary?month=2026-03` returns expenses dated April 2026, not March.
`month=2026-12` always returns an empty result even when December expenses exist.

**Root Cause:** `filterByMonth` in `src/utils.js` compares `d.getMonth()` (JavaScript's
**0-indexed** month, `0`–`11`) directly against the `month` argument, which `src/server.js`
supplies as a **1-indexed** calendar month parsed straight out of the `YYYY-MM` query string
(e.g. `"2026-03"` → `m = 3`). Because of this off-by-one mismatch:
- Querying month `3` ("March") matches dates whose `getMonth()` is `3`, i.e. **April**
  (`getMonth() === 3` for an April date).
- Querying month `12` ("December") can never match, since `getMonth()` tops out at `11`
  (December's zero-indexed value) — the comparison `d.getMonth() === 12` is always false.

**Evidence:**

`src/utils.js:11-16`
```js
function filterByMonth(expenses, year, month) {
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}
```

`src/server.js:65-69`
```js
    const month = url.searchParams.get('month'); // format: YYYY-MM
    if (month) {
      const [y, m] = month.split('-').map(Number);
      result = filterByMonth(result, y, m);
    }
```
`m` is the literal numeric month from the query string (`3` for March, `12` for December) —
already 1-indexed — and is passed unmodified into `filterByMonth`, which then compares it
against the 0-indexed `d.getMonth()`.

**Affected code paths:**
- `GET /summary?month=YYYY-MM` → `src/server.js:63-74` → `filterByMonth`
  (`src/utils.js:11-16`)
- The count (`result.length`) and total returned by `/summary` are both computed from this
  mis-filtered `result`, so the count is also wrong whenever a month filter is applied.

**Suggested fix direction:** Align the indexing on one side of the comparison — either add 1
to `d.getMonth()` inside `filterByMonth` (`d.getMonth() + 1 === month`) to treat `month` as
1-indexed throughout, or subtract 1 from `m` in `src/server.js` before calling
`filterByMonth` to treat it as 0-indexed throughout; either is correct as long as caller and
callee agree — the existing unit tests in `tests/utils.test.js` (which pass 1-indexed months
like `3` and `6` and expect March/June matches) confirm the 1-indexed convention is the
intended contract, so fixing inside `filterByMonth` is the more localized change.

---

### Finding 3 — Security Concern #1: Admin reset endpoint

**Symptom:** `POST /admin/reset` wipes all data. The protecting credential is hardcoded in
the repository and compared with a loose, non-constant-time comparison.

**Root Cause:** `src/auth.js` defines the admin token as a hardcoded string literal
committed to source control, and `isAdmin` compares the supplied header value to it with the
loose equality operator `==`, which is both (a) not a constant-time comparison — vulnerable
to timing side-channel attacks that could help an attacker infer the token character-by-
character — and (b) type-coercing, so unexpected input types are compared loosely rather than
strictly.

**Evidence:**

`src/auth.js:1-7`
```js
'use strict';

const ADMIN_TOKEN = 'admin123';

function isAdmin(token) {
  return token == ADMIN_TOKEN;
}
```

Call path: `src/server.js:76-82`
```js
  if (req.method === 'POST' && url.pathname === '/admin/reset') {
    if (!isAdmin(req.headers['x-admin-token'])) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    reset();
    return sendJson(res, 200, { status: 'reset' });
  }
```
The raw `x-admin-token` request header is passed directly into `isAdmin`, which gates a
destructive, unauthenticated-by-design `reset()` call (`src/store.js:26-29`) that empties the
entire in-memory expense store.

**Affected code paths:**
- `POST /admin/reset` → `src/server.js:76-82` → `isAdmin` (`src/auth.js:5-7`) →
  `reset()` (`src/store.js:26-29`)
- Anyone with read access to the repository (or the git history) can read `ADMIN_TOKEN`
  directly from `src/auth.js:3` and use it to wipe production data with a single unauth'd
  HTTP request; there is no rate limiting, logging, or lockout around failed attempts either.

**Suggested fix direction:** Move the admin credential out of source control into an
environment variable (e.g. `process.env.ADMIN_TOKEN`, loaded from a secret store / `.env`
excluded from git) and replace the `==` comparison with a constant-time comparison such as
Node's `crypto.timingSafeEqual` on fixed-length buffers (guarding against length mismatches
before comparing, since `timingSafeEqual` throws on unequal-length inputs) to remove the
timing side channel.

---

## Test Evidence

`npm test` run locally against the current (unmodified) source, matching the documented
baseline in `docs/test-results-before.txt`: **7 tests, 3 pass, 4 fail**.

| Failing test | Finding |
|---|---|
| `calculateTotal sums every expense, including the first one` (`tests/utils.test.js:11-18`, expected `34.75`, actual `24.25`) | Finding 1 |
| `calculateTotal of a single expense equals its amount` (`tests/utils.test.js:20-22`, expected `42`, actual `0`) | Finding 1 |
| `filterByMonth returns expenses from the requested calendar month` (`tests/utils.test.js:24-32`, expected ids `[1, 3]`, actual `[2]`) | Finding 2 |
| `filterByMonth respects the year` (`tests/utils.test.js:34-41`, expected `[2]`, actual `[]`) | Finding 2 |

Passing tests: `calculateTotal returns 0 for an empty list`, `validateExpense rejects a
missing description`, `validateExpense accepts a complete expense` — none of these exercise
the buggy code paths above, so their pass status is unaffected by Findings 1–2.

There is no automated test coverage for `src/auth.js` / the `/admin/reset` endpoint
(Finding 3); the security concern is not represented in the current failing-test baseline and
was located purely through source inspection.

---

## Files Inspected

- `src/server.js` — full file (request routing for `/health`, `/expenses`, `/summary`,
  `/admin/reset`)
- `src/utils.js` — full file (`calculateTotal`, `filterByMonth`, `validateExpense`)
- `src/auth.js` — full file (`ADMIN_TOKEN`, `isAdmin`)
- `src/store.js` — full file (`addExpense`, `listExpenses`, `reset`) — inspected as a
  supporting module for the `/admin/reset` path; no defects found here
- `tests/utils.test.js` — full file — used as executable specification confirming the
  expected (1-indexed month, full-sum) behavior and as the source of the failing-test
  evidence above
- `docs/test-results-before.txt` — baseline `npm test` output referenced by the bug context,
  cross-checked against a fresh local `npm test` run (identical results: 3 pass / 4 fail)
