#!/usr/bin/env python3
"""Pure Pawn Slug path classifier for optional staging evidence."""
from __future__ import annotations

import argparse

import quality_scope

EXPLICIT_PATHS = frozenset({
    ".github/workflows/staging-deploy.yml",
    ".github/workflows/staging-pawn-slug-visual.yml",
    "e2e/staging-pawn-slug-godot.spec.js",
    "scripts/staging_pawn_slug_visual_scope.py",
    "scripts/staging_optional_scope.py",
})


def requires_live_visual(paths: list[str]) -> bool:
    cleaned = [path.strip().replace("\\", "/") for path in paths if path.strip()]
    if any(path in EXPLICIT_PATHS for path in cleaned):
        return True
    scope = quality_scope.classify(cleaned)
    return bool(scope.run_pawn_slug_godot or scope.run_pawn_slug_e2e)


def self_test() -> None:
    assert requires_live_visual(["games/pawn-slug-godot/scripts/main.gd"])
    assert requires_live_visual(["frontend/src/components/PawnSlugScreen.jsx"])
    assert requires_live_visual(["e2e/staging-pawn-slug-godot.spec.js"])
    assert requires_live_visual([".github/workflows/staging-deploy.yml"])
    assert requires_live_visual(["scripts/staging_optional_scope.py"])
    assert not requires_live_visual(["frontend/src/components/GameScreen.jsx"])
    assert not requires_live_visual(["docs/operations/pvp.md"])
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
