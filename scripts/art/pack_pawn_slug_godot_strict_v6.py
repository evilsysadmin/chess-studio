#!/usr/bin/env python3
"""Append a strict-style crouch row to the Pawn Slug Godot Matthias atlas.

The crouch is derived from the existing strict-v5 shoot stance itself, so the
new row preserves exactly the same rendered identity, weapon, lighting and
palette. Only the lower body is recomposed into a low combat stance.
"""
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
SHOOT_ROW = 6
SHOOT_FRAME = 0

UPPER_SHIFT = 24
UPPER_FADE_START = 150
UPPER_FADE_END = 190
LEG_SCALE = 0.68
LEG_SPREAD = 10
LEG_ROTATE = 6
LEG_BOTTOM = 238
LEG_BOXES = (
    (42, 145, 112, LEG_BOTTOM, -LEG_SPREAD, -LEG_ROTATE),
    (96, 145, 170, LEG_BOTTOM, LEG_SPREAD, LEG_ROTATE),
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-atlas", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--crouch-output", type=Path)
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
    if width < 110 or height < 150:
        raise SystemExit(f"implausibly small crouch silhouette: {width}x{height}")
    if height > 205:
        raise SystemExit(f"crouch silhouette still too upright: {height}px")


def extract_cell(atlas: Image.Image, row: int, column: int) -> Image.Image:
    return atlas.crop((column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL))


def faded_upper(source: Image.Image) -> Image.Image:
    upper = source.copy()
    alpha = upper.getchannel("A")
    pixels = alpha.load()
    span = max(1, UPPER_FADE_END - UPPER_FADE_START)
    for y in range(UPPER_FADE_START, CELL):
        factor = 0.0 if y >= UPPER_FADE_END else (UPPER_FADE_END - y) / span
        for x in range(CELL):
            pixels[x, y] = int(pixels[x, y] * factor)
    upper.putalpha(alpha)
    return upper


def derive_crouch(base: Image.Image) -> Image.Image:
    source = extract_cell(base, SHOOT_ROW, SHOOT_FRAME)
    crouch = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))

    # Recompose both legs first. They stay anchored to the authored boot line,
    # are shortened/spread slightly, and get opposing rotations.
    for x0, y0, x1, y1, x_offset, angle in LEG_BOXES:
        leg = source.crop((x0, y0, x1, y1))
        original_width = leg.width
        scaled_height = max(1, int(round(leg.height * LEG_SCALE)))
        leg = leg.resize((original_width, scaled_height), Image.Resampling.LANCZOS)
        leg = leg.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        x = x0 + x_offset - (leg.width - original_width) // 2
        y = LEG_BOTTOM - leg.height
        crouch.alpha_composite(leg, (x, y))

    # Keep face, torso, arms and weapon at native scale. Moving this layer down
    # creates the squat; the fade removes the old straight-leg pixels.
    crouch.alpha_composite(faded_upper(source), (0, UPPER_SHIFT))
    validate_crouch(crouch)
    return crouch


def main():
    cfg = parse_args()
    base = load_rgba(cfg.base_atlas, BASE_SIZE)
    crouch = derive_crouch(base)

    atlas = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
    atlas.alpha_composite(base, (0, 0))
    atlas.alpha_composite(crouch, (0, BASE_ROWS * CELL))

    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(cfg.output, "PNG", optimize=True)
    if cfg.crouch_output:
        cfg.crouch_output.parent.mkdir(parents=True, exist_ok=True)
        crouch.save(cfg.crouch_output, "PNG", optimize=True)
    print(f"Packed {cfg.output} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
