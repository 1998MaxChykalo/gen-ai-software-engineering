"""Pydantic models for the banking transactions API.

JSON uses camelCase (``fromAccount``, ``toAccount``) per the spec, while Python
attributes stay snake_case. ``populate_by_name`` lets both forms work.
Monetary amounts use ``Decimal`` (never float) to avoid rounding errors.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .validators import validate_account, validate_amount, validate_currency


class TransactionType(str, Enum):
    deposit = "deposit"
    withdrawal = "withdrawal"
    transfer = "transfer"


class TransactionStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


def _now_iso() -> datetime:
    return datetime.now(timezone.utc)


class TransactionCreate(BaseModel):
    """Request body for creating a transaction."""

    model_config = ConfigDict(populate_by_name=True)

    from_account: str = Field(alias="fromAccount")
    to_account: str = Field(alias="toAccount")
    amount: Decimal
    currency: str
    type: TransactionType

    @field_validator("from_account", "to_account")
    @classmethod
    def _check_account(cls, v: str) -> str:
        return validate_account(v)

    @field_validator("amount")
    @classmethod
    def _check_amount(cls, v: Decimal) -> Decimal:
        return validate_amount(v)

    @field_validator("currency")
    @classmethod
    def _check_currency(cls, v: str) -> str:
        return validate_currency(v)


class Transaction(BaseModel):
    """A stored/returned transaction. Serialized with camelCase aliases."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_account: str = Field(alias="fromAccount")
    to_account: str = Field(alias="toAccount")
    amount: Decimal
    currency: str
    type: TransactionType
    timestamp: datetime = Field(default_factory=_now_iso)
    status: TransactionStatus = TransactionStatus.completed

    @classmethod
    def from_create(cls, data: TransactionCreate) -> "Transaction":
        return cls(
            from_account=data.from_account,
            to_account=data.to_account,
            amount=data.amount,
            currency=data.currency,
            type=data.type,
        )


class BalanceResponse(BaseModel):
    account_id: str = Field(alias="accountId")
    balance: Decimal
    model_config = ConfigDict(populate_by_name=True)


class SummaryResponse(BaseModel):
    account_id: str = Field(alias="accountId")
    total_deposits: Decimal = Field(alias="totalDeposits")
    total_withdrawals: Decimal = Field(alias="totalWithdrawals")
    transaction_count: int = Field(alias="transactionCount")
    most_recent_transaction_date: Optional[datetime] = Field(
        alias="mostRecentTransactionDate", default=None
    )
    model_config = ConfigDict(populate_by_name=True)


# --- Error models (match the spec's shape) ---------------------------------


class ErrorDetail(BaseModel):
    field: str
    message: str


class ValidationErrorResponse(BaseModel):
    error: str = "Validation failed"
    details: List[ErrorDetail]
