#!/usr/bin/env python3
"""Build Matthias strict-v15 from strict-v14 without changing alpha geometry.

v15 is a narrow pure-2D face-readability pass. It strengthens only dark facial
marks that already exist inside the skin region so the stern expression survives
runtime downscaling. It does not invent new silhouette, weapon or body geometry.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

VERSION = "v15"
COLS = 8
ROWS = 18
CELL = 416
SIZE = (COLS * CELL, ROWS * CELL)
PIVOT_X = 200.0
FOOT_Y = 382.0


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--weapon", default="pistol")
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def shift(mask: np.ndarray, dy: int, dx: int) -> np.ndarray:
    return np.roll(mask, (dy, dx), (0, 1))


def build(src: np.ndarray):
    out = src.copy()
    feature = np.array([44, 31, 25], dtype=np.uint8)
    soft_feature = np.array([72, 45, 34], dtype=np.uint8)
    touched_frames = 0
    touched_rows = [0] * ROWS

    for row in range(17):  # death/downed row stays byte-identical
        for col in range(COLS):
            cell = out[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]
            alpha = cell[..., 3]
            rgb = cell[..., :3].astype(np.float32)
            r, g, b = [rgb[..., i] for i in range(3)]
            luma = .2126 * r + .7152 * g + .0722 * b
            skin = (
                (alpha > 32)
                & (r > 125)
                & (g > 55)
                & (g < r * .88)
                & (b < r * .72)
                & (b < 160)
            )
            ys, xs = np.where(skin)
            if len(xs) < 80:
                continue

            x0, y0 = int(xs.min()), int(ys.min())
            x1, y1 = int(xs.max() + 1), int(ys.max() + 1)
            yy, xx = np.indices(alpha.shape)
            face_skin = (
                skin
                & (yy < y0 + int(.58 * (y1 - y0)))
                & (xx < min(240, x0 + 100))
            )
            fys, fxs = np.where(face_skin)
            if len(fxs) < 80:
                continue
            fx0, fy0 = int(fxs.min()), int(fys.min())
            fx1, fy1 = int(fxs.max() + 1), int(fys.max() + 1)
            fw, fh = fx1 - fx0, fy1 - fy0
            if fw < 25 or fh < 15:
                continue

            # Existing face marks are dark pixels surrounded by skin. Requiring
            # local skin support rejects the cap/hair boundary and weapon detail.
            skin_support = np.zeros_like(alpha, dtype=np.int16)
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    skin_support += shift(face_skin, dy, dx).astype(np.int16)

            inner_face = (
                (xx >= fx0 + int(.15 * fw))
                & (xx < fx0 + int(.88 * fw))
                & (yy >= fy0 + int(.18 * fh))
                & (yy < fy0 + int(.86 * fh))
            )
            detail = (
                inner_face
                & (alpha > 40)
                & (luma < 105)
                & (skin_support >= 10)
                & (~skin)
            )
            if not np.any(detail):
                continue

            before = cell[..., :3].copy()
            cell[detail, :3] = np.minimum(cell[detail, :3], feature)

            # One-pixel reinforcement of the already-authored eye/brow/frown,
            # clipped strictly to skin so it survives Lanczos downscale.
            for dx in (-1, 1):
                target = np.roll(detail, (0, dx), (0, 1)) & face_skin
                cell[target, :3] = feature
            target = np.roll(detail, (1, 0), (0, 1)) & face_skin
            cell[target, :3] = np.minimum(cell[target, :3], soft_feature)

            if np.any(cell[..., :3] != before):
                touched_frames += 1
                touched_rows[row] += 1

    out[out[..., 3] == 0, :3] = 0
    metrics = {
        "face_detail_frames": touched_frames,
        "touched_rows": touched_rows,
        "changed_rgb_pixels": int(np.any(out[..., :3] != src[..., :3], axis=2).sum()),
    }
    return out, metrics


def main():
    args = parse_args()
    if args.self_test:
        assert SIZE == (3328, 7488)
        assert COLS == 8 and ROWS == 18
        assert PIVOT_X == 200.0 and FOOT_Y == 382.0
        print("OK strict-v15 pack self-test")
        return
    if not (args.source and args.output and args.manifest):
        raise SystemExit("source/output/manifest required")

    src = np.array(Image.open(args.source).convert("RGBA"))
    if (src.shape[1], src.shape[0]) != SIZE:
        raise SystemExit(f"expected {SIZE}, got {(src.shape[1], src.shape[0])}")

    out, metrics = build(src)
    if not np.array_equal(out[..., 3], src[..., 3]):
        raise SystemExit("alpha changed")

    Image.fromarray(out, "RGBA").save(args.output, "PNG", compress_level=3)
    manifest = {
        "schema": 1,
        "kind": "pawn-slug-godot-strict-atlas",
        "version": VERSION,
        "weapon": args.weapon,
        "source": {
            "filename": args.source.name,
            "sha256": sha(args.source),
            "generation": "v14",
            "size": list(SIZE),
        },
        "atlas": {
            "filename": args.output.name,
            "sha256": sha(args.output),
            "columns": COLS,
            "rows": ROWS,
            "cell_size": CELL,
            "width": SIZE[0],
            "height": SIZE[1],
            "pivot_x": PIVOT_X,
            "foot_y": FOOT_Y,
            "frames_per_pose": COLS,
        },
        "processing": {
            "blender": False,
            "kind": "2d-face-detail-reinforcement",
            "geometry_contract": "strict-v14 alpha preserved byte-for-byte",
            "visual_pass": "reinforce only pre-existing dark face marks inside skin so stern expression survives runtime downscale",
            "death_row_contract": "row 17 byte-identical to strict-v14",
        },
        "metrics": metrics,
    }
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
