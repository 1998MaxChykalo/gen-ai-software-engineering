"""Validation rule tests for TicketCreate / TicketMetadata models."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models import Category, Priority, Status, Ticket, TicketCreate, TicketMetadata


def _base(**overrides) -> dict:
    payload = {
        "customer_id": "CUST-1",
        "customer_email": "user@example.com",
        "customer_name": "User",
        "subject": "A valid subject",
        "description": "This description is long enough to pass validation.",
    }
    payload.update(overrides)
    return payload


def test_subject_too_short_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(subject=""))


def test_subject_too_long_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(subject="x" * 201))


def test_description_too_short_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(description="short"))


def test_description_too_long_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(description="x" * 2001))


def test_invalid_email_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(customer_email="not-an-email"))


def test_invalid_category_enum_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(category="not_a_real_category"))


def test_invalid_priority_enum_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(priority="super_urgent"))


def test_invalid_status_enum_rejected():
    with pytest.raises(ValidationError):
        TicketCreate(**_base(status="archived"))


def test_invalid_metadata_device_type_rejected():
    with pytest.raises(ValidationError):
        TicketMetadata(source="web_form", device_type="smart_fridge")


def test_metadata_requires_source():
    with pytest.raises(ValidationError):
        TicketMetadata(browser="Chrome")


def test_defaults_applied_when_omitted():
    ticket_create = TicketCreate(**_base())
    ticket = Ticket.from_create(ticket_create)

    assert ticket.status == Status.new
    assert ticket.priority == Priority.medium
    assert ticket.category == Category.other
    assert ticket.tags == []
    assert ticket.resolved_at is None
    assert ticket.classification is None
