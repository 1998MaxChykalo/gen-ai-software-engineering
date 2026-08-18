# Transaction Processing Pipeline — Specification

> Ingest the information from this file, implement the Low-Level Tasks, and generate
> the code that will satisfy the High and Mid-Level Objectives.

**Produced by:** Agent 1 — Specification (`spec-writer` agent, `/write-spec` skill)
**Revision 2:** stack changed to **Node.js + React** at the author's request (was Python/FastAPI)
**Template:** `homework-3/specification-TEMPLATE-example.md` (Banking-Specific Specification Template)
**Input data:** `homework-6/sample-transactions.json` (8 records, TXN001–TXN008)

---

## 1. High-Level Objective

Build a file-based transaction processing pipeline in Node.js that takes raw banking
transactions through validation, fraud detection, and settlement stages, producing an
auditable per-transaction outcome (settled / flagged for review / rejected with reason)
plus a run summary viewable in a React web dashboard.

---

## 2. Mid-Level Objectives

Each objective is testable against the sample data.

1. **Validation** — Every record is checked for required fields, a positive decimal
   amount, and an ISO 4217 currency code. Invalid records are written to
   `shared/results/` with `status: "rejected"` and a machine-readable `reason` field.
   With the sample data: TXN006 is rejected (`INVALID_CURRENCY`, code `XYZ`) and
   TXN007 is rejected (`INVALID_AMOUNT`, negative `-100.00`).

2. **Fraud detection** — Every validated transaction receives a risk score 0–100 with
   a per-rule breakdown. Transactions above $10,000 are flagged for fraud review
   (TXN002 $25,000, TXN005 $75,000); a score ≥ 70 rejects the transaction with
   `reason: "FRAUD_SUSPECTED"` (TXN003: near-threshold amount $9,999.99 **to a
   watchlisted account** ACC-9999 → 70).

3. **Settlement** — Clean and review-flagged transactions are settled: a fee is
   computed with `decimal.js` and `ROUND_HALF_UP` (2 decimal places), and the
   final record lands in `shared/results/`. After a full run, **all 8 sample
   transactions appear in `shared/results/`**: 5 settled (2 clean — TXN001, TXN008 —
   and 3 with `requires_review: true`) and 3 rejected. Exact expected outcomes are
   tabulated below.

4. **Audit trail** — All pipeline stages log every operation with an ISO 8601 UTC
   timestamp, stage name, transaction ID, and outcome. Account numbers never appear
   unmasked in logs, results, or reports (`ACC-1001` → `ACC-**01`).

5. **Observability** — Each run produces `shared/results/summary.json` (counts, per-
   transaction statuses, rejection reasons, total settled amount per currency), and a
   React dashboard displays it. Unit + integration test coverage is **≥ 90%** (hard
   gate at 80%).

### Expected outcomes for `sample-transactions.json`

| TXN | Why | Risk score | Final status |
|---|---|---|---|
| TXN001 | $1,500 USD, business hours, domestic | 0 | `settled` |
| TXN002 | $25,000 wire (> $10,000) | 40 | `settled`, `requires_review: true` |
| TXN003 | $9,999.99 (structuring) → ACC-9999 (watchlist) | 70 | `rejected` — `FRAUD_SUSPECTED` |
| TXN004 | 02:47 UTC (off-hours) + country DE (cross-border) | 35 | `settled`, `requires_review: true` |
| TXN005 | $75,000 wire (> $50,000) | 50 | `settled`, `requires_review: true` |
| TXN006 | currency `XYZ` not ISO 4217 | — | `rejected` — `INVALID_CURRENCY` |
| TXN007 | amount `-100.00` not positive | — | `rejected` — `INVALID_AMOUNT` |
| TXN008 | $3,200 USD mobile, business hours | 0 | `settled` |

---

## 3. Implementation Notes

### Tech stack

| Concern | Choice |
|---|---|
| Language / runtime | Node.js 20+ LTS, ES modules (`"type": "module"`) |
| Pipeline core | Node standard library (`fs`, `path`, `crypto.randomUUID`) + **`decimal.js`** for money — the only pipeline dependency |
| API server | **Express** — JSON API over `shared/results/` + serves the built dashboard |
| Front-end | **React 18 + Vite** (`frontend/`), vanilla `fetch`, no state library |
| Testing | `node:test` (built-in runner) + **`c8`** for coverage; gate 80%, target ≥ 90%; tests isolated via `fs.mkdtemp` temp dirs |
| MCP (Task 4) | context7 for framework lookups during code generation (documented in `research-notes.md`); custom FastMCP server exposing `shared/results/` — separate task; the pipeline must not depend on it |

### Money

- All amounts are handled with **`decimal.js` (`Decimal`)** — native JS `number`
  arithmetic on money is **forbidden** everywhere: parsing, computation, serialization,
  tests. Amounts stay strings in JSON (`"amount": "1500.00"`) and are converted to
  `Decimal` at the edge; results serialize back via `.toFixed(2)`.
- Fee rounding: `.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)`, applied once at the end
  of the fee calculation.
- An amount is valid iff it is a string that parses as `Decimal`, is `> 0`, and has
  ≤ 2 decimal places.

### Currency

- ISO 4217 validation against an explicit allowlist constant:
  `{"USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"}`. Unknown codes → `INVALID_CURRENCY`.
- No FX conversion anywhere; summary totals are reported **per currency**.

### File-based pipeline protocol

Stages communicate only through JSON files in shared directories:

```
shared/
├── input/       ← orchestrator drops initial message envelopes here
├── processing/  ← a stage moves an envelope here while working on it
├── output/      ← stage writes its result envelope here for the next stage
└── results/     ← final outcomes (settled / rejected) + summary.json + audit.log
```

Standard message envelope between stages (per TASKS.md):

```json
{
  "message_id": "uuid4-string",
  "timestamp": "2026-03-16T10:00:00Z",
  "source_stage": "validator",
  "target_stage": "fraud_detector",
  "message_type": "transaction",
  "data": {
    "transaction_id": "TXN001",
    "amount": "1500.00",
    "currency": "USD",
    "status": "validated"
  }
}
```

- `data` carries the full transaction record plus fields added by stages
  (`status`, `reason`, `risk_score`, `risk_factors`, `requires_review`, `fee`, `net_amount`).
- A stage: collects the envelopes addressed to it (`target_stage` filter) from its
  input directory → moves each to `processing/` → writes a **new** envelope (fresh
  `message_id`, fresh timestamp, updated `source_stage`/`target_stage`) to `output/`
  or `results/` → removes the `processing/` copy. Files are written atomically
  (write to a temp file, then `fs.renameSync`).
- File naming: `{stage}-{transaction_id}-{message_id}.json`.
- Stages run sequentially in one process (deterministic demo); `shared/output/` is
  reused between consecutive stages, which is safe because every stage filters by
  `target_stage` and snapshots the file list before processing.

### Fraud scoring rules (additive, capped at 100)

| Rule code | Condition | Points |
|---|---|---|
| `VERY_HIGH_VALUE` | amount > 50,000 | +50 |
| `HIGH_VALUE` | 10,000 < amount ≤ 50,000 | +40 |
| `NEAR_THRESHOLD` | 9,000 ≤ amount < 10,000 (structuring) | +30 |
| `WATCHLIST_ACCOUNT` | destination account in `{"ACC-9999"}` | +40 |
| `OFF_HOURS` | transaction UTC hour in 00:00–04:59 | +20 |
| `CROSS_BORDER` | `metadata.country` ≠ `"US"` | +15 |

`VERY_HIGH_VALUE` and `HIGH_VALUE` are mutually exclusive. Decisions:
**score ≥ 70 → rejected (`FRAUD_SUSPECTED`)**, **30–69 → `flagged_for_review`**
(continues to settlement with `requires_review: true`), **< 30 → clean**.

### Settlement fee schedule

| `transaction_type` | Fee |
|---|---|
| `wire_transfer` | 0.10% of amount, minimum 25.00 |
| `transfer` | flat 0.25 |
| `refund` | 0.00 |
| anything else | flat 0.50 |

`net_amount = amount − fee` (same currency; fees never cross currencies).

### Logging / audit trail

- Single audit log format, one line per operation:
  `2026-03-16T10:00:00.123Z | validator | TXN001 | validated | detail…`
- Timestamps: ISO 8601 UTC via `new Date().toISOString()`.
- Written both to stderr and appended to `shared/results/audit.log`.

### PII

- `source_account` / `destination_account` are sensitive. In **logs, summary,
  final results, and every API/MCP response** they appear masked: keep the `ACC-`
  prefix and last 2 characters, mask the middle (`ACC-1001` → `ACC-**01`). Full
  account numbers exist only inside `shared/input|processing|output` working files.
- `description` may contain names — never logged; carried through result files but
  excluded from `summary.json`.

### Error handling

- Invalid records and suspected fraud are **valid domain outcomes** — they produce
  `rejected` result files with `reason` codes, never exceptions.
- Exceptions are reserved for infrastructure faults (unreadable file, malformed JSON);
  the orchestrator catches these per record, logs `stage_error`, and continues with
  the remaining records.

---

## 4. Context

### Beginning state

- `homework-6/TASKS.md` — assignment description
- `homework-6/sample-transactions.json` — 8 raw transaction records (TXN001–TXN008)
- `homework-6/specification.md` — this document
- `homework-6/agents.md` — agent guidelines for this project
- `.claude/commands/write-spec.md` — skill that generated this spec
- `.claude/agents/spec-writer.md` — Agent 1 definition
- No pipeline code exists yet.

### Ending state

```
homework-6/
├── TASKS.md
├── specification.md              (this file)
├── agents.md
├── sample-transactions.json
├── package.json                  ← "type": "module"; scripts: pipeline, serve, test, coverage
├── orchestrator.js               ← entry point: node orchestrator.js  /  npm run pipeline
├── pipeline/
│   ├── common.js                 ← envelope protocol, audit log, masking, Decimal parsing
│   ├── validator.js              ← stage 1 (also runnable with --dry-run)
│   ├── fraud-detector.js         ← stage 2
│   └── settlement.js             ← stage 3
├── shared/                       ← created at runtime, gitignored except .gitkeep
│   ├── input/  ├── processing/  ├── output/  └── results/
├── frontend/
│   ├── server.js                 ← Express: GET /api/summary, GET /api/transactions, POST /api/run; serves dist/
│   ├── package.json              ← React 18 + Vite
│   ├── vite.config.js            ← dev proxy /api → Express
│   ├── index.html
│   └── src/App.jsx, main.jsx, styles.css
├── mcp/server.py                 (Task 4 — not part of this spec's low-level tasks)
├── tests/
│   ├── validator.test.js
│   ├── fraud-detector.test.js
│   ├── settlement.test.js
│   └── integration.test.js       ← full pipeline over sample data in a temp dir
├── research-notes.md             (Task 2/4 — context7 queries)
├── README.md / HOWTORUN.md       (Task 5)
└── docs/screenshots/
```

- Running `node orchestrator.js` completes with exit code 0; all 8 sample
  transactions appear in `shared/results/` with the statuses from the outcome table.
- `shared/results/summary.json` exists with counts `{settled: 5, rejected: 3}`,
  `requires_review: 3`, rejection reasons, and per-currency settled totals.
- `npm run coverage` (c8 over `node --test`) reports **≥ 90%** on `pipeline/` and
  `orchestrator.js`; the push hook (Task 3) blocks below 80%.

---

## 5. Low-Level Tasks

> Ordered by dependency — implement top to bottom.

### Task 1: Shared pipeline protocol

```
Task: Shared pipeline protocol (common utilities)
Prompt: "Read homework-6/specification.md sections 3 (file-based pipeline protocol,
  logging, PII) and create homework-6/pipeline/common.js (ESM). Implement:
  makeEnvelope(sourceStage, targetStage, data, messageType='transaction') producing
  the standard message envelope with crypto.randomUUID() message_id and ISO 8601 UTC
  timestamp; writeEnvelope(envelope, directory) writing atomically (temp file +
  fs.renameSync) named '{source_stage}-{transaction_id}-{message_id}.json' and
  returning the path; readEnvelopes(directory, targetStage?) returning parsed
  envelopes (filtered by target_stage when given, skipping non-envelope files);
  parseAmount(value) returning a decimal.js Decimal and throwing for non-string,
  non-decimal, non-positive, or more-than-2-dp input; maskAccount(account) turning
  'ACC-1001' into 'ACC-**01'; maskRecord(record) returning a copy with both account
  fields masked; and audit(resultsDir, stage, transactionId, outcome, detail='')
  writing one ISO-8601-timestamped line to stderr and appending it to
  <resultsDir>/audit.log. decimal.js is the only dependency; no native number ever
  holds an amount."
File to CREATE: homework-6/pipeline/common.js
Function to CREATE: makeEnvelope(...), writeEnvelope(...), readEnvelopes(...),
  parseAmount(value) -> Decimal, maskAccount(account), maskRecord(record),
  audit(resultsDir, stage, transactionId, outcome, detail)
Details: Foundation used by every stage. Envelope format is fixed by the spec; audit
  line format '<iso-ts> | <stage> | <txn-id> | <outcome> | <detail>'. Atomic writes
  prevent the next stage from reading half-written JSON.
```

### Task 2: Validation stage

```
Task: Validation Stage
Prompt: "Read homework-6/specification.md and create homework-6/pipeline/validator.js
  (ESM). Implement processTransaction(record) returning the record with status
  'validated', or status 'rejected' plus a reason code from {MISSING_FIELD,
  INVALID_AMOUNT, INVALID_CURRENCY, INVALID_TIMESTAMP}. Required fields:
  transaction_id, timestamp, source_account, destination_account, amount, currency,
  transaction_type. Amount must pass common.parseAmount (positive Decimal string,
  ≤ 2 dp); currency must be in the ISO 4217 allowlist {USD, EUR, GBP, JPY, CHF, CAD,
  AUD}; timestamp must be ISO 8601 (regex + Date parse). Implement run({inputDir,
  processingDir, outputDir, resultsDir}) that reads envelopes addressed to
  'validator', moves each to processingDir, writes validated records as envelopes
  targeted at 'fraud_detector' to outputDir and rejected ones (masked via
  common.maskRecord) to resultsDir, audit-logging every record. Add a CLI entry:
  'node pipeline/validator.js --dry-run [path]' validates sample-transactions.json
  directly and prints a table of transaction_id / valid / reason plus total, valid
  and invalid counts, without writing to shared/."
File to CREATE: homework-6/pipeline/validator.js
Function to CREATE: processTransaction(record) -> record
Details: Stage checks structure only — no business/risk judgment. On sample data it
  must reject exactly TXN006 (INVALID_CURRENCY 'XYZ') and TXN007 (INVALID_AMOUNT
  '-100.00') and validate the other six. The --dry-run mode is required by the
  /validate-transactions skill in Task 3.
```

### Task 3: Fraud detection stage

```
Task: Fraud Detection Stage
Prompt: "Read homework-6/specification.md (fraud scoring rules table) and create
  homework-6/pipeline/fraud-detector.js (ESM). Implement scoreTransaction(record)
  -> {score, factors} applying the additive rules: VERY_HIGH_VALUE(+50,
  amount>50000), HIGH_VALUE(+40, 10000<amount<=50000, mutually exclusive with
  VERY_HIGH_VALUE), NEAR_THRESHOLD(+30, 9000<=amount<10000), WATCHLIST_ACCOUNT(+40,
  destination in WATCHLIST={'ACC-9999'}), OFF_HOURS(+20, UTC hour 0-4),
  CROSS_BORDER(+15, metadata.country !== 'US'); cap score at 100 and return the
  triggered rule codes. Amount comparisons via decimal.js only. Implement
  processTransaction(record) adding risk_score and risk_factors, and setting status
  'rejected' with reason 'FRAUD_SUSPECTED' when score >= 70, 'flagged_for_review'
  with requires_review=true when 30 <= score < 70, else 'cleared'. Implement
  run({inputDir, processingDir, outputDir, resultsDir}) with the same
  envelope/processing/audit behavior as the validator, reading envelopes addressed
  to 'fraud_detector' and targeting 'settlement'; fraud rejections (masked) go to
  resultsDir with their risk_score and risk_factors."
File to CREATE: homework-6/pipeline/fraud-detector.js
Function to CREATE: scoreTransaction(record) -> {score, factors},
  processTransaction(record) -> record
Details: On sample data: TXN003 scores 70 (NEAR_THRESHOLD+WATCHLIST_ACCOUNT) and is
  rejected; TXN002 scores 40, TXN004 scores 35 (OFF_HOURS+CROSS_BORDER), TXN005
  scores 50 — all flagged_for_review; TXN001/TXN008 score 0 and are cleared.
```

### Task 4: Settlement stage

```
Task: Settlement Processing Stage
Prompt: "Read homework-6/specification.md (settlement fee schedule) and create
  homework-6/pipeline/settlement.js (ESM). Implement calculateFee(amount: Decimal,
  transactionType) -> Decimal per the schedule: wire_transfer 0.1% with 25.00
  minimum, transfer flat 0.25, refund 0.00, otherwise 0.50 — quantized once to 2 dp
  with Decimal.ROUND_HALF_UP. Implement processTransaction(record) setting fee,
  net_amount (amount - fee, as .toFixed(2) strings), settled_at (ISO 8601 UTC) and
  status 'settled', preserving requires_review if present. Implement run({inputDir,
  processingDir, resultsDir}) reading envelopes addressed to 'settlement', writing
  final envelopes (source_stage 'settlement', target_stage 'results', record masked
  via common.maskRecord) into resultsDir, audit-logging each settlement without
  unmasked accounts or amounts in the log detail."
File to CREATE: homework-6/pipeline/settlement.js
Function to CREATE: calculateFee(amount, transactionType) -> Decimal,
  processTransaction(record) -> record
Details: All decimal.js arithmetic; e.g. TXN002 fee = 25.00 (0.1% of 25000), TXN005
  fee = 75.00, TXN001 fee = 0.25. Result files are the only place accounts are
  masked persistently — earlier working files keep originals.
```

### Task 5: Orchestrator

```
Task: Orchestrator / pipeline runner
Prompt: "Read homework-6/specification.md and create homework-6/orchestrator.js
  (ESM). Export async main(argv) that: (1) creates/clears
  shared/{input,processing,output,results} under the homework-6 root (resolve via
  import.meta.url, never cwd); (2) loads sample-transactions.json (amounts remain
  strings — plain JSON.parse) and drops one envelope per record into shared/input/
  with source_stage 'orchestrator', target_stage 'validator'; (3) runs
  validator.run, fraudDetector.run and settlement.run in order, wiring
  shared/output/ between stages and shared/results/ for rejections; (4) verifies
  every input transaction_id has exactly one file in shared/results/, catching
  per-record infrastructure exceptions as audit 'stage_error' without aborting;
  (5) writes shared/results/summary.json with run_id, started/finished ISO 8601 UTC
  timestamps, counts by final status, requires_review count, rejection reasons by
  transaction, and per-currency total settled net amount (Decimal sums serialized
  with .toFixed(2); masked accounts only; no description fields); (6) prints a
  human-readable summary table and returns exit code 0 on success, 1 if any
  transaction is unaccounted for. Support '--transactions <path>' and '--root
  <path>' flags (tests use a temp root). Add a CLI guard so 'node orchestrator.js'
  runs main and exits with its code."
File to CREATE: homework-6/orchestrator.js
Function to CREATE: async main(argv) -> number
Details: Sequential single-process run (no daemons) so the demo is deterministic.
  Deliverable check from TASKS.md: after 'node orchestrator.js', all 8 sample
  transactions appear in shared/results/ — 5 settled (3 of them requires_review)
  and 3 rejected.
```

### Task 6: Front-end (React dashboard + Express API)

```
Task: Front-end dashboard (React + Express)
Prompt: "Read homework-6/specification.md and create the front-end. (a)
  homework-6/frontend/server.js (ESM, Express): GET /api/summary → contents of
  shared/results/summary.json (404 JSON error if no run yet); GET /api/transactions
  → array of final result envelopes' data from shared/results/; POST /api/run →
  awaits orchestrator.main([]) and returns the fresh summary; serves
  frontend/dist/ statically at '/'; listens on PORT env or 3000. The API must never
  return unmasked accounts (results are already masked — do not re-read working
  dirs). (b) A React 18 + Vite app in homework-6/frontend/ (package.json,
  vite.config.js with dev-server proxy /api → http://localhost:3000, index.html,
  src/main.jsx, src/App.jsx, src/styles.css): a 'Run pipeline' button calling POST
  /api/run with a loading state, stat cards for total/settled/review/rejected
  counts, per-currency settled totals, and a table with transaction_id, masked
  accounts, amount+currency, risk score, status badge (settled / review / rejected)
  and rejection reason, loaded from /api/transactions on mount and after each run.
  Errors (e.g. no run yet) render as a friendly empty state. No state library, no
  CSS framework."
File to CREATE: homework-6/frontend/server.js, frontend/package.json,
  frontend/vite.config.js, frontend/index.html, frontend/src/{main.jsx,App.jsx,styles.css}
Function to CREATE: Express handlers getSummary(), getTransactions(), runPipeline(); React component App()
Details: Read-only view over shared/results/ plus a trigger endpoint — the frontend
  never implements business logic. Production mode: 'npm run build' in frontend/,
  then 'node frontend/server.js' serves API + dist on :3000. This satisfies the
  'simple front-end' requirement of Task 2 (screenshot: docs/screenshots/frontend.png).
```

### Task 7: Test suite

```
Task: Unit and integration tests
Prompt: "Read homework-6/specification.md and create node:test suites under
  homework-6/tests/: validator.test.js (each rejection reason, each required field,
  boundary amounts '0.00'/'0.01'/3-dp, dry-run counts on sample data),
  fraud-detector.test.js (each rule in isolation, rule combinations from the
  expected-outcomes table, thresholds 29/30/69/70, score cap at 100),
  settlement.test.js (fee schedule incl. wire minimum boundary at 25000.00,
  ROUND_HALF_UP behavior, net_amount, masking in results), and integration.test.js
  running orchestrator.main(['--root', <mkdtemp dir>, '--transactions', <copy of
  sample-transactions.json>]) and asserting all 8 result files, the exact statuses
  from the specification's expected-outcomes table, and summary.json counts
  {settled: 5, rejected: 3, requires_review: 3}. Tests must never touch the real
  shared/ directory. Scripts: 'npm test' = node --test tests/, 'npm run coverage' =
  c8 --check-coverage --lines 80 node --test tests/. Target ≥ 90% on pipeline/ and
  orchestrator.js."
File to CREATE: homework-6/tests/validator.test.js, fraud-detector.test.js,
  settlement.test.js, integration.test.js
Function to CREATE: node:test test cases per case above
Details: Owned by Agent 3 (unit tests) with the coverage gate hook from Task 3
  blocking pushes below 80%. The expected-outcomes table in section 2 is the
  integration-test oracle.
```
