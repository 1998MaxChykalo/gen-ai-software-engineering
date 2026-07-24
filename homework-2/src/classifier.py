"""Rule-based ticket classifier.

Deterministic, offline, keyword-scoring classification — no external API
calls, fully unit-testable. Keyword tables are matched case-insensitively with
regex word boundaries so, e.g., ``"asap"`` doesn't match inside ``"asapio"``.
Hits in the subject count double (2x) versus hits in the description (1x),
reflecting that the subject line is a stronger signal of intent.

Every classification decision (automatic on create/auto-classify, or a manual
override applied via ``PUT /tickets/{id}``) is appended to the in-memory
``classification_log`` and emitted through the standard ``logging`` module so
it is inspectable both by tests and by real log aggregation.
"""
from __future__ import annotations

import logging
import re
from typing import Dict, List, Tuple

from .models import Category, ClassificationResult, Priority

logger = logging.getLogger(__name__)

# --- Keyword tables (TASKS.md, expanded with synonyms) ---------------------

CATEGORY_KEYWORDS: Dict[Category, List[str]] = {
    Category.account_access: [
        "login", "log in", "log-in", "password", "2fa", "two-factor",
        "two factor", "authentication", "sign in", "sign-in", "locked out",
        "account locked", "reset password", "can't log in", "cannot log in",
        "mfa", "verification code", "account access",
    ],
    Category.technical_issue: [
        "error", "crash", "crashed", "crashing", "glitch", "broken",
        "not working", "malfunction", "exception", "freeze", "frozen",
        "timeout", "unresponsive", "500 error", "server error",
    ],
    Category.billing_question: [
        "payment", "invoice", "refund", "billing", "charge", "charged",
        "subscription", "credit card", "receipt", "overcharged",
        "double charged", "billed twice", "payment method", "renewal",
    ],
    Category.feature_request: [
        "feature request", "enhancement", "suggestion", "would be nice",
        "please add", "improvement", "new feature", "add support",
        "enhance", "wish list", "could you add",
    ],
    Category.bug_report: [
        "reproduce", "reproduction", "steps to reproduce", "defect",
        "reproducible", "expected behavior", "actual behavior",
        "regression", "reproducing the issue", "bug report",
    ],
}

URGENT_KEYWORDS: List[str] = [
    "can't access", "cannot access", "critical", "production down",
    "security", "security breach", "urgent", "can't login", "cannot login",
]
HIGH_KEYWORDS: List[str] = [
    "important", "blocking", "asap", "high priority", "time-sensitive",
]
LOW_KEYWORDS: List[str] = [
    "minor", "cosmetic", "suggestion", "low priority", "nice to have",
    "trivial",
]

OTHER_BASELINE_CONFIDENCE = 0.3

# In-memory decision log — every auto-classify or manual-override decision is
# appended here so tests (and real observability) can inspect it.
classification_log: List[dict] = []


def _matches(text: str, keyword: str) -> bool:
    pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
    return re.search(pattern, text) is not None


def _score_category(
    subject_l: str, description_l: str, keywords: List[str]
) -> Tuple[int, List[str]]:
    score = 0
    hits: List[str] = []
    for keyword in keywords:
        hit_subject = _matches(subject_l, keyword)
        hit_description = _matches(description_l, keyword)
        if hit_subject:
            score += 2
        if hit_description:
            score += 1
        if hit_subject or hit_description:
            hits.append(keyword)
    return score, hits


def classify(subject: str, description: str) -> ClassificationResult:
    """Classify a ticket's category and priority from its text.

    Pure function — does not touch the decision log. Callers that want the
    decision recorded should call :func:`record_decision` afterwards.
    """
    subject_l = (subject or "").lower()
    description_l = (description or "").lower()

    scores: Dict[Category, int] = {}
    hits_by_category: Dict[Category, List[str]] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score, hits = _score_category(subject_l, description_l, keywords)
        scores[category] = score
        hits_by_category[category] = hits

    total_score = sum(scores.values())
    winner = max(scores, key=lambda c: scores[c])
    if scores[winner] == 0:
        winner = Category.other

    if winner == Category.other or total_score == 0:
        confidence = OTHER_BASELINE_CONFIDENCE
        category_keywords: List[str] = []
    else:
        confidence = max(0.0, min(1.0, scores[winner] / total_score))
        category_keywords = hits_by_category[winner]

    combined_l = f"{subject_l} {description_l}"
    priority = Priority.medium
    priority_keywords: List[str] = []
    for candidate_priority, keywords in (
        (Priority.urgent, URGENT_KEYWORDS),
        (Priority.high, HIGH_KEYWORDS),
        (Priority.low, LOW_KEYWORDS),
    ):
        hits = [kw for kw in keywords if _matches(combined_l, kw)]
        if hits:
            priority = candidate_priority
            priority_keywords = hits
            break

    # Preserve order, drop duplicates.
    keywords_found = list(dict.fromkeys(category_keywords + priority_keywords))

    reasoning_parts = []
    if category_keywords:
        reasoning_parts.append(
            f"Category '{winner.value}' matched keywords: {', '.join(category_keywords)}."
        )
    else:
        reasoning_parts.append("No category keywords matched; defaulted to 'other'.")
    if priority_keywords:
        reasoning_parts.append(
            f"Priority '{priority.value}' triggered by: {', '.join(priority_keywords)}."
        )
    else:
        reasoning_parts.append("No priority keywords matched; defaulted to 'medium'.")

    return ClassificationResult(
        category=winner,
        priority=priority,
        confidence=round(confidence, 3),
        reasoning=" ".join(reasoning_parts),
        keywords_found=keywords_found,
    )


def record_decision(
    ticket_id: str, result: ClassificationResult, *, manual_override: bool = False
) -> dict:
    """Append a classification decision to the in-memory log and emit it via logging."""
    entry = {
        "ticket_id": ticket_id,
        "category": result.category.value,
        "priority": result.priority.value,
        "confidence": result.confidence,
        "manual_override": manual_override,
    }
    classification_log.append(entry)
    logger.info(
        "classification decision ticket_id=%s category=%s priority=%s "
        "confidence=%.3f manual_override=%s",
        ticket_id,
        result.category.value,
        result.priority.value,
        result.confidence,
        manual_override,
    )
    return entry


def reset_log() -> None:
    """Clear the in-memory decision log (used by tests)."""
    classification_log.clear()
