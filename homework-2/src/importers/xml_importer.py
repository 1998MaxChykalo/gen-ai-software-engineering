"""XML ticket importer — stdlib ``xml.etree.ElementTree`` only.

Expected structure::

    <tickets>
      <ticket>
        <customer_id>...</customer_id>
        <customer_email>...</customer_email>
        <customer_name>...</customer_name>
        <subject>...</subject>
        <description>...</description>
        <category>...</category>            <!-- optional -->
        <priority>...</priority>             <!-- optional -->
        <status>...</status>                 <!-- optional -->
        <assigned_to>...</assigned_to>       <!-- optional -->
        <tags><tag>...</tag><tag>...</tag></tags>  <!-- optional -->
        <metadata>                            <!-- optional -->
          <source>...</source>
          <browser>...</browser>
          <device_type>...</device_type>
        </metadata>
      </ticket>
      ...
    </tickets>
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

from .errors import ImportParseError

ROOT_TAG = "tickets"
ITEM_TAG = "ticket"
_FLAT_FIELDS = (
    "customer_id", "customer_email", "customer_name", "subject", "description",
    "category", "priority", "status", "assigned_to",
)


def parse(raw: bytes) -> List[Dict]:
    """Parse XML bytes into a list of raw ticket dicts (not yet validated)."""
    if not raw.strip():
        return []

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ImportParseError(f"Malformed XML file: {exc}") from exc

    if root.tag != ROOT_TAG:
        raise ImportParseError(
            f"Expected root element '<{ROOT_TAG}>', found '<{root.tag}>'"
        )

    return [_parse_ticket_element(item) for item in root.findall(ITEM_TAG)]


def _text(elem: Optional[ET.Element]) -> Optional[str]:
    if elem is None or elem.text is None:
        return None
    value = elem.text.strip()
    return value or None


def _parse_ticket_element(item: ET.Element) -> Dict:
    record: Dict = {}
    for key in _FLAT_FIELDS:
        value = _text(item.find(key))
        if value is not None:
            record[key] = value

    tags: List[str] = []
    tags_el = item.find("tags")
    if tags_el is not None:
        for tag_el in tags_el.findall("tag"):
            value = _text(tag_el)
            if value:
                tags.append(value)
    record["tags"] = tags

    metadata_el = item.find("metadata")
    if metadata_el is not None:
        source = _text(metadata_el.find("source"))
        if source:
            metadata: Dict = {"source": source}
            browser = _text(metadata_el.find("browser"))
            device_type = _text(metadata_el.find("device_type"))
            if browser:
                metadata["browser"] = browser
            if device_type:
                metadata["device_type"] = device_type
            record["metadata"] = metadata

    return record
