#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys

GAME_ROOT = "games/pawn-slug-godot/"
AUTHORING_PREFIXES = (
    "games/pawn-slug-godot/tests/",
    "games/pawn-slug-godot/art/sprite-forge-v1/",
)
RUNTIME_TOOLING = {
    ".github/workflows/pawn-slug-godot-web.yml",
    "scripts/pawn_slug_godot_bundle.py",
    "scripts/pawn_slug_godot_pr_capture.mjs",
}


def requires_full_visual_capture(paths: list[str]) -> bool:
    for raw in paths:
        path = raw.strip()
        if not path:
            continue
        if path in RUNTIME_TOOLING:
            return True
        if path.startswith(GAME_ROOT):
            if any(path.startswith(prefix) for prefix in AUTHORING_PREFIXES):
                continue
            # Runtime scripts/assets/project/export settings are visual surface.
            return True
    return False


def self_test() -> None:
    assert not requires_full_visual_capture(
        [
            "scripts/art/sprite_forge.py",
            "scripts/art/ingest_matthias_pistol_v1.py",
            "games/pawn-slug-godot/tests/matthias_pistol_v1_seed_smoke.gd",
            "games/pawn-slug-godot/art/sprite-forge-v1/catalog.json",
            "docs/pawnslug-sprites.md",
        ]
    )
    assert requires_full_visual_capture(
        ["games/pawn-slug-godot/scripts/matthias_art.gd"]
    )
    assert requires_full_visual_capture(
        ["games/pawn-slug-godot/assets/weapon_atlas.svg"]
    )
    assert requires_full_visual_capture(
        ["games/pawn-slug-godot/project.godot"]
    )
    assert requires_full_visual_capture(
        ["scripts/pawn_slug_godot_pr_capture.mjs"]
    )
    assert requires_full_visual_capture(
        [".github/workflows/pawn-slug-godot-web.yml"]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("Pawn Slug visual CI scope self-test: OK")
        return 0

    paths = [line for line in sys.stdin.read().splitlines() if line.strip()]
    print("true" if requires_full_visual_capture(paths) else "false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
