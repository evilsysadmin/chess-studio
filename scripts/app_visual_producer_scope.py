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
    "training-school",
    "training-openings",
    "training-puzzles",
    "training-tournament",
    "training-progress",
    "warroom-core",
    "warroom-decor",
    "warroom-armor",
    "warroom-hans",
    "health-runtime",
    "health-storage",
)
WARROOM_ALL = {"warroom-core", "warroom-decor", "warroom-armor", "warroom-hans"}
WARROOM_RENDERER_SHARED = {"warroom-core", "warroom-hans"}
WARROOM_CORE_ONLY_FILES = {
    # Presentation shell only: these affect the canonical War Room composition
    # and immersive viewport, but cannot change decor, armor or Hans ownership.
    "frontend/src/components/usewarroomimmersive.js",
    "frontend/src/components/warroomimmersive.css",
}
WARROOM_VARIANT_ORDER = ("classic", "v2", "v3")
WARROOM_VARIANT_ALL = set(WARROOM_VARIANT_ORDER)
WARROOM_CLASSIC_VARIANT_FILES = {
    "frontend/src/components/warroomclassicshell.js",
    "frontend/src/components/premiumwarroomscene.js",
    "frontend/src/components/warroomcastlearchitecture.js",
    "frontend/src/components/warroompremiumpaintings.js",
}
WARROOM_V2_VARIANT_FILES = {
    "frontend/src/components/warroomv2shell.js",
    "frontend/src/components/warroomfiresprites.js",
    "scripts/blender/publish_war_room_v2_staging.py",
    ".github/workflows/war-room-blender-art.yml",
}
WARROOM_V3_VARIANT_FILES = {
    "frontend/src/components/warroomv3shell.js",
    "frontend/src/components/warroomv3fire.js",
    "scripts/blender/build_war_room_v3.py",
    "scripts/blender/publish_war_room_v3.py",
    ".github/workflows/war-room-v3-blender-art.yml",
}
WARROOM_BLENDER_SHARED_VARIANT_FILES = {
    "frontend/src/components/warroomblendershellruntime.js",
    "frontend/src/components/warroomblendermaterials.js",
    "scripts/blender/build_war_room_premium.py",
}
WARROOM_SHARED_VARIANT_FILES = {
    "frontend/src/components/gamewarroomcommandcolumn.jsx",
    "frontend/src/components/warroomscenevariant.js",
    "frontend/src/components/warroomsharedviewport.css",
    "frontend/src/components/warroomvariant.js",
}
WARROOM_VARIANT_CORE_FILES = {
    "frontend/src/components/gamewarroomcommandcolumn.jsx",
    "frontend/src/components/warroomscenevariant.js",
    "frontend/src/components/warroomsharedviewport.css",
    "frontend/src/components/warroomclassicshell.js",
    "frontend/src/components/warroomblendershellruntime.js",
    "frontend/src/components/warroomblendermaterials.js",
    "frontend/src/components/warroomv2shell.js",
    "frontend/src/components/warroomv3shell.js",
    "frontend/src/components/warroomv3fire.js",
    "frontend/src/components/warroomvariant.js",
}
HOME_ALL = {"home-base", "home-matthias", "home-focus"}
CHRONICLES_SHARED = {"chronicles-tactics", "chronicles-gameplay"}
TRAINING_ALL = {
    "training-school",
    "training-openings",
    "training-puzzles",
    "training-tournament",
    "training-progress",
}
TRAINING_EXACT_PRODUCERS = {
    "frontend/src/components/puzzlescreen.jsx": {"training-puzzles"},
    "frontend/src/components/puzzlemobilepolish.css": {"training-puzzles"},
    "frontend/src/components/tournamentscreen.jsx": {"training-tournament"},
    "frontend/src/components/tournamentmobilepolish.css": {"training-tournament"},
}

PUBLIC_NONCANONICAL_PATHS = {
    "frontend/public/404.html",
    "frontend/public/cname",
    "frontend/public/_headers",
    "frontend/public/apple-touch-icon.png",
    "frontend/public/favicon-32.png",
    "frontend/public/favicon.svg",
    "frontend/public/manifest.webmanifest",
    "frontend/public/release.json",
    "frontend/public/sw.js",
}


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
        "matthias-home-visual-critical.spec.js": {"home-matthias"},
        "home-3d-focus-visual.spec.js": {"home-focus"},
        "experiments-visual-artifact.spec.js": {"experiments-hub"},
        "pawn-slug-godot-visual-artifact.spec.js": {"experiments-hub"},
        "chronicles-tactics-visual-artifact.spec.js": {"chronicles-tactics"},
        "chronicles-gameplay-visual-artifact.spec.js": {"chronicles-gameplay"},
        "chronicles-avatar-visual-artifact.spec.js": {"chronicles-avatar"},
        "training-visual-artifact.spec.js": set(TRAINING_ALL),
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
    if "war-room" in name or "three-d-war-room" in name:
        return {"warroom-core"}
    return None


def classify_path(path: str) -> set[str] | None:
    lower = path.lower().replace("\\", "/")
    name = Path(lower).name

    if lower.endswith(".md"):
        return set()
    if lower in {
        "scripts/app_visual_changed_files.py",
        "scripts/app_visual_scope.py",
        "scripts/app_visual_producer_scope.py",
    }:
        return set()
    if lower == "scripts/war_room_visual_freeze_check.mjs":
        return {"warroom-core"}
    if (
        lower == ".github/workflows/app-visual-artifact.yml"
        or lower.startswith(".github/actions/app-visual-pipeline/")
    ):
        return {"chronicles-tactics"}
    if lower == "scripts/app_visual_capture.sh":
        return None
    if lower in {
        "scripts/blender/build_war_room_premium.py",
        "scripts/blender/publish_war_room_v2_staging.py",
        ".github/workflows/war-room-blender-art.yml",
        "scripts/blender/build_war_room_v3.py",
        "scripts/blender/publish_war_room_v3.py",
        ".github/workflows/war-room-v3-blender-art.yml",
    }:
        return {"warroom-core"}

    if lower.startswith("e2e/"):
        return _e2e_producer(name)

    if lower.startswith("frontend/public/audio/"):
        return set()
    if lower.startswith("frontend/public/chesscom/"):
        return set()
    if lower in PUBLIC_NONCANONICAL_PATHS:
        return set()
    if lower == "frontend/public/models/chronicles-tactics-party.glb":
        return {"chronicles-tactics"}
    if lower in {
        "frontend/public/models/matthias-home-canonical.glb",
        "frontend/public/matthias-home-canonical.b64",
    }:
        return {"home-matthias"}
    if lower.startswith("frontend/public/"):
        return None

    if not lower.startswith("frontend/src/"):
        if lower in {
            "scripts/css_architecture_manifest.json",
            "scripts/async_resilience_gate.mjs",
            "scripts/blender_required_scope.py",
            "scripts/browser_quality_scope.py",
            "scripts/chess_rules_gate.mjs",
            "scripts/quality_scope.py",
            "scripts/workflow_debt_gate.py",
        }:
            return set()
        return None

    if ".test." in name or ".spec." in name:
        return set()
    if "chesscom" in lower:
        return set()
    if lower.startswith("frontend/src/admin") or name.startswith(("admin", "observability", "useadmin")):
        return set()

    if name == "experimentalthreerenderer.js":
        return set(CHRONICLES_SHARED)

    if lower in {"frontend/src/lablaunchintent.js", "frontend/src/usepuzzlelaunchflow.js"}:
        return set()
    if lower == "frontend/src/components/usegamemobilefocus.js":
        return {"warroom-core"}
    if lower == "frontend/src/components/labscreen.jsx":
        return {"experiments-hub"}
    if lower in TRAINING_EXACT_PRODUCERS:
        return set(TRAINING_EXACT_PRODUCERS[lower])

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
        return set(CHRONICLES_SHARED)

    if any(token in lower for token in ("pawnslug", "pawn-slug", "trailblazer", "arcade")):
        return {"experiments-hub"}
    if "experimentsscreen" in lower or "/experiments" in lower:
        return {"experiments-hub"}

    if lower in WARROOM_VARIANT_CORE_FILES or lower in WARROOM_CORE_ONLY_FILES:
        return {"warroom-core"}

    if any(token in lower for token in ("war-room", "warroom", "board3d", "gameboardview", "gamesidecolumn", "game3d")):
        # Class Room renders through Board3D too. Shared Board3D changes must
        # therefore produce both training proof and the existing War Room proof.
        if "board3d" in lower:
            return {"training-school", *WARROOM_RENDERER_SHARED}
        if any(token in lower for token in ("warroom3d", "gameboardview", "game3d")):
            return set(WARROOM_RENDERER_SHARED)
        if "armor" in lower or "armour" in lower:
            return {"warroom-armor"}
        if "hans" in lower:
            return {"warroom-hans"}
        if any(token in lower for token in (
            "cat", "decor", "ambientlife", "rain", "sofa", "plant", "fireplace", "lighting", "light", "roomtone"
        )):
            return {"warroom-decor"}
        return set(WARROOM_ALL)

    if lower.startswith("frontend/src/components/homematthias"):
        return {"home-matthias"}

    if any(token in lower for token in ("illustrated-home", "homecastle", "home-castle", "/home", "castle3d")):
        return set(HOME_ALL)

    if "matthias" in lower and "school" not in lower:
        return {"home-matthias", "warroom-core"}

    if "openingsscreen" in lower:
        return {"training-openings"}
    if any(token in lower for token in ("puzzle", "puzzles")):
        return {"training-puzzles"}
    if "tournament" in lower:
        return {"training-tournament"}
    if any(token in lower for token in ("insights", "career-dossier", "careerscreen", "rivalrydossier")):
        return {"training-progress"}
    if any(token in lower for token in ("tutorial", "glossary", "school", "mechanic-library")):
        return {"training-school"}
    if "training" in lower:
        # Generic/shared training code may affect several destinations. Keep the
        # fallback fail-closed while still letting well-owned surfaces stay cheap.
        return set(TRAINING_ALL)

    return None



def _variant_csv(values: set[str]) -> str:
    return ",".join(item for item in WARROOM_VARIANT_ORDER if item in values)


def _warroom_variant_ownership(path: str) -> set[str]:
    lower = path.lower().replace("\\", "/")
    if lower in WARROOM_CLASSIC_VARIANT_FILES:
        return {"classic"}
    if lower in WARROOM_V2_VARIANT_FILES:
        return {"v2"}
    if lower in WARROOM_V3_VARIANT_FILES:
        return {"v3"}
    if lower in WARROOM_BLENDER_SHARED_VARIANT_FILES:
        return {"v2", "v3"}
    if lower in WARROOM_SHARED_VARIANT_FILES:
        return set(WARROOM_VARIANT_ALL)
    if any(token in lower for token in ("war-room", "warroom", "board3d", "gameboardview", "gamesidecolumn", "game3d")):
        return set(WARROOM_VARIANT_ALL)
    return set()


def classify_warroom_variants(paths: list[str]) -> str:
    cleaned = [path.strip() for path in paths if path.strip()]
    if not cleaned:
        return _variant_csv(WARROOM_VARIANT_ALL)
    variants: set[str] = set()
    for path in cleaned:
        owned = _warroom_variant_ownership(path)
        if owned == WARROOM_VARIANT_ALL:
            return _variant_csv(WARROOM_VARIANT_ALL)
        if owned:
            variants.update(owned)
            continue
        producer_owner = classify_path(path)
        if producer_owner is None or "warroom-core" in producer_owner:
            return _variant_csv(WARROOM_VARIANT_ALL)
    return _variant_csv(variants or WARROOM_VARIANT_ALL)

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
    assert classify([
        "frontend/src/components/useGameMobileFocus.js",
        "e2e/mobile-war-room-lifecycle.spec.js",
        "e2e/three-d-war-room-android-touch.spec.js",
    ]) == "warroom-core"
    assert classify_warroom_variants(["frontend/src/components/WarRoomClassicShell.js"]) == "classic"
    assert classify_warroom_variants(["frontend/src/components/PremiumWarRoomScene.js"]) == "classic"
    assert classify_warroom_variants(["frontend/src/components/WarRoomV2Shell.js"]) == "v2"
    assert classify_warroom_variants(["frontend/src/components/WarRoomV3Shell.js"]) == "v3"
    assert classify_warroom_variants(["frontend/src/components/WarRoomBlenderShellRuntime.js"]) == "v2,v3"
    assert classify_warroom_variants(["scripts/blender/build_war_room_premium.py"]) == "v2,v3"
    assert classify_warroom_variants(["frontend/src/components/Board3DScene.js"]) == "classic,v2,v3"
    assert classify_warroom_variants([
        "frontend/src/components/WarRoomClassicShell.js",
        "frontend/src/components/WarRoomV3Shell.js",
    ]) == "classic,v3"
    assert classify_warroom_variants(["frontend/src/components/PuzzleScreen.jsx"]) == "classic,v2,v3"
    assert classify(["scripts/app_visual_scope.py"]) == "none"
    assert classify(["scripts/app_visual_producer_scope.py"]) == "none"
    assert classify(["scripts/app_visual_changed_files.py"]) == "none"
    assert classify([".github/actions/app-visual-pipeline/action.yml"]) == "chronicles-tactics"
    assert classify([".github/workflows/app-visual-artifact.yml"]) == "chronicles-tactics"
    assert classify(["frontend/src/chroniclesOfMatthiasIsometric.js"]) == "chronicles-tactics"
    assert classify(["frontend/src/components/ChroniclesOfMatthiasTactics.jsx"]) == "chronicles-tactics"
    assert classify(["frontend/src/chroniclesDungeon.js"]) == "chronicles-gameplay"
    assert classify(["frontend/src/experimentalThreeRenderer.js"]) == "chronicles-tactics,chronicles-gameplay"
    assert classify(["frontend/src/components/LabScreen.jsx"]) == "experiments-hub"
    assert classify([
        "frontend/src/components/PuzzleScreen.jsx",
        "frontend/src/components/PuzzleMobilePolish.css",
    ]) == "training-puzzles"
    assert classify([
        "frontend/src/components/TournamentScreen.jsx",
        "frontend/src/components/TournamentMobilePolish.css",
    ]) == "training-tournament"
    assert classify(["frontend/src/components/OpeningsScreen.jsx"]) == "training-openings"
    assert classify(["frontend/src/components/CareerScreen.jsx"]) == "training-progress"
    assert classify(["frontend/src/components/MatthiasSchool.jsx"]) == "training-school"
    assert classify(["e2e/training-visual-artifact.spec.js"]) == (
        "training-school,training-openings,training-puzzles,training-tournament,training-progress"
    )
    assert classify(["frontend/src/labLaunchIntent.js"]) == "none"
    assert classify(["frontend/src/usePuzzleLaunchFlow.js"]) == "none"
    assert classify(["scripts/quality_scope.py"]) == "none"
    assert classify(["scripts/browser_quality_scope.py"]) == "none"
    assert classify(["scripts/war_room_visual_freeze_check.mjs"]) == "warroom-core"
    assert classify(["frontend/src/chroniclesOfMatthiasSpectralBishop.js"]) == "chronicles-tactics,chronicles-gameplay"
    assert classify(["scripts/blender/build_war_room_premium.py"]) == "warroom-core"
    assert classify(["scripts/blender/publish_war_room_v2_staging.py"]) == "warroom-core"
    assert classify([".github/workflows/war-room-blender-art.yml"]) == "warroom-core"
    assert classify(["scripts/blender/build_war_room_v3.py"]) == "warroom-core"
    assert classify(["scripts/blender/publish_war_room_v3.py"]) == "warroom-core"
    assert classify([".github/workflows/war-room-v3-blender-art.yml"]) == "warroom-core"
    assert classify(["docs/operations/war-room-blender-pipeline.md"]) == "none"
    assert classify([".github/workflows/README.md"]) == "none"
    assert classify(["scripts/blender_required_scope.py"]) == "none"
    assert classify(["scripts/workflow_debt_gate.py"]) == "none"
    for variant_core_file in WARROOM_VARIANT_CORE_FILES:
        assert classify([variant_core_file]) == "warroom-core"
    for core_only_file in WARROOM_CORE_ONLY_FILES:
        assert classify([core_only_file]) == "warroom-core"
    assert classify(["frontend/src/components/WarRoomCatDecor.js"]) == "warroom-decor"
    assert classify(["frontend/src/components/WarRoomArmorDisplay.js"]) == "warroom-armor"
    assert classify(["frontend/src/components/WarRoomHansPerGame.jsx"]) == "warroom-hans"
    assert classify(["frontend/src/components/Board3DCore.jsx"]) == "training-school,warroom-core,warroom-hans"
    assert classify(["frontend/src/components/Board3DScene.js"]) == "training-school,warroom-core,warroom-hans"
    assert classify(["frontend/src/components/WarRoom3DAnimation.js"]) == "warroom-core,warroom-hans"
    assert classify(["frontend/src/components/GameBoardView.jsx"]) == "warroom-core,warroom-hans"
    assert classify(["frontend/src/components/WarRoomCastleArchitecture.js"]) == "warroom-core,warroom-decor,warroom-armor,warroom-hans"
    assert classify(["e2e/war-room-decor-visual-artifact.spec.js"]) == "warroom-decor"
    assert classify(["e2e/browser-storage-health.spec.js"]) == "health-storage"
    assert classify(["e2e/pawn-slug-godot-visual-artifact.spec.js"]) == "experiments-hub"
    assert classify(["frontend/src/components/AdminDashboardContent.jsx"]) == "none"
    assert classify(["frontend/src/App.css"]) == "all"
    assert classify(["scripts/async_resilience_gate.mjs"]) == "none"
    assert classify(["scripts/chess_rules_gate.mjs"]) == "none"
    assert classify(["frontend/public/audio/theme.ogg"]) == "none"
    assert classify(["frontend/public/chesscom/piece.glb"]) == "none"
    for public_meta in PUBLIC_NONCANONICAL_PATHS:
        assert classify([public_meta]) == "none"
    assert classify(["frontend/public/models/chronicles-tactics-party.glb"]) == "chronicles-tactics"
    assert classify(["frontend/public/models/matthias-home-canonical.glb"]) == "home-matthias"
    assert classify(["frontend/public/matthias-home-canonical.b64"]) == "home-matthias"
    assert classify(["frontend/src/components/HomeMatthias3D.jsx"]) == "home-matthias"
    assert classify(["frontend/src/components/HomeMatthiasRoutine.css"]) == "home-matthias"
    assert classify(["frontend/src/components/HomeMatthiasStations.js"]) == "home-matthias"
    assert classify(["e2e/matthias-home-visual-critical.spec.js"]) == "home-matthias"
    assert classify(["frontend/public/support-pawn.png"]) == "all"
    assert classify([
        "frontend/src/chroniclesOfMatthiasIsometric.js",
        "frontend/public/audio/theme.ogg",
    ]) == "chronicles-tactics"
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
    paths = [] if args.all else sys.stdin.read().splitlines()
    result = "all" if args.all else classify(paths)
    warroom_variants = _variant_csv(WARROOM_VARIANT_ALL) if args.all else classify_warroom_variants(paths)
    if args.github_output:
        with open(args.github_output, "a", encoding="utf-8") as handle:
            handle.write(f"producer_scope={result}\n")
            handle.write(f"warroom_variants={warroom_variants}\n")
    else:
        print(f"producer_scope={result}")
        print(f"warroom_variants={warroom_variants}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
