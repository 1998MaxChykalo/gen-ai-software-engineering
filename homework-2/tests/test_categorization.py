"""Unit tests for the rule-based classifier: category, priority, confidence, keywords."""
from __future__ import annotations

from src.classifier import classify
from src.models import Category, Priority


def _assert_common(result, expected_category, expected_priority):
    assert result.category == expected_category
    assert result.priority == expected_priority
    assert 0.0 <= result.confidence <= 1.0
    assert isinstance(result.reasoning, str) and result.reasoning
    assert isinstance(result.keywords_found, list)


def test_classify_account_access():
    result = classify(
        "Cannot log in to my account",
        "I forgot my password and the verification code never arrives.",
    )
    _assert_common(result, Category.account_access, Priority.medium)
    assert "log in" in result.keywords_found
    assert result.confidence > 0.5


def test_classify_technical_issue():
    result = classify(
        "Application keeps crashing",
        "The app crashes and freezes every time I try to open a saved document.",
    )
    _assert_common(result, Category.technical_issue, Priority.medium)
    assert any(k in result.keywords_found for k in ("crash", "crashes", "crashing", "freeze", "freezes"))


def test_classify_billing_question():
    result = classify(
        "Question about my invoice",
        "I have a billing question about the payment charged to my credit card this month.",
    )
    _assert_common(result, Category.billing_question, Priority.medium)
    assert "invoice" in result.keywords_found or "billing" in result.keywords_found


def test_classify_feature_request():
    result = classify(
        "Feature request for dark mode",
        "Please add an enhancement that brings dark mode to the app as a new feature.",
    )
    _assert_common(result, Category.feature_request, Priority.medium)
    assert "feature request" in result.keywords_found or "enhancement" in result.keywords_found


def test_classify_bug_report():
    result = classify(
        "Bug report: totals miscalculated",
        "Steps to reproduce: add an item, apply a coupon. Expected behavior differs from actual behavior.",
    )
    _assert_common(result, Category.bug_report, Priority.medium)
    assert "steps to reproduce" in result.keywords_found


def test_classify_other():
    result = classify(
        "General inquiry",
        "Just wanted to say hello and ask about your company history, nothing specific.",
    )
    _assert_common(result, Category.other, Priority.medium)
    assert result.confidence == 0.3
    assert result.keywords_found == []


def test_classify_priority_urgent():
    result = classify(
        "Production down, security issue",
        "This is critical, production down, and we can't access the system at all right now.",
    )
    assert result.priority == Priority.urgent
    assert result.confidence >= 0.0
    assert any(k in result.keywords_found for k in ("critical", "production down", "can't access"))


def test_classify_priority_high():
    result = classify(
        "Important and blocking issue",
        "This is important and currently blocking our release, please handle this asap.",
    )
    assert result.priority == Priority.high
    assert any(k in result.keywords_found for k in ("important", "blocking", "asap"))


def test_classify_priority_low():
    result = classify(
        "Minor cosmetic suggestion",
        "This is just a minor, cosmetic suggestion, a nice to have whenever convenient.",
    )
    assert result.priority == Priority.low
    assert any(k in result.keywords_found for k in ("minor", "cosmetic", "suggestion"))


def test_classify_priority_default_medium():
    result = classify(
        "Question about my invoice",
        "I have a billing question about the payment charged to my credit card this month.",
    )
    assert result.priority == Priority.medium
    assert not any(
        kw in result.keywords_found
        for kw in ("critical", "important", "minor", "urgent", "asap", "blocking")
    )
