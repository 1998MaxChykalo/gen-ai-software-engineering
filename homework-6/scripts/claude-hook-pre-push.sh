#!/usr/bin/env bash
# Claude Code PreToolUse hook (Task 3): intercepts Bash tool calls; when the command
# is a `git push`, runs the coverage gate and blocks the push (exit 2) if coverage
# is below 80%. Non-push commands pass through untouched (exit 0).
# Wired up in .claude/settings.json.
set -uo pipefail

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

# Only gate git push (covers `git push`, `git -C dir push`, `cd x && git push origin br`).
if ! printf '%s' "$CMD" | grep -Eq '(^|[^[:alnum:]_-])git[[:space:]]+([^;&|]*[[:space:]])?push([[:space:]]|$)'; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if "$SCRIPT_DIR/coverage-gate.sh"; then
  exit 0
fi

echo "PUSH BLOCKED by coverage gate hook: unit test line coverage is below 80% (or tests are failing/missing). Run 'npm run coverage' in homework-6/, fix the suite, then push again." >&2
exit 2
