#!/usr/bin/env bash
# Installs the repo's git hooks (currently: pre-push coverage gate) into .git/hooks/.
# Run once after cloning: homework-6/scripts/install-git-hooks.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

install -m 0755 "$SCRIPT_DIR/git-hooks/pre-push" "$HOOKS_DIR/pre-push"
echo "Installed pre-push coverage gate hook -> $HOOKS_DIR/pre-push"
