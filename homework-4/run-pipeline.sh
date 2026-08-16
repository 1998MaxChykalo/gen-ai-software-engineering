#!/usr/bin/env bash
#
# run-pipeline.sh — single-command runner for the homework-4 agent pipeline.
#
#   Bug Researcher -> Research Verifier -> Bug Planner -> Bug Fixer
#                                       -> Security Verifier -> Unit Test Generator
#
# Each stage is a headless Claude Code invocation (`claude -p`). The agent
# definition (agents/*.agent.md) is loaded as the system prompt, the model is
# taken from the agent file's frontmatter, and referenced skills are loaded
# automatically because each agent's definition instructs it to read its skill
# file from skills/.
#
# Usage:   ./run-pipeline.sh          (or: npm run pipeline)
# Requires: Claude Code CLI (`claude`) on PATH, run from homework-4/.

set -euo pipefail
cd "$(dirname "$0")"

BATCH="context/bugs/001"
LOG="docs/pipeline-run.log"
mkdir -p docs "${BATCH}/research"
: > "$LOG"

# Extract `model:` from an agent file's YAML frontmatter.
agent_model() {
  awk '/^model:/ { print $2; exit }' "$1"
}

# Strip the YAML frontmatter, leaving the agent's instructions.
agent_body() {
  awk 'BEGIN{fm=0} /^---$/{fm++; next} fm!=1 {print}' "$1"
}

run_agent() {
  local agent_file="$1" task_prompt="$2"
  local model
  model="$(agent_model "$agent_file")"
  echo "" | tee -a "$LOG"
  echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG"
  echo "▶ STAGE: ${agent_file}  (model: ${model})" | tee -a "$LOG"
  echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG"
  claude -p "$task_prompt" \
    --model "$model" \
    --append-system-prompt "$(agent_body "$agent_file")" \
    --allowedTools "Read" "Grep" "Glob" "Edit" "Write" "Bash(npm test:*)" "Bash(node:*)" \
    --permission-mode acceptEdits \
    2>&1 | tee -a "$LOG"
}

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "✖ Expected artifact missing: $1 — pipeline stopped." | tee -a "$LOG"
    exit 1
  fi
  echo "✔ Artifact produced: $1" | tee -a "$LOG"
}

echo "Tiny Expense Tracker — 4-agent pipeline ($(date))" | tee -a "$LOG"

# 1. Bug Researcher
run_agent agents/bug-researcher.agent.md \
  "Investigate all reports in ${BATCH}/bug-context.md and write ${BATCH}/research/codebase-research.md as your agent definition specifies."
require_file "${BATCH}/research/codebase-research.md"

# 2. Bug Research Verifier (uses skills/research-quality-measurement.md)
run_agent agents/research-verifier.agent.md \
  "Verify ${BATCH}/research/codebase-research.md. Apply skills/research-quality-measurement.md and write ${BATCH}/research/verified-research.md in the skill's required format."
require_file "${BATCH}/research/verified-research.md"

# Gate: stop if verification failed.
if grep -q "Overall: FAIL" "${BATCH}/research/verified-research.md"; then
  echo "✖ Research verification FAILED — pipeline stopped before planning." | tee -a "$LOG"
  exit 1
fi

# 3. Bug Planner
run_agent agents/bug-planner.agent.md \
  "Create ${BATCH}/implementation-plan.md from ${BATCH}/research/verified-research.md as your agent definition specifies."
require_file "${BATCH}/implementation-plan.md"

# 4. Bug Fixer
run_agent agents/bug-fixer.agent.md \
  "Execute ${BATCH}/implementation-plan.md exactly and write ${BATCH}/fix-summary.md as your agent definition specifies."
require_file "${BATCH}/fix-summary.md"

# 5. Security Vulnerabilities Verifier (on changed code)
run_agent agents/security-verifier.agent.md \
  "Review the changes recorded in ${BATCH}/fix-summary.md and write ${BATCH}/security-report.md as your agent definition specifies. Report only — no code edits."
require_file "${BATCH}/security-report.md"

# 6. Unit Test Generator (uses skills/unit-tests-FIRST.md, on changed code)
run_agent agents/unit-test-generator.agent.md \
  "Generate FIRST-compliant unit tests for the code changed in ${BATCH}/fix-summary.md, run them, and write ${BATCH}/test-report.md. Apply skills/unit-tests-FIRST.md."
require_file "${BATCH}/test-report.md"

echo "" | tee -a "$LOG"
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG"
echo "✔ Pipeline complete. Final test run:" | tee -a "$LOG"
npm test 2>&1 | tail -8 | tee -a "$LOG"
