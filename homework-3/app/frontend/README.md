# Horizon — Frontend

React 18 + Vite 5 + TypeScript (strict) frontend for **Horizon**, the financial
goal forecasting app described in `homework-3/specification.md`. Built to run
standalone against an in-memory mock (no backend needed) or against the real
NestJS backend in `homework-3/app/backend` once it implements the binding HTTP
contract.

## Stack

- React 18, React Router 6, TypeScript 5 (`strict: true`, no `any`)
- Vite 5 (pinned below 6/7 for Node 18.16 compatibility)
- Recharts 2 for the net-worth and scenario-comparison charts
- Plain CSS (`src/styles/global.css`) — system font stack, indigo/teal accent
- Vitest + @testing-library/react + jsdom for tests

Requires Node `>=18.16` (tested on 18.16.0).

## Running with the real backend

```bash
npm ci
npm run dev
```

This starts Vite on `http://localhost:5173`. Requests to `/api/*` are proxied
to `http://localhost:3000` (see `vite.config.ts`), where the backend from
`homework-3/app/backend` is expected to be listening. Log in with an account
registered against that backend (or use `/register`).

## Running standalone in mock mode (no backend required)

```bash
npm ci
npm run dev:mock
```

`dev:mock` sets `VITE_USE_MOCKS=true`, which swaps the HTTP client
(`src/api/httpClient.ts`) for an in-memory implementation of the exact same
`HorizonApi` interface (`src/api/mockClient.ts`), seeded with a realistic
median-family persona in `src/api/mockData.ts`:

- Two incomes (salary + rental), five expenses, three assets (cash,
  investments, real estate), and a mortgage.
- A 240-month (20-year) net-worth trajectory.
- Three goals: **emergency fund** (`on_track`), **house down payment**
  (`late`), **vacation** (`on_track`) — matching the outcome variety called
  for in the brief.
- One scenario evaluation flow with plausible baseline/what-if deltas for all
  five canonical "what if" presets.

Mutations (profile edits, goal create/edit/archive, save/delete scenario)
update the in-memory state plausibly — the mock does not re-run real
forecasting math (per the build brief, "no real math needed, clearly fine for
demo"); it exists to make every screen explorable and screenshot-able without
a backend. Log in with **any** credentials — mock mode accepts anything (the
demo hint `demo@horizon.app` / `HorizonDemo1!` is shown on the login page for
consistency with the real backend's seeded demo user).

Any profile/goal mutation flips the forecast to `stale: true` for ~3 seconds
(simulating the real recalculation pipeline) so the staleness badge and the
5-second freshness poll (`GET /forecast/freshness`, polled every 5s only while
stale) have something real to demonstrate.

## Pages

| Route | Page | Notes |
|---|---|---|
| `/login`, `/register` | Auth | Minimal forms; demo hint text shown on both |
| `/dashboard` | Dashboard | Headline stats, net-worth area chart, goal summary cards, staleness badge, assumption chips, disclaimer footer |
| `/profile` | Profile | Sectioned editor (incomes / expenses / assets / liabilities / assumptions), add/remove rows, optimistic-lock 409 handling with reload prompt |
| `/goals` | Goals | Priority-sorted list, progress bars, outcome badges, create/edit modal with inline 422 mapping, archive with confirm |
| `/scenarios` | What if? | Five canonical presets → deltas, baseline-vs-scenario chart, per-goal delta table, save/load/delete named scenarios |

All four authenticated pages render inside `AppShell` (`src/components/AppShell.tsx`):
top nav (Dashboard / Profile / Goals / What if?), the Horizon wordmark, logout,
and a staleness indicator polled from `/forecast/freshness`.

## Guardrails honored (see `agents.md` §3.3–3.5, §7)

- **Disclaimer, never hidden**: `DisclaimerFooter` renders the exact
  `disclaimer` string from the API response on every forecast/scenario
  surface (Dashboard, Scenarios) — visible footer text, not a tooltip.
- **Assumption transparency**: `AssumptionsChips` shows inflation / expected
  return / income growth next to every forecast and scenario output.
- **Projection language only**: all UI copy uses "projected" / "if these
  assumptions hold" phrasing; nothing says "you should" or promises a
  guarantee.
- **Unreachable goals are a designed state, not an error**: `OutcomeBadge` +
  `GoalCard`'s explanation text render `unreachable` ("expenses exceed income
  under current inputs...") and `unreachable_within_horizon` honestly, with
  color-coded badges (green/amber/red/grey) — never a toast or thrown error.
- **Staleness is visible**: `StalenessBadge` renders whenever `stale: true`
  comes back from the forecast or freshness endpoints, both in the app shell
  and inline on affected goal cards.
- **Money is minor units end to end**: every `*Minor` field is formatted with
  `formatEurMinor` (a single utility) and nothing else; user-entered euro
  strings are parsed with `parseEurToMinor`, both pure integer/string
  arithmetic — no `parseFloat`, no `Number * 100` anywhere in the app. See
  `src/utils/money.ts`.
- **Empty states are designed**: no profile / no goals / no forecast yet /
  no saved scenarios each render a friendly `EmptyState` card with an
  onboarding action, never a blank screen.

## Money handling in detail

`src/utils/money.ts` is the single source of truth for money formatting and
parsing on the frontend, and the only file that touches numeric string
parsing for currency:

- `parseEurToMinor(raw: string): number` — parses user-typed amounts
  (`"1234.56"`, `"1.234,56"`, `"1234,56"`, `"1234"`, with optional leading
  `+`/`-`) into integer minor units using only string decomposition + integer
  concatenation — never a float multiply/divide. Throws `MoneyParseError` on
  garbage input, more than 2 fraction digits, or malformed separators.
- `formatEurMinor(minor: number): string` — the single formatting utility
  required by the brief. Splits minor units into whole euros/cents via
  `Math.trunc`/`%` (integer division and remainder), then hands `Intl.
  NumberFormat('de-DE', {style:'currency', currency:'EUR'})` an exact decimal
  value assembled from those two integers. Handles negatives.
- `formatEurMinorCompact` / `minorToEuroInputString` are secondary, non-money-critical
  helpers (chart axis ticks, pre-filling edit-form inputs) built the same way.

All 18 tests in `src/utils/money.test.ts` cover both directions, round-tripping,
negatives, and garbage-input rejection.

## Tests

```bash
npm test
```

28 tests across 4 files, all passing:

- `src/utils/money.test.ts` — `parseEurToMinor` (all required formats,
  negatives, garbage rejection, round-trip) and `formatEurMinor` (positive,
  zero, negative, cent-only amounts).
- `src/components/GoalCard.test.tsx` — renders the `unreachable` outcome with
  its badge and honest explanation text, plus `on_track`/`late` variants.
- `src/components/ScenarioDeltaTable.test.tsx` — `formatDeltaMonths` sign
  handling (`"7 months later"` / `"3 months sooner"` / `"no change"` /
  `"—"` for null) and full-table rendering.
- `src/pages/Dashboard.test.tsx` — asserts the disclaimer text rendered on
  the dashboard comes from the (mocked) API payload, not a hardcoded string.

## Verified locally (Node 18.16.0)

- `npm ci` — clean install from `package-lock.json`.
- `npm run build` (`tsc -b && vite build`) — typechecks clean, produces
  `dist/`.
- `npm test` (`vitest run`) — 28/28 passing.
- `npm run dev:mock` — boots on port 5173, responds to `curl`, serves the app
  fully standalone.

## Known limitations / not built

- No dark theme (brief only asked for a clean light look).
- The mock's scenario-evaluation math is illustrative (documented heuristics
  in `mockClient.ts`), not a real engine — by design, per the build brief; the
  real math lives in the backend's forecast engine.
- No automated Playwright/e2e screenshot script is included here; screenshots
  were captured manually per the top-level `CLAUDE.md` screenshot guidance.
- Bundle is a single ~600KB (170KB gzip) JS chunk — fine for this app's size,
  but code-splitting (e.g. lazy-loading `recharts`-heavy pages) would be the
  first optimization for a larger app.
