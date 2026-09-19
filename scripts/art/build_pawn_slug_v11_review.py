#!/usr/bin/env python3
"""Build a compact v9 vs v11 Matthias review board for one weapon."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 416
ROWS = 18
OLD_COLS = 6
NEW_COLS = 8
THUMB = 72
LABEL = 180
ROW_H = THUMB * 2 + 30


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def thumb(cell: Image.Image) -> Image.Image:
    out = cell.copy()
    out.thumbnail((THUMB, THUMB), Image.Resampling.LANCZOS)
    return out


def main():
    cfg = parse_args()
    old = Image.open(cfg.baseline).convert("RGBA")
    new = Image.open(cfg.atlas).convert("RGBA")
    data = json.loads(cfg.manifest.read_text(encoding="utf-8"))
    if old.size != (OLD_COLS * CELL, ROWS * CELL):
        raise SystemExit(f"unexpected v9 size {old.size}")
    if new.size != (NEW_COLS * CELL, ROWS * CELL):
        raise SystemExit(f"unexpected v11 size {new.size}")
    actions = data.get("actions", [])
    if len(actions) != ROWS:
        raise SystemExit(f"unexpected v11 action count {len(actions)}")

    board = Image.new("RGBA", (LABEL + NEW_COLS * THUMB, ROWS * ROW_H), (18, 18, 18, 255))
    draw = ImageDraw.Draw(board)
    for action in actions:
        row = int(action["row"])
        name = str(action["name"])
        y = row * ROW_H
        draw.text((8, y + 4), f"{row:02d} {name}", fill=(245, 245, 245, 255))
        draw.text((8, y + 20), "v9 / v11", fill=(160, 160, 160, 255))
        for col in range(OLD_COLS):
            cell = old.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            board.alpha_composite(thumb(cell), (LABEL + col * THUMB, y + 28))
        for col in range(NEW_COLS):
            cell = new.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            board.alpha_composite(thumb(cell), (LABEL + col * THUMB, y + 28 + THUMB))
    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    board.save(cfg.output, "PNG", optimize=True)
    print(f"Wrote {cfg.output}")


if __name__ == "__main__":
    main()
