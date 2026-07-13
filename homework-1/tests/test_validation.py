"""Tests for transaction validation rules and the error response shape."""
import pytest

from tests.conftest import make_transaction


def _field_messages(body: dict) -> dict:
    return {d["field"]: d["message"] for d in body["details"]}


def test_negative_amount_rejected(client):
    resp = client.post("/transactions", json=make_transaction(amount=-5))
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "Validation failed"
    assert "amount" in _field_messages(body)


def test_zero_amount_rejected(client):
    resp = client.post("/transactions", json=make_transaction(amount=0))
    assert resp.status_code == 400


def test_more_than_two_decimal_places_rejected(client):
    resp = client.post("/transactions", json=make_transaction(amount=10.123))
    assert resp.status_code == 400
    assert "amount" in _field_messages(resp.json())


@pytest.mark.parametrize("bad_account", ["12345", "ACC_12345", "ACC-", "ABC-12345"])
def test_invalid_account_format_rejected(client, bad_account):
    resp = client.post("/transactions", json=make_transaction(fromAccount=bad_account))
    assert resp.status_code == 400
    assert "from_account" in _field_messages(resp.json()) or "fromAccount" in _field_messages(resp.json())


def test_invalid_currency_rejected(client):
    resp = client.post("/transactions", json=make_transaction(currency="XYZ"))
    assert resp.status_code == 400
    assert "currency" in _field_messages(resp.json())


def test_invalid_type_rejected(client):
    resp = client.post("/transactions", json=make_transaction(type="bogus"))
    assert resp.status_code == 400


def test_multiple_errors_reported_together(client):
    resp = client.post(
        "/transactions",
        json=make_transaction(amount=-1, currency="ZZZ"),
    )
    assert resp.status_code == 400
    fields = _field_messages(resp.json())
    assert "amount" in fields
    assert "currency" in fields


def test_valid_currency_lowercase_is_normalized(client):
    resp = client.post("/transactions", json=make_transaction(currency="usd"))
    assert resp.status_code == 201
    assert resp.json()["currency"] == "USD"
