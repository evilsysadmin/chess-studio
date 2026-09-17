#!/usr/bin/env python3
"""Keep Pawn Slug's Godot runtime strictly 2D and frame-driven.

The gate protects games/pawn-slug-godot from accidental 3D runtime assets and
also keeps Matthias on the Godot AnimatedSprite2D/SpriteFrames path.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
GODOT_ROOT = ROOT / "games/pawn-slug-godot"
MATTHIAS = GODOT_ROOT / "scripts/matthias_art.gd"
ENEMIES = GODOT_ROOT / "scripts/enemy_visual.gd"

TEXT_SUFFIXES = {".gd", ".tscn", ".tres", ".godot", ".cfg", ".svg", ".md"}
FORBIDDEN = (
    "blender",
    ".blend",
    "node3d",
    "meshinstance3d",
    "sprite3d",
    "skeleton3d",
    ".glb",
    ".gltf",
)
REQUIRED_MATTHIAS = (
    "AnimatedSprite2D",
    "SpriteFrames",
    "Marker2D",
    "HTTPRequest",
    "MASTER_URL",
    "LEGACY_PISTOL_ATLAS_URL",
    "/pawn-slug/matthias/master/matthias_canonical_sprite_sheet_v1-",
    "/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-",
    "FULL_ATLAS_COLUMNS := 8",
    "FULL_ATLAS_ROWS := 10",
    "FULL_ATLAS_CELL_SIZE := 256",
    "FULL_ATLAS_SIZE := Vector2i(FULL_ATLAS_COLUMNS * FULL_ATLAS_CELL_SIZE, FULL_ATLAS_ROWS * FULL_ATLAS_CELL_SIZE)",
    "pawn_slug_godot_atlases_v2/matthias_pistol_godot_strict_8x10_256_v5.png",
    "pawn_slug_godot_atlases_v2/matthias_smg_godot_strict_8x10_256_v5.png",
    "pawn_slug_godot_atlases_v2/matthias_shotgun_godot_strict_8x10_256_v5.png",
    "pawn_slug_godot_atlases_v2/matthias_bazooka_godot_strict_8x10_256_v5.png",
    "FULL_ACTIONS",
    '"shoot": {"row": 6, "count": 6',
    '"die": {"row": 9, "count": 8',
    "_normalized_cell_texture",
    "ImageTexture.create_from_image",
    "load_png_from_buffer",
    "load_webp_from_buffer",
    "animation_finished.connect",
    "_advance_locomotion",
    'frames.get_frame_texture("fall", 0)',
    'name = "WeaponRoot"',
)
FORBIDDEN_MATTHIAS = (
    "MOTION_ATLAS_URL",
    "PISTOL_SHOOT_URL",
    "WEAPON_URLS",
    "res://assets/weapon_atlas.svg",
    "_pistol_shoot",
    "/pawn-slug/matthias/machinegun/",
    "/pawn-slug/matthias/shotgun/",
    "/pawn-slug/matthias/panzerfaust/",
)
REQUIRED_ENEMIES = (
    "Sprite2D",
    "Marker2D",
    "HTTPRequest",
    "res://assets/weapon_atlas.svg",
    "/pawn-slug/enemies/premium-raster/",
    "enemy_premium_raster_v5",
    "load_webp_from_buffer",
)


class GateError(RuntimeError):
    pass


def source_files() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for path in GODOT_ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if "build" in path.relative_to(GODOT_ROOT).parts:
            continue
        files.append(path)
    return sorted(files)


def validate_contract(path: pathlib.Path, label: str, required: tuple[str, ...], violations: list[str]) -> None:
    if not path.is_file():
        violations.append(f"falta {path.relative_to(ROOT)}")
        return
    text = path.read_text(encoding="utf-8")
    for token in required:
        if token not in text:
            violations.append(f"{label} perdió contrato 2D requerido: {token}")
    if path == MATTHIAS:
        for token in FORBIDDEN_MATTHIAS:
            if token in text:
                violations.append(f"{label} reintrodujo identidad visual legacy: {token}")


def validate() -> None:
    if not GODOT_ROOT.is_dir():
        raise GateError(f"No existe Pawn Slug Godot: {GODOT_ROOT}")

    violations: list[str] = []
    for path in source_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        lowered = text.lower()
        for token in FORBIDDEN:
            if token in lowered:
                violations.append(f"{path.relative_to(ROOT)}: token prohibido {token!r}")

    validate_contract(MATTHIAS, "matthias_art.gd", REQUIRED_MATTHIAS, violations)
    validate_contract(ENEMIES, "enemy_visual.gd", REQUIRED_ENEMIES, violations)

    if violations:
        raise GateError("\n".join(violations))


def self_test() -> None:
    assert "blender" in FORBIDDEN
    assert "node3d" in FORBIDDEN
    assert "AnimatedSprite2D" in REQUIRED_MATTHIAS
    assert "SpriteFrames" in REQUIRED_MATTHIAS
    assert "FULL_ATLAS_COLUMNS := 8" in REQUIRED_MATTHIAS
    assert "FULL_ATLAS_ROWS := 10" in REQUIRED_MATTHIAS
    assert "FULL_ATLAS_CELL_SIZE := 256" in REQUIRED_MATTHIAS
    assert "matthias_smg_godot_strict_8x10_256_v5.png" in REQUIRED_MATTHIAS
    assert "_advance_locomotion" in REQUIRED_MATTHIAS
    assert 'frames.get_frame_texture("fall", 0)' in REQUIRED_MATTHIAS
    assert "load_webp_from_buffer" in REQUIRED_MATTHIAS
    assert "WEAPON_URLS" in FORBIDDEN_MATTHIAS
    assert "/pawn-slug/matthias/machinegun/" in FORBIDDEN_MATTHIAS
    assert "HTTPRequest" in REQUIRED_ENEMIES
    assert "/pawn-slug/enemies/premium-raster/" in REQUIRED_ENEMIES
    print("OK Pawn Slug Godot 2D SpriteFrames gate self-test")


def main() -> int:
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "self-test":
            self_test()
        else:
            validate()
            print("OK Pawn Slug Godot stays 2D and frame-driven")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
