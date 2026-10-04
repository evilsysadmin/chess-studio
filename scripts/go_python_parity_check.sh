#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python -m pip install --quiet   "$(grep -E '^chess==' backend-python/requirements.txt)"   "$(grep -E '^pydantic==' backend-python/requirements.txt)"

python scripts/chronicles_topology_parity_corpus.py --check
python scripts/engine_parity_corpus.py --check
python scripts/games_parity_corpus.py --check
python scripts/games_ops_corpus.py --check

(
  cd backend-go
  go test -count=1 -run 'MatchesPython' ./internal/residenteval ./internal/residentsearch
)
