#!/usr/bin/env python3
"""Pack the *approved* four-row Football goalkeeper source without inventing sprites.

Usage: python scripts/art/normalize_chess_football_keeper.py --source approved.png --output atlas.png
Requires Pillow, numpy and opencv-python. The input SHA guards against an
unapproved source and the output SHA guards reproducibility.
"""
import argparse
import hashlib
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SOURCE_SHA = "6d4536b1cc5c0f7e14cceb6b7c7595e56f63e74c74b9272dfd470263bfecef6f"
OUTPUT_SHA = "41ca02f757545eb39c4f80e99eb358c167e8f9044153bedfd799ad488a88ca9c"
ROW_EDGES = [0, 241, 480, 717, 1052]
COL_EDGES = [0, 223, 415, 604, 792, 977, 1157, 1331, 1495]
CELL_W, CELL_H = 128, 144
FOOTLINE, FIGURE_H = 130, 118


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pack(source, output):
    if sha256(source) != SOURCE_SHA:
        raise RuntimeError("Keeper source differs from approved 32-frame image")
    image = Image.open(source).convert("RGBA")
    if image.size != (1495, 1052):
        raise RuntimeError("Unexpected source dimensions")
    source_pixels = np.array(image)
    atlas = Image.new("RGBA", (CELL_W * 8, CELL_H * 4), (0, 0, 0, 0))
    for row in range(4):
        for column in range(8):
            x0, x1 = COL_EDGES[column:column + 2]
            y0, y1 = ROW_EDGES[row:row + 2]
            cut = source_pixels[y0:y1, x0:x1].copy()
            opaque = (cut[:, :, 3] > 40).astype(np.uint8)
            count, labels, stats, centroids = cv2.connectedComponentsWithStats(opaque, 8)
            figures = sorted([stats[k] for k in range(1, count)], key=lambda item: -int(item[cv2.CC_STAT_AREA]))
            if len(figures) != 1 or int(figures[0][cv2.CC_STAT_AREA]) < 9000:
                raise RuntimeError(f"Unconnected or multiple figures at {row}:{column}")
            x, y, w, h, area = map(int, figures[0])
            left, top = max(0, x - 2), max(0, y - 2)
            right, bottom = min(cut.shape[1], x + w + 2), min(cut.shape[0], y + h + 2)
            figure = Image.fromarray(cut[top:bottom, left:right], "RGBA")
            scale = FIGURE_H / h
            width, height = round(figure.width * scale), round(figure.height * scale)
            if width >= CELL_W - 4 or height >= CELL_H - 3:
                raise RuntimeError(f"Keeper frame exceeds canonical cell at {row}:{column}")
            figure = figure.resize((width, height), Image.Resampling.LANCZOS)
            pixels = np.array(figure)
            pixels[:, :, 3] = np.where(pixels[:, :, 3] < 13, 0, pixels[:, :, 3])
            figure = Image.fromarray(pixels, "RGBA")
            atlas.alpha_composite(figure, (column * CELL_W + (CELL_W - width) // 2,
                                          row * CELL_H + FOOTLINE - height))
    # Deterministic 256-color indexed PNG preserves crisp game-sized forms.
    optimized = atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE,
                               dither=Image.Dither.NONE)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    optimized.save(output, optimize=True)
    if sha256(output) != OUTPUT_SHA:
        raise RuntimeError("Normalized goalkeeper PNG differs from accepted runtime atlas")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pack(args.source, args.output)
