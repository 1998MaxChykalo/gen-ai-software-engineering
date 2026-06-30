"""Transaction endpoints: create, list (with filters), get-by-id, CSV export."""
from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from .. import store
from ..models import Transaction, TransactionCreate, TransactionType

router = APIRouter(tags=["transactions"])


@router.post(
    "/transactions",
    response_model=Transaction,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(payload: TransactionCreate) -> Transaction:
    transaction = Transaction.from_create(payload)
    return store.add(transaction)


# NOTE: declare /transactions/export BEFORE /transactions/{transaction_id}
# so the literal "export" path isn't captured as an id.
@router.get("/transactions/export")
def export_transactions(format: str = Query("csv")) -> StreamingResponse:
    if format.lower() != "csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only 'csv' format is supported",
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["id", "fromAccount", "toAccount", "amount", "currency", "type", "timestamp", "status"]
    )
    for t in store.list_transactions():
        writer.writerow(
            [
                t.id,
                t.from_account,
                t.to_account,
                str(t.amount),
                t.currency,
                t.type.value,
                t.timestamp.isoformat(),
                t.status.value,
            ]
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


@router.get(
    "/transactions",
    response_model=list[Transaction],
    response_model_by_alias=True,
)
def list_transactions(
    accountId: Optional[str] = Query(default=None),
    type: Optional[TransactionType] = Query(default=None),
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
) -> list[Transaction]:
    return store.list_transactions(
        account_id=accountId,
        type=type,
        date_from=from_,
        date_to=to,
    )


@router.get(
    "/transactions/{transaction_id}",
    response_model=Transaction,
    response_model_by_alias=True,
)
def get_transaction(transaction_id: str) -> Transaction:
    transaction = store.get(transaction_id)
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' not found",
        )
    return transaction
