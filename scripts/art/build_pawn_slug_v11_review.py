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


def thumb(cell: Image.Image, guides: bool = False) -> Image.Image:
    out = cell.resize((THUMB, THUMB), Image.Resampling.LANCZOS)
    if guides:
        draw = ImageDraw.Draw(out)
        pivot_x = int(round(200.0 / CELL * THUMB))
        foot_y = int(round(382.0 / CELL * THUMB))
        draw.line((pivot_x, 0, pivot_x, THUMB - 1), fill=(65, 190, 255, 145))
        draw.line((0, foot_y, THUMB - 1, foot_y), fill=(255, 195, 70, 160))
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
        metas = action.get("frames_meta", [])
        unique = len({str(item.get("sha256_rgba", "")) for item in metas if item.get("sha256_rgba")})
        draw.text((8, y + 4), f"{row:02d} {name}", fill=(245, 245, 245, 255))
        draw.text((8, y + 20), f"v9 · 6 keys / v11 · 8 ({unique} distinct)", fill=(160, 160, 160, 255))
        for col in range(OLD_COLS):
            cell = old.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            board.alpha_composite(thumb(cell), (LABEL + col * THUMB, y + 28))
        for col in range(NEW_COLS):
            cell = new.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            board.alpha_composite(thumb(cell, guides=True), (LABEL + col * THUMB, y + 28 + THUMB))
    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    board.save(cfg.output, "PNG", optimize=True)
    print(f"Wrote {cfg.output}")


if __name__ == "__main__":
    main()
