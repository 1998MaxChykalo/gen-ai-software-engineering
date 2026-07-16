"""Pydantic models for the Intelligent Customer Support System.

Ticket data uses snake_case throughout (JSON body and Python attributes match,
unlike homework-1's camelCase transactions API). Timestamps are timezone-aware
UTC datetimes; the server owns ``created_at``/``updated_at``/``resolved_at``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Category(str, Enum):
    account_access = "account_access"
    technical_issue = "technical_issue"
    billing_question = "billing_question"
    feature_request = "feature_request"
    bug_report = "bug_report"
    other = "other"


class Priority(str, Enum):
    urgent = "urgent"
    high = "high"
    medium = "medium"
    low = "low"


class Status(str, Enum):
    new = "new"
    in_progress = "in_progress"
    waiting_customer = "waiting_customer"
    resolved = "resolved"
    closed = "closed"


class Source(str, Enum):
    web_form = "web_form"
    email = "email"
    api = "api"
    chat = "chat"
    phone = "phone"


class DeviceType(str, Enum):
    desktop = "desktop"
    mobile = "mobile"
    tablet = "tablet"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TicketMetadata(BaseModel):
    """Contextual info about how the ticket arrived."""

    source: Source
    browser: Optional[str] = None
    device_type: Optional[DeviceType] = None


class ClassificationResult(BaseModel):
    """Result of running the rule-based classifier against a ticket."""

    category: Category
    priority: Priority
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    keywords_found: List[str] = Field(default_factory=list)


class TicketCreate(BaseModel):
    """Request body for creating a ticket."""

    customer_id: str = Field(min_length=1)
    customer_email: EmailStr
    customer_name: str = Field(min_length=1)
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=10, max_length=2000)
    category: Optional[Category] = None
    priority: Optional[Priority] = None
    status: Optional[Status] = None
    assigned_to: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Optional[TicketMetadata] = None


class TicketUpdate(BaseModel):
    """Request body for a partial ticket update. All fields optional."""

    customer_id: Optional[str] = Field(default=None, min_length=1)
    customer_email: Optional[EmailStr] = None
    customer_name: Optional[str] = Field(default=None, min_length=1)
    subject: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, min_length=10, max_length=2000)
    category: Optional[Category] = None
    priority: Optional[Priority] = None
    status: Optional[Status] = None
    assigned_to: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[TicketMetadata] = None


class Ticket(BaseModel):
    """A stored/returned support ticket."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_email: EmailStr
    customer_name: str
    subject: str
    description: str
    category: Category = Category.other
    priority: Priority = Priority.medium
    status: Status = Status.new
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    resolved_at: Optional[datetime] = None
    assigned_to: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Optional[TicketMetadata] = None
    classification: Optional[ClassificationResult] = None

    @classmethod
    def from_create(cls, data: TicketCreate) -> "Ticket":
        now = _now()
        return cls(
            customer_id=data.customer_id,
            customer_email=data.customer_email,
            customer_name=data.customer_name,
            subject=data.subject,
            description=data.description,
            category=data.category or Category.other,
            priority=data.priority or Priority.medium,
            status=data.status or Status.new,
            created_at=now,
            updated_at=now,
            assigned_to=data.assigned_to,
            tags=list(data.tags),
            metadata=data.metadata,
        )


class ImportError_(BaseModel):
    """Details for a single record that failed import validation."""

    record: dict
    reason: str


class ImportSummary(BaseModel):
    """Response body for ``POST /tickets/import``."""

    total_records: int
    successful: int
    failed: int
    errors: List[ImportError_] = Field(default_factory=list)


# --- Error envelope (spec: {"error": {"code", "message", "details"}}) ------


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Optional[object] = None


class ErrorResponse(BaseModel):
    error: ErrorBody
