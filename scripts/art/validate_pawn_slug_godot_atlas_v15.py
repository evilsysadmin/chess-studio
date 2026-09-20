#!/usr/bin/env python3
"""Fail-closed validation for Matthias strict-v15 face-readability pass."""
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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--atlas", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--baseline", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    args = p.parse_args()

    new = np.array(Image.open(args.atlas).convert("RGBA"))
    old = np.array(Image.open(args.baseline).convert("RGBA"))
    manifest = json.loads(args.manifest.read_text())
    errors = []

    if (new.shape[1], new.shape[0]) != SIZE or (old.shape[1], old.shape[0]) != SIZE:
        errors.append("bad atlas size")
    if not np.array_equal(new[..., 3], old[..., 3]):
        errors.append("alpha geometry changed")
    if np.any(new[new[..., 3] == 0, :3] != 0):
        errors.append("transparent RGB contamination")
    bad = [x.decode() for x in chunks(args.atlas) if x in FORBIDDEN]
    if bad:
        errors.append("forbidden PNG chunks: " + ",".join(bad))
    if max(new.shape[:2]) > 16384:
        errors.append("texture side exceeds 16384")

    changed = int(np.any(new[..., :3] != old[..., :3], axis=2).sum())
    if changed < 3000:
        errors.append(f"face pass too small: {changed} changed RGB pixels")
    if changed > 100000:
        errors.append(f"face pass suspiciously broad: {changed} changed RGB pixels")

    # The pass must not touch the authored death/downed row at all.
    death_old = old[17 * CELL:18 * CELL]
    death_new = new[17 * CELL:18 * CELL]
    if not np.array_equal(death_new, death_old):
        errors.append("death row changed")

    hashes = frame_hashes(new)
    distinct = [len(set(hashes[r * COLS:(r + 1) * COLS])) for r in range(ROWS)]
    if min(distinct) < 8:
        errors.append(f"duplicate frame row(s): {distinct}")

    spreads = []
    for row in range(ROWS):
        old_luma = []
        new_luma = []
        for col in range(COLS):
            for atlas, dest in ((old, old_luma), (new, new_luma)):
                cell = atlas[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]
                mask = cell[..., 3] > 40
                rgb = cell[..., :3].astype(np.float32)
                y = .2126 * rgb[..., 0] + .7152 * rgb[..., 1] + .0722 * rgb[..., 2]
                dest.append(float(y[mask].mean()))
        old_spread = max(old_luma) - min(old_luma)
        new_spread = max(new_luma) - min(new_luma)
        spreads.append((old_spread, new_spread))
        if new_spread > old_spread + .5:
            errors.append(
                f"luma flicker regression row {row}: {old_spread:.2f}->{new_spread:.2f}"
            )

    metrics = manifest.get("metrics", {})
    face_frames = int(metrics.get("face_detail_frames", 0))
    if face_frames < 40:
        errors.append(f"face detail coverage too low: {face_frames}")
    if int(metrics.get("changed_rgb_pixels", 0)) != changed:
        errors.append("manifest changed_rgb_pixels mismatch")

    report = {
        "ok": not errors,
        "errors": errors,
        "summary": {
            "frames": ROWS * COLS,
            "rows": ROWS,
            "all_rows_8_distinct": min(distinct) == 8,
            "alpha_byte_identical": bool(np.array_equal(new[..., 3], old[..., 3])),
            "death_row_byte_identical": bool(np.array_equal(death_new, death_old)),
            "changed_rgb_pixels": changed,
            "face_detail_frames": face_frames,
            "max_luma_spread_delta": round(max(n - o for o, n in spreads), 3),
        },
    }
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if errors:
        raise SystemExit("\n".join(errors))
    print("OK strict-v15 atlas", report["summary"])


if __name__ == "__main__":
    main()
