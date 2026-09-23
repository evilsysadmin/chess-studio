#!/usr/bin/env python3
"""High-confidence dead-module gate without installing project dependencies.

Reports whole product modules and stylesheets that cannot be reached from the
runtime entrypoints through static/dynamic relative imports. It also reports a
narrow class of dead frontend exports when the symbol has no external named
consumer, no internal reference and no opaque namespace/dynamic consumer.
CSS selectors and ambiguous symbols remain outside this no-dependency gate.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend" / "src"
BACKEND = ROOT / "backend-python"
SCRIPTS = ROOT / "scripts"
JS_EXTS = (".js", ".jsx", ".mjs")
IMPORT_RE = re.compile(r"(?:(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?|import\s*\()\s*['\"]([^'\"]+)['\"]")
CSS_IMPORT_RE = re.compile(r"@import\s+(?:url\(\s*)?['\"]?([^'\")\s;]+)")
EXPORT_DECL_RE = re.compile(r"\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)")
NAMED_FROM_RE = re.compile(
    r"(?:import\s+(?:[A-Za-z_$][A-Za-z0-9_$]*\s*,\s*)?|export\s+)"
    r"\{([^}]*)\}\s+from\s+['\"]([^'\"]+)['\"]",
    re.DOTALL,
)
OPAQUE_FROM_RE = re.compile(
    r"(?:import\s+\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*|"
    r"export\s+\*(?:\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*)?)"
    r"\s+from\s+['\"]([^'\"]+)['\"]"
)
DYNAMIC_IMPORT_RE = re.compile(r"\bimport\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
REQUIRE_RE = re.compile(r"\brequire\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
UVICORN_ENTRY_RE = re.compile(r"\buvicorn\s+([A-Za-z_][A-Za-z0-9_]*):[A-Za-z_][A-Za-z0-9_]*")
FRONTEND_EXCLUDES = {"test-setup.js"}
FRONTEND_DEAD_EXPORT_BASELINE = {
    "frontend/src/ambientIdentityContrasts.js::IDENTITY_CONTRAST_IDS",
    "frontend/src/ambientRadioMatthiasRecompositions.js::RADIO_MATTHIAS_MELODIC_REWRITE_IDS",
    "frontend/src/chesscomEnvironmentArtV4.js::CHESSCOM_ENVIRONMENT_ART_V4",
    "frontend/src/chesscomMaterialArtV7.js::CHESSCOM_MATERIAL_ART_V7",
    "frontend/src/chesscomOverlayArtV6.js::CHESSCOM_OVERLAY_ART_V6",
    "frontend/src/chronicles/chroniclesMapCatalog.js::chroniclesMapEnemyById",
    "frontend/src/chronicles/chroniclesMapCatalog.js::chroniclesMapInteractable",
    "frontend/src/chroniclesOfMatthias.js::chroniclesEnemyAlive",
    "frontend/src/chroniclesOfMatthias.js::chroniclesFrontCell",
    "frontend/src/chroniclesOfMatthiasProgression.js::resetChroniclesCharacterBuild",
    "frontend/src/chroniclesOfMatthiasTactics.js::chroniclesTacticsWait",
    "frontend/src/combatEconomyBalance.js::COMBAT_CAMPAIGN_ECONOMY",
    "frontend/src/components/WarRoomCampaignArt.js::WAR_ROOM_CAMPAIGN_ART_KEYS",
    "frontend/src/components/WarRoomHansActor.js::acquireWarRoomHansRoutine",
    "frontend/src/components/WarRoomHansActor.js::releaseWarRoomHansRoutine",
    "frontend/src/components/WarRoomHansActor.js::warRoomHansRoutineAvailable",
    "frontend/src/pawnTrailblazerSprites.js::trailSprite",
    "frontend/src/puzzleStateMachine.js::assertPuzzleInvariant",
    "frontend/src/puzzleTacticalQuality.js::bestShallowTacticalScore",
    "frontend/src/puzzleTacticalQuality.js::tacticalScoreForFirstMove",
}


def strip_resource_query(spec: str) -> str:
    return re.split(r"[?#]", spec, maxsplit=1)[0]


def resolve_js(source: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    # Vite resource queries (?raw, ?url, etc.) modify loading semantics while
    # still referring to the same repository file for reachability purposes.
    base = source.parent / strip_resource_query(spec)
    candidates = [base, *(Path(str(base) + ext) for ext in JS_EXTS), *(base / f"index{ext}" for ext in JS_EXTS)]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError(f"import relativo no resoluble: {source.relative_to(ROOT)} -> {spec}")


def resolve_css(source: Path, spec: str) -> Path | None: