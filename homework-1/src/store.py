"""In-memory transaction store and account aggregations.

No database — transactions live in a module-level list for the lifetime of the
process. ``reset()`` clears state between tests.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from .models import Transaction, TransactionType

# The "database": a simple ordered list of transactions.
_transactions: List[Transaction] = []


def reset() -> None:
    """Clear all stored transactions (used by tests)."""
    _transactions.clear()


def add(transaction: Transaction) -> Transaction:
    _transactions.append(transaction)
    return transaction


def get(transaction_id: str) -> Optional[Transaction]:
    return next((t for t in _transactions if t.id == transaction_id), None)


def list_transactions(
    *,
    account_id: Optional[str] = None,
    type: Optional[TransactionType] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> List[Transaction]:
    """Return transactions, optionally filtered. Filters combine (logical AND).

    ``account_id`` matches either the source or destination account.
    Date bounds are inclusive and compared against the transaction timestamp.
    """
    results = list(_transactions)

    if account_id is not None:
        results = [
            t for t in results
            if t.from_account == account_id or t.to_account == account_id
        ]
    if type is not None:
        results = [t for t in results if t.type == type]
    if date_from is not None:
        results = [t for t in results if _aware(t.timestamp) >= _aware(date_from)]
    if date_to is not None:
        results = [t for t in results if _aware(t.timestamp) <= _aware(date_to)]

    return results


def _aware(dt: datetime) -> datetime:
    """Treat naive datetimes (e.g. from query params) as UTC for comparison."""
    if dt.tzinfo is None:
        from datetime import timezone
        return dt.replace(tzinfo=timezone.utc)
    return dt


def balance(account_id: str) -> Decimal:
    """Net balance for an account from completed transactions.

    Convention: money moving *into* the account (it is the ``toAccount``) adds to
    the balance; money moving *out* (it is the ``fromAccount``) subtracts.
    Only ``completed`` transactions are counted.
    """
    total = Decimal("0")
    for t in _transactions:
        if t.status.value != "completed":
            continue
        if t.to_account == account_id:
            total += t.amount
        if t.from_account == account_id:
            total -= t.amount
    return total


def summary(account_id: str) -> dict:
    """Aggregate totals for an account (Task 4, Option A)."""
    total_deposits = Decimal("0")
    total_withdrawals = Decimal("0")
    count = 0
    most_recent: Optional[datetime] = None

    for t in _transactions:
        involved = t.from_account == account_id or t.to_account == account_id
        if not involved:
            continue
        count += 1
        # Inflows: this account receives money.
        if t.to_account == account_id:
            total_deposits += t.amount
        # Outflows: this account sends money.
        if t.from_account == account_id:
            total_withdrawals += t.amount
        if most_recent is None or _aware(t.timestamp) > _aware(most_recent):
            most_recent = t.timestamp

    return {
        "account_id": account_id,
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "transaction_count": count,
        "most_recent_transaction_date": most_recent,
    }
