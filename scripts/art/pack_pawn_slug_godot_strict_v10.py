#!/usr/bin/env python3
"""Pack the next Matthias generation into an 8 x 18 Godot atlas.

The v9 canonical source remains the regression baseline. This packer expands
each action to eight deterministic frames and replaces the pistol/SMG run rows
with new transparent frame strips when supplied. Every generated frame is
normalized to the v9 body height, foot line and pivot before it is placed in a
416 px cell. The other actions and weapons stay sourced from the validated v9
atlas so directional coverage and weapon silhouettes cannot regress while the
new locomotion is reviewed.
"""
from __future__ import annotations

import argparse
import statistics
from pathlib import Path

from PIL import Image

from pack_pawn_slug_godot_strict_v9 import load_source, lower_body_anchor, pack as pack_v9

STRICT_VERSION = "v10"
BASELINE_COLS = 6
COLS = 8
ROWS = 18
CELL = 416
OUT_SIZE = (COLS * CELL, ROWS * CELL)
TARGET_FOOT_Y = 382.0
TARGET_PIVOT_X = 200.0
TARGET_BODY_HEIGHT = 230.0
MAX_CONTENT = CELL - 18
ROW_NAMES = (
    "idle",
    "walk",
    "run",
    "jump",
    "fall",
    "land",
    "crouch",
    "crouch_walk",
    "shoot_horizontal",
    "shoot_up",
    "shoot_down",
    "shoot_diag_up",
    "shoot_diag_up_alt",
    "shoot_diag_down",
    "shoot_crouch",
    "reload",
    "hurt",
    "die",
)
REMAP = (0, 1, 2, 3, 3, 4, 5, 5)


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--weapon", choices=("pistol", "machinegun", "shotgun", "panzerfaust"))
    parser.add_argument("--run-strip", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def crop_cell(atlas: Image.Image, col: int, row: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def split_strip(strip: Image.Image) -> list[Image.Image]:
    """Split a transparent horizontal strip by occupied x ranges."""
    alpha = strip.getchannel("A")
    occupied = []
    for x in range(strip.width):
        if any(alpha.getpixel((x, y)) > 30 for y in range(strip.height)):
            occupied.append(x)
    if not occupied:
        raise SystemExit("run strip contains no visible pixels")
    groups: list[tuple[int, int]] = []
    start = previous = occupied[0]
    for x in occupied[1:]:
        if x - previous > 12:
            groups.append((start, previous + 1))
            start = x
        previous = x
    groups.append((start, previous + 1))
    if len(groups) != COLS:
        raise SystemExit(f"expected {COLS} run frames, found {len(groups)} x-ranges: {groups}")
    return [strip.crop((left, 0, right, strip.height)) for left, right in groups]


def normalize_generated_frame(sprite: Image.Image) -> Image.Image:
    if sprite.getchannel("A").getbbox() is None:
        raise SystemExit("generated run frame is empty")
    # Lanczos can leave a transparent fringe at the crop edge. Re-crop and
    # rescale a few times so the visible body, rather than the source fringe,
    # is exactly the canonical height.
    for _ in range(4):
        box = sprite.getchannel("A").getbbox()
        if box is None:
            raise SystemExit("generated run frame became empty while normalizing")
        sprite = sprite.crop(box)
        scale = TARGET_BODY_HEIGHT / float(sprite.height)
        sprite = sprite.resize(
            (max(1, int(round(sprite.width * scale))), max(1, int(round(sprite.height * scale)))),
            Image.Resampling.LANCZOS,
        )
    if max(sprite.width, sprite.height) > MAX_CONTENT:
        scale = MAX_CONTENT / float(max(sprite.width, sprite.height))
        sprite = sprite.resize(
            (max(1, int(round(sprite.width * scale))), max(1, int(round(sprite.height * scale)))),
            Image.Resampling.LANCZOS,
        )
    # Generated boots use warm highlights, so the v9 dark-pixel heuristic can
    # stop above the actual sole. The alpha bbox bottom is the stable visible
    # foot line for these isolated strips; keep the x pivot from the body.
    anchor_x, _ = lower_body_anchor(sprite)
    anchor_y = float(sprite.height - 1)
    local_x = int(round(TARGET_PIVOT_X - anchor_x))
    local_y = int(round(TARGET_FOOT_Y - anchor_y))
    if local_x < 0 or local_y < 0 or local_x + sprite.width > CELL or local_y + sprite.height > CELL:
        raise SystemExit(
            f"generated run frame exceeds cell: pos=({local_x},{local_y}) size={sprite.size}"
        )
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.alpha_composite(sprite, (local_x, local_y))
    return cell


def generated_run_cells(path: Path) -> list[Image.Image]:
    if not path or not path.is_file():
        raise SystemExit(f"missing generated run strip: {path}")
    strip = Image.open(path).convert("RGBA")
    return [normalize_generated_frame(frame) for frame in split_strip(strip)]


def build_v10(baseline: Image.Image, weapon: str, run_strip: Path | None) -> Image.Image:
    baseline_cells = pack_v9(baseline, weapon)
    output = Image.new("RGBA", OUT_SIZE, (0, 0, 0, 0))
    generated_run = generated_run_cells(run_strip) if run_strip else None
    for row in range(ROWS):
        for col, source_col in enumerate(REMAP):
            cell = generated_run[col] if row == 2 and generated_run else crop_cell(baseline_cells, source_col, row)
            output.alpha_composite(cell, (col * CELL, row * CELL))
    return output


def validate(atlas: Image.Image) -> None:
    if atlas.size != OUT_SIZE or atlas.mode != "RGBA":
        raise SystemExit(f"strict v10 output mismatch: {atlas.mode} {atlas.size} != RGBA {OUT_SIZE}")
    for row in range(ROWS):
        for col in range(COLS):
            box = crop_cell(atlas, col, row).getchannel("A").getbbox()
            if box is None:
                raise SystemExit(f"empty strict v10 cell: row={row} col={col}")
    idle_heights = []
    for col in range(COLS):
        box = crop_cell(atlas, col, 0).getchannel("A").getbbox()
        idle_heights.append(box[3] - box[1])
    if max(idle_heights) - min(idle_heights) > 8:
        raise SystemExit(f"strict v10 idle scale drift: {idle_heights}")
    if not 215 <= statistics.median(idle_heights) <= 245:
        raise SystemExit(f"strict v10 idle body height out of contract: {idle_heights}")


def self_test() -> None:
    assert len(ROW_NAMES) == ROWS
    assert len(REMAP) == COLS
    assert OUT_SIZE == (3328, 7488)
    sample = Image.new("RGBA", (2164, 727), (0, 0, 0, 0))
    for index in range(COLS):
        x = 24 + index * 265
        for y in range(90, 590):
            for xx in range(x, min(x + 150, sample.width)):
                sample.putpixel((xx, y), (35, 35, 35, 255))
    assert len(split_strip(sample)) == COLS
    print("OK strict-v10 packer self-test")


def main() -> int:
    cli = args()
    if cli.self_test:
        self_test()
        return 0
    if not cli.source or not cli.output or not cli.weapon:
        raise SystemExit("--source, --output and --weapon are required")
    atlas = build_v10(load_source(cli.source), cli.weapon, cli.run_strip)
    validate(atlas)
    cli.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(cli.output, "PNG", optimize=True)
    generated = " generated-run" if cli.run_strip else " baseline-expanded"
    print(f"Packed strict-{STRICT_VERSION} {cli.weapon}:{generated} {cli.output} {atlas.size} frames={COLS}x{ROWS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
