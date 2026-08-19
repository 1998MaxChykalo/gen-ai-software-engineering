# How to Run — Transaction Processing Pipeline

> Task 2 scope: pipeline + front-end. Tests, hooks, and MCP setup are documented as
> Tasks 3–5 land.

## Prerequisites

- **Node.js 20+** (18.13+ works for the pipeline itself; the context7 MCP tooling
  needs 20+). With nvm: `nvm use 20`.
- npm with access to the public registry (if your `.npmrc` points at a private
  registry, prefix commands with `npm_config_registry=https://registry.npmjs.org/`).

## 1. Install dependencies

```bash
cd homework-6
npm install            # pipeline: decimal.js, express (+ c8 for coverage)
cd frontend && npm install && cd ..   # dashboard: react, vite
```

## 2. Run the pipeline (CLI)

```bash
node orchestrator.js         # or: npm run pipeline
```

Expected output: a per-transaction table ending with
`total: 8  settled: 5  requires_review: 3  rejected: 3` and exit code 0.
Results land in `shared/results/` (one JSON envelope per transaction plus
`summary.json` and `audit.log`). A captured run is in `docs/pipeline-run.txt`.

Validate without processing (dry run, no writes):

```bash
node pipeline/validator.js --dry-run     # or: npm run validate
```

## 3. Run the front-end (React dashboard)

Production mode (single server on port 3000):

```bash
cd frontend && npm run build && cd ..    # build the React app once
node frontend/server.js                  # or: npm run serve
# open http://localhost:3000
```

Development mode (hot reload):

```bash
node frontend/server.js        # terminal 1 — API on :3000
cd frontend && npm run dev     # terminal 2 — Vite on :5173, /api proxied to :3000
```

The dashboard shows stat cards (settled / needs review / rejected), per-currency
settled totals, and a per-transaction table with masked accounts, risk scores, and
rejection reasons. The **Run pipeline** button triggers a fresh run via
`POST /api/run`.

API endpoints (also usable with curl):

| Endpoint | Description |
|---|---|
| `GET /api/summary` | Latest `summary.json` (404 before the first run) |
| `GET /api/transactions` | All final result records (accounts masked) |
| `POST /api/run` | Runs the pipeline, returns exit code + fresh summary |

## 4. Tests

```bash
npm test               # node --test tests/ — 63 tests across 4 suites
npm run coverage       # c8 --check-coverage --lines 80 (current: ~93% lines)
```

The suite covers every stage in isolation (all rejection codes, every fraud rule and
threshold boundary, the fee schedule incl. the wire minimum boundary) plus a full
pipeline integration run in a temp directory — it never touches the real `shared/`.
Captured runs: `docs/test-results.txt`, `docs/test-coverage.txt`, and
`docs/screenshots/test-coverage.png`.

## 5. MCP servers (Task 4)

One-time setup for the custom **pipeline-status** FastMCP server (needs Python 3.10+;
`uv` makes this easy):

```bash
cd homework-6/mcp
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

Both servers are configured in `homework-6/mcp.json` and the repo-root `.mcp.json`
(auto-detected by Claude Code — approve the project MCP servers when prompted, or
check with `/mcp`):

| Server | Purpose |
|---|---|
| `context7` | Live framework docs during code generation (queries documented in `research-notes.md`). Requires Node 20+ (`nvm use 20` before launching Claude Code). |
| `pipeline-status` | Queries pipeline outcomes: tools `get_transaction_status`, `list_pipeline_results`; resource `pipeline://summary` |

Smoke-test the custom server without Claude (raw MCP stdio session):
see `docs/mcp-interaction.txt` for a captured session with all tools and the resource.

## 6. Claude Code skills & coverage gate hook (Task 3)

Slash commands (available in any Claude Code session in this repo):

| Skill | What it does |
|---|---|
| `/run-pipeline` | Runs the pipeline end-to-end and summarizes results + rejections |
| `/validate-transactions` | Validator dry-run report (counts + table), no processing |
| `/write-spec` | (Agent 1) Regenerates `specification.md` from the template |

Coverage gate hook — **blocks `git push` when line coverage < 80%**:

- **Claude Code**: `.claude/settings.json` wires a `PreToolUse` hook
  (`scripts/claude-hook-pre-push.sh`) that intercepts Bash `git push` commands and
  blocks them (exit 2) if `npm run coverage` fails the 80% gate.
- **Any terminal**: install the native git hook once —
  ```bash
  homework-6/scripts/install-git-hooks.sh   # installs .git/hooks/pre-push
  ```
  A blocked push can be bypassed deliberately with `git push --no-verify`.
- Gate logic lives in `scripts/coverage-gate.sh` (runs `npm run coverage`, i.e.
  `c8 --check-coverage --lines 80 node --test tests/`). With no test files present
  the gate fails closed (treated as 0% coverage). Evidence of the hook firing:
  `docs/hook-trigger.txt`.
