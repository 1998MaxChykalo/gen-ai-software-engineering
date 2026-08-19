---
description: Generate a project specification (specification.md) following the course template
argument-hint: [project description or path to notes]
---

# /write-spec — Specification Generator (Agent 1)

Produce a complete `specification.md` for the project described in `$ARGUMENTS`
(if no arguments are given, assume the Homework 6 transaction processing pipeline
described in `homework-6/TASKS.md`).

## Reference material (read before writing)

1. `homework-3/specification-TEMPLATE-example.md` — the full specification template from Homework 3.
2. The task description for the assignment (e.g. `homework-6/TASKS.md`).
3. Any sample input data (e.g. `homework-6/sample-transactions.json`) — the spec's
   validation and business rules must be grounded in the actual data.

## Required structure of the generated specification.md

The document MUST contain exactly these five sections, in this order:

### 1. High-Level Objective
One sentence describing what the system does.

### 2. Mid-Level Objectives
4–5 concrete, **testable** requirements. Each objective must be verifiable by a
test or by inspecting an output file. Good example: "Transactions above $10,000
are flagged for fraud review with a risk score." Bad example: "The system is robust."

### 3. Implementation Notes
Must cover at minimum:
- Monetary values: precise decimal types (e.g. `decimal.Decimal` in Python) — **never float**
- Currency codes: ISO 4217
- Logging: audit trail with ISO 8601 timestamp, stage name, transaction ID, and outcome
- PII: account numbers and names are sensitive — no plaintext logging (mask them)
- Tech stack, code style, and error-handling conventions

### 4. Context
- **Beginning state**: files that exist before implementation starts
- **Ending state**: files/directories that exist when done, expected system state,
  and quality gates (e.g. test coverage target)

### 5. Low-Level Tasks
One entry per pipeline stage / component, each in exactly this format:

```
Task: [Pipeline Stage Name]
Prompt: "[Exact prompt to give Claude Code or Copilot]"
File to CREATE: [path, e.g. pipeline/validator.py]
Function to CREATE: [signature, e.g. process_transaction(record: dict) -> dict]
Details: [What the stage checks, transforms, or decides — concrete rules, not vague goals]
```

## Rules

- Ground every validation/business rule in the actual sample data — cite concrete
  examples (e.g. "TXN006 uses currency XYZ and must be rejected").
- Prompts inside Low-Level Tasks must be self-contained: someone could paste the
  prompt into a fresh session and get the right file.
- Keep ordering strict: earlier tasks must not depend on later ones.
- Write the result to `specification.md` in the assignment folder, then print a
  checklist confirming all 5 sections are present and each pipeline stage has a
  Low-Level Task entry.
