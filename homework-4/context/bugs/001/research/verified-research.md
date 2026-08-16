# Verified Research — Bug Batch 001

## Verification Summary
- Overall: PASS
- Research Quality: SILVER (level 4/5) — per skills/research-quality-measurement.md
- References resolved: 14/14 (unique `file:line` claims; 19/19 counting repeats)
- Snippets exact: 5/6 (all 5 fenced code blocks byte-exact; the 6th is an inline quote of
  `src/server.js:72` that omits the trailing comma — non-semantic, see Discrepancy 1)

Gate: SILVER is at or above BRONZE, so the pipeline may proceed to planning.
All three root causes were independently reproduced against unmodified source.

---

## Verified Claims

| # | Claim | File:Line | Verdict | Note |
|---|-------|-----------|---------|------|
| 1 | `calculateTotal` loop starts at `i = 1`, skipping `expenses[0]` | `src/utils.js:3-9` | CONFIRMED | Fenced snippet byte-exact against source, including `Math.round(total * 100) / 100` |
| 2 | `/summary` passes the full list into `calculateTotal` | `src/server.js:72` | CONFIRMED | Actual line: `      total: calculateTotal(result),` — inline quote drops the trailing comma only |
| 3 | `GET /summary` handler spans the cited range | `src/server.js:63-74` | CONFIRMED | 63 = `if (req.method === 'GET' && url.pathname === '/summary') {`, 74 = closing `}` |
| 4 | Single-element input yields `0` because `i = 1` fails `i < 1` | `src/utils.js:3-9` | CONFIRMED | Reproduced: `calculateTotal([{amount:42}])` → `0`; 3-item list → `24.25` (not `34.75`) |
| 5 | `filterByMonth` compares 0-indexed `d.getMonth()` against the `month` argument | `src/utils.js:11-16` | CONFIRMED | Fenced snippet byte-exact |
| 6 | Server parses `YYYY-MM` and passes the 1-indexed `m` unmodified | `src/server.js:65-69` | CONFIRMED | Fenced snippet byte-exact, indentation included |
| 7 | Month `3` matches April; month `12` never matches | `src/utils.js:11-16` + `src/server.js:65-69` | CONFIRMED | Reproduced: `filterByMonth(exp,2026,3)` → `[2]` (the April row); `(...,2026,12)` → `[]` |
| 8 | `count` returned by `/summary` is also computed from the mis-filtered list | `src/server.js:70-73` (within cited `63-74`) | CONFIRMED | `count: result.length` uses the same filtered `result` |
| 9 | `ADMIN_TOKEN` is a hardcoded string literal in source | `src/auth.js:3` | CONFIRMED | `const ADMIN_TOKEN = 'admin123';` |
| 10 | `isAdmin` uses loose `==` (non-constant-time) | `src/auth.js:5-7` | CONFIRMED | `return token == ADMIN_TOKEN;` — short-circuiting string compare, no constant-time primitive |
| 11 | `src/auth.js:1-7` snippet as quoted | `src/auth.js:1-7` | CONFIRMED | Fenced snippet byte-exact (blank lines included) |
| 12 | Raw `x-admin-token` header gates the destructive reset | `src/server.js:76-82` | CONFIRMED | Fenced snippet byte-exact |
| 13 | `reset()` empties the entire in-memory store | `src/store.js:26-29` | CONFIRMED | `expenses.length = 0; nextId = 1;` |
| 14 | `src/store.js` contains no defect relevant to this batch | `src/store.js` (full) | CONFIRMED | `addExpense`/`listExpenses`/`reset` reviewed; `listExpenses` returns a copy — no aliasing issue |
| 15 | Failing test `calculateTotal sums every expense…` | `tests/utils.test.js:11-18` | CONFIRMED | Range exact; asserts `34.75`, actual `24.25` |
| 16 | Failing test `calculateTotal of a single expense…` | `tests/utils.test.js:20-22` | CONFIRMED | Range exact; asserts `42`, actual `0` |
| 17 | Failing test `filterByMonth returns expenses from the requested calendar month` | `tests/utils.test.js:24-32` | CONFIRMED | Range exact; expects `[1, 3]`, actual `[2]` |
| 18 | Failing test `filterByMonth respects the year` | `tests/utils.test.js:34-41` | CONFIRMED | Range exact; expects `[2]`, actual `[]` |
| 19 | Baseline is 7 tests / 3 pass / 4 fail, matching `docs/test-results-before.txt` | `docs/test-results-before.txt` | CONFIRMED | Fresh `npm test` reproduced: `# tests 7 / # pass 3 / # fail 4`, same four failures |
| 20 | Tests use 1-indexed months, establishing the intended contract | `tests/utils.test.js:30,39` | CONFIRMED | `filterByMonth(expenses, 2026, 3)` for March, `(…, 2026, 6)` for June |
| 21 | No automated test coverage for `src/auth.js` / `/admin/reset` | repo-wide | CONFIRMED | `tests/` contains only `utils.test.js`; grep for `isAdmin`/`reset(` finds no test reference |
| 22 | Loose `==` is type-coercing on unexpected input | `src/auth.js:6` | PARTIALLY CONFIRMED | `==` is indeed coercing, but no exploitable bypass exists: `isAdmin(undefined)`, `isAdmin(0)`, `isAdmin([])` all return `false`. See Discrepancy 2 |

Coverage check (grep for every call site of `calculateTotal`, `filterByMonth`, `isAdmin`,
`ADMIN_TOKEN`, `reset(`): the only production call sites are `src/server.js:68`, `:72`,
`:77`, `:80`. All are covered by the research. No involved file is missing from the
research's "Files Inspected" list.

---

## Discrepancies Found

1. **Trivial — inline quote drops a trailing comma.** Finding 1 quotes
   `src/server.js:72` inline as `total: calculateTotal(result)`.
   Expected (actual source): `      total: calculateTotal(result),`.
   Actual (research): `total: calculateTotal(result)` — leading indentation and trailing
   comma removed. Non-semantic; the line number and the code identity are correct. All five
   fenced code blocks in the research are byte-exact, so this is the only snippet drift.

2. **Minor overstatement — `==` coercion framed as a second vulnerability.** Finding 3
   claims the loose comparison means "unexpected input types are compared loosely rather
   than strictly". Verified behaviour: `isAdmin(undefined)` → `false`, `isAdmin(0)` →
   `false`, `isAdmin([])` → `false`. There is no type-coercion bypass here; the *real*
   defects are the hardcoded credential (`src/auth.js:3`) and the non-constant-time
   comparison (`src/auth.js:6`), both of which the research states correctly. The Bug Fixer
   should treat `==` → `crypto.timingSafeEqual` as a timing/hygiene fix, not as closing a
   coercion bypass.

3. **Omission (minor, secondary) — `filterByMonth` also has a timezone defect the research
   does not mention.** `src/utils.js:13-14` parses UTC/ISO date strings with `new Date(...)`
   but reads the components with the **local-time** getters `getFullYear()` /
   `getMonth()`. This makes the filter host-timezone dependent, independent of the
   0-vs-1-indexing bug:
   - `TZ=America/New_York`: `new Date('2026-03-01').getMonth()` → `1` (February),
     `getDate()` → `28`, so a March 1st expense drops out of a March filter.
   - `TZ=Europe/Kiev`: an expense dated `2026-03-31T23:00:00Z` reads as April 1st locally
     and likewise drops out of March.
   This is a genuine second cause of "month filter returns the wrong month" (Bug Report #2)
   and survives the indexing fix. It is not exercised by the current baseline tests and does
   not misdirect the fixer, but the Planner should decide explicitly whether to switch to
   `getUTCFullYear()` / `getUTCMonth()` (or string-prefix matching on `YYYY-MM`) while
   fixing Finding 2. **This single omission is the only reason the grade is SILVER rather
   than GOLD.**

No fabricated references, no wrong files, no wrong root causes.

---

## Research Quality Assessment

**Level 4 — SILVER.**

Reasoning against the criteria table in `skills/research-quality-measurement.md`:

- **GOLD not met.** GOLD requires "no relevant code path missed". Every reference resolves
  (14/14) and every fenced snippet matches source exactly, and all three root causes are
  correct — so GOLD's first three conditions hold. It fails only on the last: the
  local-time-getter defect inside the very function under investigation
  (`filterByMonth`, `src/utils.js:11-16`) is a second, independently reproducible cause of
  the Bug Report #2 symptom and is absent from the research (Discrepancy 3).
- **SILVER met (all conditions).**
  - ≥ 90% of references resolve → **100%** (14/14 unique, 19/19 with repeats); no line
    shift at all, let alone the ≤ 2 lines SILVER tolerates.
  - Snippets match with only trivial drift → the five fenced blocks are byte-exact; the
    single inline quote differs by a trailing comma and indentation only (Discrepancy 1).
  - Every root cause identified → all three reported items have a correct, code-supported
    root cause, each reproduced independently:
    Bug #1 = `for (let i = 1; …)` at `src/utils.js:5`;
    Bug #2 = 0-indexed `getMonth()` vs 1-indexed `m` (`src/utils.js:14` ↔ `src/server.js:67-68`);
    Security #1 = hardcoded `ADMIN_TOKEN` + loose `==` (`src/auth.js:3,6`) gating
    `reset()` (`src/store.js:26-29`).
  - At most one minor omission → exactly one (Discrepancy 3). Discrepancy 2 is an
    overstatement of an already-correct finding, not an omission or a wrong root cause.
- **Better than BRONZE/UNRELIABLE/REJECTED.** No stale snippets, no unverified secondary
  claims (the test-evidence table, the passing/failing split, and the 1-indexed-contract
  argument all check out), no reference that fails to resolve, and nothing that would send
  the Bug Fixer to the wrong code.

**Gate decision: PASS.** SILVER ≥ BRONZE, so planning may proceed. The Bug Planner can
treat Findings 1–3 and their suggested fix directions as trustworthy, and should
additionally fold Discrepancy 3 (UTC vs local getters) into the Bug #2 fix scope and
downgrade the "type coercion" rationale in Discrepancy 2 to a hygiene note.

---

## References

**Files inspected (re-opened in full during verification):**
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/context/bugs/001/research/codebase-research.md`
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/context/bugs/001/bug-context.md`
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/src/utils.js` (29 lines)
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/src/server.js` (93 lines)
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/src/auth.js` (9 lines)
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/src/store.js` (31 lines)
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/tests/utils.test.js` (57 lines)
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/docs/test-results-before.txt`
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/package.json`
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/skills/research-quality-measurement.md`
- `/Users/maksymchykalo/Desktop/studying/gen-ai-software-engineering/homework-4/agents/research-verifier.agent.md`

**Commands run:**
- `npm test` → `# tests 7 / # pass 3 / # fail 4`; identical four failures to
  `docs/test-results-before.txt` (verifies the research's Test Evidence section).
- `node -e "…calculateTotal / filterByMonth / isAdmin probes…"` →
  `24.25`, `0`, `0`; `month=3 -> [2]`, `month=12 -> []`;
  `isAdmin('admin123')=true`, `isAdmin(undefined|0|[])=false`.
- `TZ=America/New_York node -e "…"` and default `TZ=Europe/Kiev` run →
  demonstrated the local-getter timezone defect in Discrepancy 3
  (`new Date('2026-03-01').getMonth() === 1`, `getDate() === 28` under `America/New_York`).
- `grep -rn -E "calculateTotal|filterByMonth|isAdmin|ADMIN_TOKEN|reset\(" . --include="*.js" --include="*.json" --include="*.sh"`
  → coverage check; only call sites are `src/server.js:68,72,77,80` plus `tests/utils.test.js`.
- `git status --porcelain .` → confirmed no source file was modified during verification.
