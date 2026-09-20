#!/usr/bin/env python3
"""Derive a distinct elite Queen enemy from the approved row-1 Pawn Slug gait."""
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
SOURCE_ROW = 1
EXPECTED_SOURCE = (640, 240)
URL_RE = re.compile(r'^\s*const BODY_ATLAS_URL\s*:=\s*"(?P<url>https?://[^"]+)"\s*$', re.M)

INK = (22, 20, 18, 255)
ARMOUR = (73, 64, 52, 255)
BRASS = (124, 101, 63, 255)
BRASS_HI = (166, 137, 80, 255)
CLOAK = (70, 28, 27, 255)
CLOAK_HI = (120, 47, 40, 255)


def source_from_gdscript(path: Path) -> str:
    match = URL_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"{path} lost BODY_ATLAS_URL")
    return match.group("url")


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        target = temp_dir / (Path(parsed.path).name or "enemy-source.webp")
        req = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Queen/2"})
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


def decorate_queen(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    d = ImageDraw.Draw(out)

    # Command sensor crest: three compact prongs create a taller elite silhouette.
    d.polygon([(43, 22), (45, 13), (48, 21), (51, 11), (54, 21), (58, 14), (59, 25)], fill=INK)
    d.line([(45, 20), (46, 15)], fill=BRASS, width=1)
    d.line([(51, 19), (52, 13)], fill=BRASS_HI, width=1)
    d.line([(57, 20), (58, 16)], fill=BRASS, width=1)

    # Crown-band / command visor integrated into the existing helmet.
    d.polygon([(40, 23), (58, 22), (61, 26), (58, 29), (42, 29), (39, 26)], fill=INK)
    d.line([(42, 24), (57, 24)], fill=BRASS, width=2)
    d.point((49, 24), fill=BRASS_HI)

    # Elite pauldron and command sigil.
    d.polygon([(55, 31), (64, 31), (68, 36), (65, 42), (57, 40), (53, 35)], fill=INK)
    d.polygon([(57, 32), (63, 33), (66, 36), (63, 39), (57, 38), (55, 35)], fill=ARMOUR)
    d.polygon([(60, 34), (62, 36), (60, 38), (58, 36)], fill=BRASS)
    d.point((60, 35), fill=BRASS_HI)

    # Half-cape trails rearward (right) and shifts by phase without touching feet.
    sway = {0: 0, 1: 2, 2: 3, 3: 1, 4: 0, 5: -1, 6: 1, 7: 2}[phase]
    cape = [(62, 37), (68, 39), (74 + sway, 44), (77 + sway, 52),
            (72 + sway, 61), (65, 58), (61, 50)]
    d.polygon(cape, fill=INK)
    inner = [(64, 39), (68, 41), (72 + sway, 45), (74 + sway, 52),
             (70 + sway, 58), (66, 55), (63, 49)]
    d.polygon(inner, fill=CLOAK)
    d.line([(66, 42), (70 + sway, 47), (71 + sway, 54)], fill=CLOAK_HI, width=1)

    # Diagonal command sash and two restrained brass tabs.
    d.line([(43, 37), (57, 53)], fill=INK, width=3)
    d.line([(44, 37), (56, 51)], fill=CLOAK_HI, width=1)
    d.rectangle((48, 44, 51, 47), fill=BRASS)
    d.point((49, 44), fill=BRASS_HI)
    d.rectangle((53, 49, 56, 52), fill=BRASS)

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
        before = base.getchannel("A").getbbox()
        frame = decorate_queen(base, i)
        after = frame.getchannel("A").getbbox()
        if before is None or after is None:
            raise ValueError(f"frame {i} empty")
        if after[3] != before[3]:
            raise ValueError(f"frame {i} changed foot line")
        new_row.alpha_composite(frame, (i * CELL, 0))
        frames.append({"index": i, "sourceBBox": list(before), "bbox": list(after)})

    row_path = output_dir / "enemy-queen-v2-row.png"
    clean_hidden_rgb(new_row).save(row_path, "PNG", optimize=False, compress_level=9)

    scale, label_h, pad = 4, 28, 20
    review = Image.new("RGBA", (FRAMES * CELL * scale, 2 * CELL * scale + 2 * label_h + pad), (24, 24, 24, 255))
    draw = ImageDraw.Draw(review)
    draw.text((8, 7), "BASELINE KNIGHT / QUEEN ROW", fill=(235, 235, 228, 255))
    review.alpha_composite(old_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, label_h))
    y2 = label_h + CELL * scale + pad
    draw.text((8, y2 + 7), "QUEEN V2 · COMMAND CREST / HALF-CAPE", fill=(235, 235, 228, 255))
    review.alpha_composite(new_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, y2 + label_h))
    review_path = output_dir / "enemy-queen-v2-review.png"
    review.save(review_path, "PNG", optimize=False, compress_level=9)

    report = {
        "schema": 2,
        "scope": "pawn-slug-enemy-queen-v2",
        "source": source_path.name,
        "sourceSize": list(source.size),
        "sourceRow": SOURCE_ROW,
        "cell": [CELL, CELL],
        "frames": frames,
        "output": row_path.name,
        "review": review_path.name,
        "invariants": {"frameCount": FRAMES,"footLinePreserved": True,"pure2D": True},
    }
    (output_dir / "enemy-queen-v2.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    inputs = p.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--source")
    inputs.add_argument("--gdscript", type=Path)
    p.add_argument("--output-dir", type=Path, required=True)
    cfg = p.parse_args()
    source_spec = cfg.source if cfg.source else source_from_gdscript(cfg.gdscript)
    with tempfile.TemporaryDirectory(prefix="pawnslug-queen-") as tmp:
        report = build(acquire(source_spec, Path(tmp)), cfg.output_dir)
    print(f"OK queen v2: {len(report['frames'])} frames -> {cfg.output_dir / report['output']}")


if __name__ == "__main__":
    main()
