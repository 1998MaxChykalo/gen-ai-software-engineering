"""API endpoint tests for /tickets — status codes and behavior."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from .conftest import make_ticket_payload


def test_create_ticket_success(client: TestClient):
    response = client.post("/tickets", json=make_ticket_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["customer_id"] == "CUST-0001"
    assert body["status"] == "new"
    assert body["priority"] == "medium"
    assert body["category"] == "other"
    assert body["tags"] == []
    assert uuid.UUID(body["id"])  # valid UUID


def test_create_ticket_invalid_email_and_description(client: TestClient):
    bad_email = client.post("/tickets", json=make_ticket_payload(customer_email="not-an-email"))
    assert bad_email.status_code in (400, 422)
    assert "error" in bad_email.json()

    short_description = client.post(
        "/tickets", json=make_ticket_payload(description="short")
    )
    assert short_description.status_code in (400, 422)
    assert "error" in short_description.json()


def test_create_ticket_with_auto_classify_flag(client: TestClient):
    payload = make_ticket_payload(
        subject="Cannot log in to my account",
        description="I forgot my password and cannot access my account, this is critical.",
    )
    response = client.post("/tickets?auto_classify=true", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "account_access"
    assert body["classification"] is not None
    assert body["classification"]["category"] == "account_access"
    assert 0.0 <= body["classification"]["confidence"] <= 1.0


def test_list_tickets_returns_all(client: TestClient):
    client.post("/tickets", json=make_ticket_payload(customer_id="CUST-A"))
    client.post("/tickets", json=make_ticket_payload(customer_id="CUST-B"))

    response = client.get("/tickets")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2


def test_list_tickets_with_filter(client: TestClient):
    client.post(
        "/tickets",
        json=make_ticket_payload(customer_id="CUST-A", category="billing_question"),
    )
    client.post(
        "/tickets",
        json=make_ticket_payload(customer_id="CUST-B", category="technical_issue"),
    )

    response = client.get("/tickets", params={"category": "billing_question"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["customer_id"] == "CUST-A"


def test_get_ticket_by_id(client: TestClient):
    created = client.post("/tickets", json=make_ticket_payload()).json()

    response = client.get(f"/tickets/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_ticket_not_found(client: TestClient):
    missing_id = str(uuid.uuid4())
    response = client.get(f"/tickets/{missing_id}")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "ticket_not_found"


def test_get_ticket_invalid_uuid_returns_422(client: TestClient):
    response = client.get("/tickets/not-a-valid-uuid")
    assert response.status_code == 422
    assert body_has_validation_error(response.json())


def body_has_validation_error(body: dict) -> bool:
    return "error" in body and body["error"]["code"] == "validation_error"


def test_put_update_ticket(client: TestClient):
    created = client.post("/tickets", json=make_ticket_payload()).json()

    response = client.put(
        f"/tickets/{created['id']}",
        json={"status": "in_progress", "assigned_to": "agent-42"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "in_progress"
    assert body["assigned_to"] == "agent-42"
    assert body["updated_at"] != created["updated_at"] or body["updated_at"] >= created["created_at"]


def test_put_update_ticket_not_found(client: TestClient):
    missing_id = str(uuid.uuid4())
    response = client.put(f"/tickets/{missing_id}", json={"status": "resolved"})
    assert response.status_code == 404


def test_delete_ticket_204(client: TestClient):
    created = client.post("/tickets", json=make_ticket_payload()).json()

    response = client.delete(f"/tickets/{created['id']}")
    assert response.status_code == 204

    follow_up = client.get(f"/tickets/{created['id']}")
    assert follow_up.status_code == 404


def test_delete_ticket_not_found(client: TestClient):
    missing_id = str(uuid.uuid4())
    response = client.delete(f"/tickets/{missing_id}")
    assert response.status_code == 404


def test_auto_classify_endpoint(client: TestClient):
    created = client.post(
        "/tickets",
        json=make_ticket_payload(
            subject="Refund request for duplicate charge",
            description="I was charged twice for the same subscription, please issue a refund.",
        ),
    ).json()

    response = client.post(f"/tickets/{created['id']}/auto-classify")
    assert response.status_code == 200
    body = response.json()
    assert body["category"] == "billing_question"
    assert "keywords_found" in body
    assert "reasoning" in body

    # The classification result is persisted on the ticket.
    fetched = client.get(f"/tickets/{created['id']}").json()
    assert fetched["category"] == "billing_question"
    assert fetched["classification"]["category"] == "billing_question"


def test_list_tickets_pagination(client: TestClient):
    for i in range(5):
        client.post("/tickets", json=make_ticket_payload(customer_id=f"CUST-{i}"))

    response = client.get("/tickets", params={"limit": 2, "offset": 1})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2


def test_auto_classify_not_found(client: TestClient):
    response = client.post(f"/tickets/{uuid.uuid4()}/auto-classify")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ticket_not_found"


def test_root_endpoint(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["name"] == "Intelligent Customer Support System"


def test_unmatched_route_uses_error_envelope(client: TestClient):
    response = client.get("/this-route-does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "http_error"


def test_list_tickets_with_status_assigned_tag_and_query_filters(client: TestClient):
    client.post(
        "/tickets",
        json=make_ticket_payload(
            customer_id="CUST-X",
            subject="Refund needed for billing error",
            status="in_progress",
            assigned_to="agent-1",
            tags=["vip"],
        ),
    )
    client.post(
        "/tickets",
        json=make_ticket_payload(
            customer_id="CUST-Y",
            subject="Something else entirely",
            status="new",
            assigned_to="agent-2",
            tags=["beta"],
        ),
    )

    by_status = client.get("/tickets", params={"status": "in_progress"}).json()
    assert len(by_status) == 1 and by_status[0]["customer_id"] == "CUST-X"

    by_assigned = client.get("/tickets", params={"assigned_to": "agent-2"}).json()
    assert len(by_assigned) == 1 and by_assigned[0]["customer_id"] == "CUST-Y"

    by_tag = client.get("/tickets", params={"tag": "vip"}).json()
    assert len(by_tag) == 1 and by_tag[0]["customer_id"] == "CUST-X"

    by_query = client.get("/tickets", params={"q": "refund"}).json()
    assert len(by_query) == 1 and by_query[0]["customer_id"] == "CUST-X"
