# Screenshots

API screenshots captured against the running app (Swagger UI at `/docs`), generated
with [`demo/capture_screenshots.py`](../../demo/capture_screenshots.py) via Playwright.
Each shows a real **request + server response** (Swagger "Try it out" → Execute), and
the set covers **every implemented task**.

| File | Task | What it shows |
|------|------|---------------|
| `01-swagger-overview.png` | — | Full Swagger UI — all endpoints and schemas |
| `02-task1-create-transaction-201.png` | 1 | `POST /transactions` with a valid body → **201 Created** |
| `03-task1-list-transactions.png` | 1 | `GET /transactions` → list of all transactions |
| `04-task1-get-transaction-by-id.png` | 1 | `GET /transactions/{id}` → **200** single transaction |
| `05-task1-account-balance.png` | 1 | `GET /accounts/ACC-12345/balance` → computed balance |
| `06-task2-validation-error-400.png` | 2 | `POST /transactions` with bad account/amount/currency → **400** with `details[]` |
| `07-task3-filter-transactions.png` | 3 | `GET /transactions?accountId=ACC-12345` → filtered history |
| `08-task4a-account-summary.png` | 4A | `GET /accounts/ACC-12345/summary` → deposits/withdrawals/count/most-recent |
| `09-task4c-csv-export.png` | 4C | `GET /transactions/export?format=csv` → CSV body, `content-type: text/csv` |
| `10-task4d-rate-limit-429.png` | 4D | Root endpoint after exceeding 100 req/min → **429 Too Many Requests** + `Retry-After` |

To regenerate (from the `homework-1/` directory, venv active):

```bash
pip install playwright && playwright install chromium   # one-off, not part of the app deps
./demo/run.sh &                                          # start the API on :8000
# seed a few transactions via POST /transactions, then:
python demo/capture_screenshots.py
```

