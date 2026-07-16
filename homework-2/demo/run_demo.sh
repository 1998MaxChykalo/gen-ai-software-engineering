#!/usr/bin/env bash
# Demo: start the API, exercise the main flows, and shut it down.
# Run from anywhere: ./homework-2/demo/run_demo.sh
set -euo pipefail

HW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$HW_DIR/.venv/bin/python"
BASE_URL="http://localhost:8000"

if [ ! -x "$PYTHON" ]; then
  echo "No venv found. Set it up first:"
  echo "  cd $HW_DIR && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "==> Starting server (logs: /tmp/hw2-demo-server.log)..."
(cd "$HW_DIR" && exec "$PYTHON" -m uvicorn src.main:app --port 8000) \
  >/tmp/hw2-demo-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "$BASE_URL/docs" >/dev/null 2>&1 && break
  sleep 0.5
done

echo
echo "==> 1. Create a ticket with auto-classification"
TICKET=$(curl -sf -X POST "$BASE_URL/tickets?auto_classify=true" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "demo-001",
    "customer_email": "demo@example.com",
    "customer_name": "Demo User",
    "subject": "Cannot login after password reset",
    "description": "I reset my password but still cannot access my account. This is urgent, I am locked out.",
    "metadata": {"source": "api", "device_type": "desktop"}
  }')
echo "$TICKET" | "$PYTHON" -m json.tool
TICKET_ID=$(echo "$TICKET" | "$PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["id"])')

echo
echo "==> 2. Re-run classification explicitly (POST /tickets/{id}/auto-classify)"
curl -sf -X POST "$BASE_URL/tickets/$TICKET_ID/auto-classify" | "$PYTHON" -m json.tool

echo
echo "==> 3. Bulk import 50 tickets from CSV with auto-classification"
curl -sf -X POST "$BASE_URL/tickets/import?auto_classify=true" \
  -F "file=@$HW_DIR/tests/fixtures/sample_tickets.csv" \
  | "$PYTHON" -c 'import json,sys; s=json.load(sys.stdin); print(json.dumps({k: s[k] for k in ("total_records","successful","failed")}, indent=2))'

echo
echo "==> 4. Import a file with invalid rows — per-record error report"
curl -sf -X POST "$BASE_URL/tickets/import" \
  -F "file=@$HW_DIR/tests/fixtures/invalid_tickets.csv" | "$PYTHON" -m json.tool

echo
echo "==> 5. Combined filtering: urgent account_access tickets"
curl -sf "$BASE_URL/tickets?category=account_access&priority=urgent&limit=3" \
  | "$PYTHON" -c 'import json,sys; ts=json.load(sys.stdin); print(len(ts), "shown"); [print("- [%s] %s" % (t["priority"], t["subject"])) for t in ts]'

echo
echo "==> 6. Update (manual override) and resolve the demo ticket"
curl -sf -X PUT "$BASE_URL/tickets/$TICKET_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved", "assigned_to": "agent-42"}' \
  | "$PYTHON" -c 'import json,sys; t=json.load(sys.stdin); print(json.dumps({"status": t["status"], "assigned_to": t["assigned_to"], "resolved_at": t["resolved_at"]}, indent=2))'

echo
echo "==> Demo complete."
