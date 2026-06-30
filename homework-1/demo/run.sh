#!/usr/bin/env bash
# Start the Banking Transactions API (Homework 1).
# Creates a virtualenv, installs dependencies, and launches the server on :8000.
set -euo pipefail

# Resolve the homework-1 directory regardless of where the script is called from.
HW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HW_DIR"

if [ ! -d ".venv" ]; then
  echo "==> Creating virtual environment (.venv)"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> Installing dependencies"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "==> Starting API at http://localhost:8000 (docs at /docs)"
exec uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
