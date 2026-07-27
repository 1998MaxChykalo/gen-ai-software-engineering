# How to Run — Horizon (Financial Goal Forecasting App)

The implementation lives in [`app/`](app/): a NestJS 10 backend (`app/backend`) and a React 18 + Vite frontend (`app/frontend`). Detailed per-package docs: [`app/backend/README.md`](app/backend/README.md) and [`app/frontend/README.md`](app/frontend/README.md).

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18.16 (tested on 18.16.0) | Only hard requirement |
| npm | ≥ 9 | Ships with Node 18 |
| Docker (optional) | any recent | Only for the spec-compliant PostgreSQL path — **not needed** for the default setup |

The default setup uses **SQLite** (zero external services) and an **in-process recalculation dispatcher** — approved deviations from the spec's PostgreSQL 16 + BullMQ/Redis, documented in `app/backend/README.md`.

## 1. Start the backend (terminal 1)

```bash
cd homework-3/app/backend
npm ci
npx prisma generate          # generate the Prisma client
npx prisma migrate dev       # create/migrate the SQLite dev.db
npm run seed                 # seed the demo user + median-family profile + goals
npm run build
npm run start:prod           # API on http://localhost:3000
```

Verify it's up:

```bash
curl http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@horizon.app","password":"HorizonDemo1!"}'
# → {"accessToken":"..."}
```

- **API base URL:** `http://localhost:3000/api/v1`
- **OpenAPI / Swagger UI:** `http://localhost:3000/api/docs`
- Configuration is in `app/backend/.env` (SQLite path, JWT secret, port 3000, CORS for `http://localhost:5173`). Defaults work out of the box; the JWT secret is a dev-only placeholder.

## 2. Start the frontend (terminal 2)

```bash
cd homework-3/app/frontend
npm ci
npm run dev                  # UI on http://localhost:5173
```

Open **http://localhost:5173** and log in with the seeded demo user:

> **Email:** `demo@horizon.app`
> **Password:** `HorizonDemo1!`

Vite proxies `/api/*` to the backend on port 3000, so no frontend configuration is needed.

### Frontend without a backend (mock mode)

For a standalone UI demo (screenshots, no API running):

```bash
cd homework-3/app/frontend
npm run dev:mock             # in-memory mock API, any credentials accepted
```

## 3. What to try (demo walkthrough)

1. **Dashboard** — net-worth trajectory chart over the projection horizon, headline stats, goal cards with progress and outcome badges, the assumptions chips (inflation / return / income growth), and the mandatory projection disclaimer.
2. **Profile** — edit incomes/expenses/assets/liabilities and assumptions; saving triggers an immediate forecast recalculation (watch the staleness badge flip).
3. **Goals** — create a goal (e.g., "Car", €15,000, priority 4). Try a target month in the past to see the `GOAL_TARGET_IN_PAST` validation error rendered inline.
4. **What if?** — run the canonical scenarios (salary +15%, cut an expense, one-time purchase, early loan payoff) and compare baseline vs. scenario net-worth curves plus per-goal completion deltas ("House down payment: 16 months sooner").

## 4. Running the tests

**Backend** (engine unit tests, fast-check property invariants, golden persona fixtures — uses a throwaway `test.db`, no services needed):

```bash
cd homework-3/app/backend
npm test
```

**Frontend** (money parser/formatter, goal-card and scenario-table rendering, disclaimer wiring):

```bash
cd homework-3/app/frontend
npm test
```

## 5. Optional: spec-compliant PostgreSQL path

The spec targets PostgreSQL 16; SQLite is the local-demo substitution. With Docker available:

```bash
cd homework-3/app
docker compose up -d         # PostgreSQL 16 + Redis 7
```

Then in `app/backend`: set `DATABASE_URL` to the Postgres URL from `docker-compose.yml`, change the `provider` in `prisma/schema.prisma` from `sqlite` to `postgresql`, and re-run `npx prisma migrate dev && npm run seed`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE: 3000` | Another backend instance is running — `pkill -f "node dist/main.js"` |
| Login fails with the demo user | Seed didn't run — `npm run seed` in `app/backend` |
| Frontend shows network errors | Backend not running on port 3000, or you meant `npm run dev:mock` |
| Prisma client errors after pulling changes | `npx prisma generate && npx prisma migrate dev` |
| Stale/odd demo data in `dev.db` | Reset: stop the backend, `rm prisma/dev.db`, then `npx prisma migrate dev && npm run seed` |
