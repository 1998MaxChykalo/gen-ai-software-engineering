"""All ``/tickets`` endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from .. import store
from ..classifier import classify, record_decision
from ..importers import ImportParseError, detect_format, import_records, parse_records
from ..models import (
    Category,
    ClassificationResult,
    ImportSummary,
    Priority,
    Status,
    Ticket,
    TicketCreate,
    TicketUpdate,
)

router = APIRouter(tags=["tickets"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def error_detail(code: str, message: str, details: Optional[object] = None) -> Dict:
    """Build the ``detail`` payload for ``HTTPException`` in the spec's error shape."""
    return {"code": code, "message": message, "details": details}


def _not_found(ticket_id) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=error_detail("ticket_not_found", f"Ticket '{ticket_id}' not found"),
    )


@router.post(
    "/tickets",
    response_model=Ticket,
    status_code=status.HTTP_201_CREATED,
)
def create_ticket(
    payload: TicketCreate,
    auto_classify: bool = Query(default=False),
) -> Ticket:
    ticket = Ticket.from_create(payload)
    if auto_classify:
        result = classify(ticket.subject, ticket.description)
        ticket.category = result.category
        ticket.priority = result.priority
        ticket.classification = result
        record_decision(ticket.id, result, manual_override=False)
    store.add(ticket)
    return ticket


@router.post("/tickets/import", response_model=ImportSummary)
async def import_tickets(
    file: UploadFile = File(...),
    auto_classify: bool = Query(default=False),
) -> ImportSummary:
    raw = await file.read()
    fmt = detect_format(file.filename or "", file.content_type or "", raw)

    try:
        records = parse_records(fmt, raw)
    except ImportParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_detail("import_parse_error", str(exc)),
        ) from exc

    return import_records(records, auto_classify=auto_classify)


@router.get("/tickets", response_model=List[Ticket])
def list_tickets(
    category: Optional[Category] = Query(default=None),
    priority: Optional[Priority] = Query(default=None),
    status_: Optional[Status] = Query(default=None, alias="status"),
    assigned_to: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: Optional[int] = Query(default=None, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
) -> List[Ticket]:
    return store.list_tickets(
        category=category,
        priority=priority,
        status=status_,
        assigned_to=assigned_to,
        tag=tag,
        q=q,
        limit=limit,
        offset=offset,
    )


@router.get("/tickets/{ticket_id}", response_model=Ticket)
def get_ticket(ticket_id: UUID) -> Ticket:
    ticket = store.get(str(ticket_id))
    if ticket is None:
        raise _not_found(ticket_id)
    return ticket


@router.put("/tickets/{ticket_id}", response_model=Ticket)
def update_ticket(ticket_id: UUID, payload: TicketUpdate) -> Ticket:
    ticket = store.get(str(ticket_id))
    if ticket is None:
        raise _not_found(ticket_id)

    changes = payload.model_dump(exclude_unset=True)
    manual_override = "category" in changes or "priority" in changes

    updated = ticket.model_copy(deep=True)
    for field, value in changes.items():
        setattr(updated, field, value)

    if "status" in changes:
        if updated.status == Status.resolved:
            # (Re-)entering "resolved" refreshes the resolution timestamp.
            updated.resolved_at = _now()
        elif updated.status == Status.closed:
            # Closing after resolving keeps the original resolved_at; closing
            # directly (without ever resolving) leaves it unset.
            pass
        else:
            # Moving to an active status (new/in_progress/waiting_customer) is
            # a reopen — clear any previous resolution timestamp.
            updated.resolved_at = None

    updated.updated_at = _now()
    store.update(updated)

    if manual_override:
        override_result = ClassificationResult(
            category=updated.category,
            priority=updated.priority,
            confidence=1.0,
            reasoning="Manual override applied via PUT /tickets/{id}.",
            keywords_found=[],
        )
        updated.classification = override_result
        store.update(updated)
        record_decision(updated.id, override_result, manual_override=True)

    return updated


@router.delete("/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(ticket_id: UUID) -> Response:
    deleted = store.delete(str(ticket_id))
    if not deleted:
        raise _not_found(ticket_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tickets/{ticket_id}/auto-classify")
def auto_classify_ticket(ticket_id: UUID) -> Dict:
    ticket = store.get(str(ticket_id))
    if ticket is None:
        raise _not_found(ticket_id)

    result = classify(ticket.subject, ticket.description)
    updated = ticket.model_copy(deep=True)
    updated.category = result.category
    updated.priority = result.priority
    updated.classification = result
    updated.updated_at = _now()
    store.update(updated)
    record_decision(updated.id, result, manual_override=False)

    return {
        "category": result.category,
        "priority": result.priority,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "keywords_found": result.keywords_found,
    }
