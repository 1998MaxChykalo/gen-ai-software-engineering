"""Account endpoints: balance and summary (Task 4, Option A)."""
from __future__ import annotations

from fastapi import APIRouter

from .. import store
from ..models import BalanceResponse, SummaryResponse

router = APIRouter(tags=["accounts"])


@router.get(
    "/accounts/{account_id}/balance",
    response_model=BalanceResponse,
    response_model_by_alias=True,
)
def get_balance(account_id: str) -> BalanceResponse:
    return BalanceResponse(account_id=account_id, balance=store.balance(account_id))


@router.get(
    "/accounts/{account_id}/summary",
    response_model=SummaryResponse,
    response_model_by_alias=True,
)
def get_summary(account_id: str) -> SummaryResponse:
    data = store.summary(account_id)
    return SummaryResponse(
        account_id=data["account_id"],
        total_deposits=data["total_deposits"],
        total_withdrawals=data["total_withdrawals"],
        transaction_count=data["transaction_count"],
        most_recent_transaction_date=data["most_recent_transaction_date"],
    )
