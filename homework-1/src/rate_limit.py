"""Simple in-memory per-IP rate limiting (Task 4, Option D).

Sliding window: at most ``max_requests`` per ``window_seconds`` per client IP.
Over the limit returns HTTP 429. State is a dict of IP -> deque of timestamps;
this is process-local and resets on restart, which is fine for the homework.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window_start = now - self.window_seconds

        hits = self._hits[client_ip]
        # Drop timestamps that fell out of the window.
        while hits and hits[0] < window_start:
            hits.popleft()

        if len(hits) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - hits[0])) + 1
            return JSONResponse(
                status_code=429,
                content={"error": "Too Many Requests"},
                headers={"Retry-After": str(max(retry_after, 1))},
            )

        hits.append(now)
        return await call_next(request)
