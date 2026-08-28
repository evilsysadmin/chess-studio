#!/usr/bin/env python3
"""Fail on silent regrowth of the largest orchestration modules.

This is a containment budget, not a style metric. Crossing it means new logic
must be extracted into a domain/hook instead of extending an already risky
orchestrator.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUDGETS = {
    "frontend/src/App.jsx": 1250,
    "frontend/src/components/GameScreen.jsx": 1030,
    "frontend/src/components/useCombatController.js": 1310,
    "backend-python/game_api.py": 450,
}

failures = []
for relative, budget in BUDGETS.items():
    path = ROOT / relative
    lines = len(path.read_text(encoding="utf-8").splitlines())
    if lines > budget:
        failures.append(f"{relative}: {lines} lines > budget {budget}; extract a domain before adding more")
    else:
        print(f"architecture-debt · {relative}: {lines}/{budget}")

if failures:
    print("architecture-debt-budget FAIL")
    for failure in failures:
        print(f" - {failure}")
    raise SystemExit(1)
print("architecture-debt-budget OK · hotspot modules cannot silently regrow")
