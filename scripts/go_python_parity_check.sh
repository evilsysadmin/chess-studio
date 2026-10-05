#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python -m pip install --quiet   "$(grep -E '^chess==' backend-python/requirements.txt)"   "$(grep -E '^pydantic==' backend-python/requirements.txt)"   "$(grep -E '^pymongo==' backend-python/requirements.txt)"   "$(grep -E '^bcrypt==' backend-python/requirements.txt)"   "$(grep -E '^argon2-cffi==' backend-python/requirements.txt)"   "$(grep -E '^pyjwt==' backend-python/requirements.txt)"   "$(grep -E '^httpx' backend-python/requirements.txt | head -1)"

python scripts/chronicles_topology_parity_corpus.py --check
python scripts/engine_parity_corpus.py --check
python scripts/games_parity_corpus.py --check
python scripts/games_ops_corpus.py --check
python scripts/cpu_policy_parity_corpus.py --check
python scripts/engine_history_parity_corpus.py --check
python scripts/engine_pv_parity_corpus.py --check
python scripts/engine_move_analysis_parity_corpus.py --check
python scripts/observability_history_parity_corpus.py --check
python scripts/profile_parity_corpus.py --check
python scripts/password_parity_corpus.py --check
python scripts/auth_guard_parity_corpus.py --check
python scripts/matthias_memory_parity_corpus.py --check
python scripts/matthias_memory_writes_parity_corpus.py --check
python scripts/narrative_parity_corpus.py --check

(
  cd backend-go
  go test -count=1 -run 'MatchesPython' ./internal/residenteval ./internal/residentsearch
  go test -count=1 -run 'MatchPython|MatchesPython' ./internal/residentpolicy ./internal/residentmove
  go test -count=1 -run 'MatchesPython' ./internal/gamesapi
  go test -count=1 -run 'MatchPython' ./internal/obshistory
  go test -count=1 -run 'MatchPython' ./internal/profilestore
  go test -count=1 -run 'MatchesPython|MatchPython' ./internal/authcrypto ./internal/authguard
  go test -count=1 -run 'MatchesPython|MatchPython' ./internal/matthiasmem ./internal/pyval ./internal/narrative
)
