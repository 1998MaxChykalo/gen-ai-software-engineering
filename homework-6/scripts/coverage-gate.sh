#!/usr/bin/env bash
# Coverage gate (Task 3): fails with non-zero exit if unit-test line coverage of the
# homework-6 pipeline is below 80% (c8 --check-coverage --lines 80 via `npm run coverage`).
# Used by both the Claude Code pre-push hook (.claude/settings.json) and the native
# git pre-push hook (scripts/git-hooks/pre-push).
set -uo pipefail

HW6_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HW6_DIR"

# Hooks may run in a non-interactive shell without nvm on PATH.
if ! command -v node >/dev/null 2>&1 && [ -d "$HOME/.nvm/versions/node" ]; then
  NEWEST_NODE="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NEWEST_NODE" ] && export PATH="$NEWEST_NODE:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "coverage-gate: BLOCKED — node not found on PATH; cannot verify coverage." >&2
  exit 1
fi

if ! ls tests/*.test.js >/dev/null 2>&1; then
  echo "coverage-gate: BLOCKED — no test files in homework-6/tests/ (coverage 0% < 80%)." >&2
  exit 1
fi

echo "coverage-gate: running 'npm run coverage' (c8 gate: lines >= 80%)..." >&2
OUTPUT="$(npm run coverage 2>&1)"
STATUS=$?
# Show the coverage table / error tail either way.
printf '%s\n' "$OUTPUT" | tail -20 >&2

if [ $STATUS -ne 0 ]; then
  echo "coverage-gate: BLOCKED — tests failing or line coverage below 80%." >&2
  exit 1
fi
echo "coverage-gate: PASSED — coverage meets the 80% gate." >&2
exit 0
