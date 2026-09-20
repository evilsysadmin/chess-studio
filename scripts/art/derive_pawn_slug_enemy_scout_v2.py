#!/usr/bin/env python3
"""Derive a distinct lightweight Scout enemy from the approved Pawn Slug row-0 gait."""
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

INK = (22, 22, 20, 255)
CLOTH = (61, 67, 61, 255)
CLOTH_HI = (95, 102, 91, 255)
OPTIC = (56, 111, 137, 255)
OPTIC_HI = (126, 190, 211, 255)
SCARF = (76, 45, 38, 255)
SCARF_HI = (123, 69, 54, 255)


def source_from_gdscript(path: Path) -> str:
    match = URL_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"{path} lost BODY_ATLAS_URL")
    return match.group("url")


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        target = temp_dir / (Path(parsed.path).name or "enemy-source.webp")
        req = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Scout/2"})
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


def decorate_scout(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    d = ImageDraw.Draw(out)

    # Light hood/neck shroud changes the head/shoulder contour without bulking the unit.
    d.polygon([(38, 23), (45, 18), (55, 20), (61, 27), (58, 34), (50, 31), (42, 34), (37, 29)], fill=INK)
    d.polygon([(40, 23), (46, 20), (54, 21), (59, 27), (56, 31), (49, 29), (43, 31), (39, 28)], fill=CLOTH)
    d.line([(42, 23), (53, 22)], fill=CLOTH_HI, width=1)

    # Monocular blue scout optic, intentionally brighter than the rest of the palette.
    d.rectangle((38, 25, 45, 29), fill=INK)
    d.rectangle((39, 26, 43, 28), fill=OPTIC)
    d.point((39, 26), fill=OPTIC_HI)

    # Compact rear antenna / sensor mast.
    sway = -1 if phase in {1, 2, 6} else (1 if phase in {4, 5} else 0)
    d.line([(62, 31), (66 + sway, 17)], fill=INK, width=2)
    d.line([(63, 30), (66 + sway, 18)], fill=CLOTH_HI, width=1)
    d.ellipse((64 + sway, 14, 68 + sway, 18), fill=INK)
    d.point((66 + sway, 16), fill=OPTIC_HI)

    # Thin scarf tails trail rearward; phase map prevents a rigid cutout look.
    tail = {0: 2, 1: 5, 2: 7, 3: 4, 4: 1, 5: -1, 6: 1, 7: 4}[phase]
    d.polygon([(57, 32), (62, 34), (69 + tail, 35), (74 + tail, 39), (68 + tail, 42), (60, 38)], fill=INK)
    d.polygon([(59, 33), (62, 35), (68 + tail, 36), (71 + tail, 39), (67 + tail, 40), (60, 37)], fill=SCARF)
    d.line([(62, 35), (68 + tail, 37)], fill=SCARF_HI, width=1)

    # Light diagonal harness and small recon pouch.
    d.line([(44, 36), (57, 50)], fill=INK, width=3)
    d.line([(45, 36), (56, 48)], fill=CLOTH_HI, width=1)
    d.rectangle((55, 44, 62, 51), fill=INK)
    d.rectangle((56, 45, 60, 49), fill=CLOTH)
    d.point((57, 45), fill=OPTIC)

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
        frame = decorate_scout(base, i)
        after = frame.getchannel("A").getbbox()
        if before is None or after is None:
            raise ValueError(f"frame {i} empty")
        if after[3] != before[3]:
            raise ValueError(f"frame {i} changed foot line")
        new_row.alpha_composite(frame, (i * CELL, 0))
        frames.append({"index": i, "sourceBBox": list(before), "bbox": list(after)})

    row_path = output_dir / "enemy-scout-v2-row.png"
    clean_hidden_rgb(new_row).save(row_path, "PNG", optimize=False, compress_level=9)

    scale, label_h, pad = 4, 28, 20
    review = Image.new("RGBA", (FRAMES * CELL * scale, 2 * CELL * scale + 2 * label_h + pad), (24, 24, 24, 255))
    draw = ImageDraw.Draw(review)
    draw.text((8, 7), "BASELINE PAWN ROW", fill=(235, 235, 228, 255))
    review.alpha_composite(old_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, label_h))
    y2 = label_h + CELL * scale + pad
    draw.text((8, y2 + 7), "SCOUT V2 · OPTIC / SENSOR / LIGHT SCARF", fill=(235, 235, 228, 255))
    review.alpha_composite(new_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, y2 + label_h))
    review_path = output_dir / "enemy-scout-v2-review.png"
    review.save(review_path, "PNG", optimize=False, compress_level=9)

    report = {
        "schema": 2,
        "scope": "pawn-slug-enemy-scout-v2",
        "source": source_path.name,
        "sourceSize": list(source.size),
        "sourceRow": SOURCE_ROW,
        "cell": [CELL, CELL],
        "frames": frames,
        "output": row_path.name,
        "review": review_path.name,
        "invariants": {"frameCount": FRAMES, "footLinePreserved": True, "pure2D": True},
    }
    (output_dir / "enemy-scout-v2.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    inputs = p.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--source")
    inputs.add_argument("--gdscript", type=Path)
    p.add_argument("--output-dir", type=Path, required=True)
    cfg = p.parse_args()
    source_spec = cfg.source if cfg.source else source_from_gdscript(cfg.gdscript)
    with tempfile.TemporaryDirectory(prefix="pawnslug-scout-") as tmp:
        report = build(acquire(source_spec, Path(tmp)), cfg.output_dir)
    print(f"OK scout v2: {len(report['frames'])} frames -> {cfg.output_dir / report['output']}")


if __name__ == "__main__":
    main()
