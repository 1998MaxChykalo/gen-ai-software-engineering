"""Import dispatch: pick a format-specific parser, then validate + store records.

Format is chosen from the uploaded file's extension first, falling back to
content-type sniffing, and finally to peeking at the raw bytes (JSON starts
with ``{``/``[``, XML starts with ``<``) so a mislabeled upload still works.
"""
from __future__ import annotations

from typing import Dict, List

from pydantic import ValidationError

from .. import store
from ..classifier import classify, record_decision
from ..models import ImportSummary, Ticket, TicketCreate
from . import csv_importer, json_importer, xml_importer
from .errors import ImportParseError

__all__ = ["ImportParseError", "detect_format", "parse_records", "import_records"]

_PARSERS = {
    "csv": csv_importer.parse,
    "json": json_importer.parse,
    "xml": xml_importer.parse,
}


def detect_format(filename: str, content_type: str, raw: bytes) -> str:
    """Best-effort format detection: extension -> content-type -> content sniff."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext in _PARSERS:
            return ext

    ct = (content_type or "").lower()
    if "json" in ct:
        return "json"
    if "xml" in ct:
        return "xml"
    if "csv" in ct:
        return "csv"

    stripped = raw.strip()
    if stripped.startswith(b"{") or stripped.startswith(b"["):
        return "json"
    if stripped.startswith(b"<"):
        return "xml"
    return "csv"


def parse_records(fmt: str, raw: bytes) -> List[Dict]:
    """Parse raw file bytes into a list of un-validated ticket dicts.

    Raises :class:`ImportParseError` if the file's overall structure is
    unparseable (bad root element, malformed JSON/XML, missing CSV columns).
    """
    parser = _PARSERS.get(fmt)
    if parser is None:
        raise ImportParseError(f"Unsupported file format: '{fmt}'")
    return parser(raw)


def _format_validation_error(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", ()))
        parts.append(f"{loc or 'record'}: {err.get('msg', 'invalid value')}")
    return "; ".join(parts)


def import_records(records: List[Dict], *, auto_classify: bool = False) -> ImportSummary:
    """Validate raw records, store the valid ones, and summarize the outcome.

    Invalid records never abort the import — they are collected into
    ``errors`` so the caller can see exactly which rows failed and why.
    """
    errors: List[Dict] = []
    successful = 0

    for record in records:
        try:
            ticket_create = TicketCreate(**record)
        except ValidationError as exc:
            errors.append({"record": record, "reason": _format_validation_error(exc)})
            continue
        except (TypeError, ValueError) as exc:
            errors.append({"record": record, "reason": str(exc)})
            continue

        ticket = Ticket.from_create(ticket_create)
        if auto_classify:
            result = classify(ticket.subject, ticket.description)
            ticket.category = result.category
            ticket.priority = result.priority
            ticket.classification = result
            record_decision(ticket.id, result, manual_override=False)
        store.add(ticket)
        successful += 1

    return ImportSummary(
        total_records=len(records),
        successful=successful,
        failed=len(errors),
        errors=errors,
    )
