---
description: Validate all transactions (dry run) without running the full pipeline
allowed-tools: Bash(node:*), Bash(npm:*), Read
argument-hint: [path to transactions .json, defaults to sample-transactions.json]
---

Validate all transactions in `sample-transactions.json` (or the file given in
`$ARGUMENTS`) **without processing them** (homework-6).

Steps:

1. Run the validator stage in dry-run mode from `homework-6/`:
   ```bash
   node pipeline/validator.js --dry-run $ARGUMENTS   # equivalently: npm run validate
   ```
   Dry-run mode only reads the input file — it must not write anything to `shared/`.
2. Report: **total count, valid count, invalid count**, and the reasons for rejection
   (reason code + detail per invalid transaction).
3. Show a table of results — the dry-run already prints one
   (`TRANSACTION / VALID / REASON / DETAIL`); reproduce it for the user and add a
   one-line interpretation (e.g. which checks caught which record).

Expected on the sample data: 8 total, 6 valid, 2 invalid — TXN006
`INVALID_CURRENCY` (code `XYZ` not in the ISO 4217 allowlist) and TXN007
`INVALID_AMOUNT` (negative amount). If the output differs, flag it as a regression
against `specification.md` instead of declaring success.
