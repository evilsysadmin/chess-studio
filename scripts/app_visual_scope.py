#!/usr/bin/env python3
"""Classify which expensive app-visual surfaces a PR actually needs to capture.

Unknown/global visual changes fail safe to the full canonical set. Manual runs use
--all and therefore keep the historical full-canon behaviour.
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

GROUP_ORDER = ("home", "experiments", "training", "warroom", "health")
EXPERIMENT_ORDER = ("landing", "chronicles", "pawnslug")


@dataclass(frozen=True)
class Scope:
    groups: tuple[str, ...]
    hans: bool = False
    chesscom: bool = False
    experiment_parts: tuple[str, ...] = ()

    @property
    def capture_groups(self) -> str:
        return ",".join(self.groups) if self.groups else "none"

    @property
    def experiments_scope(self) -> str:
        if "experiments" not in self.groups:
            return "none"
        return ",".join(self.experiment_parts or EXPERIMENT_ORDER)

    @property
    def warroom(self) -> bool:
        return "warroom" in self.groups


def full_scope() -> Scope:
    return Scope(GROUP_ORDER, hans=True, chesscom=True, experiment_parts=EXPERIMENT_ORDER)


def _surface_groups(path: str) -> set[str] | None:
    """Return explicit groups, empty set for optional-only, or None for full fallback."""
    lower = path.lower()
    name = Path(lower).name

    # Changes to the orchestrator itself must prove the entire contract.
    if (
        lower.startswith(".github/actions/app-visual-pipeline/")
        or lower == ".github/workflows/app-visual-artifact.yml"
        or lower.startswith("scripts/app_visual_")
        or lower == "scripts/war_room_visual_freeze_check.mjs"
    ):
        return None

    if lower.startswith("e2e/"):
        if "chesscom" in name:
            return set()
        if name in {"browser-runtime-health.spec.js", "browser-storage-health.spec.js"}:
            return {"health"}
        if name in {
            "app-visual-artifact.spec.js",
            "matthias-home-visual-artifact.spec.js",
            "home-3d-focus-visual.spec.js",
        }:
            return {"home"}
        if name in {"experiments-visual-artifact.spec.js", "chronicles-avatar-visual-artifact.spec.js"}:
            return {"experiments"}
        if name == "training-visual-artifact.spec.js":
            return {"training"}
        if name.startswith("war-room-") and "visual" in name:
            return {"warroom"}
        # An unknown visual/E2E producer is safer as full canonical.
        return None

    if lower.startswith("frontend/public/"):
        return None

    if not lower.startswith("frontend/src/"):
        return None

    if "chesscom" in lower:
        return set()

    groups: set[str] = set()
    if any(token in lower for token in ("experiment", "pawnslug", "pawn-slug", "chronicles", "trailblazer", "arcade")):
        groups.add("experiments")
    if any(token in lower for token in ("training", "tutorial", "glossary", "school", "mechanic-library")):
        groups.add("training")
    if any(token in lower for token in ("war-room", "warroom", "board3d", "gameboardview", "gamesidecolumn", "game3d")):
        groups.add("warroom")
    if any(token in lower for token in ("illustrated-home", "homecastle", "home-castle", "/home", "castle3d")):
        groups.add("home")

    # Matthias is rendered independently on Home and inside War Room. A shared
    # Matthias component can affect either, while school-specific files were
    # already classified above as training.
    if "matthias" in lower and "school" not in lower:
        groups.update(("home", "warroom"))

    if groups:
        return groups

    # Generic JSX/CSS/components/assets can have cross-surface impact. Do not
    # guess narrowly: retain the historical full suite for ambiguous changes.
    return None


def _experiment_parts(path: str) -> set[str]:
    lower = path.lower()
    name = Path(lower).name
    if name == "experiments-visual-artifact.spec.js":
        return set(EXPERIMENT_ORDER)
    if name == "chronicles-avatar-visual-artifact.spec.js" or "chronicles" in lower:
        return {"chronicles"}
    if "pawnslug" in lower or "pawn-slug" in lower:
        return {"pawnslug"}
    if "trailblazer" in lower or "arcade" in lower:
        return {"landing"}
    # The Experiments hub owns navigation into both sub-modes; changes to the
    # hub itself prove all three paths, not merely its landing screenshot.
    if "experiment" in lower:
        return set(EXPERIMENT_ORDER)
    return set(EXPERIMENT_ORDER)


def classify(paths: list[str]) -> Scope:
    cleaned = [path.strip().replace("\\", "/") for path in paths if path.strip()]
    if not cleaned:
        return full_scope()

    groups: set[str] = set()
    experiment_parts: set[str] = set()
    hans = False
    chesscom = False

    for path in cleaned:
        lower = path.lower()
        if "chesscom" in lower:
            chesscom = True
        if any(token in lower for token in ("hans", "board3d", "warroom", "war-room", "gameboardview")):
            hans = True

        surface = _surface_groups(path)
        if surface is None:
            return full_scope()
        groups.update(surface)
        if "experiments" in surface:
            experiment_parts.update(_experiment_parts(path))

    ordered = tuple(group for group in GROUP_ORDER if group in groups)
    ordered_experiments = tuple(part for part in EXPERIMENT_ORDER if part in experiment_parts)
    return Scope(ordered, hans=hans, chesscom=chesscom, experiment_parts=ordered_experiments)


def write_outputs(scope: Scope, output_path: str) -> None:
    values = {
        "capture_groups": scope.capture_groups,
        "experiments_scope": scope.experiments_scope,
        "warroom": str(scope.warroom).lower(),
        "hans": str(scope.hans).lower(),
        "chesscom": str(scope.chesscom).lower(),
    }
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def self_test() -> None:
    pawn = classify(["frontend/src/pawnSlugThree.js"])
    assert pawn.capture_groups == "experiments" and pawn.experiments_scope == "pawnslug"
    chronicles = classify(["frontend/src/chroniclesDungeon.js"])
    assert chronicles.capture_groups == "experiments" and chronicles.experiments_scope == "chronicles"
    trailblazer = classify(["frontend/src/pawnTrailblazerThree.js"])
    assert trailblazer.experiments_scope == "landing"
    hub = classify(["frontend/src/components/ExperimentsScreen.jsx"])
    assert hub.experiments_scope == "landing,chronicles,pawnslug"
    assert classify(["frontend/src/components/WarRoom3D.jsx"]) == Scope(("warroom",), hans=True)
    assert classify(["frontend/src/components/HomeCastle3D.jsx"]).capture_groups == "home"
    assert classify(["frontend/src/components/MatthiasAvatar.jsx"]).capture_groups == "home,warroom"
    assert classify(["frontend/src/components/MatthiasSchool.jsx"]).capture_groups == "training"
    assert classify(["e2e/browser-storage-health.spec.js"]).capture_groups == "health"
    chesscom = classify(["frontend/src/chesscomClient.js"])
    assert chesscom.capture_groups == "none" and chesscom.chesscom
    assert classify(["frontend/src/App.css"]) == full_scope()
    assert classify([".github/actions/app-visual-pipeline/action.yml"]) == full_scope()
    print("app visual scope self-test: OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="force the historical full canonical capture")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0

    scope = full_scope() if args.all else classify(sys.stdin.read().splitlines())
    if args.github_output:
        write_outputs(scope, args.github_output)
    else:
        print(f"capture_groups={scope.capture_groups}")
        print(f"experiments_scope={scope.experiments_scope}")
        print(f"warroom={str(scope.warroom).lower()}")
        print(f"hans={str(scope.hans).lower()}")
        print(f"chesscom={str(scope.chesscom).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
