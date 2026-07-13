# 🏦 Homework 1: Banking Transactions API

> **Student Name**: Maksym Chykalo
> **Date Submitted**: 2026-06-30
> **AI Tools Used**: Claude Code (Anthropic)

---

## 📋 Project Overview

A minimal REST API for banking transactions built with **Python + FastAPI**, using
in-memory storage. It supports creating and querying transactions, computing account
balances, filtering transaction history, and three additional features: an account
**summary** endpoint, **CSV export**, and per-IP **rate limiting**.

FastAPI was chosen because Pydantic models map cleanly onto the required transaction
schema and validation rules, and FastAPI auto-generates interactive API docs at
`/docs` (Swagger UI) — useful both for manual testing and for the required screenshots.

## ✨ Features Implemented

### Task 1 — Core API ⭐
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/transactions` | Create a new transaction (`201`) |
| `GET` | `/transactions` | List all transactions (supports filters) |
| `GET` | `/transactions/{id}` | Get a transaction by id (`404` if missing) |
| `GET` | `/accounts/{accountId}/balance` | Computed account balance |

- In-memory storage (a Python list) — no database.
- Positive-amount validation, appropriate status codes (200/201/400/404), error handling.

### Task 2 — Validation ✅
- **Amount**: positive, at most 2 decimal places (stored as `Decimal`, never `float`).
- **Account**: must match `ACC-XXXXX` (alphanumeric suffix).
- **Currency**: must be a valid ISO 4217 code (e.g. USD, EUR, GBP, JPY); lowercase is normalized.
- Validation errors return the spec's shape:
  ```json
  {
    "error": "Validation failed",
    "details": [
      {"field": "amount", "message": "Amount must be a positive number"},
      {"field": "currency", "message": "Invalid currency code"}
    ]
  }
  ```

### Task 3 — Transaction History 📜
`GET /transactions` supports combinable filters:
- `?accountId=ACC-12345` (matches source or destination)
- `?type=transfer`
- `?from=2024-01-01&to=2024-01-31` (inclusive date range)

### Task 4 — Additional Features 🌟 (implemented A, C, D)
- **A. Summary** — `GET /accounts/{accountId}/summary`: total deposits, total withdrawals, transaction count, most recent transaction date.
- **C. CSV Export** — `GET /transactions/export?format=csv`: streams transactions as CSV.
- **D. Rate Limiting** — max **100 requests/minute per IP**; returns `429 Too Many Requests` when exceeded.

## 🏗️ Architecture & Decisions

```
src/
├── main.py          # FastAPI app, middleware, validation exception handler
├── models.py        # Pydantic models + enums (Decimal amounts, camelCase aliases)
├── validators.py    # Pure validation functions (amount, account, currency)
├── store.py         # In-memory store + balance/summary aggregation
├── rate_limit.py    # Per-IP sliding-window rate-limit middleware
└── routes/
    ├── transactions.py  # create, list (filters), get-by-id, CSV export
    └── accounts.py      # balance, summary
```

Key decisions:
- **`Decimal` for money** — avoids floating-point rounding errors in financial data.
- **camelCase JSON, snake_case Python** — Pydantic field aliases keep the public API matching the spec (`fromAccount`/`toAccount`) while keeping idiomatic Python internally.
- **Validation as pure functions** — `validators.py` is independently unit-testable and reused by the models.
- **Balance convention** — only `completed` transactions count; an account is credited when it is the `toAccount` and debited when it is the `fromAccount`.
- **Route ordering** — `/transactions/export` is declared before `/transactions/{id}` so the literal path isn't captured as an id.
- **Port 8000** — the API runs on `8000` (uvicorn default). The task's sample curl mentions `3000`; adjust the port in those examples accordingly.

## 🤖 How AI Was Used

- Generated the initial FastAPI scaffolding, Pydantic models, and validation logic from the task spec via Claude Code.
- Iterated on edge cases (2-decimal-place enforcement using `Decimal` exponents, reshaping Pydantic's `RequestValidationError` into the spec's `{error, details[]}` format, route ordering for the export path).
- Generated the pytest suite (CRUD, validation, filtering, balance/summary, rate limiting) and the demo files.
- All generated code was reviewed and verified by running the test suite and exercising the API manually. See `docs/screenshots/` for AI-interaction evidence.

## 🧪 Tests

`pytest` covers happy paths, every validation rule (→ 400 with `details`), filtering, balance/summary math, not-found handling, and rate limiting. See **HOWTORUN.md** for how to run them.

## 📸 Screenshots

[`docs/screenshots/`](docs/screenshots/) contains a screenshot for **every implemented task**
(create/list/get-by-id/balance, validation 400, filtering, summary, CSV export, and the 429
rate limit) — each showing a real request and server response in the Swagger UI. See
[`docs/screenshots/README.md`](docs/screenshots/README.md) for the task-by-task index. They
were generated with [`demo/capture_screenshots.py`](demo/capture_screenshots.py) (Playwright).

---

<div align="center">

*This project was completed as part of the AI-Assisted Development course.*

</div>
