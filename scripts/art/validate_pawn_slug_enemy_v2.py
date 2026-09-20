#!/usr/bin/env python3
"""Validate normalized Pawn Slug enemy v2 atlases and manifest."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from png_contract import sha256_file, validate_png_contract
from pack_pawn_slug_enemy_v2 import (
    CELL_GUTTER,
    CELL_HEIGHT,
    CELL_WIDTH,
    ENEMY_TYPES,
    FOOT_LINE,
    GRID_COLUMNS,
    GRID_ROWS,
    PIVOT_X,
)


def validate_manifest(manifest_path: Path) -> dict:
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_header = {
        "schema": 2,
        "scope": "pawn-slug-godot-enemy-v2",
        "cell": [CELL_WIDTH, CELL_HEIGHT],
        "grid": [GRID_COLUMNS, GRID_ROWS],
        "pivot": [PIVOT_X, FOOT_LINE],
        "footLine": FOOT_LINE,
        "gutter": CELL_GUTTER,
        "framesPerType": GRID_COLUMNS * GRID_ROWS,
    }
    for key, expected in expected_header.items():
        if manifest.get(key) != expected:
            raise ValueError(f"manifest {key}={manifest.get(key)!r}, expected {expected!r}")

    items = manifest.get("types", [])
    seen = [item.get("type") for item in items]
    if seen != list(ENEMY_TYPES):
        raise ValueError(f"enemy type order mismatch: {seen}")

    expected_size = (GRID_COLUMNS * CELL_WIDTH, GRID_ROWS * CELL_HEIGHT)
    for item in items:
        atlas_path = root / item["atlas"]
        info = validate_png_contract(atlas_path, max_side=4096)
        if (info["width"], info["height"]) != expected_size:
            raise ValueError(f"{atlas_path} size mismatch: {(info['width'], info['height'])} != {expected_size}")
        if item.get("atlasSha256") != sha256_file(atlas_path):
            raise ValueError(f"{atlas_path} sha256 mismatch")
        if len(item.get("frames", [])) != GRID_COLUMNS * GRID_ROWS:
            raise ValueError(f"{atlas_path} must expose 16 frames")

        with Image.open(atlas_path) as atlas:
            atlas = atlas.convert("RGBA")
            for frame in item["frames"]:
                x, y, w, h = frame["region"]
                if (w, h) != (CELL_WIDTH, CELL_HEIGHT):
                    raise ValueError(f"{atlas_path}: frame {frame['index']} wrong cell size")
                cell = atlas.crop((x, y, x + w, y + h))
                bbox = cell.getchannel("A").getbbox()
                if bbox is None:
                    raise ValueError(f"{atlas_path}: frame {frame['index']} is empty")
                left, top, right, bottom = bbox
                if left < CELL_GUTTER or top < CELL_GUTTER:
                    raise ValueError(f"{atlas_path}: frame {frame['index']} violates top/left gutter: {bbox}")
                if right > CELL_WIDTH - CELL_GUTTER:
                    raise ValueError(f"{atlas_path}: frame {frame['index']} violates right gutter: {bbox}")
                if bottom != FOOT_LINE:
                    raise ValueError(f"{atlas_path}: frame {frame['index']} foot line {bottom}, expected {FOOT_LINE}")
                if bottom > CELL_HEIGHT - CELL_GUTTER:
                    raise ValueError(f"{atlas_path}: frame {frame['index']} violates bottom gutter: {bbox}")

    review = root / manifest["review"]
    validate_png_contract(review, max_side=4096)
    if manifest.get("reviewSha256") != sha256_file(review):
        raise ValueError("review sha256 mismatch")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    cfg = parser.parse_args()
    manifest = validate_manifest(cfg.manifest)
    print(f"OK enemy v2: {len(manifest['types'])} types, {manifest['framesPerType']} frames/type, mobile-safe pages")


if __name__ == "__main__":
    main()
