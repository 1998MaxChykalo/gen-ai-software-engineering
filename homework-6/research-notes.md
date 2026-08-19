# Research Notes — context7 queries (Agent 2, code generation)

During pipeline code generation, framework documentation was looked up through the
**context7 MCP server** (`@upstash/context7-mcp`, v4.0.2, tools `resolve-library-id`
and `query-docs`). Queries were made over the MCP stdio protocol; raw responses were
saved during the session and the relevant findings are documented below.

---

## Query 1: decimal.js — rounding modes for monetary arithmetic

- **Search:** `resolve-library-id` for "decimal.js" with query
  *"rounding modes ROUND_HALF_UP toDecimalPlaces arbitrary precision money arithmetic"*,
  then `query-docs` *"rounding modes ROUND_HALF_UP toDecimalPlaces toFixed for monetary calculations"*
- **context7 library ID:** `/mikemcl/decimal.js`
- **Key findings from the returned docs:**
  - `Decimal.rounding` defaults to `4` (**ROUND_HALF_UP**) — the exact mode the
    specification requires, so no global re-configuration is needed.
  - `toDecimalPlaces(dp, rm)` rounds using an explicit rounding mode:
    `x.toDecimalPlaces(1, Decimal.ROUND_UP)`.
  - `toFixed(dp [, rm])` returns a fixed-point **string** rounded to `dp` places
    using the default mode when `rm` is omitted.
  - Financial-calculation pattern from the docs:
    `Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })`.
- **Applied in code:**
  - `pipeline/settlement.js` → `calculateFee()` quantizes the fee **once, at the
    end**, with `fee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)` (explicit mode, per
    docs), and serializes money with `.toFixed(2)` so amounts stay strings in JSON.
  - `pipeline/common.js` → `parseAmount()` uses `decimalPlaces()` to reject amounts
    with more than 2 decimal places instead of silently rounding user input.

## Query 2: Express — static file serving + JSON APIs

- **Search:** `resolve-library-id` for "Express" with query
  *"serve static files and JSON API res.json express.static"*, then `query-docs`
  *"express.static serve static files res.json status codes JSON API"*
- **context7 library ID:** `/expressjs/express`
- **Key findings from the returned docs:**
  - `app.use(express.static(root, options))` serves a directory; `fallthrough: true`
    (default) calls `next()` when a file is missing, so API routes registered before
    the static middleware keep working.
  - Options like `index: ['index.html']` (default) make `/` serve the SPA entry
    without extra routing.
  - `res.status(code).json(body)` is the canonical way to combine an HTTP status
    with a JSON payload.
- **Applied in code:**
  - `frontend/server.js` registers the three `/api/*` routes **before**
    `app.use(express.static(DIST_DIR))`, relying on the documented middleware order;
    the missing-summary case returns `res.status(404).json({ error: ... })` and a
    failed run returns `res.status(500).json(...)`.

## Query 3: Vite — dev-server proxy to the Express backend

- **Search:** `resolve-library-id` for "Vite" with query
  *"dev server proxy configuration for API backend"*, then `query-docs`
  *"server.proxy dev server proxy /api to backend, build outDir"*
- **context7 library ID:** `/vitejs/vite`
- **Key findings from the returned docs:**
  - `server.proxy` supports a string shorthand — `'/foo': 'http://localhost:4567'`
    proxies `http://localhost:5173/foo` to the target **without path rewriting**,
    which is exactly what is needed when the backend also serves `/api/...`.
  - `rewrite`/`changeOrigin` are only needed when the backend paths differ — not our
    case, so the config stays minimal.
- **Applied in code:**
  - `frontend/vite.config.js` uses the string-shorthand proxy
    `'/api': 'http://localhost:3000'` so `npm run dev` (5173) and the production
    Express server (3000) expose identical API paths, and `build.outDir: 'dist'`
    matches what `frontend/server.js` serves.

---

*Note on tooling:* the context7 MCP server requires Node 20+ (its `undici`
dependency uses the `File` global); queries were run with Node v20.19.2. The same
server is configured for interactive use in `mcp.json` (Task 4).

---

## Task 4 — MCP configuration

Both MCP servers are configured together in `homework-6/mcp.json` (deliverable
format) and in the repo-root `.mcp.json` (picked up by Claude Code sessions in this
repository):

- **context7** (`npx -y @upstash/context7-mcp@latest`) — used during code
  generation; the three queries above are the documented evidence.
- **pipeline-status** (`mcp/.venv/bin/python mcp/server.py`, FastMCP) — exposes
  `get_transaction_status`, `list_pipeline_results`, and the `pipeline://summary`
  resource over `shared/results/`. A full MCP stdio session exercising all three
  (including the not-found path) is captured in `docs/mcp-interaction.txt`.
  PII rules hold at the MCP boundary too: accounts arrive pre-masked from the
  pipeline, and `description` fields are stripped by the server.
