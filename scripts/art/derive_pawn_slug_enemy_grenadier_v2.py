#!/usr/bin/env python3
"""Derive a distinct Grenadier enemy from the approved Pawn Slug row-0 gait."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 80
FRAMES = 8
SOURCE_ROW = 0
EXPECTED_SOURCE = (640, 240)
URL_RE = re.compile(r'^\s*const BODY_ATLAS_URL\s*:=\s*"(?P<url>https?://[^"]+)"\s*$', re.M)

INK = (22, 21, 18, 255)
OLIVE = (64, 71, 50, 255)
OLIVE_HI = (103, 108, 72, 255)
BRASS = (151, 123, 69, 255)
SATCHEL = (76, 55, 39, 255)
SATCHEL_HI = (113, 78, 49, 255)


def source_from_gdscript(path: Path) -> str:
    match = URL_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"{path} lost BODY_ATLAS_URL")
    return match.group("url")


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        target = temp_dir / (Path(parsed.path).name or "enemy-source.webp")
        req = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Grenadier/2"})
        with urllib.request.urlopen(req, timeout=30) as response, target.open("wb") as stream:
            shutil.copyfileobj(response, stream)
        return target
    return Path(source)


def clean_hidden_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    px = bytearray(rgba.tobytes())
    for i in range(0, len(px), 4):
        if px[i + 3] == 0:
            px[i] = px[i + 1] = px[i + 2] = 0
    return Image.frombytes("RGBA", rgba.size, bytes(px))


def decorate_grenadier(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    d = ImageDraw.Draw(out)

    # High rear grenade satchel gives a chunky but different profile from Commando.
    sway = -1 if phase in {1, 5, 6} else 0
    d.polygon([(61, 32), (70 + sway, 33), (74 + sway, 39), (72 + sway, 54), (64, 55), (60, 48)], fill=INK)
    d.polygon([(63, 34), (69 + sway, 35), (72 + sway, 40), (70 + sway, 51), (65, 52), (62, 47)], fill=SATCHEL)
    d.line([(64, 36), (69 + sway, 37)], fill=SATCHEL_HI, width=1)

    # Diagonal grenade bandolier, with four round canisters readable at native 80px.
    d.line([(43, 34), (60, 53)], fill=INK, width=5)
    d.line([(44, 34), (59, 51)], fill=SATCHEL_HI, width=1)
    grenade_centres = [(46, 37), (50, 41), (54, 45), (58, 49)]
    for gx, gy in grenade_centres:
        d.ellipse((gx - 3, gy - 3, gx + 3, gy + 3), fill=INK)
        d.ellipse((gx - 2, gy - 2, gx + 2, gy + 2), fill=OLIVE)
        d.line([(gx, gy - 4), (gx, gy - 2)], fill=BRASS, width=1)
        d.point((gx - 1, gy - 1), fill=OLIVE_HI)

    # Compact launcher canister under the current barrel, attached rather than floating.
    d.rectangle((18, 30, 35, 38), fill=INK)
    d.rectangle((20, 31, 33, 36), fill=OLIVE)
    d.line([(20, 31), (31, 31)], fill=OLIVE_HI, width=1)
    d.rectangle((17, 32, 20, 36), fill=BRASS)

    # Rear spare shell tube and hazard stripe.
    d.polygon([(66, 23), (72, 23), (74, 29), (73, 36), (67, 36), (65, 30)], fill=INK)
    d.rectangle((67, 25, 71, 34), fill=OLIVE)
    d.line([(67, 27), (71, 30)], fill=BRASS, width=1)
    d.line([(67, 31), (70, 34)], fill=BRASS, width=1)

    return clean_hidden_rgb(out)


def build(source_path: Path, output_dir: Path) -> dict:
    source = Image.open(source_path).convert("RGBA")
    if source.size != EXPECTED_SOURCE:
        raise ValueError(f"source atlas must be 640x240, got {source.size}")
    output_dir.mkdir(parents=True, exist_ok=True)
    old_row = source.crop((0, SOURCE_ROW * CELL, FRAMES * CELL, (SOURCE_ROW + 1) * CELL))
    new_row = Image.new("RGBA", old_row.size, (0, 0, 0, 0))
    frames = []
    for i in range(FRAMES):
        base = old_row.crop((i * CELL, 0, (i + 1) * CELL, CELL))
        before = base.getchannel("A").getbox()
        frame = decorate_grenadier(base, i)
        after = frame.getchannel("A").getbbox()
        if before is None or after is None:
            raise ValueError(f"frame {i} empty")
        if after[3] != before[3]:
            raise ValueError(f"frame {i} changed foot line")
        new_row.alpha_composite(frame, (i * CELL, 0))
        frames.append({"index": i, "sourceBBox": list(before), "bbox": list(after)})

    row_path = output_dir / "enemy-grenadier-v2-row.png"
    clean_hidden_rgb(new_row).save(row_path, "PNG", optimize=False, compress_level=9)

    scale, label_h, pad = 4, 28, 20
    review = Image.new("RGBA", (FRAMES * CELL * scale, 2 * CELL * scale + 2 * label_h + pad), (24, 24, 24, 255))
    draw = ImageDraw.Draw(review)
    draw.text((8, 7), "BASELINE PAWN ROW", fill=(235, 235, 228, 255))
    review.alpha_composite(old_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, label_h))
    y2 = label_h + CELL * scale + pad
    draw.text((8, y2 + 7), "GRENADIER V2 · BANDOLIER / LAUNCHER / SATCHEL", fill=(235, 235, 228, 255))
    review.alpha_composite(new_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, y2 + label_h))
    review_path = output_dir / "enemy-grenadier-v2-review.png"
    review.save(review_path, "PNG", optimize=False, compress_level=9)

    report = {
        "schema": 2,
        "scope": "pawn-slug-enemy-grenadier-v2",
        "source": source_path.name,
        "sourceSize": list(source.size),
        "sourceRow": SOURCE_ROW,
        "cell": [CELL, CELL],
        "frames": frames,
        "output": row_path.name,
        "review": review_path.name,
        "invariants": {"frameCount": FRAMES, "footLinePreserved": True, "pure2D": True},
    }
    (output_dir / "enemy-grenadier-v2.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    inputs = p.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--source")
    inputs.add_argument("--gdscript", type=Path)
    p.add_argument("--output-dir", type=Path, required=True)
    cfg = p.parse_args()
    source_spec = cfg.source if cfg.source else source_from_gdscript(cfg.gdscript)
    with tempfile.TemporaryDirectory(prefix="pawnslug-grenadier-") as tmp:
        report = build(acquire(source_spec, Path(tmp)), cfg.output_dir)
    print(f"OK grenadier v2: {len(report['frames'])} frames -> {cfg.output_dir / report['output']}")


if __name__ == "__main__":
    main()
