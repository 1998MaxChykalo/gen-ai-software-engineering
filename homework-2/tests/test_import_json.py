"""JSON import tests: happy path, partial failures, and malformed-input handling."""
from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import upload_file


def test_import_json_20_records_happy_path(client: TestClient):
    response = upload_file(client, "sample_tickets.json")
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 20
    assert body["successful"] == 20
    assert body["failed"] == 0

    listed = client.get("/tickets").json()
    assert len(listed) == 20


def test_import_json_partial_failures(client: TestClient):
    response = upload_file(client, "invalid_tickets.json")
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 8
    assert body["successful"] == 3
    assert body["failed"] == 5


def test_import_json_not_an_array(client: TestClient):
    content = b'{"customer_id": "CUST-1", "subject": "not wrapped in an array"}'
    files = {"file": ("not_array.json", content, "application/json")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "import_parse_error"


def test_import_json_malformed_400(client: TestClient):
    response = upload_file(client, "malformed.json")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "import_parse_error"


def test_import_json_wrong_types(client: TestClient):
    response = upload_file(client, "invalid_tickets.json")
    body = response.json()
    reasons = " ".join(error["reason"] for error in body["errors"])
    assert "tags" in reasons


def test_import_json_empty_file(client: TestClient):
    files = {"file": ("empty.json", b"", "application/json")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 200
    body = response.json()
    assert body == {"total_records": 0, "successful": 0, "failed": 0, "errors": []}


def test_import_json_tickets_wrapper_key(client: TestClient):
    content = b'{"tickets": [{"customer_id": "CUST-1", "customer_email": "a@example.com", "customer_name": "A", "subject": "Wrapped record", "description": "This record is wrapped in a top-level tickets key."}]}'
    files = {"file": ("wrapped.json", content, "application/json")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 1
    assert body["successful"] == 1


def test_import_json_item_not_object(client: TestClient):
    content = b"[1, 2, 3]"
    files = {"file": ("not_objects.json", content, "application/json")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "import_parse_error"


def test_import_detects_json_by_content_sniffing(client: TestClient):
    """A file with no recognizable extension is sniffed from its leading byte."""
    content = b'[{"customer_id": "CUST-2", "customer_email": "b@example.com", "customer_name": "B", "subject": "Sniffed record", "description": "This file has no extension and a generic content type."}]'
    files = {"file": ("data", content, "application/octet-stream")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 200
    assert response.json()["successful"] == 1
