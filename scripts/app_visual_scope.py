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


@dataclass(frozen=True)
class Scope:
    groups: tuple[str, ...]
    hans: bool = False
    chesscom: bool = False
    experiment_parts: tuple[str, ...] = ()
    chronicles_avatar: bool = False
    warroom_revision_required: bool = False

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
    return Scope(
        GROUP_ORDER,
        hans=True,
        chesscom=True,
        experiment_parts=EXPERIMENT_ORDER,
        chronicles_avatar=True,
    )


def _is_noncanonical_admin_surface(path: str) -> bool:
    """Admin/observability UI has browser canaries but no canonical art capture."""
    lower = path.lower()
    if lower.startswith("frontend/src/admin"):
        return True
    if not lower.startswith("frontend/src/components/"):
        return False
    name = Path(lower).name
    return name.startswith(("admin", "observability", "useadmin"))


def _surface_groups(path: str) -> set[str] | None:
    """Return explicit groups, empty set for optional-only, or None for full fallback."""
    lower = path.lower()
    name = Path(lower).name

    if lower == "scripts/css_architecture_manifest.json":
        return set()
    if lower in {
        "scripts/blender/build_war_room_premium.py",
        "scripts/blender/publish_war_room_v2_staging.py",
        ".github/workflows/war-room-blender-art.yml",
    }:
        return {"warroom"}
    if (
        lower in {
            "scripts/app_visual_scope.py",
            "scripts/app_visual_producer_scope.py",
            ".github/workflows/app-visual-artifact.yml",
        }
        or lower.startswith(".github/actions/app-visual-pipeline/")
    ):
        return {"experiments"}
    if lower.startswith("scripts/app_visual_") or lower == "scripts/war_room_visual_freeze_check.mjs":
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
        if name in {
            "experiments-visual-artifact.spec.js",
            "chronicles-avatar-visual-artifact.spec.js",
            "chronicles-gameplay-visual-artifact.spec.js",
            "chronicles-tactics-visual-artifact.spec.js",
        }:
            return {"experiments"}
        if name == "training-visual-artifact.spec.js":
            return {"training"}
        if name.startswith("war-room-") and "visual" in name:
            return {"warroom"}
        return None
    if lower.startswith("frontend/public/audio/"):
        return set()
    if lower.startswith("frontend/public/chesscom/"):
        return set()
    if lower in PUBLIC_NONCANONICAL_PATHS:
        return set()
    if lower == "frontend/public/models/chronicles-tactics-party.glb":
        return {"experiments"}
    if lower in {
        "frontend/public/models/matthias-home-canonical.glb",
        "frontend/public/matthias-home-canonical.b64",
    }:
        return {"home"}
    if lower.startswith("frontend/public/"):
        return None

    if not lower.startswith("frontend/src/"):
        return None
    if "chesscom" in lower:
        return set()
    if _is_noncanonical_admin_surface(path):
        return set()

    groups: set[str] = set()
    if any(token in lower for token in ("experiment", "pawnslug", "pawn-slug", "chronicles", "trailblazer", "arcade")):
        groups.add("experiments")
    if any(token in lower for token in (
        "training", "tutorial", "glossary", "school", "mechanic-library", "openingsscreen",
        "insights", "career-dossier", "careerscreen", "rivalrydossier",
    )):
        groups.add("training")
    if any(token in lower for token in ("war-room", "warroom", "board3d", "gameboardview", "gamesidecolumn", "game3d")):
        groups.add("warroom")
    if any(token in lower for token in ("illustrated-home", "homecastle", "home-castle", "/home", "castle3d")):
        groups.add("home")
    if "matthias" in lower and "school" not in lower and "chronicles" not in lower:
        groups.update(("home", "warroom"))
    if groups:
        return groups
    # Generic frontend source can have cross-surface visual impact, so retain
    # every canonical surface. Optional deep sidecars (Hans routine videos and
    # Chesscom) stay owner-driven instead of being dragged in by ambiguity.
    return set(GROUP_ORDER)


def _experiment_parts(path: str) -> set[str]:
    lower = path.lower()
    name = Path(lower).name
    if (
        lower in {
            "scripts/app_visual_scope.py",
            "scripts/app_visual_producer_scope.py",
            ".github/workflows/app-visual-artifact.yml",
        }
        or lower.startswith(".github/actions/app-visual-pipeline/")
    ):
        return {"chronicles"}
    if name == "experiments-visual-artifact.spec.js":
        return set(EXPERIMENT_ORDER)
    if name == "chronicles-avatar-visual-artifact.spec.js" or "chronicles" in lower:
        return {"chronicles"}
    if "pawnslug" in lower or "pawn-slug" in lower:
        return {"pawnslug"}
    if "trailblazer" in lower or "arcade" in lower:
        return {"landing"}
    if "experiment" in lower:
        return set(EXPERIMENT_ORDER)
    return set(EXPERIMENT_ORDER)


HANS_ROUTINE_SHARED_OWNERS = {
    "frontend/src/components/gameboardview.jsx",
    "frontend/src/components/warroomambientdirector.js",
}


def _needs_hans_routines(path: str) -> bool:
    """Deep Hans videos are reserved for Hans choreography/event ownership."""
    lower = path.lower().replace("\\", "/")
    if "hans" in lower:
        return True
    return lower in HANS_ROUTINE_SHARED_OWNERS


WAR_ROOM_V2_REVISION_OWNERS = {
    "scripts/blender/build_war_room_premium.py",
    "scripts/blender/publish_war_room_v2_staging.py",
    ".github/workflows/war-room-blender-art.yml",
}


def _needs_warroom_revision(path: str) -> bool:
    return path.lower().replace("\\", "/") in WAR_ROOM_V2_REVISION_OWNERS


def _needs_chronicles_avatar(path: str) -> bool:
    """The 8-avatar proof is only needed for portrait/UI/Three ownership."""
    lower = path.lower()
    name = Path(lower).name
    if name == "chronicles-avatar-visual-artifact.spec.js":
        return True
    if lower.startswith("e2e/"):
        return False
    if lower.startswith("frontend/src/components/chronicles"):
        return True
    if "chronicles" not in lower:
        return False
    return any(token in name for token in ("three", "party", "portrait", "relic", "condition", "visual", "art"))


def classify(paths: list[str]) -> Scope:
    cleaned = [path.strip().replace("\\", "/") for path in paths if path.strip()]
    if not cleaned:
        return full_scope()

    groups: set[str] = set()
    experiment_parts: set[str] = set()
    hans = False
    chesscom = False
    chronicles_avatar = False
    warroom_revision_required = any(_needs_warroom_revision(path) for path in cleaned)

    for path in cleaned:
        lower = path.lower()
        if "chesscom" in lower:
            chesscom = True
        if _needs_hans_routines(path):
            hans = True

        surface = _surface_groups(path)
        if surface is None:
            fallback = full_scope()
            return Scope(
                fallback.groups,
                hans=fallback.hans,
                chesscom=fallback.chesscom,
                experiment_parts=fallback.experiment_parts,
                chronicles_avatar=fallback.chronicles_avatar,
                warroom_revision_required=warroom_revision_required,
            )
        groups.update(surface)
        if "experiments" in surface:
            parts = _experiment_parts(path)
            experiment_parts.update(parts)
            if "chronicles" in parts and _needs_chronicles_avatar(path):
                chronicles_avatar = True

    ordered = tuple(group for group in GROUP_ORDER if group in groups)
    ordered_experiments = tuple(part for part in EXPERIMENT_ORDER if part in experiment_parts)
    return Scope(
        ordered,
        hans=hans,
        chesscom=chesscom,
        experiment_parts=ordered_experiments,
        chronicles_avatar=chronicles_avatar,
        warroom_revision_required=warroom_revision_required,
    )


def write_outputs(scope: Scope, output_path: str) -> None:
    values = {
        "capture_groups": scope.capture_groups,
        "experiments_scope": scope.experiments_scope,
        "chronicles_avatar": str(scope.chronicles_avatar).lower(),
        "warroom": str(scope.warroom).lower(),
        "hans": str(scope.hans).lower(),
        "chesscom": str(scope.chesscom).lower(),
        "warroom_revision_required": str(scope.warroom_revision_required).lower(),
    }
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def self_test() -> None:
    pawn = classify(["frontend/src/components/PawnSlugGodotHost.jsx"])
    assert pawn.capture_groups == "experiments" and pawn.experiments_scope == "pawnslug"
    chronicles_visual = classify(["e2e/chronicles-tactics-visual-artifact.spec.js"])
    assert chronicles_visual.capture_groups == "experiments"
    assert chronicles_visual.experiments_scope == "chronicles"
    assert not chronicles_visual.hans and not chronicles_visual.chesscom
    chronicles_logic = classify(["frontend/src/chroniclesDungeon.js"])
    assert chronicles_logic.capture_groups == "experiments"
    assert chronicles_logic.experiments_scope == "chronicles"
    assert not chronicles_logic.chronicles_avatar
    chronicles_ui = classify(["frontend/src/components/ChroniclesOfMatthias.jsx"])
    assert chronicles_ui.capture_groups == "experiments"
    assert chronicles_ui.experiments_scope == "chronicles" and chronicles_ui.chronicles_avatar
    chronicles_three = classify(["frontend/src/chroniclesOfMatthiasThree.js"])
    assert chronicles_three.capture_groups == "experiments" and chronicles_three.chronicles_avatar
    chronicles_party = classify(["frontend/src/chroniclesOfMatthiasPartyCondition.js"])
    assert chronicles_party.capture_groups == "experiments" and chronicles_party.chronicles_avatar
    chronicles_atmosphere = classify(["frontend/src/chroniclesOfMatthiasAtmosphere.js"])
    assert chronicles_atmosphere.capture_groups == "experiments"
    assert chronicles_atmosphere.experiments_scope == "chronicles"
    assert not chronicles_atmosphere.chronicles_avatar
    chronicles_patina = classify(["frontend/src/chroniclesOfMatthiasSurfacePatina.js"])
    assert chronicles_patina.capture_groups == "experiments"
    assert chronicles_patina.experiments_scope == "chronicles"
    assert not chronicles_patina.chronicles_avatar
    trailblazer = classify(["frontend/src/pawnTrailblazerThree.js"])
    assert trailblazer.experiments_scope == "landing"
    hub = classify(["frontend/src/components/ExperimentsScreen.jsx"])
    assert hub.experiments_scope == "landing,chronicles,pawnslug"
    assert not hub.chronicles_avatar

    blender_warroom = classify(["scripts/blender/build_war_room_premium.py"])
    blender_publish = classify(["scripts/blender/publish_war_room_v2_staging.py"])
    blender_workflow = classify([".github/workflows/war-room-blender-art.yml"])
    assert blender_publish.capture_groups == "warroom" and not blender_publish.hans
    assert blender_workflow.capture_groups == "warroom" and not blender_workflow.hans
    assert blender_warroom.capture_groups == "warroom" and not blender_warroom.hans
    assert blender_warroom.warroom_revision_required
    assert blender_publish.warroom_revision_required
    assert blender_workflow.warroom_revision_required

    warroom_3d = classify(["frontend/src/components/WarRoom3D.jsx"])
    assert warroom_3d.capture_groups == "warroom" and not warroom_3d.hans
    board3d_core = classify(["frontend/src/components/Board3DCore.jsx"])
    assert board3d_core.capture_groups == "warroom" and not board3d_core.hans
    assert not board3d_core.warroom_revision_required
    game_board = classify(["frontend/src/components/GameBoardView.jsx"])
    assert game_board.capture_groups == "warroom" and game_board.hans
    ambient_director = classify(["frontend/src/components/WarRoomAmbientDirector.js"])
    assert ambient_director.capture_groups == "warroom" and ambient_director.hans
    hans_actor = classify(["frontend/src/components/WarRoomHansActor.js"])
    assert hans_actor.capture_groups == "warroom" and hans_actor.hans
    warroom_ui = classify(["frontend/src/components/WarRoomRain.css"])
    assert warroom_ui.capture_groups == "warroom" and not warroom_ui.hans
    warroom_visual = classify(["e2e/war-room-decor-visual-artifact.spec.js"])
    assert warroom_visual.capture_groups == "warroom" and not warroom_visual.hans
    hans_visual = classify(["e2e/war-room-hans-visual-artifact.spec.js"])
    assert hans_visual.hans
    hans_routines = classify(["e2e/war-room-hans-routines-visual.spec.js"])
    assert hans_routines.hans

    assert classify(["frontend/src/components/HomeCastle3D.jsx"]).capture_groups == "home"
    assert classify(["frontend/src/components/MatthiasAvatar.jsx"]).capture_groups == "home,warroom"
    assert classify(["frontend/src/components/MatthiasSchool.jsx"]).capture_groups == "training"
    assert classify(["frontend/src/components/OpeningsScreen.jsx"]).capture_groups == "training"
    assert classify(["frontend/src/components/OpeningsScreen.css"]).capture_groups == "training"
    assert classify(["frontend/src/components/InsightsScreen.jsx"]).capture_groups == "training"
    assert classify(["frontend/src/components/CareerScreen.jsx"]).capture_groups == "training"
    assert classify(["frontend/src/styles/04-career-dossier.css"]).capture_groups == "training"
    assert classify(["frontend/src/components/RivalryDossier.jsx"]).capture_groups == "training"
    assert classify(["e2e/browser-storage-health.spec.js"]).capture_groups == "health"
    chesscom = classify(["frontend/src/chesscomClient.js"])
    assert chesscom.capture_groups == "none" and chesscom.chesscom

    public_audio = classify(["frontend/public/audio/tropical-house.mp3"])
    assert public_audio.capture_groups == "none"
    assert not public_audio.hans and not public_audio.chesscom
    public_chesscom = classify(["frontend/public/chesscom/piece.glb"])
    assert public_chesscom.capture_groups == "none" and public_chesscom.chesscom
    for public_meta in PUBLIC_NONCANONICAL_PATHS:
        public_scope = classify([public_meta])
        assert public_scope.capture_groups == "none"
        assert not public_scope.hans and not public_scope.chesscom
    public_chronicles_model = classify(["frontend/public/models/chronicles-tactics-party.glb"])
    assert public_chronicles_model.capture_groups == "experiments"
    assert public_chronicles_model.experiments_scope == "chronicles"
    public_home_model = classify(["frontend/public/models/matthias-home-canonical.glb"])
    assert public_home_model.capture_groups == "home"
    public_home_b64 = classify(["frontend/public/matthias-home-canonical.b64"])
    assert public_home_b64.capture_groups == "home"
    assert classify(["frontend/public/support-pawn.png"]) == full_scope()

    for admin_path in (
        "frontend/src/components/AdminDashboardContent.jsx",
        "frontend/src/components/ObservabilityPanel.jsx",
        "frontend/src/components/useAdminFeedbackController.js",
        "frontend/src/adminDashboard.jsx",
    ):
        admin = classify([admin_path])
        assert admin.capture_groups == "none"
        assert not admin.hans and not admin.chesscom
    mixed_admin_home = classify([
        "frontend/src/components/AdminDashboardContent.jsx",
        "frontend/src/components/HomeCastle3D.jsx",
    ])
    assert mixed_admin_home.capture_groups == "home"

    css_manifest = classify(["scripts/css_architecture_manifest.json"])
    assert css_manifest.capture_groups == "none"
    assert not css_manifest.hans and not css_manifest.chesscom
    career_with_manifest = classify([
        "frontend/src/styles/04-career-dossier.css",
        "scripts/css_architecture_manifest.json",
    ])
    assert career_with_manifest.capture_groups == "training"
    assert not career_with_manifest.hans and not career_with_manifest.chesscom

    visual_scope = classify(["scripts/app_visual_scope.py"])
    assert visual_scope.capture_groups == "experiments"
    assert visual_scope.experiments_scope == "chronicles"
    assert not visual_scope.hans and not visual_scope.chesscom
    assert classify(["scripts/app_visual_capture.sh"]) == full_scope()
    assert classify(["scripts/app_visual_summary.mjs"]) == full_scope()
    global_css = classify(["frontend/src/App.css"])
    assert global_css.capture_groups == ",".join(GROUP_ORDER)
    assert global_css.experiments_scope == ",".join(EXPERIMENT_ORDER)
    assert not global_css.hans and not global_css.chesscom
    visual_pipeline = classify([".github/actions/app-visual-pipeline/action.yml"])
    assert visual_pipeline.capture_groups == "experiments"
    assert visual_pipeline.experiments_scope == "chronicles"
    assert not visual_pipeline.chronicles_avatar
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
        print(f"chronicles_avatar={str(scope.chronicles_avatar).lower()}")
        print(f"warroom={str(scope.warroom).lower()}")
        print(f"hans={str(scope.hans).lower()}")
        print(f"chesscom={str(scope.chesscom).lower()}")
        print(f"warroom_revision_required={str(scope.warroom_revision_required).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())