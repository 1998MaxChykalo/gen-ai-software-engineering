"""Integration tests for transaction CRUD, filtering, and CSV export."""
from tests.conftest import make_transaction


def test_create_transaction_returns_201_and_generated_fields(client):
    resp = client.post("/transactions", json=make_transaction())
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"]
    assert body["fromAccount"] == "ACC-12345"
    assert body["toAccount"] == "ACC-67890"
    assert body["status"] == "completed"
    assert body["timestamp"]


def test_get_transaction_by_id(client):
    created = client.post("/transactions", json=make_transaction()).json()
    resp = client.get(f"/transactions/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_unknown_transaction_returns_404(client):
    resp = client.get("/transactions/does-not-exist")
    assert resp.status_code == 404


def test_list_all_transactions(client):
    client.post("/transactions", json=make_transaction())
    client.post("/transactions", json=make_transaction(type="deposit"))
    resp = client.get("/transactions")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_filter_by_account(client):
    client.post("/transactions", json=make_transaction(fromAccount="ACC-AAA", toAccount="ACC-BBB"))
    client.post("/transactions", json=make_transaction(fromAccount="ACC-CCC", toAccount="ACC-DDD"))
    resp = client.get("/transactions", params={"accountId": "ACC-AAA"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["fromAccount"] == "ACC-AAA"


def test_filter_by_type(client):
    client.post("/transactions", json=make_transaction(type="deposit"))
    client.post("/transactions", json=make_transaction(type="withdrawal"))
    resp = client.get("/transactions", params={"type": "deposit"})
    assert len(resp.json()) == 1
    assert resp.json()[0]["type"] == "deposit"


def test_filter_by_date_range(client):
    client.post("/transactions", json=make_transaction())
    # A future window should exclude the just-created transaction.
    resp = client.get(
        "/transactions",
        params={"from": "2099-01-01T00:00:00", "to": "2099-12-31T00:00:00"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_combined_filters(client):
    client.post("/transactions", json=make_transaction(fromAccount="ACC-AAA", type="deposit"))
    client.post("/transactions", json=make_transaction(fromAccount="ACC-AAA", type="withdrawal"))
    client.post("/transactions", json=make_transaction(fromAccount="ACC-ZZZ", type="deposit"))
    resp = client.get("/transactions", params={"accountId": "ACC-AAA", "type": "deposit"})
    assert len(resp.json()) == 1


def test_export_csv(client):
    client.post("/transactions", json=make_transaction())
    resp = client.get("/transactions/export", params={"format": "csv"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    lines = resp.text.strip().splitlines()
    assert lines[0].startswith("id,fromAccount,toAccount,amount,currency,type")
    assert len(lines) == 2  # header + 1 transaction


def test_export_unsupported_format_returns_400(client):
    resp = client.get("/transactions/export", params={"format": "xml"})
    assert resp.status_code == 400
