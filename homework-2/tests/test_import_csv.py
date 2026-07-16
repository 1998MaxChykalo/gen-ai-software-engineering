"""CSV import tests: happy path, partial failures, and malformed-input handling."""
from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import upload_file


def test_import_csv_50_rows_happy_path(client: TestClient):
    response = upload_file(client, "sample_tickets.csv")
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 50
    assert body["successful"] == 50
    assert body["failed"] == 0
    assert body["errors"] == []

    listed = client.get("/tickets").json()
    assert len(listed) == 50


def test_import_csv_mixed_valid_invalid_summary(client: TestClient):
    response = upload_file(client, "invalid_tickets.csv")
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 7
    assert body["successful"] == 3
    assert body["failed"] == 4
    assert len(body["errors"]) == 4


def test_import_csv_missing_required_column(client: TestClient, tmp_path):
    content = "customer_id,customer_email,customer_name,subject\nCUST-1,a@example.com,A,Hi\n"
    files = {"file": ("bad_columns.csv", content.encode("utf-8"), "text/csv")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "import_parse_error"
    assert "description" in body["error"]["message"]


def test_import_csv_malformed_file_400(client: TestClient):
    response = upload_file(client, "malformed.csv")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "import_parse_error"


def test_import_csv_empty_file(client: TestClient):
    files = {"file": ("empty.csv", b"", "text/csv")}
    response = client.post("/tickets/import", files=files)
    assert response.status_code == 200
    body = response.json()
    assert body["total_records"] == 0
    assert body["successful"] == 0
    assert body["failed"] == 0


def test_import_csv_error_details_shape(client: TestClient):
    response = upload_file(client, "invalid_tickets.csv")
    body = response.json()
    for error in body["errors"]:
        assert "record" in error
        assert "reason" in error
        assert isinstance(error["record"], dict)
        assert isinstance(error["reason"], str)
        assert error["reason"]
