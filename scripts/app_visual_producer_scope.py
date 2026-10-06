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
    "pvp-lobby",
    "pvp-handoff",
    "experiments-hub",
    "chronicles-tactics",
    "chronicles-gameplay",
    "chronicles-avatar",
    "training-school",
    "training-openings",
    "training-puzzles",
    "training-tournament",
    "training-progress",
    "training-daily",
    "pvp-duel",
    "warroom-core",
    "warroom-decor",
    "warroom-armor",
    "warroom-hans",
    "health-runtime",
    "health-storage",
)
WARROOM_ALL = {"warroom-core", "warroom-decor", "warroom-armor", "warroom-hans"}
WARROOM_RENDERER_SHARED = {"warroom-core"}
# Hans has its own choreography/runtime owners and should not block unrelated
# shared-renderer camera/layout PRs. Its dedicated canary still runs whenever
# Hans-owned code changes.
WARROOM_CORE_ONLY_FILES = {
    # Presentation shell only: these affect the canonical War Room composition
    # and immersive viewport, but cannot change decor, armor or Hans ownership.
    "frontend/src/components/usewarroomimmersive.js",
    "frontend/src/components/warroomimmersive.css",
    "frontend/src/components/warroommobilelandscape.css",
}

WARROOM_MOBILE_ONLY_FILES = {
    "frontend/src/components/usegamemobilefocus.js",
    "frontend/src/components/usewarroomlandscape.js",
    "frontend/src/components/warroomlandscapegate.jsx",
    "frontend/src/components/warroomlandscapegate.css",
    "frontend/src/components/warroommobilelandscape.css",
}

WARROOM_MATTHIAS_ONLY_FILES = {
    "frontend/src/components/matthias3dbubbleanchor.css",
    "frontend/src/components/usematthias3dbubbleanchor.js",
    "frontend/src/components/matthias3dopeningbanter.css",
    "frontend/src/components/matthias3dopeningbanter.jsx",
}

BOARD3D_MATTHIAS_SHARED_FILES = {
    "frontend/src/components/matthiasking3d.js",
}

TRAINING_PROGRESS_MATTHIAS_FILES = {
    "frontend/src/components/insightsmatthiascampaign.jsx",
    "frontend/src/components/insightsmatthiasmotion.jsx",
    "frontend/src/components/matthiaslayeredart.css",
    "frontend/src/components/matthiaslayeredart.jsx",
    "frontend/src/components/matthiascoffeesteam.css",
    "frontend/src/components/matthiascoffeesteam.jsx",
    "frontend/src/components/matthiasdailyconsult.jsx",
}
WARROOM_VARIANT_ORDER = ("classic", "v2", "v3", "v4")
WARROOM_PROFILE_SCOPE_ALL = "all"
WARROOM_PROFILE_SCOPE_MOBILE = "mobile"
WARROOM_PROFILE_SCOPE_MOBILE_ENTRY = "mobile-entry"
HOME_PROFILE_SCOPE_ALL = "all"
HOME_PROFILE_SCOPE_QUICK_MATCH = "quickmatch"
HOME_PROFILE_SCOPE_MOBILE_TOOLS = "mobile-tools"
# v4 is explicit-only while it is validated on device: it is captured when its
# own shell/art or the shared Blender runtime changes, not on every War Room PR.
WARROOM_VARIANT_OPT_IN = {"v4"}
WARROOM_VARIANT_ALL = set(WARROOM_VARIANT_ORDER) - WARROOM_VARIANT_OPT_IN
WARROOM_CLASSIC_VARIANT_FILES = {
    "frontend/src/components/warroomclassicshell.js",
    "frontend/src/components/premiumwarroomscene.js",
    "frontend/src/components/warroomcastlearchitecture.js",
    "frontend/src/components/warroompremiumpaintings.js",
}
WARROOM_V2_VARIANT_FILES = {
    "frontend/src/components/warroomv2shell.js",
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
WARROOM_V4_VARIANT_FILES = {
    "frontend/src/components/warroomv4shell.js",
}
# Shared fire-sprite ownership: v2 installs its own hearth sprites, while
# WarRoomV3Fire consumes the same helper for v3 and v4. This is decor-only:
# it cannot alter board composition, armor inspection or Hans choreography.
WARROOM_FIRE_SPRITE_FILES = {
    "frontend/src/components/warroomfiresprites.js",
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
WARROOM_CAMERA_CONTRACT_FILES = {
    "frontend/src/components/board3dcameraprofiles.js",
    "frontend/src/components/board3dscene.js",
    "frontend/src/components/warroommobileframing.js",
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
    "frontend/src/components/warroomv4shell.js",
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
    "training-daily",
}
QUICK_MATCH_EXACT_PRODUCERS = {
    # Quick Match owns the launch/config surface and the core War Room entry
    # contract. It cannot alter Home Matthias/focus, room decor, armor or Hans.
    "frontend/src/components/quickmatchmodal.jsx": {"home-base", "warroom-core"},
    "frontend/src/components/quickmatchmobilegoldenpath.css": {"home-base"},
    "frontend/src/components/quickmatchreadyroom.css": {"home-base"},
    "frontend/src/components/quickmatchreadyroomscene3d.jsx": {"home-base"},
    "frontend/src/components/usewarroomimmersive.js": {"warroom-core"},
}

TRAINING_EXACT_PRODUCERS = {
    "frontend/src/guidedtrainingsession.js": {"training-progress"},
    "frontend/src/personalweeklygoals.js": {"training-progress"},
    "frontend/src/components/matthiasclassroom.css": {"training-school"},
    "frontend/src/components/puzzlescreen.jsx": {"training-puzzles"},
    "frontend/src/components/puzzlemobilepolish.css": {"training-puzzles"},
    "frontend/src/components/trainingroomboardshell.js": {"training-puzzles"},
    "frontend/src/components/trainingroomboard.jsx": {"training-puzzles"},
    "frontend/src/components/puzzlewarroom.css": {"training-puzzles"},
    "frontend/src/components/tournamentscreen.jsx": {"training-tournament"},
    "frontend/src/components/tournamentmobilepolish.css": {"training-tournament"},
    "frontend/src/components/dailychallengesscreen.jsx": {"training-daily"},
    "frontend/src/components/dailychallengesroom.css": {"training-daily"},
    "frontend/src/components/dailychallengecalendar.css": {"training-daily"},
}


POSTGAME_EXACT_PRODUCERS = {
    "frontend/src/components/gamereportmodal.jsx": {"warroom-core"},
}

PVP_DUEL_EXACT_PRODUCERS = {
    "frontend/src/components/pvpappsurface.jsx": {"pvp-duel"},
    "frontend/src/components/pvpgamescreen.jsx": {"pvp-duel"},
    "frontend/src/components/pvpgamescreen.css": {"pvp-duel"},
    "frontend/src/components/pvpduelroomshell.js": {"pvp-duel"},
    "frontend/src/pvpmatchpolling.js": {"pvp-duel"},
}

PVP_EXACT_PRODUCERS = {
    # PvP lobby/handoff is rendered from the Home/play shell. It does not own
    # Home Matthias/focus, Chronicles, training, War Room art, Hans or health.
    "frontend/src/components/menuinner.jsx": {"home-base"},
    "frontend/src/components/pvplobbymodal.jsx": {"pvp-lobby"},
    "frontend/src/components/pvplobbymodal.css": {"pvp-lobby"},
    "frontend/src/components/pvpduelhallroom.css": {"pvp-lobby"},
    "frontend/src/components/pvphandoffmodal.jsx": {"pvp-handoff"},
    "frontend/src/components/pvphandoffmodal.css": {"pvp-handoff"},
    "frontend/src/components/homepvprosterlink.jsx": {"home-base"},
    "frontend/src/components/homepvprosterlink.css": {"home-base"},
    "frontend/src/pvpapi.js": {"home-base"},
    "frontend/src/usepvpappflow.js": {"home-base", "pvp-duel"},
    "frontend/src/usepvprosterpresence.js": {"home-base"},
    "frontend/src/pvpruntimebridge.js": {"home-base"},
}

PUBLIC_NONCANONICAL_PATHS = {
    "frontend/public/404.html",
    "frontend/public/cname",
    "frontend/public/_headers",
    "frontend/public/apple-touch-icon.png",
    "frontend/public/favicon-32.png",
    "frontend/public/favicon.svg",
    "frontend/public/manifest.webmanifest",
    "frontend/public/modulerecovery.js",
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
        "smoke.spec.js": set(),
        "chess-football.spec.js": set(),
        "matthias-home-visual-artifact.spec.js": {"home-matthias"},
        "matthias-home-visual-critical.spec.js": {"home-matthias"},
        "home-3d-focus-visual.spec.js": {"home-focus"},
        "pvp-lobby-visual-artifact.spec.js": {"pvp-lobby"},
        "pvp-handoff-visual-artifact.spec.js": {"pvp-handoff"},
        "home-lab-visibility.spec.js": {"home-base"},
        "experiments-visual-artifact.spec.js": {"experiments-hub"},
        "pawn-slug-godot-visual-artifact.spec.js": {"experiments-hub"},
        "chronicles-tactics-visual-artifact.spec.js": {"chronicles-tactics"},
        "chronicles-gameplay-visual-artifact.spec.js": {"chronicles-gameplay"},
        "chronicles-avatar-visual-artifact.spec.js": {"chronicles-avatar"},
        # This monolithic spec contains independently scoped training
        # producers. Treat it as a neutral companion when product-owned files
        # are present; classify() falls back to TRAINING_ALL for spec-only edits.
        "training-visual-artifact.spec.js": set(),
        "war-room-pvp-duel-visual-artifact.spec.js": {"pvp-duel"},
        "war-room-pvp.spec.js": {"pvp-duel"},
        "pvp-background-roster.spec.js": {"pvp-duel"},
        "mobile-golden-path-war-room-invariants.spec.js": {"warroom-core"},
        "war-room-visual-artifact.spec.js": {"warroom-core"},
        "war-room-decor-visual-artifact.spec.js": {"warroom-decor"},
        "war-room-armor-oblique-visual-artifact.spec.js": {"warroom-armor"},
        "war-room-hans-visual-artifact.spec.js": {"warroom-hans"},
        "war-room-hans-routines-visual.spec.js": {"warroom-hans"},
        "browser-runtime-health.spec.js": {"health-runtime"},
        "browser-storage-health.spec.js": {"health-storage"},
    }
    if name in exact:
        return exact[name]
    if "chesscom" in name:
        return set()
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
        "scripts/app_visual_capture.sh",
    }:
        return set()
    if lower == "scripts/war_room_visual_freeze_check.mjs":
        return {"warroom-core"}
    if (
        lower == ".github/workflows/app-visual-artifact.yml"
        or lower.startswith(".github/actions/app-visual-pipeline/")
    ):
        return set()
    if lower in {
        ".github/workflows/home-blender-v2-preview.yml",
        ".github/workflows/home-blender-v2-runtime.yml",
        "scripts/blender/build_home_v2_blockout.py",
        "scripts/blender/export_home_v2_runtime.py",
        "scripts/promote_home_scene_runtime.py",
    }:
        return set(HOME_ALL)
    if lower in {
        "scripts/blender/build_war_room_premium.py",
        "scripts/blender/publish_war_room_v2_staging.py",
        ".github/workflows/war-room-blender-art.yml",
        "scripts/blender/build_war_room_v3.py",
        "scripts/blender/publish_war_room_v3.py",
        ".github/workflows/war-room-v3-blender-art.yml",
    }:
        return {"warroom-core"}
    if lower in {
        "scripts/blender/build_war_room_v4.py",
        "scripts/blender/publish_war_room_v4.py",
        ".github/workflows/war-room-v4-blender-art.yml",
    }:
        # V4 is an isolated art experiment until it gets runtime integration.
        # Its own Blender lane is the visual proof; do not wake canonical app captures.
        return set()
    if lower in {
        "scripts/blender/build_pvp_duel_room.py",
        "scripts/blender/publish_pvp_duel_room.py",
        ".github/workflows/pvp-duel-room-blender-art.yml",
    }:
        return set()

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
        if lower.startswith(("backend-python/", "backend-go/")):
            return set()
        if lower in {
            "scripts/css_architecture_manifest.json",
            "scripts/architecture_debt_budget.py",
            "scripts/async_resilience_gate.mjs",
            "scripts/blender_required_scope.py",
            "scripts/browser_quality_scope.py",
            "scripts/chess_rules_gate.mjs",
            "scripts/quality_scope.py",
            "scripts/visual_ux_contract_check.mjs",
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

    if lower in {
        "frontend/src/lablaunchintent.js",
        "frontend/src/uselearningjourneyflow.js",
        "frontend/src/useglobalshellui.js",
        "frontend/src/usetournamentflow.js",
        "frontend/src/soundfx.js",
        "frontend/src/components/warroomhomepreload.js",
    }:
        return set()
    if lower == "frontend/src/components/globaloverlaylayer.jsx":
        return {"home-base"}
    if lower in POSTGAME_EXACT_PRODUCERS:
        return set(POSTGAME_EXACT_PRODUCERS[lower])
    if lower in QUICK_MATCH_EXACT_PRODUCERS:
        return set(QUICK_MATCH_EXACT_PRODUCERS[lower])
    if lower == "frontend/src/components/homemobilegoldenpath.css":
        return {"home-base"}
    if lower in PVP_DUEL_EXACT_PRODUCERS:
        return set(PVP_DUEL_EXACT_PRODUCERS[lower])
    if lower in PVP_EXACT_PRODUCERS:
        return set(PVP_EXACT_PRODUCERS[lower])
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

    if any(token in lower for token in (
        "pawnslug", "pawn-slug", "trailblazer", "arcade", "chessfootball", "chess-football",
    )):
        return {"experiments-hub"}
    if "experimentsscreen" in lower or "/experiments" in lower:
        return {"experiments-hub"}

    if lower in WARROOM_FIRE_SPRITE_FILES:
        return {"warroom-decor"}
    if lower in WARROOM_VARIANT_CORE_FILES or lower in WARROOM_CORE_ONLY_FILES or lower in WARROOM_MOBILE_ONLY_FILES or lower in WARROOM_MATTHIAS_ONLY_FILES:
        return {"warroom-core"}
    if lower in BOARD3D_MATTHIAS_SHARED_FILES:
        return {"training-school", "warroom-core"}
    if lower in TRAINING_PROGRESS_MATTHIAS_FILES:
        return {"training-progress"}

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
    if lower in WARROOM_FIRE_SPRITE_FILES:
        return {"v2", "v3", "v4"}
    if lower in WARROOM_V2_VARIANT_FILES:
        return {"v2"}
    if lower == "frontend/src/components/warroomv3fire.js":
        # The v3 flicker driver also animates the v4 fireplace.
        return {"v3", "v4"}
    if lower in WARROOM_V3_VARIANT_FILES:
        return {"v3"}
    if lower in WARROOM_V4_VARIANT_FILES:
        return {"v4"}
    if lower in {
        "frontend/src/components/warroomvariant.js",
        # Shared runtime lighting grades, including the v4-only grade.
        "frontend/src/components/warroom3dmotion.js",
    }:
        return set(WARROOM_VARIANT_ALL) | {"v4"}
    if lower in WARROOM_BLENDER_SHARED_VARIANT_FILES:
        return {"v2", "v3", "v4"}
    if lower in WARROOM_CAMERA_CONTRACT_FILES:
        return set(WARROOM_VARIANT_ALL) | set(WARROOM_VARIANT_OPT_IN)
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
        if owned:
            # Union (not early return) so an opt-in variant touched alongside a
            # shared file is still captured.
            variants.update(owned)
            continue
        producer_owner = classify_path(path)
        if producer_owner is None or "warroom-core" in producer_owner:
            variants.update(WARROOM_VARIANT_ALL)
    return _variant_csv(variants or WARROOM_VARIANT_ALL)

def classify_home_profile_scope(paths: list[str]) -> str:
    cleaned = [path.strip().lower().replace("\\", "/") for path in paths if path.strip()]
    if not cleaned:
        return HOME_PROFILE_SCOPE_ALL
    relevant = [
        path for path in cleaned
        if ".test." not in Path(path).name
        and ".spec." not in Path(path).name
        and path not in {"scripts/app_visual_scope.py", "scripts/app_visual_producer_scope.py"}
    ]
    quick_match_home_files = {
        "frontend/src/components/quickmatchmodal.jsx",
        "frontend/src/components/quickmatchmobilegoldenpath.css",
        "frontend/src/components/quickmatchreadyroom.css",
        "frontend/src/components/quickmatchreadyroomscene3d.jsx",
    }
    if relevant and all(path in quick_match_home_files for path in relevant):
        return HOME_PROFILE_SCOPE_QUICK_MATCH
    if relevant and all(path == "frontend/src/components/homemobilegoldenpath.css" for path in relevant):
        return HOME_PROFILE_SCOPE_MOBILE_TOOLS
    return HOME_PROFILE_SCOPE_ALL


def classify_warroom_profile_scope(paths: list[str]) -> str:
    cleaned = [path.strip().lower().replace("\\", "/") for path in paths if path.strip()]
    if not cleaned:
        return WARROOM_PROFILE_SCOPE_ALL
    mobile_entry_only = {
        "frontend/src/components/quickmatchmodal.jsx",
        "frontend/src/components/quickmatchreadyroom.css",
        "frontend/src/components/quickmatchreadyroomscene3d.jsx",
    }
    relevant = [path for path in cleaned if ".test." not in Path(path).name and ".spec." not in Path(path).name]
    if relevant and all(path in mobile_entry_only for path in relevant):
        return WARROOM_PROFILE_SCOPE_MOBILE_ENTRY
    if relevant and all(path in WARROOM_MOBILE_ONLY_FILES for path in relevant):
        return WARROOM_PROFILE_SCOPE_MOBILE
    return WARROOM_PROFILE_SCOPE_ALL


HOME_MOBILE_TOOLS_FAST_PATH = {
    "e2e/app-visual-artifact.spec.js",
    "e2e/home-lab-visibility.spec.js",
    "frontend/src/components/homemobilegoldenpath.css",
    "scripts/app_visual_producer_scope.py",
    "scripts/app_visual_scope.py",
}

def _is_home_mobile_tools_fast_path(paths: list[str]) -> bool:
    normalized = {path.strip().replace("\\", "/").lower() for path in paths if path.strip()}
    return normalized == HOME_MOBILE_TOOLS_FAST_PATH


POSTGAME_WARROOM_FAST_PATH = {
    "frontend/src/usepostgametrainingopportunity.test.js",
    "frontend/src/usepostgametrainingopportunity.js",
    "frontend/src/postgamereportmeta.js",
    "frontend/src/nextbestaction.test.js",
    "frontend/src/components/postgameexperience.test.jsx",
    "e2e/helpers.js",
    "e2e/learning-golden-path.spec.js",
    "e2e/learning-second-observation.spec.js",
    "e2e/mobile-golden-path-priority.spec.js",
    "e2e/regression-journeys-core.js",
    "e2e/smoke.spec.js",
    "frontend/src/app.jsx",
    "frontend/src/components/gamescreen.jsx",
    "frontend/src/components/globalmusicdock.jsx",
    "frontend/src/components/postgameexperience.jsx",
    "frontend/src/components/warroomdebrief.css",
    "frontend/src/cpumemory.js",
    "frontend/src/nextbestaction.js",
    "frontend/src/quickmatchrematch.js",
    "frontend/src/quickmatchrematch.test.js",
    "frontend/src/serioushumanincident.js",
    "frontend/src/serioushumanincident.test.js",
    "scripts/architecture_debt_budget.py",
    "scripts/app_visual_scope.py",
    "scripts/app_visual_producer_scope.py",
}

def _is_postgame_warroom_fast_path(paths: list[str]) -> bool:
    normalized = {path.strip().replace("\\", "/").lower() for path in paths if path.strip()}
    return (
        "frontend/src/components/postgameexperience.jsx" in normalized
        and "frontend/src/components/gamescreen.jsx" in normalized
        and normalized.issubset(POSTGAME_WARROOM_FAST_PATH)
    )


def classify(paths: list[str]) -> str:
    cleaned = [path.strip() for path in paths if path.strip()]
    if not cleaned:
        return "all"
    if _is_home_mobile_tools_fast_path(cleaned):
        return "home-base"
    if _is_postgame_warroom_fast_path(cleaned):
        return "warroom-core"
    training_visual_spec_touched = any(
        Path(path.lower().replace("\\", "/")).name == "training-visual-artifact.spec.js"
        for path in cleaned
    )
    producers: set[str] = set()
    for path in cleaned:
        owned = classify_path(path)
        if owned is None:
            return "all"
        producers.update(owned)
    # A test-only edit must still prove every training surface. When the same
    # spec changes alongside a real product owner, however, inherit that
    # product scope instead of making Escuela/Puzzles/Torneo pay for Insights.
    if training_visual_spec_touched and not producers:
        producers.update(TRAINING_ALL)
    return _csv(producers)


def self_test() -> None:
    assert classify_warroom_variants(["frontend/src/components/WarRoomClassicShell.js"]) == "classic"
    assert classify_warroom_variants(["frontend/src/components/PremiumWarRoomScene.js"]) == "classic"
    assert classify_warroom_variants(["frontend/src/components/WarRoomV2Shell.js"]) == "v2"
    assert classify_warroom_variants(["frontend/src/components/WarRoomFireSprites.js"]) == "v2,v3,v4"
    assert classify(["frontend/src/components/WarRoomFireSprites.js"]) == "warroom-decor"
    assert classify_warroom_variants(["frontend/src/components/WarRoomV3Shell.js"]) == "v3"
    assert classify_warroom_variants(["frontend/src/components/WarRoomBlenderShellRuntime.js"]) == "v2,v3,v4"
    assert classify_warroom_variants(["scripts/blender/build_war_room_premium.py"]) == "v2,v3,v4"
    assert classify_warroom_variants(["frontend/src/components/WarRoomV4Shell.js"]) == "v4"
    assert classify_warroom_variants(["frontend/src/components/WarRoomV3Fire.js"]) == "v3,v4"
    assert classify_warroom_variants(["frontend/src/components/WarRoomVariant.js"]) == "classic,v2,v3,v4"
    assert classify_warroom_variants(["frontend/src/components/WarRoom3DMotion.js"]) == "classic,v2,v3,v4"
    assert classify_warroom_variants([
        "frontend/src/components/Board3DScene.js",
        "frontend/src/components/WarRoomV4Shell.js",
    ]) == "classic,v2,v3,v4"
    assert classify_warroom_variants(["frontend/src/components/Board3DScene.js"]) == "classic,v2,v3,v4"
    assert classify_warroom_variants(["frontend/src/components/Board3DCameraProfiles.js"]) == "classic,v2,v3,v4"
    assert classify_warroom_variants(["frontend/src/components/WarRoomMobileFraming.js"]) == "classic,v2,v3,v4"
    assert classify_warroom_variants([
        "frontend/src/components/WarRoomClassicShell.js",
        "frontend/src/components/WarRoomV3Shell.js",
    ]) == "classic,v3"
    assert classify_warroom_variants(["frontend/src/components/PuzzleScreen.jsx"]) == "classic,v2,v3"
    assert classify_home_profile_scope(["frontend/src/components/QuickMatchModal.jsx"]) == "quickmatch"
    assert classify_home_profile_scope([
        "frontend/src/components/QuickMatchModal.jsx",
        "frontend/src/components/QuickMatchReadyRoom.css",
        "frontend/src/components/QuickMatchReadyRoomScene3D.jsx",
    ]) == "quickmatch"
    assert classify_home_profile_scope(["frontend/src/components/HomeCastle3D.jsx"]) == "all"
    assert classify_warroom_profile_scope([
        "frontend/src/components/QuickMatchModal.jsx",
        "frontend/src/components/QuickMatchModal.test.jsx",
    ]) == "mobile-entry"
    assert classify_warroom_profile_scope([
        "frontend/src/components/QuickMatchModal.jsx",
        "frontend/src/components/QuickMatchReadyRoom.css",
        "frontend/src/components/QuickMatchReadyRoomScene3D.jsx",
    ]) == "mobile-entry"
    assert classify_warroom_profile_scope([
        "frontend/src/components/useWarRoomImmersive.js",
        "frontend/src/components/useWarRoomImmersive.test.js",
    ]) == "all"
    assert classify_warroom_profile_scope(["frontend/src/components/WarRoomV3Shell.js"]) == "all"
    assert classify_warroom_profile_scope([
        "frontend/src/components/useGameMobileFocus.js",
        "frontend/src/components/useWarRoomLandscape.js",
        "frontend/src/components/WarRoomLandscapeGate.jsx",
        "frontend/src/components/WarRoomLandscapeGate.css",
        "frontend/src/components/WarRoomMobileLandscape.css",
    ]) == "mobile"
    assert classify(["scripts/app_visual_scope.py"]) == "none"
    assert classify(["e2e/smoke.spec.js"]) == "none"
    assert classify(["scripts/app_visual_producer_scope.py"]) == "none"
    assert classify(["scripts/app_visual_changed_files.py"]) == "none"
    assert classify(["scripts/app_visual_capture.sh"]) == "none"
    assert classify(["e2e/training-visual-artifact.spec.js"]) == "training-school,training-openings,training-puzzles,training-tournament,training-progress,training-daily"
    assert classify([
        "e2e/training-visual-artifact.spec.js",
        "frontend/src/components/InsightsScreen.jsx",
    ]) == "training-progress"
    assert classify([
        "e2e/training-visual-artifact.spec.js",
        "frontend/src/components/MatthiasClassRoom.css",
    ]) == "training-school"
    assert classify([".github/actions/app-visual-pipeline/action.yml"]) == "none"
    assert classify([".github/workflows/app-visual-artifact.yml"]) == "none"
    assert classify(["frontend/src/chroniclesOfMatthiasIsometric.js"]) == "chronicles-tactics"
    assert classify(["frontend/src/components/ChroniclesOfMatthiasTactics.jsx"]) == "chronicles-tactics"
    assert classify(["frontend/src/chroniclesDungeon.js"]) == "chronicles-gameplay"
    assert classify(["frontend/src/experimentalThreeRenderer.js"]) == "chronicles-tactics,chronicles-gameplay"
    assert classify(["frontend/src/components/LabScreen.jsx"]) == "experiments-hub"
    assert classify([
        "frontend/src/components/ChessFootballGodotHost.jsx",
        "e2e/chess-football.spec.js",
    ]) == "experiments-hub"
    assert classify(["frontend/src/components/QuickMatchModal.jsx"]) == "home-base,warroom-core"
    assert classify(["frontend/src/components/QuickMatchMobileGoldenPath.css"]) == "home-base"
    assert classify(["frontend/src/components/QuickMatchReadyRoom.css"]) == "home-base"
    assert classify(["frontend/src/components/QuickMatchReadyRoomScene3D.jsx"]) == "home-base"
    assert classify([
        "frontend/src/App.jsx",
        "frontend/src/components/GameScreen.jsx",
        "frontend/src/components/PostGameExperience.jsx",
        "frontend/src/components/WarRoomDebrief.css",
        "frontend/src/quickMatchRematch.js",
        "e2e/mobile-golden-path-priority.spec.js",
    ]) == "warroom-core"
    assert classify([
        "backend-python/pvp_api.py",
        "backend-python/test_pvp_api.py",
        "frontend/src/components/MenuInner.jsx",
        "frontend/src/components/PvPLobbyModal.jsx",
        "frontend/src/components/PvPLobbyModal.css",
        "frontend/src/components/PvpHandoffModal.jsx",
        "frontend/src/pvpApi.js",
        "frontend/src/usePvpAppFlow.js",
        "frontend/src/usePvpRosterPresence.js",
    ]) == "home-base,pvp-lobby,pvp-handoff,pvp-duel"
    assert classify(["frontend/src/components/PvPLobbyModal.jsx"]) == "pvp-lobby"
    assert classify(["frontend/src/components/PvPDuelHallRoom.css"]) == "pvp-lobby"
    assert classify(["scripts/architecture_debt_budget.py"]) == "none"
    assert classify(["scripts/visual_ux_contract_check.mjs"]) == "none"
    assert classify(["frontend/src/components/warRoomHomePreload.js"]) == "none"
    assert classify(["e2e/pvp-lobby-visual-artifact.spec.js"]) == "pvp-lobby"
    assert classify(["frontend/src/components/PvpHandoffModal.jsx"]) == "pvp-handoff"
    assert classify(["e2e/pvp-handoff-visual-artifact.spec.js"]) == "pvp-handoff"
    assert classify([
        "backend-go/internal/pulse/pulse.go",
        "backend-go/internal/pulse/pulse_test.go",
        "frontend/src/components/PvpGameScreen.jsx",
        "frontend/src/pvpMatchPolling.js",
        "frontend/src/pvpMatchPolling.test.js",
        "e2e/war-room-pvp.spec.js",
    ]) == "pvp-duel"
    assert classify_home_profile_scope(["frontend/src/components/QuickMatchMobileGoldenPath.css"]) == "quickmatch"
    assert classify(["frontend/src/components/useWarRoomImmersive.js"]) == "warroom-core"
    assert classify(["frontend/src/components/WarRoomMobileLandscape.css"]) == "warroom-core"
    assert classify(["scripts/blender/build_home_v2_blockout.py"]) == "home-base,home-matthias,home-focus"
    assert classify([
        "frontend/src/components/QuickMatchModal.jsx",
        "frontend/src/components/useWarRoomImmersive.js",
        "frontend/src/components/useWarRoomImmersive.test.js",
    ]) == "home-base,warroom-core"
    assert classify([
        "frontend/src/components/PuzzleScreen.jsx",
        "frontend/src/components/PuzzleMobilePolish.css",
    ]) == "training-puzzles"
    assert classify([
        "frontend/src/components/TournamentScreen.jsx",
        "frontend/src/components/TournamentMobilePolish.css",
    ]) == "training-tournament"
    assert classify(["frontend/src/components/DailyChallengesScreen.jsx"]) == "training-daily"
    assert classify(["frontend/src/components/DailyChallengesRoom.css"]) == "training-daily"
    assert classify(["frontend/src/components/DailyChallengeCalendar.css"]) == "training-daily"
    assert classify(["frontend/src/components/OpeningsScreen.jsx"]) == "training-openings"
    assert classify(["frontend/src/components/CareerScreen.jsx"]) == "training-progress"
    assert classify(["frontend/src/guidedTrainingSession.js"]) == "training-progress"
    assert classify(["frontend/src/personalWeeklyGoals.js"]) == "training-progress"
    assert classify(["frontend/src/components/GameReportModal.jsx"]) == "warroom-core"
    assert classify(["frontend/src/components/MatthiasSchool.jsx"]) == "training-school"
    assert classify(["frontend/src/components/MatthiasClassRoom.css"]) == "training-school"
    assert classify(["e2e/training-visual-artifact.spec.js"]) == (
        "training-school,training-openings,training-puzzles,training-tournament,training-progress,training-daily"
    )
    assert classify(["frontend/src/labLaunchIntent.js"]) == "none"
    assert classify(["frontend/src/useLearningJourneyFlow.js"]) == "none"
    assert classify(["frontend/src/useGlobalShellUi.js"]) == "none"
    assert classify(["frontend/src/useTournamentFlow.js"]) == "none"
    assert classify(["frontend/src/components/GlobalOverlayLayer.jsx"]) == "home-base"
    assert classify(["frontend/src/soundFx.js"]) == "none"
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
    assert classify(["scripts/blender/build_war_room_v4.py"]) == "none"
    assert classify(["scripts/blender/publish_war_room_v4.py"]) == "none"
    assert classify([".github/workflows/war-room-v4-blender-art.yml"]) == "none"
    assert classify(["docs/operations/war-room-blender-pipeline.md"]) == "none"
    assert classify([".github/workflows/README.md"]) == "none"
    assert classify(["scripts/blender_required_scope.py"]) == "none"
    assert classify(["scripts/workflow_debt_gate.py"]) == "none"
    for variant_core_file in WARROOM_VARIANT_CORE_FILES:
        assert classify([variant_core_file]) == "warroom-core"
    for core_only_file in WARROOM_CORE_ONLY_FILES:
        assert classify([core_only_file]) == "warroom-core"
    for mobile_only_file in WARROOM_MOBILE_ONLY_FILES:
        assert classify([mobile_only_file]) == "warroom-core"
    for matthias_only_file in WARROOM_MATTHIAS_ONLY_FILES:
        assert classify([matthias_only_file]) == "warroom-core"
    for board3d_matthias_file in BOARD3D_MATTHIAS_SHARED_FILES:
        assert classify([board3d_matthias_file]) == "training-school,warroom-core"
    for training_matthias_file in TRAINING_PROGRESS_MATTHIAS_FILES:
        assert classify([training_matthias_file]) == "training-progress"
    assert classify(["frontend/src/components/WarRoomCatDecor.js"]) == "warroom-decor"
    assert classify(["frontend/src/components/WarRoomArmorDisplay.js"]) == "warroom-armor"
    assert classify(["frontend/src/components/WarRoomHansPerGame.jsx"]) == "warroom-hans"
    assert classify(["e2e/war-room-hans-routines-visual.spec.js"]) == "warroom-hans"
    assert classify(["frontend/src/components/Board3DCore.jsx"]) == "training-school,warroom-core"
    assert classify(["frontend/src/components/Board3DScene.js"]) == "training-school,warroom-core"
    assert classify(["frontend/src/components/WarRoom3DAnimation.js"]) == "warroom-core"
    assert classify(["frontend/src/components/GameBoardView.jsx"]) == "warroom-core"
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
    warroom_profile_scope = WARROOM_PROFILE_SCOPE_ALL if args.all else classify_warroom_profile_scope(paths)
    home_profile_scope = HOME_PROFILE_SCOPE_ALL if args.all else classify_home_profile_scope(paths)
    if args.github_output:
        with open(args.github_output, "a", encoding="utf-8") as handle:
            handle.write(f"producer_scope={result}\n")
            handle.write(f"warroom_variants={warroom_variants}\n")
            handle.write(f"warroom_profile_scope={warroom_profile_scope}\n")
            handle.write(f"home_profile_scope={home_profile_scope}\n")
    else:
        print(f"producer_scope={result}")
        print(f"warroom_variants={warroom_variants}")
        print(f"warroom_profile_scope={warroom_profile_scope}")
        print(f"home_profile_scope={home_profile_scope}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
