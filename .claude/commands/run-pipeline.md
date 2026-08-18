---
description: Run the transaction processing pipeline end-to-end and summarize results
allowed-tools: Bash(node:*), Bash(npm:*), Bash(ls:*), Bash(cat:*), Read, Glob
---

Run the transaction processing pipeline end-to-end (homework-6).

Steps:

1. Check that `homework-6/sample-transactions.json` exists; stop with a clear message
   if it does not.
2. Clear the `shared/` directories — the orchestrator does this itself on startup, so
   simply confirm no stale `homework-6/shared/processing/` files exist from a crashed
   run (if they exist, report them before continuing).
3. Run the pipeline from `homework-6/`:
   ```bash
   node orchestrator.js        # equivalently: npm run pipeline
   ```
4. Show a summary of results from `shared/results/`:
   - the pipeline's own summary table (stdout),
   - key numbers from `shared/results/summary.json` (counts by status,
     requires_review, per-currency settled totals).
5. Report any transactions that were **rejected** and why: for each rejection list
   `transaction_id`, `reason`, `reason_detail`/`risk_factors` (from
   `summary.json → rejections`).

Verify before finishing: exit code is 0 and **all 8** sample transactions have exactly
one result file in `shared/results/` (expected: 5 settled, of which 3
`requires_review`; 3 rejected — TXN003 `FRAUD_SUSPECTED`, TXN006 `INVALID_CURRENCY`,
TXN007 `INVALID_AMOUNT`). If anything deviates, show `shared/results/audit.log` tail
and flag it instead of declaring success.
