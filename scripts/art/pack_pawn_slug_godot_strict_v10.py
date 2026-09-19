#!/usr/bin/env python3
"""Pack Matthias v10 fluid-locomotion source sheet into a strict Godot atlas.

Source contract:
- 1536x1024 RGBA-ish image with real alpha.
- Nine horizontal authored bands.
- The image generator may emit a small number of extra frames despite labels.
  We detect them and select an evenly-spaced subset deterministically.

Output contract:
- 12 x 9 exact cells, 256 x 256 each (3072 x 2304 RGBA PNG).
- Variable frame counts declared by ACTIONS.
- Stable lower-body pivot / foot line for every authored frame.
"""
from __future__ import annotations

import argparse
from collections import deque
import hashlib
import json
import math
from pathlib import Path
import statistics

from PIL import Image

VERSION = "v10"
SRC_SIZE = (1536, 1024)
COLS = 12
ROWS = 9
CELL = 256
OUT_SIZE = (COLS * CELL, ROWS * CELL)
ALPHA_THRESHOLD = 30
MIN_COMPONENT_PIXELS = 4000
MIN_COMPONENT_HEIGHT = 70
MIN_COMPONENT_X = 100
PAD = 4
TARGET_IDLE_COMPONENT_HEIGHT = 126.0
TARGET_PIVOT_X = 95.0
TARGET_FOOT_Y = 232.0
MAX_EXTRA_FRAMES = 2
CELL_GUARD = 8

ACTIONS = (
    ("idle", 8, 0, 130, 6.0, True),
    ("walk", 10, 125, 250, 12.0, True),
    ("run", 12, 245, 375, 16.0, True),
    ("jump", 6, 375, 505, 12.0, False),
    ("fall", 4, 490, 615, 10.0, True),
    ("land", 4, 615, 725, 14.0, False),
    ("crouch", 4, 720, 825, 8.0, True),
    ("crouch_walk", 8, 820, 915, 10.0, True),
    ("move_fire", 6, 910, 1024, 15.0, False),
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--weapon", choices=("pistol",), default="pistol")
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_source(path: Path) -> Image.Image:
    if not path or not path.is_file():
        raise SystemExit(f"missing v10 source: {path}")
    image = Image.open(path).convert("RGBA")
    if image.size != SRC_SIZE:
        raise SystemExit(f"unexpected v10 source size: {image.size} != {SRC_SIZE}")
    if image.getchannel("A").getextrema()[0] == 255:
        raise SystemExit("v10 source has no transparency")
    return image


def alpha_components_band(image: Image.Image, y0: int, y1: int) -> list[dict]:
    alpha = image.getchannel("A")
    w = image.width
    h = y1 - y0
    values = alpha.load()
    seen = bytearray(w * h)
    result: list[dict] = []

    for sy in range(h):
        gy = y0 + sy
        row_base = sy * w
        for sx in range(w):
            idx = row_base + sx
            if seen[idx] or values[sx, gy] <= ALPHA_THRESHOLD:
                continue
            seen[idx] = 1
            q = deque([(sx, sy)])
            count = 0
            pixels: list[tuple[int, int]] = []
            min_x = max_x = sx
            min_y = max_y = sy
            while q:
                x, y = q.popleft()
                count += 1
                pixels.append((x, y0 + y))
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or nx >= w or ny < 0 or ny >= h:
                        continue
                    nidx = ny * w + nx
                    if seen[nidx] or values[nx, y0 + ny] <= ALPHA_THRESHOLD:
                        continue
                    seen[nidx] = 1
                    q.append((nx, ny))
            height = max_y - min_y + 1
            if count < MIN_COMPONENT_PIXELS or min_x <= MIN_COMPONENT_X or height < MIN_COMPONENT_HEIGHT:
                continue
            result.append({
                "bbox": (min_x, y0 + min_y, max_x + 1, y0 + max_y + 1),
                "area": count,
                "cx": (min_x + max_x + 1) * 0.5,
                "pixels": pixels,
            })
    result.sort(key=lambda item: item["cx"])
    return result


def select_evenly(components: list[dict], expected: int, name: str) -> tuple[list[dict], list[int]]:
    detected = len(components)
    if detected < expected:
        raise SystemExit(f"{name}: expected at least {expected} authored frames, found {detected}")
    if detected > expected + MAX_EXTRA_FRAMES:
        raise SystemExit(f"{name}: too many extra authored frames: expected={expected} found={detected}")
    if detected == expected:
        indices = list(range(expected))
    elif expected == 1:
        indices = [detected // 2]
    else:
        indices = []
        for i in range(expected):
            value = i * (detected - 1) / float(expected - 1)
            index = int(math.floor(value + 0.5))
            if indices and index <= indices[-1]:
                index = indices[-1] + 1
            indices.append(index)
        if indices[-1] >= detected:
            raise SystemExit(f"{name}: deterministic selection overflow: {indices}")
    return [components[i] for i in indices], indices


def isolated_component_sprite(source: Image.Image, component: dict) -> Image.Image:
    """Extract one alpha-connected sprite without leaking neighbour pixels."""
    x0, y0, x1, y1 = component["bbox"]
    width = (x1 - x0) + PAD * 2
    height = (y1 - y0) + PAD * 2
    sprite = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    src = source.load()
    dst = sprite.load()
    for x, y in component["pixels"]:
        dst[x - x0 + PAD, y - y0 + PAD] = src[x, y]
    return sprite


def lower_body_anchor(sprite: Image.Image) -> tuple[float, float]:
    px = sprite.load()
    w, h = sprite.size
    points: list[tuple[int, int]] = []
    y_start = int(round(h * 0.42))
    for y in range(y_start, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= 40 or max(r, g, b) >= 220:
                continue
            points.append((x, y))
    if not points:
        box = sprite.getchannel("A").getbbox()
        if box is None:
            raise SystemExit("cannot anchor empty v10 sprite")
        return (box[0] + box[2]) * 0.5, float(box[3] - 1)
    max_y = max(y for _, y in points)
    band_h = max(3, int(round(h * 0.06)))
    xs = sorted(x for x, y in points if y >= max_y - band_h)
    return float(statistics.median(xs)), float(max_y)


def build(source: Image.Image, source_path: Path, weapon: str) -> tuple[Image.Image, dict]:
    resolved = []
    for row, (name, expected, y0, y1, fps, loop) in enumerate(ACTIONS):
        detected = alpha_components_band(source, y0, y1)
        selected, indices = select_evenly(detected, expected, name)
        resolved.append((row, name, expected, fps, loop, detected, selected, indices))

    idle_heights = [item["bbox"][3] - item["bbox"][1] for item in resolved[0][6]]
    scale = TARGET_IDLE_COMPONENT_HEIGHT / float(statistics.median(idle_heights))
    if not (0.85 <= scale <= 1.75):
        raise SystemExit(f"implausible v10 scale: {scale:.4f}")

    atlas = Image.new("RGBA", OUT_SIZE, (0, 0, 0, 0))
    manifest_actions = []

    for row, name, expected, fps, loop, detected, selected, indices in resolved:
        frame_meta = []
        for col, component in enumerate(selected):
            x0, y0, x1, y1 = component["bbox"]
            crop_box = (
                max(0, x0 - PAD),
                max(0, y0 - PAD),
                min(source.width, x1 + PAD),
                min(source.height, y1 + PAD),
            )
            sprite = isolated_component_sprite(source, component)
            width = max(1, int(round(sprite.width * scale)))
            height = max(1, int(round(sprite.height * scale)))
            sprite = sprite.resize((width, height), Image.Resampling.LANCZOS)
            anchor_x, anchor_y = lower_body_anchor(sprite)

            dst_x = int(round(col * CELL + TARGET_PIVOT_X - anchor_x))
            dst_y = int(round(row * CELL + TARGET_FOOT_Y - anchor_y))
            local_x = dst_x - col * CELL
            local_y = dst_y - row * CELL
            if (
                local_x < CELL_GUARD
                or local_y < CELL_GUARD
                or local_x + width > CELL - CELL_GUARD
                or local_y + height > CELL - CELL_GUARD
            ):
                raise SystemExit(
                    f"{name}[{col}] exceeds strict v10 cell guard: "
                    f"pos=({local_x},{local_y}) size=({width},{height}) guard={CELL_GUARD}"
                )
            atlas.alpha_composite(sprite, (dst_x, dst_y))
            frame_meta.append({
                "frame": col,
                "source_index": indices[col],
                "source_bbox": list(crop_box),
                "bbox": [local_x, local_y, local_x + width, local_y + height],
            })

        manifest_actions.append({
            "name": name,
            "row": row,
            "frames": expected,
            "fps": fps,
            "loop": loop,
            "source_detected_frames": len(detected),
            "source_selected_indices": indices,
            "frames_meta": frame_meta,
        })

    manifest = {
        "schema": 1,
        "kind": "pawn-slug-godot-variable-atlas",
        "version": VERSION,
        "weapon": weapon,
        "source": {
            "filename": source_path.name,
            "sha256": sha256_file(source_path),
            "size": list(source.size),
        },
        "atlas": {
            "columns": COLS,
            "rows": ROWS,
            "cell_size": CELL,
            "width": OUT_SIZE[0],
            "height": OUT_SIZE[1],
            "pivot_x": TARGET_PIVOT_X,
            "foot_y": TARGET_FOOT_Y,
            "cell_guard_min_px": CELL_GUARD,
            "scale": round(scale, 8),
        },
        "actions": manifest_actions,
    }
    return atlas, manifest


def save(atlas: Image.Image, manifest: dict, output: Path, manifest_path: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, "PNG", optimize=True)
    manifest["atlas"]["filename"] = output.name
    manifest["atlas"]["sha256"] = sha256_file(output)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def self_test() -> None:
    sample = Image.new("RGBA", SRC_SIZE, (0, 0, 0, 0))
    extras = {"walk": 1, "run": 2, "crouch_walk": 1}
    for name, expected, y0, y1, _fps, _loop in ACTIONS:
        count = expected + extras.get(name, 0)
        cy = (y0 + y1) // 2
        for i in range(count):
            x0 = 150 + i * 95
            yb = cy + 38
            for y in range(yb - 78, yb):
                for x in range(x0, x0 + 70):
                    sample.putpixel((x, y), (45, 45, 45, 255))
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        src = root / "source.png"
        out = root / "atlas.png"
        mf = root / "manifest.json"
        sample.save(src, "PNG")
        atlas, manifest = build(sample, src, "pistol")
        save(atlas, manifest, out, mf)
        assert atlas.size == OUT_SIZE
        data = json.loads(mf.read_text(encoding="utf-8"))
        assert [a["frames"] for a in data["actions"]] == [a[1] for a in ACTIONS]
    print("OK strict-v10 packer self-test")


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.source or not args.output or not args.manifest:
        raise SystemExit("--source, --output and --manifest are required")
    source = load_source(args.source)
    atlas, manifest = build(source, args.source, args.weapon)
    save(atlas, manifest, args.output, args.manifest)
    print(
        f"Packed strict-{VERSION} {args.weapon}: {args.output} {atlas.size} "
        + " ".join(f"{a['name']}={a['frames']}" for a in manifest["actions"])
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
