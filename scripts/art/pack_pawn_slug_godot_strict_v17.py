#!/usr/bin/env python3
"""Build the strict-v17 Matthias machinegun bank from validated strict-v16 art.

strict-v16 intentionally left the machinegun on an older body/proportion family.
This pass fixes only that debt: it uses the validated strict-v16 shotgun body/pose
bank (same canonical Matthias family as pistol/shotgun/panzerfaust) and adds a
deterministic integrated machinegun treatment. Fixed 8x18 x 416px grid; no free
packing, no Blender, Pillow only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

VERSION = "v17"
SOURCE_GENERATION = "v16"
SOURCE_WEAPON = "shotgun"
WEAPON = "machinegun"
CELL = 416
COLS = 8
ROWS = 18
SIZE = (COLS * CELL, ROWS * CELL)
PIVOT_X = 200.0
FOOT_Y = 382.0
GUARD = 2
ACTIONS = [
    "idle", "walk", "run", "jump", "fall", "land", "crouch", "crouch_walk",
    "shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_up_alt",
    "shoot_diag_down", "shoot_crouch", "reload", "hurt", "die",
]
ANGLE_BY_ROW = {9: -58.0, 10: 34.0, 11: -48.0, 12: -48.0, 13: 34.0}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _skin_bbox(cell: Image.Image) -> tuple[int, int, int, int]:
    # Search only the face band. This deliberately excludes muzzle-flash zones,
    # preventing fire from becoming a false anchor in up/down/diagonal rows.
    xs: list[int] = []
    ys: list[int] = []
    pix = cell.load()
    for y in range(175, 306):
        for x in range(110, 286):
            r, g, b, a = pix[x, y]
            if (
                a > 80 and r > 125 and g > 62 and b < 105
                and r * 100 > g * 118 and g * 100 > b * 105
            ):
                xs.append(x)
                ys.append(y)
    if len(xs) < 40:
        return (175, 190, 255, 270)
    xs.sort()
    ys.sort()
    lo = max(0, int(len(xs) * 0.05))
    hi = min(len(xs) - 1, int(len(xs) * 0.95))
    return xs[lo], ys[lo], xs[hi], ys[hi]


def _machinegun_overlay(angle: float) -> tuple[Image.Image, tuple[int, int]]:
    """Build a compact feed-box machinegun layer around a stable hand pivot."""
    size = 190
    pivot = (60, 95)
    cx, cy = pivot
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # Preserve the underlying authored long-gun texture and add only machinegun
    # class cues, so the result stays inside the same painted/raster family.
    d.rounded_rectangle((cx - 2, cy - 10, cx + 50, cy + 11), radius=5,
                        fill=(36, 43, 34, 235), outline=(14, 18, 15, 250), width=2)
    d.rounded_rectangle((cx + 4, cy - 7, cx + 45, cy + 5), radius=3,
                        fill=(62, 69, 46, 210))
    d.line((cx + 5, cy - 6, cx + 42, cy - 6), fill=(108, 104, 69, 145), width=2)

    # Feed box and visible belt links are the strongest semantic cue.
    d.rounded_rectangle((cx + 10, cy + 8, cx + 43, cy + 38), radius=4,
                        fill=(48, 56, 38, 245), outline=(14, 17, 14, 255), width=2)
    d.line((cx + 15, cy + 13, cx + 38, cy + 13), fill=(95, 91, 58, 150), width=2)
    d.line((cx + 26, cy + 17, cx + 26, cy + 33), fill=(22, 26, 21, 240), width=2)
    for i in range(4):
        x = cx - 2 + i * 7
        d.rounded_rectangle((x, cy + 7, x + 5, cy + 12), 1, fill=(119, 96, 50, 220))

    # Short vented shroud + brake augment, rather than replace, the source barrel.
    d.rounded_rectangle((cx + 45, cy - 6, cx + 82, cy + 6), radius=3,
                        fill=(31, 37, 31, 190), outline=(16, 19, 17, 200), width=1)
    for x in (cx + 57, cx + 69):
        d.ellipse((x - 2, cy - 2, x + 2, cy + 2), fill=(8, 11, 9, 230))
    d.rectangle((cx + 79, cy - 8, cx + 88, cy + 8), fill=(26, 31, 27, 220))
    d.polygon([(cx + 65, cy - 6), (cx + 68, cy - 13), (cx + 71, cy - 6)],
              fill=(34, 39, 33, 220))

    # Deterministic micro-texture avoids a flat vector patch at authored scale.
    for i in range(28):
        x = cx + ((i * 29) % 88)
        y = cy - 9 + ((i * 47) % 46)
        if 0 <= x < size and 0 <= y < size and im.getpixel((x, y))[3] > 80:
            d.point((x, y), fill=(100, 96, 65, 65) if i % 2 else (5, 8, 6, 60))
    im = im.filter(ImageFilter.GaussianBlur(0.35))
    if angle:
        im = im.rotate(-angle, resample=Image.Resampling.BICUBIC, center=pivot)
    return im, pivot


def _anchor_for(row: int, bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    _x1, y1, x2, y2 = bbox
    cy = (y1 + y2) * 0.5
    if row == 9:
        return x2 - 22, cy + 14
    if row in (11, 12):
        return x2 - 18, cy + 16
    if row in (10, 13):
        return x2 - 14, cy + 13
    if row == 14:
        return x2 - 13, cy + 22
    return x2 - 13, cy + 18


def _should_overlay(row: int, col: int) -> bool:
    if row <= 15:
        return True
    # The validated hurt/death rows progressively discard the weapon. Re-author
    # it only while the original pose visibly carries a gun.
    if row == 16:
        return col in (1, 2, 3)
    if row == 17:
        return col in (0, 1, 2, 3)
    return False


def augment_cell(cell: Image.Image, row: int, col: int) -> Image.Image:
    if not _should_overlay(row, col):
        return cell.copy()
    bbox = _skin_bbox(cell)
    angle = ANGLE_BY_ROW.get(row, 0.0)
    if row == 17:
        angle = {0: 0.0, 1: -5.0, 2: -7.0, 3: -12.0}.get(col, 0.0)
    overlay, pivot = _machinegun_overlay(angle)
    ax, ay = _anchor_for(row, bbox)
    if row == 17 and col >= 1:
        ay += (col - 1) * 3
    out = cell.copy()
    out.alpha_composite(overlay, (round(ax - pivot[0]), round(ay - pivot[1])))
    return out


def build(source: Image.Image) -> Image.Image:
    source = source.convert("RGBA")
    if source.size != SIZE:
        raise SystemExit(f"expected source {SIZE}, got {source.size}")
    out = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            box = (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)
            cell = augment_cell(source.crop(box), row, col)
            # Explicit transparent guard for linear filtering in Godot.
            px = cell.load()
            for y in range(CELL):
                for x in range(CELL):
                    if x < GUARD or y < GUARD or x >= CELL - GUARD or y >= CELL - GUARD:
                        px[x, y] = (0, 0, 0, 0)
            out.alpha_composite(cell, (col * CELL, row * CELL))
    return out


def main():
    args = parse_args()
    if args.self_test:
        assert SIZE == (3328, 7488)
        assert COLS == 8 and ROWS == 18 and CELL == 416
        assert PIVOT_X == 200.0 and FOOT_Y == 382.0 and GUARD == 2
        assert len(ACTIONS) == 18 and len(ANGLE_BY_ROW) == 5
        print("OK strict-v17 pack self-test")
        return
    if not all((args.source, args.output, args.manifest)):
        raise SystemExit("--source/--output/--manifest required")

    source = Image.open(args.source).convert("RGBA")
    atlas = build(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, "PNG", optimize=False, compress_level=9)
    manifest = {
        "schema": 1,
        "kind": "pawn-slug-godot-strict-atlas",
        "version": VERSION,
        "weapon": WEAPON,
        "source": {
            "filename": args.source.name,
            "sha256": sha(args.source),
            "generation": SOURCE_GENERATION,
            "weapon": SOURCE_WEAPON,
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
            "cell_guard_px": GUARD,
        },
        "actions": {name: {"row": row, "frames": COLS} for row, name in enumerate(ACTIONS)},
        "processing": {
            "blender": False,
            "kind": "2d-canonical-body-machinegun-reauthor",
            "body_pose_contract": "strict-v16 shotgun body/pose bank preserved; overlay only adds weapon pixels",
            "weapon_contract": "machinegun feed box, belt links, vented shroud and brake authored deterministically",
            "layout_contract": "fixed 8x18 grid; no free packing",
        },
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
