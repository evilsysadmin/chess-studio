#!/usr/bin/env python3
"""Build Matthias strict-v16 from strict-v15 using a shared material reference.

v16 is a deterministic pure-2D material harmonisation pass. The strict-v15
machinegun bank is used only as the colour/material reference; alpha geometry,
pivot, foot line, weapon silhouettes and the death/downed row remain untouched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

VERSION = "v16"
COLS = 8
ROWS = 18
CELL = 416
SIZE = (COLS * CELL, ROWS * CELL)
PIVOT_X = 200.0
FOOT_Y = 382.0
Q = np.array([5, 20, 40, 60, 80, 95], dtype=np.float32)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path)
    p.add_argument("--reference", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--weapon", choices=("pistol", "machinegun", "shotgun", "panzerfaust"))
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def semantic_masks(a: np.ndarray):
    alpha = a[..., 3]
    rgb = a[..., :3].astype(np.float32)
    r, g, b = [rgb[..., i] for i in range(3)]
    luma = .2126 * r + .7152 * g + .0722 * b

    skin = (
        (alpha > 32)
        & (r > 125)
        & (g > 55)
        & (g < r * .90)
        & (b < r * .74)
        & (b < 170)
    )
    weapon = (
        (alpha > 32)
        & (luma > 18)
        & (luma < 150)
        & (g > r * .68)
        & (g > b * 1.04)
        & ((g - b) > 3)
    )
    fire = (
        (alpha > 32)
        & (r > 175)
        & (g > 70)
        & (b < 90)
        & ((r - g) > 45)
    )
    body = (
        (alpha > 40)
        & (~skin)
        & (~weapon)
        & (~fire)
        & (r < 120)
        & (g < 125)
        & (b < 130)
    )
    opaque = alpha > 40
    interior = opaque.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        interior &= np.roll(opaque, (dy, dx), (0, 1))

    # Never retouch the authored death/downed row.
    skin[17 * CELL:] = False
    body[17 * CELL:] = False
    interior[17 * CELL:] = False
    return skin, weapon, fire, body, interior


def quantiles(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    vals = rgb[mask].astype(np.float32)
    if not len(vals):
        return np.zeros((len(Q), 3), dtype=np.float32)
    return np.percentile(vals, Q, axis=0).astype(np.float32)


def distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(np.abs(a - b)))


def build(source: np.ndarray, reference: np.ndarray, weapon_name: str):
    out = source.copy()
    src_skin, _, _, src_body, src_interior = semantic_masks(source)
    ref_skin, _, _, ref_body, _ = semantic_masks(reference)
    ref_q = {
        "skin": quantiles(reference[..., :3], ref_skin),
        "body": quantiles(reference[..., :3], ref_body),
    }

    if weapon_name == "machinegun":
        return out, {
            "reference_passthrough": True,
            "changed_rgb_pixels": 0,
            "skin_distance_before": 0.0,
            "skin_distance_after": 0.0,
            "skin_reduction_pct": 100.0,
            "body_distance_before": 0.0,
            "body_distance_after": 0.0,
            "body_reduction_pct": 100.0,
        }

    # Denoise only opaque interior uniform pixels, cell by cell, so the atlas
    # remains bounded in memory and edges/weapon silhouettes are untouched.
    for row in range(17):
        for col in range(COLS):
            y0 = row * CELL
            x0 = col * CELL
            ys = slice(y0, y0 + CELL)
            xs = slice(x0, x0 + CELL)
            mask = src_body[ys, xs] & src_interior[ys, xs]
            if not np.any(mask):
                continue
            tile = source[ys, xs, :3]
            median = np.array(
                Image.fromarray(tile, "RGB").filter(ImageFilter.MedianFilter(size=3))
            )
            dst = out[ys, xs, :3].astype(np.float32)
            dst[mask] = (
                dst[mask] * .62
                + median[mask].astype(np.float32) * .38
            )
            out[ys, xs, :3] = np.clip(dst, 0, 255).astype(np.uint8)

    metrics = {"reference_passthrough": False}
    for name, mask, strength in (
        ("skin", src_skin, .78),
        ("body", src_body, .88),
    ):
        before = quantiles(source[..., :3], mask)
        vals = out[..., :3].astype(np.float32)[mask].copy()
        src_q = np.percentile(vals, Q, axis=0).astype(np.float32)
        target_q = ref_q[name]
        for channel in range(3):
            mapped = np.interp(
                vals[:, channel],
                src_q[:, channel],
                target_q[:, channel],
                left=target_q[0, channel],
                right=target_q[-1, channel],
            )
            vals[:, channel] = (
                vals[:, channel] * (1.0 - strength)
                + mapped * strength
            )
        rgb = out[..., :3]
        rgb[mask] = np.clip(vals, 0, 255).astype(np.uint8)
        out[..., :3] = rgb

        after = quantiles(out[..., :3], mask)
        before_distance = distance(before, target_q)
        after_distance = distance(after, target_q)
        metrics[f"{name}_distance_before"] = round(before_distance, 3)
        metrics[f"{name}_distance_after"] = round(after_distance, 3)
        metrics[f"{name}_reduction_pct"] = round(
            100.0 * (1.0 - after_distance / max(before_distance, 1e-6)),
            2,
        )

    out[17 * CELL:] = source[17 * CELL:]
    out[out[..., 3] == 0, :3] = 0
    metrics["changed_rgb_pixels"] = int(
        np.any(out[..., :3] != source[..., :3], axis=2).sum()
    )
    return out, metrics


def main():
    args = parse_args()
    if args.self_test:
        assert SIZE == (3328, 7488)
        assert COLS == 8 and ROWS == 18
        assert PIVOT_X == 200.0 and FOOT_Y == 382.0
        print("OK strict-v16 pack self-test")
        return

    if not all((args.source, args.reference, args.output, args.manifest, args.weapon)):
        raise SystemExit("source/reference/output/manifest/weapon required")

    source = np.array(Image.open(args.source).convert("RGBA"))
    reference = np.array(Image.open(args.reference).convert("RGBA"))
    if (source.shape[1], source.shape[0]) != SIZE:
        raise SystemExit(f"expected source {SIZE}, got {(source.shape[1], source.shape[0])}")
    if (reference.shape[1], reference.shape[0]) != SIZE:
        raise SystemExit(f"expected reference {SIZE}, got {(reference.shape[1], reference.shape[0])}")

    out, metrics = build(source, reference, args.weapon)
    if not np.array_equal(out[..., 3], source[..., 3]):
        raise SystemExit("alpha changed")
    if not np.array_equal(out[17 * CELL:], source[17 * CELL:]):
        raise SystemExit("death/downed row changed")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(args.output, "PNG", compress_level=3)
    manifest = {
        "schema": 1,
        "kind": "pawn-slug-godot-strict-atlas",
        "version": VERSION,
        "weapon": args.weapon,
        "source": {
            "filename": args.source.name,
            "sha256": sha(args.source),
            "generation": "v15",
            "size": list(SIZE),
        },
        "reference": {
            "filename": args.reference.name,
            "sha256": sha(args.reference),
            "weapon": "machinegun",
            "generation": "v15",
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
            "kind": "2d-material-harmonisation",
            "geometry_contract": "strict-v15 alpha preserved byte-for-byte",
            "death_row_contract": "row 17 byte-identical to strict-v15",
            "reference_contract": "strict-v15 machinegun supplies material/palette statistics only",
            "visual_pass": "reduce interior uniform speckle; harmonise skin and dark-uniform quantiles; preserve weapon/fire masks and all geometry",
        },
        "metrics": metrics,
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
