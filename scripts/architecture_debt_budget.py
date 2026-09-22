#!/usr/bin/env python3
"""Fail on silent regrowth of the largest orchestration modules.

This is a descending containment ratchet, not a style metric. A hotspot may
never exceed its ceiling, and any shrink must lower that ceiling in the same
change so paid-down debt cannot silently regrow.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUDGETS = {
    "frontend/src/App.jsx": 1174,
    "frontend/src/useGameLaunchController.js": 95,
    "frontend/src/components/GameScreen.jsx": 866,
    "frontend/src/components/Board3DCore.jsx": 1221,
    "frontend/src/components/useCombatController.js": 1270,
    "backend-python/game_api.py": 391,
    # Backlog hotspots: lower these ceilings whenever an extraction shrinks them.
    "backend-python/matthias_memory_store.py": 1264,
    "backend-python/narrative_cloudflare.py": 1038,
    # Audio remains productively reachable but is again large enough to deserve a ratchet.
    "frontend/src/sound.js": 2281,
    "frontend/src/ambientCatalog.js": 2046,
    "frontend/src/ambientProfilesLegacy.js": 630,
    # Mode/render hotspots not covered by the original orchestration budget.
    "frontend/src/components/RoguelikeScreen.jsx": 982,
    "frontend/src/components/CombatDeploymentView.jsx": 928,
    "frontend/src/chroniclesOfMatthiasIsometric.js": 1103,
    # Godot runtime hotspots: keep behavior stable while responsibilities are extracted.
    "games/pawn-slug-godot/scripts/main.gd": 3136,
    "games/pawn-slug-godot/scripts/matthias_art.gd": 2146,
}

failures = []
for relative, budget in BUDGETS.items():
    path = ROOT / relative
    lines = len(path.read_text(encoding="utf-8").splitlines())
    if lines > budget:
        failures.append(f"{relative}: {lines} lines > budget {budget}; extract a domain before adding more")
    elif lines < budget:
        failures.append(
            f"{relative}: {lines} lines < budget {budget}; lower the ratchet to {lines} in this same change"
        )
    else:
        print(f"architecture-debt · {relative}: {lines}/{budget}")

if failures:
    print("architecture-debt-budget FAIL")
    for failure in failures:
        print(f" - {failure}")
    raise SystemExit(1)
print("architecture-debt-budget OK · hotspot ceilings match current size and can only descend")
