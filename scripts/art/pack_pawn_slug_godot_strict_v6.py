#!/usr/bin/env python3
"""Append an authored crouch row to the strict Pawn Slug Godot Matthias atlas."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

CELL = 256
COLS = 8
BASE_ROWS = 10
ROWS = 11
BASE_SIZE = (COLS * CELL, BASE_ROWS * CELL)
OUTPUT_SIZE = (COLS * CELL, ROWS * CELL)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-atlas", type=Path, required=True)
    parser.add_argument("--crouch-frame", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_rgba(path: Path, expected: tuple[int, int]) -> Image.Image:
    if not path.is_file():
        raise SystemExit(f"missing image: {path}")
    image = Image.open(path).convert("RGBA")
    if image.size != expected:
        raise SystemExit(f"unexpected image size {image.size}, expected {expected}: {path}")
    return image


def validate_crouch(image: Image.Image) -> None:
    box = image.getchannel("A").getbbox()
    if not box:
        raise SystemExit("empty crouch frame")
    width = box[2] - box[0]
    height = box[3] - box[1]
    if width < 55 or height < 90:
        raise SystemExit(f"implausibly small crouch silhouette: {width}x{height}")
    if height > 235:
        raise SystemExit(f"crouch silhouette implausibly tall: {height}px")


def main():
    cfg = parse_args()
    base = load_rgba(cfg.base_atlas, BASE_SIZE)
    crouch = load_rgba(cfg.crouch_frame, (CELL, CELL))
    validate_crouch(crouch)

    atlas = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
    atlas.alpha_composite(base, (0, 0))
    atlas.alpha_composite(crouch, (0, BASE_ROWS * CELL))

    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(cfg.output, "PNG", optimize=True)
    print(f"Packed {cfg.output} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
