"""FastAPI application entrypoint for the Intelligent Customer Support System.

Run with:  uvicorn src.main:app --reload   (from the homework-2 directory)
"""
from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .routes import tickets

app = FastAPI(
    title="Intelligent Customer Support System",
    description="Homework 2 — multi-format ticket import, auto-classification, and search.",
    version="1.0.0",
)

app.include_router(tickets.router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Reshape HTTPException.detail into the spec's error envelope.

    Routes raise ``HTTPException(detail={"code", "message", "details"})``; any
    other detail shape (e.g. FastAPI's own 404 for an unmatched path) is
    wrapped so every error response has the same ``{"error": {...}}`` shape.
    """
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        error = detail
    else:
        error = {"code": "http_error", "message": str(detail), "details": None}

    return JSONResponse(status_code=exc.status_code, content={"error": error})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Reshape FastAPI/Pydantic validation errors into the spec's error envelope."""
    details = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        field = loc[-1] if loc else "request"
        message = err.get("msg", "Invalid value")
        if message.startswith("Value error, "):
            message = message[len("Value error, "):]
        details.append({"field": field, "message": message})

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request validation failed",
                "details": details,
            }
        },
    )


@app.get("/", tags=["meta"])
def root() -> dict:
    return {"name": "Intelligent Customer Support System", "docs": "/docs", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
