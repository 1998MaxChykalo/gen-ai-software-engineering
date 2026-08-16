# Fix Summary — Bug Batch 001

## Changes Made

### Change 1: `calculateTotal` off-by-one loop start

**File:** `src/utils.js`

**Location:** Lines 3–9 (function `calculateTotal`)

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

**Test Command:**
```bash
node --test --test-name-pattern="calculateTotal" tests/
```

**Test Result:** PASS
```
# tests 7
# pass 3
# fail 0
```

All three `calculateTotal` tests passed:
- ✓ `calculateTotal returns 0 for an empty list`
- ✓ `calculateTotal sums every expense, including the first one`
- ✓ `calculateTotal of a single expense equals its amount`

---

### Change 2: `filterByMonth` month-indexing and timezone fix

**File:** `src/utils.js`

**Location:** Lines 11–16 (function `filterByMonth`)

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

**Test Command:**
```bash
node --test --test-name-pattern="filterByMonth" tests/
```

**Test Result:** PASS
```
# tests 7
# pass 2
# fail 0
```

Both `filterByMonth` tests passed:
- ✓ `filterByMonth returns expenses from the requested calendar month`
- ✓ `filterByMonth respects the year`

---

### Change 3: Remove hardcoded admin token; constant-time comparison

**File:** `src/auth.js`

**Location:** Lines 1–9 (entire file: `ADMIN_TOKEN` constant and `isAdmin` function)

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

**Test Command:**
```bash
npm test
```

**Test Result:** PASS (no regression)
```
# tests 7
# pass 7
# fail 0
```

No new failures introduced by this change. All existing tests continue to pass because `src/auth.js` has no baseline test coverage (verified research Claim #21); unit test coverage for `isAdmin` will be added by the Unit Test Generator stage.

---

## Overall Status

**Status:** SUCCESS

**Full Suite Results** (after all three changes applied):
```
# tests 7
# pass 7
# fail 0
```

**Comparison to Baseline:**
- Baseline (before any fixes): 7 tests, 3 pass, 4 fail
- After all fixes: 7 tests, 7 pass, 0 fail

**Fixed Tests:**
1. ✓ `calculateTotal sums every expense, including the first one` (was failing, now passing)
2. ✓ `calculateTotal of a single expense equals its amount` (was failing, now passing)
3. ✓ `filterByMonth returns expenses from the requested calendar month` (was failing, now passing)
4. ✓ `filterByMonth respects the year` (was failing, now passing)

**Regression Tests:**
- ✓ `calculateTotal returns 0 for an empty list` (already passing, still passing)
- ✓ `validateExpense rejects a missing description` (already passing, still passing)
- ✓ `validateExpense accepts a complete expense` (already passing, still passing)

---

## Manual Verification

To verify each fix independently after applying all changes:

### Verify Change 1: `calculateTotal` fix

1. Open `src/utils.js` and confirm line 5 reads `for (let i = 0; i < expenses.length; i++);`
2. Run the calculateTotal tests:
   ```bash
   cd /Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4
   node --test --test-name-pattern="calculateTotal" tests/
   ```
3. Confirm all three tests pass without SKIP markers.

### Verify Change 2: `filterByMonth` fix

1. Open `src/utils.js` and confirm line 14 reads:
   ```js
   return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
   ```
2. Run the filterByMonth tests:
   ```bash
   cd /Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4
   node --test --test-name-pattern="filterByMonth" tests/
   ```
3. Confirm both tests pass without SKIP markers.

### Verify Change 3: `auth.js` security hardening

1. Open `src/auth.js` and confirm:
   - Line 3 imports `crypto` from `'node:crypto'`
   - `ADMIN_TOKEN` constant is removed
   - `isAdmin` function reads `process.env.ADMIN_TOKEN`
   - Comparison uses `crypto.timingSafeEqual`
2. Verify no hardcoded credentials remain:
   ```bash
   cd /Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4
   grep -r "admin123" src/ || echo "No hardcoded tokens found"
   ```
3. Run the full suite to confirm no regressions:
   ```bash
   cd /Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4
   npm test
   ```
4. Confirm all 7 tests pass.

### Optional: Confirm timezone-independent operation (Change 2)

To verify that the filterByMonth fix is timezone-independent, run:
```bash
cd /Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4
TZ=America/New_York npm test
# or
TZ=Asia/Tokyo npm test
```

Expected result: all 7 tests pass regardless of timezone setting.

---

## References

- **Implementation Plan:** `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/context/bugs/001/implementation-plan.md`
- **Verified Research:** `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/context/bugs/001/research/verified-research.md`
- **Codebase Research:** `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/context/bugs/001/research/codebase-research.md`

**Changed Files:**
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/src/utils.js` (Changes 1 and 2)
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/src/auth.js` (Change 3)

**Unchanged Files (per plan):**
- `src/server.js` — no changes needed; call signatures remain unchanged
- `src/store.js` — verified research found no defect
- `tests/utils.test.js` — existing tests are the acceptance criteria; no modification needed
- Dedicated `isAdmin` tests will be added by Unit Test Generator stage

---

## Security Note

**Change 3 is security-sensitive.** This change modifies authentication token handling:
- Removes hardcoded credential from source control
- Implements constant-time comparison to mitigate timing side-channel attacks

**Before merge:** This change must be reviewed by the Security Verifier before deployment.

**Deployment requirement:** The application requires the `ADMIN_TOKEN` environment variable to be set in any environment where `/admin/reset` is called (dev, test, staging, production). If unset, all admin requests will be denied by design.
