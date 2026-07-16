"""End-to-end workflow tests spanning multiple endpoints."""
from __future__ import annotations

import threading

from fastapi.testclient import TestClient

from src import classifier
from .conftest import make_ticket_payload, upload_file


def test_full_ticket_lifecycle(client: TestClient):
    # Create.
    created = client.post(
        "/tickets",
        json=make_ticket_payload(
            subject="Cannot log in, this is critical",
            description="I forgot my password and cannot access my account, this is critical.",
        ),
    ).json()
    ticket_id = created["id"]
    assert created["status"] == "new"

    # Classify.
    classify_response = client.post(f"/tickets/{ticket_id}/auto-classify")
    assert classify_response.status_code == 200
    assert classify_response.json()["category"] == "account_access"

    # Assign.
    assign_response = client.put(f"/tickets/{ticket_id}", json={"assigned_to": "agent-7"})
    assert assign_response.json()["assigned_to"] == "agent-7"

    # Resolve.
    resolve_response = client.put(f"/tickets/{ticket_id}", json={"status": "resolved"})
    resolved_body = resolve_response.json()
    assert resolved_body["status"] == "resolved"
    assert resolved_body["resolved_at"] is not None

    # Close.
    close_response = client.put(f"/tickets/{ticket_id}", json={"status": "closed"})
    closed_body = close_response.json()
    assert closed_body["status"] == "closed"
    # Closing after resolving keeps the resolution timestamp (it's not a reopen).
    assert closed_body["resolved_at"] is not None

    # Reopening (e.g. back to in_progress) clears the resolution timestamp.
    reopen_response = client.put(f"/tickets/{ticket_id}", json={"status": "in_progress"})
    assert reopen_response.json()["resolved_at"] is None


def test_bulk_import_with_auto_classification(client: TestClient):
    response = upload_file(client, "sample_tickets.csv", params={"auto_classify": "true"})
    assert response.status_code == 200
    summary = response.json()
    assert summary["successful"] == 50

    tickets = client.get("/tickets").json()
    assert len(tickets) == 50
    classified = [t for t in tickets if t["classification"] is not None]
    assert len(classified) == 50
    categories_seen = {t["classification"]["category"] for t in classified}
    assert len(categories_seen) > 1  # varied sample data produces varied categories


def test_concurrent_ticket_creation(client: TestClient):
    thread_count = 25
    results = []
    lock = threading.Lock()

    def create_one(index: int) -> None:
        response = client.post(
            "/tickets", json=make_ticket_payload(customer_id=f"CUST-CONCURRENT-{index}")
        )
        with lock:
            results.append(response.status_code)

    threads = [threading.Thread(target=create_one, args=(i,)) for i in range(thread_count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == thread_count
    assert all(status == 201 for status in results)

    tickets = client.get("/tickets").json()
    assert len(tickets) == thread_count
    # Every ticket got a unique id — no lost updates under concurrent writes.
    assert len({t["id"] for t in tickets}) == thread_count


def test_combined_category_and_priority_filter(client: TestClient):
    client.post(
        "/tickets",
        json=make_ticket_payload(
            customer_id="A", category="billing_question", priority="urgent"
        ),
    )
    client.post(
        "/tickets",
        json=make_ticket_payload(
            customer_id="B", category="billing_question", priority="low"
        ),
    )
    client.post(
        "/tickets",
        json=make_ticket_payload(
            customer_id="C", category="technical_issue", priority="urgent"
        ),
    )

    response = client.get(
        "/tickets", params={"category": "billing_question", "priority": "urgent"}
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["customer_id"] == "A"


def test_manual_override_after_auto_classify_persists_and_logged(client: TestClient):
    created = client.post(
        "/tickets?auto_classify=true",
        json=make_ticket_payload(
            subject="Refund request for duplicate charge",
            description="I was charged twice for the same subscription, please issue a refund.",
        ),
    ).json()
    assert created["category"] == "billing_question"

    override_response = client.put(
        f"/tickets/{created['id']}",
        json={"category": "technical_issue", "priority": "high"},
    )
    assert override_response.status_code == 200
    overridden = override_response.json()
    assert overridden["category"] == "technical_issue"
    assert overridden["priority"] == "high"

    # The override persists on subsequent reads.
    fetched = client.get(f"/tickets/{created['id']}").json()
    assert fetched["category"] == "technical_issue"

    # The override was logged as a manual decision.
    override_entries = [
        entry
        for entry in classifier.classification_log
        if entry["ticket_id"] == created["id"] and entry["manual_override"]
    ]
    assert len(override_entries) == 1
    assert override_entries[0]["category"] == "technical_issue"
