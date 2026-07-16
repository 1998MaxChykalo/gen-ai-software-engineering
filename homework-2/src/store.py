"""Thread-safe in-memory ticket store.

Tickets live in a process-local dict guarded by an ``RLock`` so concurrent
requests (e.g. the 20+ thread concurrency test) never corrupt state. There is
no persistence — ``reset()`` clears everything between tests.
"""
from __future__ import annotations

import threading
from typing import Dict, List, Optional

from .models import Category, Priority, Status, Ticket

_lock = threading.RLock()
_tickets: Dict[str, Ticket] = {}


def reset() -> None:
    """Clear all stored tickets (used by tests)."""
    with _lock:
        _tickets.clear()


def add(ticket: Ticket) -> Ticket:
    with _lock:
        _tickets[ticket.id] = ticket
        return ticket


def get(ticket_id: str) -> Optional[Ticket]:
    with _lock:
        return _tickets.get(ticket_id)


def update(ticket: Ticket) -> Ticket:
    """Overwrite the stored ticket with a new version (same id)."""
    with _lock:
        _tickets[ticket.id] = ticket
        return ticket


def delete(ticket_id: str) -> bool:
    with _lock:
        if ticket_id in _tickets:
            del _tickets[ticket_id]
            return True
        return False


def list_tickets(
    *,
    category: Optional[Category] = None,
    priority: Optional[Priority] = None,
    status: Optional[Status] = None,
    assigned_to: Optional[str] = None,
    tag: Optional[str] = None,
    q: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> List[Ticket]:
    """Return tickets, optionally filtered (filters combine with AND).

    ``q`` performs a case-insensitive substring match against subject or
    description. Results are sorted by ``created_at`` for stable pagination.
    """
    with _lock:
        results = list(_tickets.values())

    results.sort(key=lambda t: t.created_at)

    if category is not None:
        results = [t for t in results if t.category == category]
    if priority is not None:
        results = [t for t in results if t.priority == priority]
    if status is not None:
        results = [t for t in results if t.status == status]
    if assigned_to is not None:
        results = [t for t in results if t.assigned_to == assigned_to]
    if tag is not None:
        results = [t for t in results if tag in t.tags]
    if q is not None:
        needle = q.lower()
        results = [
            t
            for t in results
            if needle in t.subject.lower() or needle in t.description.lower()
        ]

    if offset:
        results = results[offset:]
    if limit is not None:
        results = results[:limit]

    return results
