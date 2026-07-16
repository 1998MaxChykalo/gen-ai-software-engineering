<!-- Generated with Claude Sonnet 5 as part of the multi-model documentation workflow (see PLAN.md §6) -->

# How to Run — Intelligent Customer Support System

Audience: **graders and anyone else** setting this project up for the first time.

## Prerequisites

- Python 3.9 or newer (verified against Python 3.9.6; the project uses no syntax newer than that).
- `pip` for installing dependencies.
- No external services, database, or API keys are required — storage is in-memory and the classifier is rule-based.

## Environment setup

From the `homework-2/` directory:

```bash
cd homework-2

# 1. Create a virtual environment
python3 -m venv .venv

# 2. Activate it
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt
```

`requirements.txt` pins: `fastapi`, `uvicorn[standard]`, `pydantic[email]`, `python-multipart`, `pytest`, `pytest-cov`, `httpx`.

## Starting the server

```bash
source .venv/bin/activate
uvicorn src.main:app --reload --port 8000
```

The server listens on `http://localhost:8000`. `--reload` auto-restarts on code changes and is optional for grading.

### Verify it's up

```bash
curl http://localhost:8000/
```

Expected response:

```json
{"name": "Intelligent Customer Support System", "docs": "/docs", "version": "1.0.0"}
```

Or open `http://localhost:8000/docs` in a browser for the interactive Swagger UI, which lists all 7 endpoints and lets you execute requests directly.

## Running the tests

```bash
source .venv/bin/activate
pytest
```

Expected output: `70 passed` in about 2 seconds.

### With coverage report

```bash
source .venv/bin/activate
pytest --cov=src --cov-report=term-missing --cov-report=html --cov-fail-under=85
```

Expected summary:

```
70 passed in ~2s

---------- coverage: platform darwin, python 3.9.x -----------
Name                             Stmts   Miss  Cover
--------------------------------------------------------------
TOTAL                              531     16    97%
```

Actual measured coverage is **96.99%**, well above the `--cov-fail-under=85` gate. Open `htmlcov/index.html` in a browser for a line-by-line breakdown per module.

## Try it in 2 minutes

With the server running (`uvicorn src.main:app --reload --port 8000`) and `tests/fixtures/sample_tickets.csv` available, run the following from the `homework-2/` directory.

**1. Create a ticket**

```bash
curl -X POST http://localhost:8000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST-1000",
    "customer_email": "alice.nguyen@example.com",
    "customer_name": "Alice Nguyen",
    "subject": "Cannot log in to my account",
    "description": "I forgot my password and cannot access my account, this is critical."
  }'
```

Note the `id` in the response for the next step (or skip straight to auto-classify-on-create below).

**2. Auto-classify it**

```bash
# Replace TICKET_ID with the id returned above
curl -X POST http://localhost:8000/tickets/TICKET_ID/auto-classify
```

Expected: `category: "account_access"`, `priority: "urgent"`, plus `confidence`, `reasoning`, and `keywords_found`.

Or combine steps 1 and 2 in one call using the `auto_classify` flag:

```bash
curl -X POST "http://localhost:8000/tickets?auto_classify=true" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST-1001",
    "customer_email": "bob.smith@example.com",
    "customer_name": "Bob Smith",
    "subject": "Refund request for duplicate charge",
    "description": "I was charged twice for the same subscription, please issue a refund."
  }'
```

**3. Bulk-import the sample CSV (50 tickets)**

```bash
curl -X POST http://localhost:8000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.csv;type=text/csv"
```

Expected: `{"total_records": 50, "successful": 50, "failed": 0, "errors": []}`.

**4. List with filters**

```bash
# All tickets
curl http://localhost:8000/tickets

# Filter by category and priority
curl "http://localhost:8000/tickets?category=billing_question&priority=urgent"

# Free-text search + pagination
curl "http://localhost:8000/tickets?q=refund&limit=5&offset=0"
```

That's it — you've created a ticket, classified it, imported 50 more from a file, and filtered the results.
