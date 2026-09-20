#!/usr/bin/env python3
"""Fail-closed validation for Matthias strict-v16 material harmonisation."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

COLS = 8
ROWS = 18
CELL = 416
SIZE = (COLS * CELL, ROWS * CELL)
FORBIDDEN = {b"iCCP", b"gAMA", b"sRGB", b"cHRM"}
Q = np.array([5, 20, 40, 60, 80, 95], dtype=np.float32)


def chunks(path: Path):
    data = path.read_bytes()
    pos = 8
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return []
    out = []
    while pos + 12 <= len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        out.append(typ)
        pos += 12 + n
        if typ == b"IEND":
            break
    return out


def frame_hashes(atlas):
    return [
        hashlib.sha256(
            atlas[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL].tobytes()
        ).hexdigest()
        for r in range(ROWS)
        for c in range(COLS)
    ]


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
    skin[17 * CELL:] = False
    body[17 * CELL:] = False
    return skin, body


def quantiles(a: np.ndarray, mask: np.ndarray) -> np.ndarray:
    vals = a[..., :3].astype(np.float32)[mask]
    return np.percentile(vals, Q, axis=0).astype(np.float32)


def palette_distance(a, mask, reference, ref_mask):
    return float(np.mean(np.abs(quantiles(a, mask) - quantiles(reference, ref_mask))))


def luma_spread(atlas, row):
    vals = []
    for col in range(COLS):
        cell = atlas[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]
        mask = cell[..., 3] > 40
        rgb = cell[..., :3].astype(np.float32)
        y = .2126 * rgb[..., 0] + .7152 * rgb[..., 1] + .0722 * rgb[..., 2]
        vals.append(float(y[mask].mean()))
    return max(vals) - min(vals)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--atlas", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--baseline", type=Path, required=True)
    p.add_argument("--reference", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    args = p.parse_args()

    new = np.array(Image.open(args.atlas).convert("RGBA"))
    old = np.array(Image.open(args.baseline).convert("RGBA"))
    ref = np.array(Image.open(args.reference).convert("RGBA"))
    manifest = json.loads(args.manifest.read_text())
    weapon = str(manifest.get("weapon", ""))
    errors = []

    if any((arr.shape[1], arr.shape[0]) != SIZE for arr in (new, old, ref)):
        errors.append("bad atlas/reference size")
    if not np.array_equal(new[..., 3], old[..., 3]):
        errors.append("alpha geometry changed")
    if not np.array_equal(new[17 * CELL:], old[17 * CELL:]):
        errors.append("death/downed row changed")
    if np.any(new[new[..., 3] == 0, :3] != 0):
        errors.append("transparent RGB contamination")
    bad = [x.decode() for x in chunks(args.atlas) if x in FORBIDDEN]
    if bad:
        errors.append("forbidden PNG chunks: " + ",".join(bad))
    if max(new.shape[:2]) > 16384:
        errors.append("texture side exceeds 16384")

    changed = int(np.any(new[..., :3] != old[..., :3], axis=2).sum())
    if weapon == "machinegun":
        if changed != 0:
            errors.append(f"machinegun reference must be pixel passthrough, got {changed} changed pixels")
    elif not (1_000_000 <= changed <= 5_000_000):
        errors.append(f"suspicious changed RGB pixel count: {changed}")

    hashes = frame_hashes(new)
    distinct = [len(set(hashes[r * COLS:(r + 1) * COLS])) for r in range(ROWS)]
    if min(distinct) < 8:
        errors.append(f"duplicate frame row(s): {distinct}")

    spread_deltas = [
        luma_spread(new, row) - luma_spread(old, row)
        for row in range(ROWS)
    ]
    if max(spread_deltas) > .75:
        errors.append(f"luma flicker regression: max delta {max(spread_deltas):.3f}")

    old_skin, old_body = semantic_masks(old)
    ref_skin, ref_body = semantic_masks(ref)
    new_skin = old_skin
    new_body = old_body
    distances = {}
    for name, src_mask, dst_mask, ref_mask in (
        ("skin", old_skin, new_skin, ref_skin),
        ("body", old_body, new_body, ref_body),
    ):
        before = palette_distance(old, src_mask, ref, ref_mask)
        after = palette_distance(new, dst_mask, ref, ref_mask)
        reduction = 100.0 if weapon == "machinegun" else 100.0 * (1.0 - after / max(before, 1e-6))
        distances[name] = {
            "before": round(before, 3),
            "after": round(after, 3),
            "reduction_pct": round(reduction, 2),
        }
        threshold = 0.0 if weapon == "machinegun" else (55.0 if name == "skin" else 65.0)
        if reduction < threshold:
            errors.append(f"{name} palette reduction too small: {reduction:.2f}% < {threshold:.2f}%")

    metrics = manifest.get("metrics", {})
    if int(metrics.get("changed_rgb_pixels", -1)) != changed:
        errors.append("manifest changed_rgb_pixels mismatch")

    report = {
        "ok": not errors,
        "errors": errors,
        "summary": {
            "frames": ROWS * COLS,
            "rows": ROWS,
            "all_rows_8_distinct": min(distinct) == 8,
            "alpha_byte_identical": bool(np.array_equal(new[..., 3], old[..., 3])),
            "death_row_byte_identical": bool(np.array_equal(new[17 * CELL:], old[17 * CELL:])),
            "changed_rgb_pixels": changed,
            "max_luma_spread_delta": round(max(spread_deltas), 3),
            "palette_distance": distances,
        },
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if errors:
        raise SystemExit("\n".join(errors))
    print("OK strict-v16 atlas", report["summary"])


if __name__ == "__main__":
    main()
