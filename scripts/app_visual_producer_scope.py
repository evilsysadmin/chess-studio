#!/usr/bin/env python3
"""Resolve the smallest canonical visual producer set for a PR.

This is an optimization layer on top of app_visual_scope.py, not a replacement.
Unknown/shared ownership deliberately falls back to ``all`` so visual coverage is
never reduced merely because a new file name was not taught to this classifier.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PRODUCER_ORDER = (
    "home-base",
    "home-matthias",
    "home-focus",
    "experiments-hub",
    "chronicles-tactics",
    "chronicles-gameplay",
    "chronicles-avatar",
    "training",
    "warroom-core",
    "warroom-decor",
    "warroom-armor",
    "warroom-hans",
    "health-runtime",
    "health-storage",
)
WARROOM_ALL = {"warroom-core", "warroom-decor", "warroom-armor", "warroom-hans"}
HOME_ALL = {"home-base", "home-matthias", "home-focus"}
CHRONICLES_SHARED = {"chronicles-tactics", "chronicles-gameplay"}


def _csv(values: set[str] | None) -> str:
    if values is None:
        return "all"
    if not values:
        return "none"
    return ",".join(item for item in PRODUCER_ORDER if item in values)


def _e2e_producer(name: str) -> set[str] | None:
    exact = {
        "app-visual-artifact.spec.js": {"home-base"},
        "matthias-home-visual-artifact.spec.js": {"home-matthias"},
        "home-3d-focus-visual.spec.js": {"home-focus"},
        "experiments-visual-artifact.spec.js": {"experiments-hub"},
        "chronicles-tactics-visual-artifact.spec.js": {"chronicles-tactics"},
        "chronicles-gameplay-visual-artifact.spec.js": {"chronicles-gameplay"},
        "chronicles-avatar-visual-artifact.spec.js": {"chronicles-avatar"},
        "training-visual-artifact.spec.js": {"training"},
        "war-room-visual-artifact.spec.js": {"warroom-core"},
        "war-room-decor-visual-artifact.spec.js": {"warroom-decor"},
        "war-room-armor-oblique-visual-artifact.spec.js": {"warroom-armor"},
        "war-room-hans-visual-artifact.spec.js": {"warroom-hans"},
        "browser-runtime-health.spec.js": {"health-runtime"},
        "browser-storage-health.spec.js": {"health-storage"},
    }
    if name in exact:
        return exact[name]
    if "chesscom" in name or name == "war-room-hans-routines-visual.spec.js":
        return set()
    return None


def classify_path(path: str) -> set[str] | None:
    lower = path.lower().replace("\\", "/")
    name = Path(lower).name

    # Changes to the producer orchestration itself prove the full contract.
    if (
        lower == "scripts/app_visual_producer_scope.py"
        or lower == "scripts/app_visual_capture.sh"
        or lower.startswith(".github/actions/app-visual-pipeline/")
        or lower == ".github/workflows/app-visual-artifact.yml"
    ):
        return None

    if lower.startswith("e2e/"):
        return _e2e_producer(name)

    if lower.startswith("frontend/public/"):
        return None
    if not lower.startswith("frontend/src/"):
        # Build metadata that cannot affect pixels needs no canonical capture.
        if lower in {"scripts/css_architecture_manifest.json"}:
            return set()
        return None

    if ".test." in name or ".spec." in name:
        return set()
    if "chesscom" in lower:
        return set()
    if lower.startswith("frontend/src/admin") or name.startswith(("admin", "observability", "useadmin")):
        return set()

    # This seam is shared by the two Chronicles WebGL surfaces only. Treating
    # the word "experimental" as the whole Experiments hub was a major source
    # of unnecessary captures.
    if name == "experimentalthreerenderer.js":
        return set(CHRONICLES_SHARED)

    if "chronicles" in lower:
        if "tactics" in lower or "isometric" in lower:
            return {"chronicles-tactics"}
        if any(token in lower for token in ("scavenger", "spectral", "blenderart", "enemyart")):
            return set(CHRONICLES_SHARED)
        if any(token in lower for token in ("portrait", "party", "avatar")):
            return {"chronicles-gameplay", "chronicles-avatar"}
        if name == "chroniclesofmatthias.jsx":
            return {"chronicles-gameplay", "chronicles-avatar"}
        if any(token in lower for token in ("three", "dungeon", "atmosphere", "patina", "turn", "encounter", "event", "treasure")):
            return {"chronicles-gameplay"}
        # Unknown Chronicles ownership stays inside Chronicles, but proves both
        # gameplay renderers rather than widening to Pawn Slug/Arcade.
        return set(CHRONICLES_SHARED)

    if any(token in lower for token in ("pawnslug", "pawn-slug", "trailblazer", "arcade")):
        return {"experiments-hub"}
    if "experimentsscreen" in lower or "/experiments" in lower:
        return {"experiments-hub"}

    if any(token in lower for token in ("war-room", "warroom", "board3d", "gameboardview", "gamesidecolumn", "game3d")):
        if any(token in lower for token in ("board3d", "warroom3d", "gameboardview", "game3d")):
            return set(WARROOM_ALL)
        if "armor" in lower or "armour" in lower:
            return {"warroom-armor"}
        if "hans" in lower:
            return {"warroom-hans"}
        if any(token in lower for token in (
            "cat", "decor", "ambientlife", "rain", "sofa", "plant", "fireplace", "lighting", "light", "roomtone"
        )):
            return {"warroom-decor"}
        return set(WARROOM_ALL)

    if any(token in lower for token in ("illustrated-home", "homecastle", "home-castle", "/home", "castle3d")):
        return set(HOME_ALL)

    if "matthias" in lower and "school" not in lower:
        return {"home-matthias", "warroom-core"}

    if any(token in lower for token in (
        "training", "tutorial", "glossary", "school", "mechanic-library", "openingsscreen",
        "insights", "career-dossier", "careerscreen", "rivalrydossier",
    )):
        return {"training"}

    # Generic/global CSS, components and assets remain fail-safe.
    return None


def classify(paths: list[str]) -> str:
    cleaned = [path.strip() for path in paths if path.strip()]
    if not cleaned:
        return "all"
    producers: set[str] = set()
    for path in cleaned:
        owned = classify_path(path)
        if owned is None:
            return "all"
        producers.update(owned)
    return _csv(producers)


def self_test() -> None:
    assert classify(["frontend/src/chroniclesOfMatthiasIsometric.js"]) == "chronicles-tactics"
    assert classify(["frontend/src/components/ChroniclesOfMatthiasTactics.jsx"]) == "chronicles-tactics"
    assert classify(["frontend/src/chroniclesDungeon.js"]) == "chronicles-gameplay"
    assert classify(["frontend/src/experimentalThreeRenderer.js"]) == "chronicles-tactics,chronicles-gameplay"
    assert classify(["frontend/src/chroniclesOfMatthiasSpectralBishop.js"]) == "chronicles-tactics,chronicles-gameplay"
    assert classify(["frontend/src/components/WarRoomCatDecor.js"]) == "warroom-decor"
    assert classify(["frontend/src/components/WarRoomArmorDisplay.js"]) == "warroom-armor"
    assert classify(["frontend/src/components/WarRoomHansPerGame.jsx"]) == "warroom-hans"
    assert classify(["frontend/src/components/Board3DCore.jsx"]) == "warroom-core,warroom-decor,warroom-armor,warroom-hans"
    assert classify(["e2e/war-room-decor-visual-artifact.spec.js"]) == "warroom-decor"
    assert classify(["e2e/browser-storage-health.spec.js"]) == "health-storage"
    assert classify(["frontend/src/components/AdminDashboardContent.jsx"]) == "none"
    assert classify(["frontend/src/App.css"]) == "all"
    assert classify([
        "frontend/src/chroniclesOfMatthiasIsometric.js",
        "frontend/src/chroniclesDungeon.js",
    ]) == "chronicles-tactics,chronicles-gameplay"
    print("app visual producer scope self-test: OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0
    result = "all" if args.all else classify(sys.stdin.read().splitlines())
    if args.github_output:
        with open(args.github_output, "a", encoding="utf-8") as handle:
            handle.write(f"producer_scope={result}\n")
    else:
        print(f"producer_scope={result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
