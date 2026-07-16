"""Shared exception type for the importers package."""
from __future__ import annotations


class ImportParseError(Exception):
    """Raised when a file's top-level structure cannot be parsed at all.

    Distinct from per-record validation failures, which are collected into
    the import summary instead of aborting the whole import.
    """
