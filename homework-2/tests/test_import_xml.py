"""XML import tests: happy path, partial failures, and malformed-input handling."""
from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import upload_file


def test_import_xml_30_records_happy_path(client: TestClient):
    response = upload_file(client, "sample_tickets.xml")
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 30
    assert body["successful"] == 30
    assert body["failed"] == 0

    listed = client.get("/tickets").json()
    assert len(listed) == 30


def test_import_xml_partial_failures(client: TestClient):
    response = upload_file(client, "invalid_tickets.xml")
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 6
    assert body["successful"] == 2
    assert body["failed"] == 4


def test_import_xml_bad_root_element(client: TestClient):
    content = b"<?xml version='1.0'?><notes><note>hello</note></notes>"
    files = {"file": ("bad_root.xml", content, "application/xml")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "import_parse_error"
    assert "tickets" in body["error"]["message"]


def test_import_xml_malformed_400(client: TestClient):
    response = upload_file(client, "malformed.xml")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "import_parse_error"


def test_import_xml_missing_fields_per_record(client: TestClient):
    response = upload_file(client, "invalid_tickets.xml")
    body = response.json()
    reasons = " ".join(error["reason"] for error in body["errors"])
    assert "customer_id" in reasons or "Field required" in reasons


def test_import_detects_xml_by_content_type(client: TestClient):
    """A file with no recognizable extension falls back to the content-type header."""
    content = (
        b"<tickets><ticket><customer_id>CUST-9</customer_id>"
        b"<customer_email>c@example.com</customer_email><customer_name>C</customer_name>"
        b"<subject>Content-type routed record</subject>"
        b"<description>This file has no extension so the content-type header picks XML.</description>"
        b"</ticket></tickets>"
    )
    files = {"file": ("data", content, "application/xml")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 200
    assert response.json()["successful"] == 1
