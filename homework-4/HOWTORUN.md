# How to Run — Homework 4

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | ≥ 18.11 (built-in `node:test` + `--test-name-pattern`) | `node --version` |
| npm | any recent | `npm --version` |
| Claude Code CLI | latest (only for re-running the pipeline) | `claude --version` |

No `npm install` needed — the app is **zero-dependency** (Node standard library only).

## 1. Run the tests

```bash
cd homework-4
npm test
```

Expected: all tests pass (baseline suite in `tests/utils.test.js` + agent-generated suites
`tests/*.generated.test.js`). The pre-fix failing state is preserved in
`docs/test-results-before.txt`.

## 2. Run the application

```bash
cd homework-4
ADMIN_TOKEN=my-secret npm start
# → Tiny Expense Tracker listening on http://localhost:3000
```

`ADMIN_TOKEN` is optional — without it the app runs but `POST /admin/reset` is always
denied (secure default after the fix; there is no fallback secret anymore).

### Try the API

```bash
# health
curl http://localhost:3000/health

# add expenses
curl -X POST http://localhost:3000/expenses -H 'Content-Type: application/json' \
  -d '{"description":"Coffee","amount":3.5,"category":"food","date":"2026-03-15T12:00:00Z"}'
curl -X POST http://localhost:3000/expenses -H 'Content-Type: application/json' \
  -d '{"description":"Book","amount":20,"category":"fun","date":"2026-04-10T12:00:00Z"}'

# list / filter
curl http://localhost:3000/expenses
curl 'http://localhost:3000/expenses?category=food'

# monthly summary (fixed: correct total, correct month)
curl 'http://localhost:3000/summary?month=2026-03'

# admin reset (denied without the right token; constant-time check)
curl -X POST http://localhost:3000/admin/reset -H 'x-admin-token: wrong'      # 403
curl -X POST http://localhost:3000/admin/reset -H 'x-admin-token: my-secret'  # 200
```

## 3. Run the agent pipeline (single command)

```bash
cd homework-4
npm run pipeline        # == ./run-pipeline.sh
```

The script runs all stages **in order** via headless Claude Code, taking each agent's
**model from its frontmatter** and loading its skills; it verifies each stage's artifact
exists before continuing and stops at the quality gate if research verification FAILs.
Full stage log: `docs/pipeline-run.log`.

> Note: re-running the pipeline against the already-fixed code will (correctly) result in
> research that finds the bugs resolved. To reproduce the full original run, first restore
> the seeded-bug state of `src/utils.js` / `src/auth.js` from the **Before** blocks in
> `context/bugs/001/implementation-plan.md`.

## 4. Inspect the pipeline artifacts

```
context/bugs/001/
├── bug-context.md                    # input: symptom-only bug reports
├── research/codebase-research.md     # stage 1 output
├── research/verified-research.md     # stage 2 output (quality per skill, PASS/FAIL gate)
├── implementation-plan.md            # stage 3 output
├── fix-summary.md                    # stage 4 output (before/after + test results)
├── security-report.md                # stage 5 output (severity-rated findings)
└── test-report.md                    # stage 6 output (FIRST compliance + run results)
```

## Testing guide

- **Full suite:** `npm test`
- **Only one area:** `node --test --test-name-pattern="filterByMonth" tests/`
- **Generated tests only:** `node --test tests/utils-fixes.generated.test.js tests/auth.generated.test.js`
- **Before/after evidence:** `docs/test-results-before.txt` (3 pass / 4 fail) vs
  `docs/test-results-after.txt` (all green).

## Troubleshooting

- `claude: command not found` → install Claude Code (`npm i -g @anthropic-ai/claude-code`) and log in.
- Admin reset always 403 → set `ADMIN_TOKEN` in the environment before `npm start`; the
  token must match exactly (constant-time comparison, no coercion).
- Tests must be run from `homework-4/` so relative `require('../src/...')` paths resolve.
