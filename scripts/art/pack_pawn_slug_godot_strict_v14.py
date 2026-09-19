#!/usr/bin/env python3
"""Build Matthias strict-v14 from strict-v13 without changing alpha geometry.

v14 is a deterministic pure-2D readability pass: reduce dark uniform speckle,
separate weapon mids from clothing, and restore the canonical stern face cues
on upright/readable frames. No Blender and no free-form atlas generation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

VERSION = 'v14'
COLS = 8
ROWS = 18
CELL = 416
SIZE = (COLS * CELL, ROWS * CELL)
PIVOT_X = 200.0
FOOT_Y = 382.0


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path)
    p.add_argument('--output', type=Path)
    p.add_argument('--manifest', type=Path)
    p.add_argument('--weapon', default='pistol')
    p.add_argument('--self-test', action='store_true')
    return p.parse_args()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def semantic_masks(rgb: np.ndarray, alpha: np.ndarray):
    r, g, b = [rgb[..., i] for i in range(3)]
    luma = .2126 * r + .7152 * g + .0722 * b
    skin = (alpha > 32) & (r > 125) & (g > 55) & (g < r * .88) & (b < r * .72) & (b < 160)
    weapon = (alpha > 32) & (luma > 18) & (luma < 140) & (g > r * .66) & (g > b * 1.02) & ((g - b) > 2)
    warm_fire = (alpha > 32) & (r > 180) & (g > 85) & (b < 80) & ((r - g) > 55)
    return skin, weapon, warm_fire, luma


def add_face_cues(out: np.ndarray) -> int:
    """Strengthen the existing stern face without changing alpha or silhouette."""
    feature = np.array([52, 37, 28], dtype=np.uint8)
    touched = 0
    for row in range(16):  # fully downed/death rows are intentionally untouched
        for col in range(COLS):
            cell = out[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]
            alpha = cell[..., 3]
            ys, xs = np.where(alpha > 40)
            if len(xs) == 0:
                continue
            rgb = cell[..., :3].astype(np.float32)
            r, g, b = [rgb[..., i] for i in range(3)]
            skin = (alpha > 32) & (r > 125) & (g > 55) & (g < r * .88) & (b < r * .72) & (b < 160)
            x0, y0 = int(xs.min()), int(ys.min())
            x1, y1 = int(xs.max() + 1), int(ys.max() + 1)
            yy, xx = np.indices(alpha.shape)
            topcut = int(y0 + .58 * (y1 - y0))
            face = skin & (yy < topcut) & (xx < 230)
            fys, fxs = np.where(face)
            if len(fxs) < 60:
                continue
            fx0, fy0 = int(fxs.min()), int(fys.min())
            fx1, fy1 = int(fxs.max() + 1), int(fys.max() + 1)
            fw, fh = fx1 - fx0, fy1 - fy0
            if fw < 20 or fh < 12:
                continue

            ex = int(fx0 + .70 * fw)
            ey = int(fy0 + .38 * fh)
            best = None
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    px, py = ex + dx, ey + dy
                    if 1 <= px < CELL - 2 and 1 <= py < CELL - 2 and skin[py, px]:
                        dist = dx * dx + dy * dy
                        if best is None or dist < best[0]:
                            best = (dist, px, py)
            if best is None:
                continue
            _, ex, ey = best

            def put(px: int, py: int) -> None:
                if 0 <= px < CELL and 0 <= py < CELL and alpha[py, px] > 40:
                    cell[py, px, :3] = feature

            # Narrowed eye and a brow sloping toward the nose.
            for dx in (-1, 0, 1):
                put(ex + dx, ey)
            for dx, dy in [(-2, -3), (-1, -3), (0, -2), (1, -2), (2, -1)]:
                put(ex + dx, ey + dy)

            # Compact firm frown, searched back onto valid skin if needed.
            mx = min(fx1 - 4, ex + 7)
            my = min(fy1 - 4, ey + int(.28 * fh) + 2)
            bestm = None
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    px, py = mx + dx, my + dy
                    if 1 <= px < CELL - 2 and 1 <= py < CELL - 2 and skin[py, px]:
                        dist = dx * dx + dy * dy
                        if bestm is None or dist < bestm[0]:
                            bestm = (dist, px, py)
            if bestm:
                _, mx, my = bestm
                for dx, dy in [(-2, 0), (-1, 0), (0, 0), (1, 1)]:
                    put(mx + dx, my + dy)
            touched += 1
    return touched


def build(src: np.ndarray):
    alpha = src[..., 3].copy()
    rgb = src[..., :3].astype(np.float32)
    skin, weapon, warm_fire, luma = semantic_masks(rgb, alpha)
    opaque = alpha > 40

    # Preserve the exterior silhouette. Readability work is restricted to pixels
    # at least two opaque steps inside the sprite wherever possible.
    interior = opaque.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        interior &= np.roll(opaque, (dy, dx), (0, 1))
    interior2 = interior.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        interior2 &= np.roll(interior, (dy, dx), (0, 1))

    uniform = opaque & (~skin) & (~weapon) & (~warm_fire) & (luma > 10) & (luma < 105)
    uniform_mid = uniform & interior2 & (luma > 24) & (luma < 88)

    # Five-neighbour deterministic denoise inside clothing only.
    sum_rgb = rgb.copy()
    count = np.ones(alpha.shape, dtype=np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n_rgb = np.roll(rgb, (dy, dx), (0, 1))
        n_mask = np.roll(opaque, (dy, dx), (0, 1)).astype(np.float32)
        sum_rgb += n_rgb * n_mask[..., None]
        count += n_mask
    mean5 = sum_rgb / np.maximum(count[..., None], 1)
    rgb[uniform_mid] = rgb[uniform_mid] * .70 + mean5[uniform_mid] * .30

    skin, weapon, warm_fire, luma = semantic_masks(rgb, alpha)
    uniform_mid = opaque & (~skin) & (~weapon) & (~warm_fire) & interior2 & (luma > 22) & (luma < 92)
    gain = np.clip((92 - luma) / 70, 0, 1)
    lift = 4.0 + 5.0 * gain
    for channel in range(3):
        rgb[..., channel][uniform_mid] = np.minimum(255, rgb[..., channel][uniform_mid] + lift[uniform_mid])
    rgb[..., 2][uniform_mid] = np.minimum(255, rgb[..., 2][uniform_mid] + 2.5)
    rgb[..., 0][uniform_mid] = np.maximum(0, rgb[..., 0][uniform_mid] - 1.0)

    skin, weapon, warm_fire, luma = semantic_masks(rgb, alpha)
    boundary = opaque & (~interior2) & (~skin) & (~warm_fire)
    bd = boundary & (luma > 16) & (luma < 70)
    rgb[bd] *= .94

    skin, weapon, warm_fire, luma = semantic_masks(rgb, alpha)
    wmid = weapon & (luma > 26) & (luma < 115)
    rgb[wmid] *= 1.09
    rgb[..., 1][wmid] = np.minimum(255, rgb[..., 1][wmid] + 3)
    wdark = weapon & (luma <= 38)
    rgb[wdark] *= .90

    skin, weapon, warm_fire, luma = semantic_masks(rgb, alpha)
    skin_luma = luma[skin]
    rgb[..., 0][skin] = np.clip(rgb[..., 0][skin] * .985 + np.where(skin_luma < 150, 4, 0), 0, 246)
    rgb[..., 1][skin] = np.clip(rgb[..., 1][skin] * .975 + np.where(skin_luma < 135, 3, 0), 0, 220)
    rgb[..., 2][skin] = np.clip(rgb[..., 2][skin] * .97, 0, 190)

    # Strengthen existing dark facial detail adjacent to the skin before adding
    # the compact canonical cues. No alpha pixels are introduced.
    near = skin.copy()
    for _ in range(2):
        expanded = near.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            expanded |= np.roll(near, (dy, dx), (0, 1))
        near = expanded
    _, _, _, luma = semantic_masks(rgb, alpha)
    r, g, _ = [rgb[..., i] for i in range(3)]
    face_detail = near & opaque & (~skin) & (luma > 8) & (luma < 92) & (r < 135) & (g < 120)
    rgb[face_detail] *= .84

    skin, _, warm_fire, luma = semantic_masks(rgb, alpha)
    clean = opaque & (~skin) & (~warm_fire) & (luma < 145)
    rgb[clean] = np.round(rgb[clean] / 4.0) * 4.0

    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), alpha])
    out[alpha == 0, :3] = 0
    face_frames = add_face_cues(out)
    return out, {
        'skin_pixels': int(skin.sum()),
        'weapon_pixels': int(weapon.sum()),
        'uniform_pixels': int(uniform.sum()),
        'face_cue_frames': int(face_frames),
    }


def main():
    args = parse_args()
    if args.self_test:
        assert SIZE == (3328, 7488)
        assert COLS == 8 and ROWS == 18
        assert PIVOT_X == 200.0 and FOOT_Y == 382.0
        print('OK strict-v14 pack self-test')
        return
    if not (args.source and args.output and args.manifest):
        raise SystemExit('source/output/manifest required')
    src = np.array(Image.open(args.source).convert('RGBA'))
    if (src.shape[1], src.shape[0]) != SIZE:
        raise SystemExit(f'expected {SIZE}, got {(src.shape[1], src.shape[0])}')
    out, metrics = build(src)
    if not np.array_equal(out[..., 3], src[..., 3]):
        raise SystemExit('alpha changed')
    Image.fromarray(out, 'RGBA').save(args.output, 'PNG', compress_level=3)
    metrics['changed_rgb_pixels'] = int(np.any(out[..., :3] != src[..., :3], axis=2).sum())
    manifest = {
        'schema': 1,
        'kind': 'pawn-slug-godot-strict-atlas',
        'version': VERSION,
        'weapon': args.weapon,
        'source': {
            'filename': args.source.name,
            'sha256': sha(args.source),
            'generation': 'v13',
            'size': list(SIZE),
        },
        'atlas': {
            'filename': args.output.name,
            'sha256': sha(args.output),
            'columns': COLS,
            'rows': ROWS,
            'cell_size': CELL,
            'width': SIZE[0],
            'height': SIZE[1],
            'pivot_x': PIVOT_X,
            'foot_y': FOOT_Y,
            'frames_per_pose': COLS,
        },
        'processing': {
            'blender': False,
            'kind': '2d-readability-cleanup',
            'geometry_contract': 'strict-v13 alpha preserved byte-for-byte',
            'visual_pass': 'reduce dark clothing speckle; increase weapon/material separation; restore canonical stern brow/eye/frown cues on upright frames',
        },
        'metrics': metrics,
    }
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(args.output)


if __name__ == '__main__':
    main()
