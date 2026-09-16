#!/usr/bin/env python3
"""Pack canonical Pawn Slug Matthias frame PNGs into the runtime 16x5 WebP."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ACTIONS = (
    ("idle", 10),
    ("walk", 10),
    ("run", 16),
    ("crouch", 10),
    ("jump", 9),
)
CELL = 192
COLS = 16
ROWS = 5


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-dir", type=Path, required=True)
    parser.add_argument("--weapon", required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_cell(path: Path) -> Image.Image:
    if not path.is_file():
        raise SystemExit(f"missing runtime frame: {path}")
    image = Image.open(path).convert("RGBA")
    if image.size != (CELL, CELL):
        raise SystemExit(f"unexpected frame size {image.size}: {path}")
    alpha_box = image.getchannel("A").getbbox()
    if not alpha_box:
        raise SystemExit(f"empty runtime frame: {path}")
    width = alpha_box[2] - alpha_box[0]
    height = alpha_box[3] - alpha_box[1]
    if width < 40 or height < 80:
        raise SystemExit(f"implausibly small Matthias silhouette {width}x{height}: {path}")
    return image


def main():
    cfg = parse_args()
    frames = cfg.frames_dir.resolve()
    atlas = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))

    for row, (action, count) in enumerate(ACTIONS):
        for frame in range(count):
            path = frames / f"matthias_{cfg.weapon}_{action}_{frame:02d}.png"
            atlas.alpha_composite(load_cell(path), (frame * CELL, row * CELL))

    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(cfg.output, "WEBP", lossless=True, quality=100, method=6)
    print(f"Packed {cfg.output} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
