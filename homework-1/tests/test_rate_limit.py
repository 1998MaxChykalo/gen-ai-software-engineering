"""Test the per-IP rate limiting middleware (Task 4, Option D).

Uses a dedicated app with a low threshold so the test is fast and does not
consume the shared app's request budget (which could make other tests flaky).
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.main import app as main_app
from src.rate_limit import RateLimitMiddleware


def _app_with_limit(max_requests: int) -> FastAPI:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, max_requests=max_requests, window_seconds=60)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return app


def test_allows_up_to_limit_then_blocks():
    client = TestClient(_app_with_limit(max_requests=3))
    statuses = [client.get("/ping").status_code for _ in range(4)]
    assert statuses[:3] == [200, 200, 200]
    assert statuses[3] == 429


def test_429_includes_retry_after_header():
    client = TestClient(_app_with_limit(max_requests=1))
    client.get("/ping")
    resp = client.get("/ping")
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


def test_middleware_is_registered_on_main_app():
    assert any(m.cls is RateLimitMiddleware for m in main_app.user_middleware)
