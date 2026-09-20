#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 416
ROWS = 18
PICKS = (0, 3, 6)
TH = 112
LABEL = 120
PAIR = len(PICKS) * TH
ROWH = TH + 24


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--baseline", type=Path, required=True)
    p.add_argument("--atlas", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()

    old = Image.open(args.baseline).convert("RGBA")
    new = Image.open(args.atlas).convert("RGBA")
    board = Image.new("RGBA", (LABEL + PAIR * 2, ROWS * ROWH), (18, 18, 18, 255))
    draw = ImageDraw.Draw(board)
    draw.text((LABEL, 2), "v14 baseline", fill=(170, 170, 170, 255))
    draw.text((LABEL + PAIR, 2), "v15 candidate", fill=(170, 170, 170, 255))
    for row in range(ROWS):
        y = row * ROWH
        draw.text((6, y + 5), f"{row:02d}", fill=(240, 240, 240, 255))
        for side, image in enumerate((old, new)):
            for index, col in enumerate(PICKS):
                crop = image.crop(
                    (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)
                ).resize((TH, TH), Image.Resampling.LANCZOS)
                board.alpha_composite(
                    crop, (LABEL + side * PAIR + index * TH, y + 20)
                )
    board.save(args.output, "PNG", compress_level=3)
    print(args.output)


if __name__ == "__main__":
    main()
