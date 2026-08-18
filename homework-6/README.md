# Homework 6 — AI-Powered Transaction Processing Pipeline

**Created by Maksym Chykalo**

## What this system does

A file-based transaction processing pipeline built with a four-agent AI workflow.
Raw banking transactions from `sample-transactions.json` travel through three
sequential stages — validation, fraud detection, and settlement — communicating
exclusively through JSON message envelopes in shared directories. Every transaction
ends up in `shared/results/` with an auditable outcome: **settled** (optionally
flagged `requires_review`) or **rejected** with a machine-readable reason. Monetary
amounts are handled exclusively with `decimal.js` (never native floats), account
numbers are masked everywhere they persist (`ACC-1001` → `ACC-**01`), and every
operation is written to an ISO 8601 audit trail.

The pipeline is observable three ways: a **React dashboard** (run trigger, stat
cards, per-transaction table), a **CLI summary table**, and a **custom MCP server**
that lets Claude query outcomes (`get_transaction_status`, `list_pipeline_results`,
resource `pipeline://summary`). The development workflow itself is a deliverable:
each of the four AI agents is a first-class Claude Code artifact, backed by slash
commands, a coverage-gate push hook, and context7-powered documentation lookups.

## Pipeline stage responsibilities

- **Validator** (`pipeline/validator.js`) — structural checks only: required fields,
  positive ≤2-dp decimal amount, ISO 4217 currency allowlist, ISO 8601 timestamp.
  Invalid records are rejected with `MISSING_FIELD` / `INVALID_AMOUNT` /
  `INVALID_CURRENCY` / `INVALID_TIMESTAMP`. Also runnable standalone: `--dry-run`.
- **Fraud detector** (`pipeline/fraud-detector.js`) — additive risk scoring 0–100
  (high value, structuring near the $10k threshold, watchlisted destination,
  off-hours, cross-border). Score ≥ 70 rejects (`FRAUD_SUSPECTED`); 30–69 continues
  with `requires_review: true`; < 30 is cleared.
- **Settlement** (`pipeline/settlement.js`) — fee calculation per transaction type
  (`ROUND_HALF_UP`, rounded once), net amount, `settled_at` stamp; persists the
  final record with masked accounts.
- **Orchestrator** (`orchestrator.js`) — prepares `shared/`, seeds input envelopes,
  runs the stages in order, verifies every transaction has exactly one result, and
  writes `summary.json` (counts, review count, rejection reasons, per-currency
  settled totals).

## Architecture

```
                        ┌──────────────────────────────────────────────┐
                        │            orchestrator.js                   │
                        │  seeds input · runs stages · writes summary  │
                        └──────┬───────────────────────────▲───────────┘
                               │ envelopes                 │ verify + summary.json
sample-transactions.json ──────┘                           │
                                                           │
   shared/input/          shared/output/       shared/output/        shared/results/
        │                      │                     │                     ▲
        ▼                      ▼                     ▼                     │
  ┌───────────┐         ┌───────────────┐      ┌────────────┐             │
  │ validator │────────▶│ fraud_detector│─────▶│ settlement │─────────────┤ settled
  └─────┬─────┘         └──────┬────────┘      └────────────┘             │ (+review flag)
        │ invalid              │ score ≥ 70                               │
        └──────────────────────┴──────────────────────────────────────────┤ rejected
                        (each stage: claim → shared/processing/ → emit)   │ + reason
                                                                          │
              ┌───────────────────────────┬──────────────────────────────┤
              ▼                           ▼                              ▼
    ┌──────────────────┐        ┌──────────────────┐          ┌───────────────────┐
    │ React dashboard  │        │  audit.log       │          │ MCP pipeline-status│
    │ (Express /api/*) │        │  (ISO 8601, PII- │          │ tools + resource   │
    │  + Run trigger   │        │   masked lines)  │          │ for Claude         │
    └──────────────────┘        └──────────────────┘          └───────────────────┘
```

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ (18.13+ works for the pipeline), ES modules |
| Money arithmetic | `decimal.js` — the pipeline core's only dependency |
| Front-end | React 18 + Vite; Express serves the built app and the JSON API |
| Testing | built-in `node:test` runner + `c8` coverage (63 tests, ~93% lines) |
| Quality gate | pre-push hook blocks below 80% line coverage (Claude Code hook + native git hook) |
| MCP | context7 (docs lookups) + custom FastMCP server (Python 3.12, `fastmcp`) |
| AI workflow | Claude Code: 2 agents, 3 slash commands, 1 PreToolUse hook |

## The four-agent workflow (assignment deliverables)

| Agent | Artifact | Extra |
|---|---|---|
| 1 — Specification | `.claude/agents/spec-writer.md`, `/write-spec` skill | produced `specification.md` |
| 2 — Code generation | pipeline + frontend code | 3 context7 queries documented in `research-notes.md` |
| 3 — Unit tests | `.claude/agents/unit-test-writer.md`, `tests/` | coverage gate hook blocks push < 80% |
| 4 — Documentation | this README, `HOWTORUN.md`, `docs/presentation.pdf` | includes the author's name |

Skills: `/write-spec`, `/run-pipeline`, `/validate-transactions` (`.claude/commands/`).
Project rules for any AI agent working here: `agents.md`. Full spec: `specification.md`.

## Quick start

```bash
cd homework-6
npm install
node orchestrator.js       # run the pipeline; results land in shared/results/
```

Expected: `total: 8  settled: 5  requires_review: 3  rejected: 3` — TXN003 rejected
for suspected fraud (risk 70), TXN006 for an invalid currency, TXN007 for a negative
amount. Full setup (front-end, tests, MCP, hooks): see [HOWTORUN.md](HOWTORUN.md).

## Documentation map

| File | Contents |
|---|---|
| [specification.md](specification.md) | Full spec: objectives, rules, low-level tasks |
| [agents.md](agents.md) | Agent guardrails + the four-agent workflow |
| [HOWTORUN.md](HOWTORUN.md) | Step-by-step: pipeline, front-end, tests, MCP, hooks |
| [research-notes.md](research-notes.md) | context7 queries and applied insights |
| [docs/presentation.pdf](docs/presentation.pdf) | Capstone presentation |
| `docs/screenshots/` | Evidence: pipeline run, dashboard, coverage, hook, MCP |
