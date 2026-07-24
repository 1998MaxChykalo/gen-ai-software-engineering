"""Shared pytest fixtures for the Intelligent Customer Support System tests."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from src import classifier, store
from src.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def clean_state():
    """Reset the in-memory store and classification log before/after every test."""
    store.reset()
    classifier.reset_log()
    yield
    store.reset()
    classifier.reset_log()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def make_ticket_payload(**overrides) -> dict:
    """Build a valid ``TicketCreate`` payload, with optional field overrides."""
    payload = {
        "customer_id": "CUST-0001",
        "customer_email": "jane.doe@example.com",
        "customer_name": "Jane Doe",
        "subject": "Help with my account",
        "description": "I need some help understanding how to configure my account settings.",
    }
    payload.update(overrides)
    return payload


def fixture_path(name: str) -> Path:
    return FIXTURES_DIR / name


def fixture_bytes(name: str) -> bytes:
    return fixture_path(name).read_bytes()


def upload_file(client: TestClient, name: str, *, content_type: Optional[str] = None, params: Optional[dict] = None):
    """POST a fixture file to /tickets/import and return the response."""
    content = fixture_bytes(name)
    guessed_type = content_type
    if guessed_type is None:
        if name.endswith(".csv"):
            guessed_type = "text/csv"
        elif name.endswith(".json"):
            guessed_type = "application/json"
        elif name.endswith(".xml"):
            guessed_type = "application/xml"
        else:
            guessed_type = "application/octet-stream"

    files = {"file": (name, content, guessed_type)}
    return client.post("/tickets/import", files=files, params=params or {})
