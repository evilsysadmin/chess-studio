#!/usr/bin/env python3
"""Pack Blender-authored Pawn Slug enemy frames into a strict Godot atlas."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics

from PIL import Image, ImageDraw

VERSION = "enemy-v10"
CELL = 96
COLS = 16
ROWS = 7
ATLAS_SIZE = (COLS * CELL, ROWS * CELL)
GUARD = 2

ACTIONS = (
    ("idle", 12, 6.0, True),
    ("run", 16, 12.0, True),
    ("jump", 10, 12.0, False),
    ("crouch", 8, 8.0, True),
    ("hurt", 6, 14.0, False),
    ("climb", 12, 10.0, True),
    ("death", 14, 10.0, False),
)
ACTION_NAMES = tuple(name for name, *_ in ACTIONS)
GROUND_ACTIONS = {"idle", "run", "crouch", "hurt", "climb"}


def fail(message: str) -> "NoReturn":
    raise SystemExit(message)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--source-dir", type=Path, required=True)
    p.add_argument("--enemy-type", required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--review-board", type=Path, required=True)
    p.add_argument("--strips-dir", type=Path, required=True)
    return p.parse_args()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mean_luma(image: Image.Image) -> float:
    visible = [
        0.2126 * r + 0.7152 * g + 0.0722 * b
        for r, g, b, a in image.getdata()
        if a >= 24
    ]
    return sum(visible) / max(1, len(visible))


def load_contract(root: Path, enemy_type: str) -> dict:
    path = root / "manifest.json"
    if not path.is_file():
        fail(f"missing Blender enemy manifest: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    expected_actions = {name: count for name, count, _fps, _loop in ACTIONS}
    if data.get("version") != "blender-enemy-v1":
        fail(f"unexpected Blender enemy source version: {data.get('version')!r}")
    if data.get("mode") != "full":
        fail(f"strict enemy packer requires full render, got mode={data.get('mode')!r}")
    if data.get("sourceFacing") != "left":
        fail(f"unexpected source facing: {data.get('sourceFacing')!r}")
    if data.get("frameSize") != [192, 192]:
        fail(f"unexpected source frame size: {data.get('frameSize')!r}")
    if data.get("runtimeCell") != [96, 96]:
        fail(f"unexpected runtime cell: {data.get('runtimeCell')!r}")
    if data.get("columns") != COLS:
        fail(f"unexpected source columns: {data.get('columns')!r}")
    if data.get("types") != [enemy_type]:
        fail(f"strict packer expected only {enemy_type!r}, got {data.get('types')!r}")
    if data.get("actions") != expected_actions:
        fail(f"source action contract drift: {data.get('actions')!r} != {expected_actions!r}")
    rendered = data.get("renderedFrames") or {}
    for name, count, _fps, _loop in ACTIONS:
        expected = list(range(count))
        if rendered.get(name) != expected:
            fail(f"{enemy_type}/{name}: full render missing frames: {rendered.get(name)!r}")
    return data


def source_frame(root: Path, enemy_type: str, action: str, frame: int) -> Path:
    return root / "frames" / enemy_type / action / f"{frame:02d}.png"


def fit_runtime_frame(path: Path) -> tuple[Image.Image, tuple[int, int, int, int], float]:
    if not path.is_file():
        fail(f"missing authored frame: {path}")
    image = Image.open(path).convert("RGBA")
    if image.size != (192, 192):
        fail(f"wrong authored frame size: {path} -> {image.size}")
    runtime = image.resize((CELL, CELL), Image.Resampling.LANCZOS)
    bbox = runtime.getchannel("A").point(lambda v: 255 if v >= 24 else 0).getbbox()
    if bbox is None:
        fail(f"empty authored frame: {path}")
    left, top, right, bottom = bbox
    if min(left, top, CELL - right, CELL - bottom) < GUARD:
        fail(f"frame touches strict cell guard: {path} bbox={bbox}")
    width, height = right - left, bottom - top
    if width < 20 or height < 20:
        fail(f"implausibly small authored frame: {path} bbox={bbox}")
    return runtime, bbox, mean_luma(runtime)


def compose(root: Path, enemy_type: str) -> tuple[Image.Image, list[dict]]:
    atlas = Image.new("RGBA", ATLAS_SIZE, (0, 0, 0, 0))
    actions_meta: list[dict] = []
    for row, (name, count, fps, loop) in enumerate(ACTIONS):
        hashes: set[str] = set()
        bottoms: list[int] = []
        heights: list[int] = []
        frames_meta: list[dict] = []
        for frame in range(count):
            runtime, bbox, luma = fit_runtime_frame(source_frame(root, enemy_type, name, frame))
            if name != "death" and bbox[3] - bbox[1] < 44:
                fail(f"{enemy_type}/{name}[{frame}] too short: bbox={bbox}")
            if luma < 22.0:
                fail(f"{enemy_type}/{name}[{frame}] too dark: luma={luma:.2f}")
            digest = hashlib.sha256(runtime.tobytes()).hexdigest()
            hashes.add(digest)
            bottoms.append(bbox[3])
            heights.append(bbox[3] - bbox[1])
            atlas.alpha_composite(runtime, (frame * CELL, row * CELL))
            frames_meta.append({
                "frame": frame,
                "bbox": list(bbox),
                "mean_luma": round(luma, 2),
                "sha256_rgba": digest,
            })

        min_unique = max(2, int(math.ceil(count * 0.50)))
        if len(hashes) < min_unique:
            fail(f"{enemy_type}/{name} lacks motion diversity: unique={len(hashes)} frames={count}")
        if name in GROUND_ACTIONS and max(bottoms) - min(bottoms) > 14:
            fail(f"{enemy_type}/{name} foot-line drift too large: bottoms={bottoms}")

        actions_meta.append({
            "name": name,
            "row": row,
            "frames": count,
            "fps": fps,
            "loop": loop,
            "unique_frames": len(hashes),
            "median_height": float(statistics.median(heights)),
            "bottom_min": min(bottoms),
            "bottom_max": max(bottoms),
            "frames_meta": frames_meta,
        })
    return atlas, actions_meta


def write_review(atlas: Image.Image, actions_meta: list[dict], path: Path, strips_dir: Path) -> None:
    thumb = 72
    label_w = 150
    row_h = 88
    board = Image.new("RGBA", (label_w + COLS * thumb, ROWS * row_h), (18, 18, 18, 255))
    draw = ImageDraw.Draw(board)
    strips_dir.mkdir(parents=True, exist_ok=True)
    for action in actions_meta:
        row = int(action["row"])
        count = int(action["frames"])
        name = str(action["name"])
        y0 = row * row_h
        draw.text((8, y0 + 8), f"{row:02d} {name} ({count})", fill=(245, 245, 245, 255))
        draw.text((8, y0 + 27), f"{action['fps']:g} fps · {'loop' if action['loop'] else 'once'}", fill=(165, 165, 165, 255))
        strip = atlas.crop((0, row * CELL, count * CELL, (row + 1) * CELL))
        strip.save(strips_dir / f"{row:02d}_{name}.png", "PNG", optimize=True)
        for col in range(count):
            frame = atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            frame = frame.resize((thumb, thumb), Image.Resampling.NEAREST)
            x0 = label_w + col * thumb
            board.alpha_composite(frame, (x0, y0 + 8))
            draw.rectangle((x0, y0 + 8, x0 + thumb - 1, y0 + 8 + thumb - 1), outline=(70, 70, 70, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    board.save(path, "PNG", optimize=True)


def main() -> int:
    args = parse_args()
    source_manifest = load_contract(args.source_dir, args.enemy_type)
    atlas, actions_meta = compose(args.source_dir, args.enemy_type)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, "PNG", optimize=True)
    write_review(atlas, actions_meta, args.review_board, args.strips_dir)
    payload = {
        "schema": 1,
        "kind": "pawn-slug-godot-strict-enemy-atlas",
        "version": VERSION,
        "enemy_type": args.enemy_type,
        "source": {
            "version": source_manifest["version"],
            "blender": source_manifest.get("blender"),
            "source_facing": "left",
            "frame_size": [192, 192],
        },
        "atlas": {
            "filename": args.output.name,
            "sha256": sha256_file(args.output),
            "format": "PNG",
            "mode": "RGBA",
            "columns": COLS,
            "rows": ROWS,
            "cell_size": CELL,
            "width": ATLAS_SIZE[0],
            "height": ATLAS_SIZE[1],
            "cell_guard_min_px": GUARD,
        },
        "actions": actions_meta,
    }
    args.manifest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"OK strict enemy atlas {args.enemy_type}: {ATLAS_SIZE[0]}x{ATLAS_SIZE[1]} "
        + " ".join(f"{a['name']}={a['frames']}" for a in actions_meta)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
