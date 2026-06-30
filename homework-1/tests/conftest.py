"""Shared pytest fixtures."""
import pytest
from fastapi.testclient import TestClient

from src import store
from src.main import app


@pytest.fixture(autouse=True)
def clean_store():
    """Reset the in-memory store before and after every test."""
    store.reset()
    yield
    store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def make_transaction(**overrides) -> dict:
    """Build a valid transaction payload, with optional field overrides."""
    payload = {
        "fromAccount": "ACC-12345",
        "toAccount": "ACC-67890",
        "amount": 100.50,
        "currency": "USD",
        "type": "transfer",
    }
    payload.update(overrides)
    return payload
