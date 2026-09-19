#!/usr/bin/env python3
"""Build strict-v11 Matthias atlases from the coherent strict-v9 runtime bank.

Input:  6 x 18 @ 416px (strict-v9, one weapon).
Output: 8 x 18 @ 416px (strict-v11, one weapon).

v11 keeps the coherent strict-v9 AI-authored keyframes, but no longer pads
animations by duplicating holds. Every six-frame bank retains all six authored
frames and gains two deterministic motion-compensated half-steps. The half-step
warps one silhouette toward the next keyframe instead of cross-fading two
sprites, avoiding doubled legs, weapons and muzzle flashes. A restrained 2D
readability pass follows, then every active pose is re-anchored to the same
pivot and foot line. No Blender or 3D asset participates in this pipeline.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import statistics

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

VERSION = "v11"
SRC_COLS = 6
COLS = 8
ROWS = 18
CELL = 416
SRC_SIZE = (SRC_COLS * CELL, ROWS * CELL)
OUT_SIZE = (COLS * CELL, ROWS * CELL)
TARGET_PIVOT_X = 200.0
TARGET_FOOT_Y = 382.0
ALPHA = 40
CELL_GUARD = 4

ACTIONS = (
    ("idle", 6.0, True),
    ("walk", 10.0, True),
    ("run", 12.0, True),
    ("jump", 10.0, False),
    ("fall", 8.0, True),
    ("land", 12.0, False),
    ("crouch", 6.0, True),
    ("crouch_walk", 8.0, True),
    ("shoot", 15.0, False),
    ("shoot_up", 15.0, False),
    ("shoot_down", 15.0, False),
    ("shoot_diag_up", 15.0, False),
    ("shoot_diag_up_alt", 15.0, False),
    ("shoot_diag_down", 15.0, False),
    ("shoot_crouch", 15.0, False),
    ("reload", 10.0, False),
    ("hurt", 12.0, False),
    ("die", 9.0, False),
)

SOURCE_PHASES = (0.0, 1.0, 1.5, 2.0, 3.0, 4.0, 4.5, 5.0)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--weapon", choices=("pistol", "machinegun", "shotgun", "panzerfaust"))
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cell(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def lower_body_anchor(im: Image.Image) -> tuple[float, float]:
    pixels = np.asarray(im)
    mask = (pixels[..., 3] > ALPHA) & (pixels[..., :3].max(axis=2) < 220)
    mask[: int(CELL * 0.42), :] = False
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        box = im.getchannel("A").getbbox()
        if box is None:
            raise SystemExit("cannot anchor empty frame")
        return (box[0] + box[2]) * 0.5, float(box[3] - 1)
    foot = int(ys.max())
    band = max(3, int(CELL * 0.03))
    floor_x = np.sort(xs[ys >= foot - band])
    return float(floor_x[len(floor_x) // 2]), float(foot)


def reanchor(im: Image.Image) -> Image.Image:
    ax, ay = lower_body_anchor(im)
    dx = int(round(TARGET_PIVOT_X - ax))
    dy = int(round(TARGET_FOOT_Y - ay))
    if dx == 0 and dy == 0:
        return im.copy()
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(im, (dx, dy))
    return out


def _premultiplied(array: np.ndarray) -> np.ndarray:
    alpha = array[..., 3:4].astype(np.float32) / 255.0
    return np.concatenate((array[..., :3].astype(np.float32) * alpha, array[..., 3:4].astype(np.float32)), axis=2)


def _unpremultiplied(array: np.ndarray) -> np.ndarray:
    alpha = array[..., 3:4]
    rgb = np.where(alpha > 1.0, array[..., :3] * 255.0 / np.maximum(alpha, 1.0), 0.0)
    return np.clip(np.concatenate((rgb, alpha), axis=2), 0, 255).astype(np.uint8)


def _warp(array: np.ndarray, flow: np.ndarray, fraction: float) -> np.ndarray:
    height, width = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))
    mx = gx - fraction * flow[..., 0]
    my = gy - fraction * flow[..., 1]
    return np.stack([
        cv2.remap(array[..., channel], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        for channel in range(array.shape[2])
    ], axis=2)


def inbetween(first: Image.Image, second: Image.Image) -> Image.Image:
    a = np.array(first.convert("RGBA"))
    b = np.array(second.convert("RGBA"))
    alpha_a = a[..., 3].astype(np.float32) / 255.0
    alpha_b = b[..., 3].astype(np.float32) / 255.0
    gray_a = (cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32) * alpha_a).astype(np.uint8)
    gray_b = (cv2.cvtColor(b[..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32) * alpha_b).astype(np.uint8)
    half = (CELL // 2, CELL // 2)
    small_a = cv2.resize(gray_a, half, interpolation=cv2.INTER_AREA)
    small_b = cv2.resize(gray_b, half, interpolation=cv2.INTER_AREA)
    flow_small = cv2.calcOpticalFlowFarneback(small_a, small_b, None, 0.5, 2, 17, 2, 5, 1.2, 0)
    flow = cv2.resize(flow_small, (CELL, CELL), interpolation=cv2.INTER_LINEAR) * 2.0
    warped = _warp(_premultiplied(a), flow, 0.5)
    # One warped silhouette only: never cross-fade two bodies/weapons.
    return Image.fromarray(_unpremultiplied(warped), "RGBA")


def enhance_readability(im: Image.Image) -> Image.Image:
    alpha = im.getchannel("A")
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(1.04)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb = ImageEnhance.Color(rgb).enhance(1.03)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.85, percent=120, threshold=2))
    out = Image.merge("RGBA", (*rgb.split(), alpha))
    pixels = np.array(out)
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels, "RGBA")


def expand_frames(source_frames: list[Image.Image]) -> list[Image.Image]:
    return [
        source_frames[0],
        source_frames[1],
        inbetween(source_frames[1], source_frames[2]),
        source_frames[2],
        source_frames[3],
        source_frames[4],
        inbetween(source_frames[4], source_frames[5]),
        source_frames[5],
    ]


def validate_frame(im: Image.Image, action: str, frame: int) -> dict:
    box = im.getchannel("A").getbbox()
    if box is None:
        raise SystemExit(f"empty frame {action}[{frame}]")
    guard = min(box[0], box[1], CELL - box[2], CELL - box[3])
    if guard < CELL_GUARD:
        raise SystemExit(f"cell guard regression {action}[{frame}] guard={guard}")
    pixels = np.asarray(im)
    if np.any(pixels[pixels[..., 3] == 0, :3] != 0):
        raise SystemExit(f"transparent RGB contamination {action}[{frame}]")
    ax, ay = lower_body_anchor(im)
    if abs(ax - TARGET_PIVOT_X) > 2.0 or abs(ay - TARGET_FOOT_Y) > 2.0:
        raise SystemExit(f"anchor drift {action}[{frame}] x={ax:.1f} y={ay:.1f}")
    return {
        "bbox": list(box),
        "anchor": [round(ax, 2), round(ay, 2)],
        "sha256_rgba": hashlib.sha256(im.tobytes()).hexdigest(),
    }


def build(source: Image.Image, source_path: Path, weapon: str) -> tuple[Image.Image, dict]:
    if source.size != SRC_SIZE:
        raise SystemExit(f"strict-v11 expects strict-v9 {SRC_SIZE}, got {source.size}")
    out = Image.new("RGBA", OUT_SIZE, (0, 0, 0, 0))
    actions = []
    for row, (name, fps, loop) in enumerate(ACTIONS):
        authored = [cell(source, row, col) for col in range(SRC_COLS)]
        expanded = expand_frames(authored)
        metas = []
        for dst_col, frame in enumerate(expanded):
            frame = reanchor(frame)
            frame = enhance_readability(frame)
            frame = reanchor(frame)
            meta = validate_frame(frame, name, dst_col)
            out.alpha_composite(frame, (dst_col * CELL, row * CELL))
            meta.update({"frame": dst_col, "source_phase": SOURCE_PHASES[dst_col]})
            metas.append(meta)
        actions.append({
            "name": name, "row": row, "frames": 8, "fps": fps, "loop": loop,
            "source_phases": list(SOURCE_PHASES), "frames_meta": metas,
        })
    manifest = {
        "schema": 1,
        "kind": "pawn-slug-godot-strict-atlas",
        "version": VERSION,
        "weapon": weapon,
        "source": {"filename": source_path.name, "sha256": sha(source_path), "size": list(source.size)},
        "atlas": {
            "columns": COLS, "rows": ROWS, "cell_size": CELL,
            "width": OUT_SIZE[0], "height": OUT_SIZE[1],
            "pivot_x": TARGET_PIVOT_X, "foot_y": TARGET_FOOT_Y,
            "frames_per_pose": 8,
        },
        "processing": {
            "kind": "2d-motion-compensated",
            "inbetweens_per_action": 2,
            "readability": {"brightness": 1.04, "contrast": 1.06, "color": 1.03, "unsharp_percent": 120},
            "blender": False,
        },
        "actions": actions,
    }
    return out, manifest


def self_test():
    src = Image.new("RGBA", SRC_SIZE, (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(src)
    for row in range(ROWS):
        for col in range(SRC_COLS):
            x0 = col * CELL + 160 + (col % 2) * 2
            # crouch rows intentionally shorter; all still share a grounded foot.
            top = row * CELL + (210 if row in (6, 7, 14) else 150)
            d.rectangle((x0, top, x0 + 80, row * CELL + 382), fill=(30, 40, 55, 255))
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        root = Path(td); s = root / "src.png"; o = root / "out.png"; m = root / "m.json"
        src.save(s)
        atlas, manifest = build(src, s, "pistol")
        atlas.save(o)
        manifest["atlas"]["sha256"] = sha(o)
        m.write_text(json.dumps(manifest), encoding="utf-8")
        assert atlas.size == OUT_SIZE
        assert len(manifest["actions"]) == 18
        assert all(a["frames"] == 8 for a in manifest["actions"])
    print("OK strict-v11 packer self-test")


def main():
    a = parse_args()
    if a.self_test:
        self_test(); return
    if not all((a.source, a.output, a.manifest, a.weapon)):
        raise SystemExit("--source --output --manifest --weapon are required")
    src = Image.open(a.source).convert("RGBA")
    atlas, manifest = build(src, a.source, a.weapon)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(a.output, "PNG", optimize=True)
    manifest["atlas"]["filename"] = a.output.name
    manifest["atlas"]["sha256"] = sha(a.output)
    a.manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Packed strict-v11 {a.weapon}: {a.output} {atlas.size} actions=18 frames=144")

if __name__ == "__main__":
    main()
