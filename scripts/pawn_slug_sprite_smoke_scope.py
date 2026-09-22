#!/usr/bin/env python3
"""Resolve the smallest safe Pawn Slug runtime sprite-smoke surface."""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

MATTHIAS_PATHS = {
    "games/pawn-slug-godot/scripts/matthias_art.gd",
    "scripts/art/export_matthias_sprite_smoke.py",
    "scripts/art/validate_matthias_sprite_continuity.py",
    "scripts/art/repair_matthias_runtime_motion.py",
}

ENEMY_PATHS = {
    "games/pawn-slug-godot/scripts/enemy_visual.gd",
    "games/pawn-slug-godot/art/enemies-v2-worksheet.json",
    "scripts/art/export_enemy_sprite_smoke.py",
    "scripts/art/pack_pawn_slug_enemy_v2.py",
    "scripts/art/validate_pawn_slug_enemy_v2.py",
    "scripts/art/test_pawn_slug_enemy_v2.py",
    "scripts/art/derive_pawn_slug_enemy_queen_v2.py",
    "scripts/art/test_pawn_slug_enemy_queen_v2.py",
    "scripts/art/derive_pawn_slug_enemy_scout_v2.py",
    "scripts/art/test_pawn_slug_enemy_scout_v2.py",
}

SHARED_PATHS = {
    "scripts/art/png_contract.py",
    "scripts/pr_merge_diff.py",
    ".github/workflows/pawn-slug-matthias-sprite-smoke.yml",
}

SELF_PATH = "scripts/pawn_slug_sprite_smoke_scope.py"


@dataclass(frozen=True)
class Scope:
    matthias: bool
    enemy: bool


def full_scope() -> Scope:
    return Scope(matthias=True, enemy=True)


def classify(paths: list[str]) -> Scope:
    cleaned = [path.strip().replace("\\", "/").lower() for path in paths if path.strip()]
    if not cleaned:
        return full_scope()

    matthias = False
    enemy = False
    for path in cleaned:
        if path == SELF_PATH:
            continue
        if path in SHARED_PATHS:
            matthias = True
            enemy = True
            continue
        if path in MATTHIAS_PATHS:
            matthias = True
            continue
        if path in ENEMY_PATHS:
            enemy = True
            continue

        if path.startswith("games/pawn-slug-godot/") or path.startswith("scripts/art/"):
            matthias = True
            enemy = True

    return Scope(matthias=matthias, enemy=enemy)


def write_outputs(scope: Scope, output_path: str) -> None:
    with open(output_path, "a", encoding="utf-8") as handle:
        handle.write(f"matthias={str(scope.matthias).lower()}\n")
        handle.write(f"enemy={str(scope.enemy).lower()}\n")


def self_test() -> None:
    assert classify(["games/pawn-slug-godot/scripts/matthias_art.gd"]) == Scope(True, False)
    assert classify(["scripts/art/export_matthias_sprite_smoke.py"]) == Scope(True, False)
    assert classify(["scripts/art/validate_matthias_sprite_continuity.py"]) == Scope(True, False)
    assert classify(["scripts/art/repair_matthias_runtime_motion.py"]) == Scope(True, False)
    assert classify(["games/pawn-slug-godot/scripts/enemy_visual.gd"]) == Scope(False, True)
    assert classify(["scripts/art/derive_pawn_slug_enemy_queen_v2.py"]) == Scope(False, True)
    assert classify(["scripts/art/png_contract.py"]) == full_scope()
    assert classify(["scripts/pr_merge_diff.py"]) == full_scope()
    assert classify(["games/pawn-slug-godot/art/new-sprite-owner.json"]) == full_scope()
    assert classify(["scripts/art/new_sprite_tool.py"]) == full_scope()
    assert classify(["frontend/src/App.jsx"]) == Scope(False, False)
    assert classify(["infra/grafana/README.md"]) == Scope(False, False)
    assert classify([SELF_PATH]) == Scope(False, False)
    assert classify([
        "games/pawn-slug-godot/scripts/matthias_art.gd",
        "games/pawn-slug-godot/scripts/enemy_visual.gd",
    ]) == full_scope()
    assert classify([]) == full_scope()
    print("pawn slug sprite smoke scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    scope = full_scope() if args.all else classify(sys.stdin.read().splitlines())
    if args.github_output:
        write_outputs(scope, args.github_output)
    else:
        print(f"matthias={str(scope.matthias).lower()}")
        print(f"enemy={str(scope.enemy).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
