"""Performance smoke tests.

Thresholds are intentionally generous (well above the numbers in TASKS.md) so
these never flake on a loaded CI runner or sandboxed environment — the goal
is to catch gross regressions (e.g. an accidental O(n^2) scan), not to be a
tight benchmark.
"""
from __future__ import annotations

import time

from fastapi.testclient import TestClient

from src.classifier import classify
from .conftest import make_ticket_payload, upload_file


def test_single_create_under_threshold(client: TestClient):
    start = time.perf_counter()
    response = client.post("/tickets", json=make_ticket_payload())
    elapsed = time.perf_counter() - start

    assert response.status_code == 201
    assert elapsed < 0.5  # 500 ms — generous vs. the 50 ms target in TASKS.md


def test_csv_import_50_records_under_threshold(client: TestClient):
    start = time.perf_counter()
    response = upload_file(client, "sample_tickets.csv")
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert response.json()["successful"] == 50
    assert elapsed < 5.0  # 5 s — generous vs. the 2 s target in TASKS.md


def test_list_1000_tickets_under_threshold(client: TestClient):
    for i in range(1000):
        client.post("/tickets", json=make_ticket_payload(customer_id=f"CUST-{i}"))

    start = time.perf_counter()
    response = client.get("/tickets", params={"limit": 1000})
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert len(response.json()) == 1000
    assert elapsed < 2.0  # 2 s — generous vs. the 500 ms target in TASKS.md


def test_classification_under_threshold():
    start = time.perf_counter()
    result = classify(
        "Cannot log in to my account",
        "I forgot my password and cannot access my account, this is critical.",
    )
    elapsed = time.perf_counter() - start

    assert result.category is not None
    assert elapsed < 0.05  # 50 ms — generous vs. the 10 ms target in TASKS.md


def test_100_sequential_requests_throughput(client: TestClient):
    start = time.perf_counter()
    for i in range(100):
        response = client.post("/tickets", json=make_ticket_payload(customer_id=f"CUST-{i}"))
        assert response.status_code == 201
    elapsed = time.perf_counter() - start

    assert elapsed < 10.0  # generous ceiling for 100 sequential round-trips
