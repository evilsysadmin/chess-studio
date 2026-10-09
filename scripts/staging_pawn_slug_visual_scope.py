#!/usr/bin/env python3
"""Classify Pawn Slug staging captures independently of shared Quality coverage."""
from __future__ import annotations

import argparse
import re

# These paths change the game, its web export, the deployed Pawn Slug API, or
# the tools/artifacts used specifically to produce or verify its visual result.
PAWN_SLUG_PREFIXES = (
    "games/pawn-slug-godot/",
    "frontend/src/assets/pawnSlug/",
    "backend-python/pawn_slug_manifests/",
    "backend-go/internal/pawnslug/",
    "scripts/pawn_slug_",
    ".github/workflows/pawn-slug-",
)
PAWN_SLUG_EXACT = frozenset({
    "backend-python/pawn_slug_api.py",
    "e2e/pawn-slug.spec.js",
    "e2e/staging-pawn-slug-godot.spec.js",
    ".github/workflows/staging-pawn-slug-visual.yml",
    "scripts/staging_pawn_slug_visual_scope.py",
    "scripts/art/sprite_forge.py",
    "scripts/art/ingest_matthias_pistol_v1.py",
    "scripts/art/build_matthias_pistol_v1_seed.py",
    "scripts/art/test_sprite_forge.py",
    "scripts/art/sprite_forge_contract.schema.json",
    "scripts/art/generate_pawn_slug_v1_contracts.py",
    "scripts/art/sprite_forge_acceptance.py",
})
PAWN_SLUG_FRONTEND_RE = re.compile(
    r"^frontend/src/pawnSlug[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/PawnSlug[^/]*\.(?:js|jsx|css)$"
)


def requires_live_visual(paths: list[str]) -> bool:
    """Capture only on Pawn Slug changes, not shared test/deploy harness edits.

    Quality deliberately exercises specialized E2E on changes to e2e/helpers.js
    and other shared infrastructure. That broader coverage must not imply a
    Godot staging capture; the live visual job has a separate blast radius.
    """
    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if (
            path in PAWN_SLUG_EXACT
            or any(path.startswith(prefix) for prefix in PAWN_SLUG_PREFIXES)
            or PAWN_SLUG_FRONTEND_RE.search(path)
        ):
            return True
    return False


def self_test() -> None:
    for path in (
        "games/pawn-slug-godot/scripts/main.gd",
        "games/pawn-slug-godot/art/sprite-forge-v1/catalog.json",
        "frontend/src/components/PawnSlugScreen.jsx",
        "frontend/src/pawnSlugEngine.js",
        "frontend/src/assets/pawnSlug/hero.png",
        "backend-python/pawn_slug_api.py",
        "backend-python/pawn_slug_manifests/pawn-slug-v1.json",
        "backend-go/internal/pawnslug/handler.go",
        "scripts/pawn_slug_godot_2d_gate.py",
        "scripts/art/sprite_forge.py",
        ".github/workflows/pawn-slug-godot-web.yml",
        ".github/workflows/staging-pawn-slug-visual.yml",
        "scripts/staging_pawn_slug_visual_scope.py",
        "e2e/staging-pawn-slug-godot.spec.js",
        "e2e/pawn-slug.spec.js",
    ):
        assert requires_live_visual([path]), f"Pawn Slug capture expected for: {path}"

    for path in (
        "e2e/helpers.js",
        "e2e/playwright.config.js",
        ".github/actions/setup-browser-e2e/action.yml",
        ".github/workflows/cicd.yml",
        ".github/workflows/staging-deploy.yml",
        "scripts/staging_optional_scope.py",
        "scripts/staging_deploy_prepare.py",
        "scripts/quality_scope.py",
        "scripts/apply_frontend_csp.mjs",
        "Makefile",
        "frontend/src/components/LabScreen.jsx",
        "frontend/src/components/GameScreen.jsx",
        "frontend/src/components/ChroniclesOfMatthias.jsx",
        "games/chess-football-godot/scripts/player.gd",
        "docs/operations/pvp.md",
    ):
        assert not requires_live_visual([path]), f"Unexpected Godot capture for: {path}"

    assert not requires_live_visual([])
    assert not requires_live_visual(["e2e/helpers.js", "frontend/src/components/GameScreen.jsx"])
    assert requires_live_visual(["e2e/helpers.js", "games/pawn-slug-godot/scripts/main.gd"])
    assert requires_live_visual([r"games\pawn-slug-godot\scripts\main.gd"])
    print("staging-pawn-slug-visual-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if not args.self_test:
        parser.error("--self-test is the only direct operation; staging prepare owns the baseline")
    self_test()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
