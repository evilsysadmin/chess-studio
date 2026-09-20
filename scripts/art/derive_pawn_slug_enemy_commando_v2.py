#!/usr/bin/env python3
"""Derive a visually distinct Commando row from the approved Pawn Slug pawn raster.

This is a deterministic 2D raster pass: it preserves the approved 8-frame gait,
feet and weapon pose while adding a class-specific helmet/visor, radio pack,
shoulder armour and chest rig. It does not change gameplay or animation timing.
"""
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

# Palette sampled to remain in the current dark olive/brown military family.
INK = (23, 22, 19, 255)
PACK_DARK = (43, 48, 39, 255)
PACK_MID = (61, 65, 50, 255)
PACK_LIGHT = (91, 88, 66, 255)
VISOR = (73, 27, 25, 255)
VISOR_HI = (154, 66, 52, 255)
METAL = (78, 73, 62, 255)


def source_from_gdscript(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    match = URL_RE.search(text)
    if not match:
        raise ValueError(f"{path} lost BODY_ATLAS_URL")
    return match.group("url")


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        target = temp_dir / (Path(parsed.path).name or "enemy-source.webp")
        req = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Commando/2"})
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


def decorate_commando(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    d = ImageDraw.Draw(out)

    # Compact radio/backpack: the larger rear silhouette is the strongest class cue.
    d.polygon([(61, 29), (69, 31), (72, 37), (71, 50), (67, 55), (61, 51)], fill=INK)
    d.polygon([(62, 31), (68, 32), (70, 38), (69, 49), (66, 52), (62, 49)], fill=PACK_DARK)
    d.line([(63, 34), (68, 34), (69, 39)], fill=PACK_LIGHT, width=1)
    d.rectangle((64, 42, 68, 48), fill=PACK_MID)
    d.point((67, 43), fill=PACK_LIGHT)

    # Radio antenna, slightly phase-shifted by one pixel to follow the torso sway.
    sway = -1 if phase in {1, 2, 6} else 0
    d.line([(68, 32), (70 + sway, 19)], fill=INK, width=2)
    d.line([(69, 31), (70 + sway, 20)], fill=METAL, width=1)
    d.point((70 + sway, 18), fill=PACK_LIGHT)

    # Heavier shoulder shell and red unit tab.
    d.polygon([(55, 31), (62, 31), (66, 35), (64, 42), (57, 41), (54, 36)], fill=INK)
    d.polygon([(56, 32), (61, 33), (64, 35), (62, 39), (57, 39), (55, 36)], fill=PACK_MID)
    d.rectangle((60, 34, 63, 36), fill=VISOR)
    d.point((61, 34), fill=VISOR_HI)

    # Low-profile visor/NVG housing: remains attached to the same helmet mass.
    d.polygon([(39, 23), (47, 21), (56, 23), (59, 27), (55, 30), (43, 29), (39, 27)], fill=INK)
    d.polygon([(41, 23), (48, 22), (55, 24), (57, 26), (54, 28), (43, 28), (40, 26)], fill=PACK_DARK)
    d.rectangle((39, 26, 45, 28), fill=INK)
    d.rectangle((40, 26, 43, 27), fill=VISOR)
    d.point((40, 26), fill=VISOR_HI)

    # Chest rig + two readable pouches without obscuring the weapon arms.
    d.line([(45, 35), (52, 47), (58, 36)], fill=INK, width=2)
    d.rectangle((47, 42, 52, 49), fill=INK)
    d.rectangle((48, 42, 51, 47), fill=PACK_MID)
    d.rectangle((53, 42, 58, 49), fill=INK)
    d.rectangle((54, 42, 57, 47), fill=PACK_DARK)
    d.line([(48, 43), (51, 43)], fill=PACK_LIGHT, width=1)

    # Suppressor sleeve: makes the weapon profile unmistakably different while
    # preserving its original aim point and muzzle height.
    d.rectangle((4, 24, 15, 30), fill=INK)
    d.rectangle((5, 25, 14, 28), fill=METAL)
    d.line([(14, 26), (21, 27)], fill=INK, width=2)
    d.point((5, 25), fill=PACK_LIGHT)

    return clean_hidden_rgb(out)


def build(source_path: Path, output_dir: Path) -> dict:
    source = Image.open(source_path).convert("RGBA")
    if source.size != EXPECTED_SOURCE:
        raise ValueError(f"source atlas must be {EXPECTED_SOURCE[0]}x{EXPECTED_SOURCE[1]}, got {source.size}")
    output_dir.mkdir(parents=True, exist_ok=True)

    old_row = source.crop((0, SOURCE_ROW * CELL, FRAMES * CELL, (SOURCE_ROW + 1) * CELL))
    new_row = Image.new("RGBA", old_row.size, (0, 0, 0, 0))
    frames = []
    for i in range(FRAMES):
        base = old_row.crop((i * CELL, 0, (i + 1) * CELL, CELL))
        frame = decorate_commando(base, i)
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"frame {i} became empty")
        new_row.alpha_composite(frame, (i * CELL, 0))
        frames.append({"index": i, "bbox": list(bbox)})

    row_path = output_dir / "enemy-commando-v2-row.png"
    clean_hidden_rgb(new_row).save(row_path, "PNG", optimize=False, compress_level=9)

    scale = 4
    pad = 20
    label_h = 28
    review = Image.new("RGBA", (FRAMES * CELL * scale, 2 * CELL * scale + 2 * label_h + pad), (24, 24, 24, 255))
    draw = ImageDraw.Draw(review)
    draw.text((8, 7), "BASELINE PAWN ROW", fill=(235, 235, 228, 255))
    review.alpha_composite(old_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, label_h))
    y2 = label_h + CELL * scale + pad
    draw.text((8, y2 + 7), "COMMANDO V2 · SAME GAIT / DISTINCT KIT", fill=(235, 235, 228, 255))
    review.alpha_composite(new_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, y2 + label_h))
    review_path = output_dir / "enemy-commando-v2-review.png"
    review.save(review_path, "PNG", optimize=False, compress_level=9)

    report = {
        "schema": 2,
        "scope": "pawn-slug-enemy-commando-v2",
        "source": source_path.name,
        "sourceSize": list(source.size),
        "sourceRow": SOURCE_ROW,
        "cell": [CELL, CELL],
        "frames": frames,
        "output": row_path.name,
        "review": review_path.name,
        "invariants": {
            "frameCount": FRAMES,
            "locomotionTimingChanged": False,
            "feetDerivedFromApprovedSource": True,
            "weaponAimDerivedFromApprovedSource": True,
            "pure2D": True,
        },
    }
    (output_dir / "enemy-commando-v2.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    inputs = p.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--source")
    inputs.add_argument("--gdscript", type=Path)
    p.add_argument("--output-dir", type=Path, required=True)
    cfg = p.parse_args()
    source_spec = cfg.source if cfg.source else source_from_gdscript(cfg.gdscript)
    with tempfile.TemporaryDirectory(prefix="pawnslug-commando-") as tmp:
        source = acquire(source_spec, Path(tmp))
        report = build(source, cfg.output_dir)
    print(f"OK commando v2: {len(report['frames'])} frames -> {cfg.output_dir / report['output']}")


if __name__ == "__main__":
    main()
