"""Custom FastMCP server (Homework 6, Task 4) — makes the transaction pipeline queryable.

Exposes the final outcomes in shared/results/ (written by `node orchestrator.js`):

- Tool `get_transaction_status(transaction_id)` -> current status of one transaction
- Tool `list_pipeline_results()`                -> summary of all processed transactions
- Resource `pipeline://summary`                 -> latest pipeline run summary as text

Result files already carry masked account numbers (ACC-**01); `description` fields
may contain personal names, so they are stripped from every response (PII rule in
agents.md). Run over stdio:  python mcp/server.py
"""

import json
from pathlib import Path

from fastmcp import FastMCP

RESULTS_DIR = Path(__file__).resolve().parent.parent / "shared" / "results"
SUMMARY_FILE = RESULTS_DIR / "summary.json"

mcp = FastMCP("pipeline-status")


def _load_results() -> list[dict]:
    """Final result records (envelope.data) from shared/results/, sorted by id."""
    records = []
    if not RESULTS_DIR.is_dir():
        return records
    for path in sorted(RESULTS_DIR.glob("*.json")):
        if path.name == "summary.json":
            continue
        try:
            envelope = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if envelope.get("target_stage") != "results" or "data" not in envelope:
            continue
        data = dict(envelope["data"])
        data.pop("description", None)  # may contain personal names — never expose
        records.append(data)
    return sorted(records, key=lambda r: str(r.get("transaction_id", "")))


def _load_summary() -> dict | None:
    if not SUMMARY_FILE.is_file():
        return None
    return json.loads(SUMMARY_FILE.read_text())


@mcp.tool()
def get_transaction_status(transaction_id: str) -> dict:
    """Return the current pipeline status of one transaction from shared/results/.

    Args:
        transaction_id: e.g. "TXN003"

    Returns a dict with `found` plus, when found, the final record: status
    (settled/rejected), requires_review, reason, risk score/factors, fee and
    net_amount (settled only), and masked accounts.
    """
    wanted = transaction_id.strip()
    for record in _load_results():
        if record.get("transaction_id") == wanted:
            return {"found": True, **record}
    return {
        "found": False,
        "transaction_id": wanted,
        "hint": "No result for this id. Run the pipeline first (node orchestrator.js) "
                "or check the id against sample-transactions.json.",
    }


@mcp.tool()
def list_pipeline_results() -> dict:
    """Summarize all processed transactions from the latest pipeline run.

    Returns run metadata (counts by status, requires_review, per-currency settled
    totals) and one line per transaction: id, status, requires_review, risk_score,
    and rejection reason if any.
    """
    summary = _load_summary()
    transactions = [
        {
            "transaction_id": r.get("transaction_id"),
            "status": r.get("status"),
            "requires_review": bool(r.get("requires_review", False)),
            "risk_score": r.get("risk_score"),
            "reason": r.get("reason"),
        }
        for r in _load_results()
    ]
    if not transactions:
        return {"ran": False, "hint": "shared/results/ is empty — run the pipeline first."}
    return {
        "ran": True,
        "run_id": summary.get("run_id") if summary else None,
        "finished_at": summary.get("finished_at") if summary else None,
        "counts": summary.get("counts") if summary else None,
        "requires_review": summary.get("requires_review") if summary else None,
        "settled_totals": summary.get("settled_totals") if summary else None,
        "transactions": transactions,
    }


@mcp.resource("pipeline://summary")
def pipeline_summary() -> str:
    """Latest pipeline run summary as human-readable text."""
    summary = _load_summary()
    if summary is None:
        return "No pipeline run yet — shared/results/summary.json does not exist. Run: node orchestrator.js"

    lines = [
        f"Pipeline run {summary['run_id']}",
        f"started:  {summary['started_at']}",
        f"finished: {summary['finished_at']}",
        f"transactions: {summary['total_transactions']}",
        f"settled: {summary['counts']['settled']}"
        f" (requires review: {summary['requires_review']})"
        f" | rejected: {summary['counts']['rejected']}",
    ]
    totals = summary.get("settled_totals") or {}
    if totals:
        rendered = ", ".join(f"{amount} {currency}" for currency, amount in totals.items())
        lines.append(f"settled net totals: {rendered}")
    rejections = summary.get("rejections") or []
    if rejections:
        lines.append("rejections:")
        for r in rejections:
            detail = r.get("reason_detail") or ", ".join(r.get("risk_factors", [])) or ""
            suffix = f" ({detail})" if detail else ""
            lines.append(f"  - {r['transaction_id']}: {r['reason']}{suffix}")
    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
