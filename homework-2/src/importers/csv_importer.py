"""CSV ticket importer — stdlib ``csv`` only.

Expected header (order-independent): ``customer_id, customer_email,
customer_name, subject, description`` are required; ``category, priority,
status, assigned_to, tags, source, browser, device_type`` are optional.
``tags`` is a ``;``-separated list; ``source``/``browser``/``device_type``
flatten the nested ``metadata`` object for the tabular format.
"""
from __future__ import annotations

import csv
import io
from typing import Dict, List, Optional

from .errors import ImportParseError

REQUIRED_COLUMNS = {"customer_id", "customer_email", "customer_name", "subject", "description"}
_FLAT_FIELDS = (
    "customer_id", "customer_email", "customer_name", "subject", "description",
    "category", "priority", "status", "assigned_to",
)


def parse(raw: bytes) -> List[Dict]:
    """Parse CSV bytes into a list of raw ticket dicts (not yet validated)."""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ImportParseError(f"Could not decode CSV file as UTF-8: {exc}") from exc

    if not text.strip():
        return []

    try:
        reader = csv.DictReader(io.StringIO(text))
        fieldnames = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - fieldnames
        if missing:
            raise ImportParseError(
                f"CSV file is missing required column(s): {', '.join(sorted(missing))}"
            )
        rows = list(reader)
    except csv.Error as exc:
        raise ImportParseError(f"Malformed CSV file: {exc}") from exc

    return [_normalize_row(row) for row in rows]


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _normalize_row(row: Dict[str, Optional[str]]) -> Dict:
    record: Dict = {}
    for key in _FLAT_FIELDS:
        value = _clean(row.get(key))
        if value is not None:
            record[key] = value

    tags_raw = _clean(row.get("tags"))
    record["tags"] = [t.strip() for t in tags_raw.split(";") if t.strip()] if tags_raw else []

    source = _clean(row.get("source"))
    if source:
        metadata: Dict = {"source": source}
        browser = _clean(row.get("browser"))
        device_type = _clean(row.get("device_type"))
        if browser:
            metadata["browser"] = browser
        if device_type:
            metadata["device_type"] = device_type
        record["metadata"] = metadata

    return record
