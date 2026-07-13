# ▶️ How to Run the Application

Banking Transactions API — Python / FastAPI.

## ✅ Prerequisites

- **Python 3.9+** (developed on 3.9.6)
- `pip` and the `venv` module (bundled with Python)

## 🔐 Environment Setup

No secrets or `.env` file are required — the app uses in-memory storage and has no
external dependencies. All you need is a virtual environment with the Python packages.

From the `homework-1/` directory:

```bash
# 1. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

## 🚀 Run the API

**Option A — one command (recommended):**

```bash
./demo/run.sh
```

This creates the venv (if missing), installs dependencies, and starts the server.

**Option B — manual (venv already active):**

```bash
uvicorn src.main:app --reload --port 8000
```

The API is now available at:
- **Base URL**: http://localhost:8000
- **Interactive docs (Swagger UI)**: http://localhost:8000/docs
- **OpenAPI schema**: http://localhost:8000/openapi.json

> ℹ️ The server runs on port **8000**. The task's sample curl commands mention port
> `3000` — substitute `8000` (or run uvicorn with `--port 3000` to match them exactly).

## 🧪 Testing Guide

With the virtual environment active and dependencies installed:

```bash
pytest -v
```

The suite (in `tests/`) covers:
- Transaction create / list / get-by-id and `404` handling
- Validation rules (amount, account format, currency) → `400` with `details`
- History filtering (account, type, date range, combined)
- Account balance and summary aggregation
- CSV export
- Per-IP rate limiting (`429`)

## 📡 Sample Requests

Quick smoke test with `curl` (server must be running):

```bash
# Create a transaction
curl -X POST http://localhost:8000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "fromAccount": "ACC-12345",
    "toAccount": "ACC-67890",
    "amount": 100.50,
    "currency": "USD",
    "type": "transfer"
  }'

# List all transactions
curl http://localhost:8000/transactions

# Filter by account
curl "http://localhost:8000/transactions?accountId=ACC-12345"

# Account balance
curl http://localhost:8000/accounts/ACC-12345/balance

# Account summary
curl http://localhost:8000/accounts/ACC-12345/summary

# Export as CSV
curl "http://localhost:8000/transactions/export?format=csv"
```

More examples (including a validation-failure case) are in
[`demo/sample-requests.http`](demo/sample-requests.http), usable with the VS Code
**REST Client** extension. Sample payloads are in [`demo/sample-data.json`](demo/sample-data.json).
