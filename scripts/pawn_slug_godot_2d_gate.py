#!/usr/bin/env python3
"""Keep Pawn Slug's Godot runtime strictly 2D.

This gate is intentionally narrow: it protects games/pawn-slug-godot from
accidentally reintroducing 3D runtime nodes or 3D-authored asset references.
Other Chess Studio surfaces may continue using 3D where appropriate.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
GODOT_ROOT = ROOT / "games/pawn-slug-godot"
MATTHIAS = GODOT_ROOT / "scripts/matthias_art.gd"

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
    "Marker2D",
    "AnimationPlayer",
    "res://assets/weapon_atlas.svg",
    "/pawn-slug/matthias/motion/",
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

    if not MATTHIAS.is_file():
        violations.append("falta games/pawn-slug-godot/scripts/matthias_art.gd")
    else:
        matthias = MATTHIAS.read_text(encoding="utf-8")
        for token in REQUIRED_MATTHIAS:
            if token not in matthias:
                violations.append(f"matthias_art.gd perdió contrato 2D requerido: {token}")

    if violations:
        raise GateError("\n".join(violations))


def self_test() -> None:
    assert "blender" in FORBIDDEN
    assert "node3d" in FORBIDDEN
    assert "AnimatedSprite2D" in REQUIRED_MATTHIAS
    assert "Marker2D" in REQUIRED_MATTHIAS
    print("OK Pawn Slug Godot 2D gate self-test")


def main() -> int:
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "self-test":
            self_test()
        else:
            validate()
            print("OK Pawn Slug Godot stays 2D")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
