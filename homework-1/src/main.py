"""FastAPI application entrypoint for the Banking Transactions API.

Run with:  uvicorn src.main:app --reload   (from the homework-1 directory)
"""
from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .rate_limit import RateLimitMiddleware
from .routes import accounts, transactions

app = FastAPI(
    title="Banking Transactions API",
    description="Homework 1 — a minimal REST API for banking transactions.",
    version="1.0.0",
)

# 100 requests per minute per IP (Task 4, Option D).
app.add_middleware(RateLimitMiddleware, max_requests=100, window_seconds=60)

app.include_router(transactions.router)
app.include_router(accounts.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Reshape FastAPI/Pydantic validation errors into the spec's format:

    {"error": "Validation failed", "details": [{"field": ..., "message": ...}]}
    """
    details = []
    for err in exc.errors():
        # loc looks like ("body", "amount"); take the last meaningful segment.
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        field = loc[-1] if loc else "request"
        # Pydantic prefixes messages from custom validators with "Value error, ";
        # strip it so messages match the spec's clean format.
        message = err.get("msg", "Invalid value")
        if message.startswith("Value error, "):
            message = message[len("Value error, "):]
        details.append({"field": field, "message": message})

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": "Validation failed", "details": details},
    )


@app.get("/", tags=["meta"])
def root() -> dict:
    return {"name": "Banking Transactions API", "docs": "/docs", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
