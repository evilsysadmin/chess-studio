#!/usr/bin/env python3
"""Pack generated Matthias v9 sheets into a strict Godot atlas.

Source contract: 6 x 18 visual slots, 724 x 2172 RGBA PNG.
Output contract: 6 x 18 exact cells, 416 x 416 each (2496 x 7488 RGBA PNG).

The source is AI-authored and may let a sprite cross nominal slot boundaries.
For each expected slot we select the alpha-connected component nearest the slot
centre, then scale every sprite of one weapon with a single weapon-wide scale.
That preserves pose-to-pose proportions. The scale is calibrated from idle so
Matthias has one canonical body size across weapons. A lower-body anchor keeps
the physical pivot and foot line stable while ignoring muzzle flashes.
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
import statistics

from PIL import Image

SRC_SIZE = (724, 2172)
COLS = 6
ROWS = 18
CELL = 416
OUT_SIZE = (COLS * CELL, ROWS * CELL)
ALPHA_THRESHOLD = 30
MIN_COMPONENT_PIXELS = 500
TARGET_IDLE_HEIGHT = 230.0
TARGET_FOOT_Y = 382.0
TARGET_PIVOT_X = 200.0
MAX_CONTENT = CELL - 18
PIVOT_X_BY_WEAPON = {
    "pistol": 200.0,
    "machinegun": 200.0,
    "shotgun": 200.0,
    "panzerfaust": 200.0,
}

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--weapon", choices=("pistol", "machinegun", "shotgun", "panzerfaust"))
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def load_source(path: Path) -> Image.Image:
    if not path or not path.is_file():
        raise SystemExit(f"missing source image: {path}")
    image = Image.open(path).convert("RGBA")
    if image.size != SRC_SIZE:
        raise SystemExit(f"unexpected v9 source size {image.size}, expected {SRC_SIZE}: {path}")
    return image


def alpha_components(image: Image.Image) -> list[tuple[int, tuple[int, int, int, int], float, float]]:
    alpha = image.getchannel("A")
    w, h = image.size
    values = alpha.load()
    seen = bytearray(w * h)
    result: list[tuple[int, tuple[int, int, int, int], float, float]] = []

    for sy in range(h):
        row_base = sy * w
        for sx in range(w):
            idx = row_base + sx
            if seen[idx] or values[sx, sy] <= ALPHA_THRESHOLD:
                continue
            seen[idx] = 1
            queue = deque([(sx, sy)])
            count = 0
            min_x = max_x = sx
            min_y = max_y = sy
            sum_x = 0
            sum_y = 0
            while queue:
                x, y = queue.popleft()
                count += 1
                sum_x += x
                sum_y += y
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    nidx = ny * w + nx
                    if seen[nidx] or values[nx, ny] <= ALPHA_THRESHOLD:
                        continue
                    seen[nidx] = 1
                    queue.append((nx, ny))
            if count >= MIN_COMPONENT_PIXELS:
                result.append((count, (min_x, min_y, max_x + 1, max_y + 1), sum_x / count, sum_y / count))
    return result


def assign_slots(image: Image.Image) -> list[list[Image.Image]]:
    components = alpha_components(image)
    expected = COLS * ROWS
    if len(components) != expected:
        raise SystemExit(f"expected {expected} Matthias components, found {len(components)}")
    components.sort(key=lambda item: item[3])
    grid: list[list[Image.Image]] = []
    for row_index in range(ROWS):
        row = components[row_index * COLS : (row_index + 1) * COLS]
        row.sort(key=lambda item: item[2])
        sprites = [image.crop(item[1]) for item in row]
        if len(sprites) != COLS:
            raise SystemExit(f"row {row_index} did not resolve to {COLS} sprites")
        grid.append(sprites)
    return grid


def lower_body_anchor(sprite: Image.Image) -> tuple[float, float]:
    px = sprite.load()
    w, h = sprite.size
    candidates: list[tuple[int, int]] = []
    y_floor = int(round(h * 0.42))
    for y in range(y_floor, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= 40:
                continue
            if max(r, g, b) >= 210:
                continue
            candidates.append((x, y))
    if not candidates:
        box = sprite.getchannel("A").getbbox()
        if box is None:
            return w * 0.5, h - 1.0
        return (box[0] + box[2]) * 0.5, float(box[3] - 1)

    max_y = max(y for _, y in candidates)
    band = [(x, y) for x, y in candidates if y >= max_y - max(3, int(round(h * 0.08)))]
    xs = sorted(x for x, _ in band)
    return float(xs[len(xs) // 2]), float(max_y)


def weapon_scale(grid: list[list[Image.Image]]) -> float:
    idle_heights = [sprite.height for sprite in grid[0]]
    idle_height = float(statistics.median(idle_heights))
    scale = TARGET_IDLE_HEIGHT / idle_height
    largest = max(max(sprite.width, sprite.height) for row in grid for sprite in row)
    scale = min(scale, MAX_CONTENT / float(largest))
    if not (1.5 <= scale <= 2.6):
        raise SystemExit(f"implausible v9 weapon scale: {scale:.3f}")
    return scale


def pack(source: Image.Image, weapon: str) -> Image.Image:
    grid = assign_slots(source)
    scale = weapon_scale(grid)
    atlas = Image.new("RGBA", OUT_SIZE, (0, 0, 0, 0))

    for row_index, row in enumerate(grid):
        for column_index, sprite in enumerate(row):
            width = max(1, int(round(sprite.width * scale)))
            height = max(1, int(round(sprite.height * scale)))
            resized = sprite.resize((width, height), Image.Resampling.LANCZOS)
            anchor_x, anchor_y = lower_body_anchor(resized)

            if weapon == "panzerfaust" and 8 <= row_index <= 14:
                # Generated launch frames include a fully detached/flying rocket.
                # Runtime owns the projectile; keep Matthias + tube + muzzle blast.
                forward_cut = min(resized.width, int(round(anchor_x + 210.0)))
                if forward_cut < resized.width:
                    resized = resized.crop((0, 0, forward_cut, resized.height))

            if row_index >= 16:
                anchor_x = resized.width * 0.5
                anchor_y = resized.height - 1.0

            pivot_x = float(PIVOT_X_BY_WEAPON.get(weapon, TARGET_PIVOT_X))
            dst_x = int(round(column_index * CELL + pivot_x - anchor_x))
            dst_y = int(round(row_index * CELL + TARGET_FOOT_Y - anchor_y))
            local_x = dst_x - column_index * CELL
            local_y = dst_y - row_index * CELL
            if (
                local_x < 0
                or local_x + resized.width > CELL
                or local_y < 0
                or local_y + resized.height > CELL
            ):
                raise SystemExit(
                    f"strict v9 placement exceeds cell: row={row_index} col={column_index} "
                    f"pos=({local_x},{local_y}) size={resized.size}"
                )
            atlas.alpha_composite(resized, (dst_x, dst_y))
    return atlas


def validate(atlas: Image.Image) -> None:
    if atlas.size != OUT_SIZE:
        raise SystemExit(f"strict v9 output size mismatch: {atlas.size} != {OUT_SIZE}")
    for row in range(ROWS):
        for col in range(COLS):
            cell = atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            box = cell.getchannel("A").getbbox()
            if box is None:
                raise SystemExit(f"empty strict v9 cell: row={row} col={col}")

    heights = []
    for col in range(COLS):
        cell = atlas.crop((col * CELL, 0, (col + 1) * CELL, CELL))
        box = cell.getchannel("A").getbbox()
        heights.append(box[3] - box[1])
    if max(heights) - min(heights) > 8:
        raise SystemExit(f"strict v9 idle scale drift: {heights}")
    median_height = statistics.median(heights)
    if not (215 <= median_height <= 245):
        raise SystemExit(f"strict v9 idle body height out of contract: {median_height}")


def self_test() -> None:
    assert len(ROW_NAMES) == ROWS
    assert OUT_SIZE == (2496, 7488)
    sample = Image.new("RGBA", SRC_SIZE, (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            cx = int(round((col + 0.5) * SRC_SIZE[0] / COLS))
            cy = int(round((row + 0.5) * SRC_SIZE[1] / ROWS))
            for y in range(cy - 38, cy + 38):
                for x in range(cx - 24, cx + 24):
                    if 0 <= x < SRC_SIZE[0] and 0 <= y < SRC_SIZE[1]:
                        sample.putpixel((x, y), (40, 40, 40, 255))
    grid = assign_slots(sample)
    assert len(grid) == ROWS and all(len(row) == COLS for row in grid)
    print("OK strict-v9 packer self-test")


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.source or not args.output or not args.weapon:
        raise SystemExit("--source, --output and --weapon are required")
    source = load_source(args.source)
    atlas = pack(source, args.weapon)
    validate(atlas)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, "PNG", optimize=True)
    print(
        f"Packed strict-v9 {args.weapon}: {args.output} {atlas.size} "
        f"rows={','.join(ROW_NAMES)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
