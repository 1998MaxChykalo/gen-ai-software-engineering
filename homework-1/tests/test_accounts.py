"""Tests for account balance and summary aggregation."""
from tests.conftest import make_transaction


def test_balance_reflects_inflows_and_outflows(client):
    # ACC-AAA receives 100, then sends 30 -> balance 70.
    client.post("/transactions", json=make_transaction(
        fromAccount="ACC-BANK", toAccount="ACC-AAA", amount=100, type="deposit"))
    client.post("/transactions", json=make_transaction(
        fromAccount="ACC-AAA", toAccount="ACC-BBB", amount=30, type="transfer"))

    resp = client.get("/accounts/ACC-AAA/balance")
    assert resp.status_code == 200
    body = resp.json()
    assert body["accountId"] == "ACC-AAA"
    assert float(body["balance"]) == 70.0


def test_balance_zero_for_unknown_account(client):
    resp = client.get("/accounts/ACC-NOBODY/balance")
    assert resp.status_code == 200
    assert float(resp.json()["balance"]) == 0.0


def test_summary_aggregates(client):
    client.post("/transactions", json=make_transaction(
        fromAccount="ACC-BANK", toAccount="ACC-AAA", amount=200, type="deposit"))
    client.post("/transactions", json=make_transaction(
        fromAccount="ACC-AAA", toAccount="ACC-BBB", amount=50, type="withdrawal"))

    resp = client.get("/accounts/ACC-AAA/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["accountId"] == "ACC-AAA"
    assert float(body["totalDeposits"]) == 200.0
    assert float(body["totalWithdrawals"]) == 50.0
    assert body["transactionCount"] == 2
    assert body["mostRecentTransactionDate"] is not None


def test_summary_empty_account(client):
    resp = client.get("/accounts/ACC-EMPTY/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["transactionCount"] == 0
    assert float(body["totalDeposits"]) == 0.0
    assert body["mostRecentTransactionDate"] is None
