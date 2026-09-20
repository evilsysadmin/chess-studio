#!/usr/bin/env python3
"""Derive a visually distinct Shield enemy from the approved heavy Pawn Slug row."""
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
SOURCE_ROW = 2
EXPECTED_SOURCE = (640, 240)
URL_RE = re.compile(r'^\s*const BODY_ATLAS_URL\s*:=\s*"(?P<url>https?://[^"]+)"\s*$', re.M)

INK = (21, 20, 18, 255)
STEEL_DARK = (48, 50, 47, 255)
STEEL_MID = (70, 72, 65, 255)
STEEL_HI = (109, 105, 90, 255)
VIEW_DARK = (48, 20, 19, 255)
VIEW_HI = (147, 54, 44, 255)


def source_from_gdscript(path: Path) -> str:
    match = URL_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"{path} lost BODY_ATLAS_URL")
    return match.group("url")


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        target = temp_dir / (Path(parsed.path).name or "enemy-source.webp")
        request = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Shield/2"})
        with urllib.request.urlopen(request, timeout=30) as response, target.open("wb") as stream:
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


def decorate_shield(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    d = ImageDraw.Draw(out)
    # Shield rides in front of the source-facing-left unit. One-pixel gait sway keeps
    # it attached to the torso without changing feet or animation timing.
    sway = -1 if phase in {1, 2, 5} else (1 if phase in {3, 6} else 0)
    x0 = 10 + sway
    y0 = 24
    x1 = 40 + sway
    y1 = 69

    # Thick ballistic silhouette + beveled corners.
    outer = [(x0 + 4, y0), (x1 - 3, y0), (x1, y0 + 4), (x1, y1 - 4),
             (x1 - 4, y1), (x0 + 5, y1), (x0, y1 - 6), (x0, y0 + 5)]
    d.polygon(outer, fill=INK)
    inner = [(x0 + 5, y0 + 2), (x1 - 4, y0 + 2), (x1 - 2, y0 + 5), (x1 - 2, y1 - 5),
             (x1 - 5, y1 - 2), (x0 + 6, y1 - 2), (x0 + 2, y1 - 7), (x0 + 2, y0 + 6)]
    d.polygon(inner, fill=STEEL_DARK)

    # Strong bevels readable at native 80px.
    d.line([(x0 + 6, y0 + 4), (x1 - 6, y0 + 4)], fill=STEEL_HI, width=1)
    d.line([(x0 + 4, y0 + 6), (x0 + 4, y1 - 8)], fill=STEEL_MID, width=1)
    d.line([(x1 - 4, y0 + 7), (x1 - 4, y1 - 7)], fill=INK, width=1)

    # Armoured viewport with red internal glass, matching existing enemy accents.
    vy0, vy1 = y0 + 9, y0 + 17
    d.rectangle((x0 + 6, vy0, x1 - 6, vy1), fill=INK)
    d.rectangle((x0 + 8, vy0 + 2, x1 - 8, vy1 - 2), fill=VIEW_DARK)
    d.line([(x0 + 9, vy0 + 2), (x1 - 10, vy0 + 2)], fill=VIEW_HI, width=1)

    # Lower impact ribs + compact class mark.
    for yy in (y0 + 25, y0 + 32, y0 + 39):
        d.line([(x0 + 6, yy), (x1 - 7, yy)], fill=STEEL_MID, width=1)
    d.rectangle((x0 + 7, y1 - 11, x0 + 11, y1 - 7), fill=VIEW_DARK)
    d.point((x0 + 8, y1 - 10), fill=VIEW_HI)

    # Rear forearm clamp visually binds shield to the original arm/body mass.
    d.line([(x1 - 1, y0 + 23), (x1 + 8, y0 + 27)], fill=INK, width=3)
    d.line([(x1, y0 + 23), (x1 + 7, y0 + 26)], fill=STEEL_MID, width=1)
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
        frame = decorate_shield(base, i)
        after = frame.getchannel("A").getbbox()
        if before is None or after is None:
            raise ValueError(f"frame {i} empty")
        if after[3] != before[3]:
            raise ValueError(f"frame {i} changed foot line {before[3]} -> {after[3]}")
        new_row.alpha_composite(frame, (i * CELL, 0))
        frames.append({"index": i, "sourceBBox": list(before), "bbox": list(after)})

    row_path = output_dir / "enemy-shield-v2-row.png"
    clean_hidden_rgb(new_row).save(row_path, "PNG", optimize=False, compress_level=9)

    scale, label_h, pad = 4, 28, 20
    review = Image.new("RGBA", (FRAMES * CELL * scale, 2 * CELL * scale + 2 * label_h + pad), (24, 24, 24, 255))
    draw = ImageDraw.Draw(review)
    draw.text((8, 7), "BASELINE HEAVY ROW", fill=(235, 235, 228, 255))
    review.alpha_composite(old_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, label_h))
    y2 = label_h + CELL * scale + pad
    draw.text((8, y2 + 7), "SHIELD V2 · SAME GAIT / BALLISTIC SILHOUETTE", fill=(235, 235, 228, 255))
    review.alpha_composite(new_row.resize((FRAMES * CELL * scale, CELL * scale), Image.Resampling.NEAREST), (0, y2 + label_h))
    review_path = output_dir / "enemy-shield-v2-review.png"
    review.save(review_path, "PNG", optimize=False, compress_level=9)

    report = {
        "schema": 2,
        "scope": "pawn-slug-enemy-shield-v2",
        "source": source_path.name,
        "sourceSize": list(source.size),
        "sourceRow": SOURCE_ROW,
        "cell": [CELL, CELL],
        "frames": frames,
        "output": row_path.name,
        "review": review_path.name,
        "invariants": {"frameCount": FRAMES, "footLinePreserved": True, "pure2D": True},
    }
    (output_dir / "enemy-shield-v2.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    inputs = p.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--source")
    inputs.add_argument("--gdscript", type=Path)
    p.add_argument("--output-dir", type=Path, required=True)
    cfg = p.parse_args()
    source_spec = cfg.source if cfg.source else source_from_gdscript(cfg.gdscript)
    with tempfile.TemporaryDirectory(prefix="pawnslug-shield-") as tmp:
        report = build(acquire(source_spec, Path(tmp)), cfg.output_dir)
    print(f"OK shield v2: {len(report['frames'])} frames -> {cfg.output_dir / report['output']}")


if __name__ == "__main__":
    main()
