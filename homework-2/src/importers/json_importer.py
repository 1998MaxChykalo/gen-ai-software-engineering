"""JSON ticket importer — stdlib ``json`` only.

Accepts either a top-level JSON array of ticket objects, or an object with a
``"tickets"`` key holding that array. Each element must be a JSON object
whose keys match the ``TicketCreate`` schema (nested ``metadata`` object,
``tags`` array) — per-field validation happens downstream.
"""
from __future__ import annotations

import json
from typing import Dict, List

from .errors import ImportParseError


def parse(raw: bytes) -> List[Dict]:
    """Parse JSON bytes into a list of raw ticket dicts (not yet validated)."""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ImportParseError(f"Could not decode JSON file as UTF-8: {exc}") from exc

    if not text.strip():
        return []

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ImportParseError(f"Malformed JSON file: {exc}") from exc

    if isinstance(data, dict) and "tickets" in data:
        data = data["tickets"]

    if not isinstance(data, list):
        raise ImportParseError("JSON file must contain an array of ticket records")

    records: List[Dict] = []
    for item in data:
        if not isinstance(item, dict):
            raise ImportParseError("Each ticket record must be a JSON object")
        records.append(item)
    return records
