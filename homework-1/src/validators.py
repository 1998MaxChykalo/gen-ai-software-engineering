"""Domain validation helpers for transactions.

These are pure functions so they can be unit-tested in isolation and reused by
the Pydantic models. Each raises ``ValueError`` with a human-readable message on
failure, which Pydantic surfaces and our exception handler formats per the spec.
"""
from __future__ import annotations

import re
from decimal import Decimal

# Account numbers follow the format ACC-XXXXX where X is alphanumeric.
ACCOUNT_PATTERN = re.compile(r"^ACC-[A-Za-z0-9]+$")

# A practical subset of ISO 4217 currency codes. Extend as needed.
VALID_CURRENCIES = frozenset(
    {
        "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
        "CNY", "HKD", "SGD", "SEK", "NOK", "DKK", "PLN", "CZK",
        "HUF", "INR", "BRL", "ZAR", "MXN", "UAH", "TRY", "AED",
    }
)


def validate_amount(amount: Decimal) -> Decimal:
    """Amount must be a positive number with at most 2 decimal places."""
    if amount is None or amount <= 0:
        raise ValueError("Amount must be a positive number")
    # ``exponent`` is negative for fractional digits; -2 == 2 decimal places.
    exponent = amount.normalize().as_tuple().exponent
    if isinstance(exponent, int) and exponent < -2:
        raise ValueError("Amount must have at most 2 decimal places")
    return amount


def validate_account(account: str) -> str:
    """Account numbers must match ACC-XXXXX (alphanumeric suffix)."""
    if not isinstance(account, str) or not ACCOUNT_PATTERN.match(account):
        raise ValueError("Account number must match format ACC-XXXXX (alphanumeric)")
    return account


def validate_currency(currency: str) -> str:
    """Currency must be a valid ISO 4217 code (uppercased before checking)."""
    if not isinstance(currency, str):
        raise ValueError("Invalid currency code")
    code = currency.upper()
    if code not in VALID_CURRENCIES:
        raise ValueError("Invalid currency code")
    return code
