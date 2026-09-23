#!/usr/bin/env python3
"""Deterministically repair Matthias pistol crouch head continuity.

The strict-v21 pistol bank contains five crouch frames whose face/head smear
forward while the body and P99 remain otherwise useful. This repair keeps the
full 8-frame crouch timing and preserves every pixel outside a bounded head
window. Clean heads from the same authored crouch row are transplanted into the
five damaged phases; no new pose is invented and no other row is touched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 416
COLS = 8
ROWS = 18
SIZE = (CELL * COLS, CELL * ROWS)
CROUCH_ROW = 6
PATCH_RECT = (138, 138, 276, 258)
CLEAN_COLUMNS = (2, 4, 5)
DONOR_BY_COLUMN = {0: 2, 1: 2, 3: 4, 6: 5, 7: 5}
ALPHA_THRESHOLD = 8
MAX_PATCH_ALPHA_GAIN = 1.35


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cell(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def patch_alpha_mass(image: Image.Image) -> int:
    alpha = image.getchannel("A").crop(PATCH_RECT)
    return sum(
        1
        for value in alpha.get_flattened_data()
        if int(value) >= ALPHA_THRESHOLD
    )


def outside_patch_bytes(image: Image.Image) -> bytes:
    rgba = image.convert("RGBA")
    x0, y0, x1, y1 = PATCH_RECT
    chunks = [
        rgba.crop((0, 0, CELL, y0)).tobytes(),
        rgba.crop((0, y0, x0, y1)).tobytes(),
        rgba.crop((x1, y0, CELL, y1)).tobytes(),
        rgba.crop((0, y1, CELL, CELL)).tobytes(),
    ]
    return b"".join(chunks)


def transplant_head(target: Image.Image, donor: Image.Image) -> Image.Image:
    repaired = target.convert("RGBA").copy()
    patch = donor.convert("RGBA").crop(PATCH_RECT)
    repaired.paste((0, 0, 0, 0), PATCH_RECT)
    repaired.alpha_composite(patch, (PATCH_RECT[0], PATCH_RECT[1]))
    return repaired


def repair(source: Image.Image) -> tuple[Image.Image, dict]:
    source = source.convert("RGBA")
    if source.size != SIZE:
        raise ValueError(
            f"strict 8x18 atlas required: expected {SIZE}, got {source.size}"
        )

    output = source.copy()
    frames = {col: cell(source, CROUCH_ROW, col) for col in range(COLS)}
    repaired_report = []

    for col, donor_col in DONOR_BY_COLUMN.items():
        target = frames[col]
        donor = frames[donor_col]
        repaired = transplant_head(target, donor)
        if outside_patch_bytes(repaired) != outside_patch_bytes(target):
            raise ValueError(f"crouch c{col}: pixels outside head patch changed")
        before = patch_alpha_mass(target)
        after = patch_alpha_mass(repaired)
        donor_mass = patch_alpha_mass(donor)
        if before <= 0 or after <= 0 or donor_mass <= 0:
            raise ValueError(f"crouch c{col}: empty head patch")
        gain = after / before
        if gain > MAX_PATCH_ALPHA_GAIN:
            raise ValueError(
                f"crouch c{col}: repaired head alpha gain {gain:.4f} exceeds "
                f"{MAX_PATCH_ALPHA_GAIN:.2f}"
            )
        if (
            repaired.crop(PATCH_RECT).tobytes()
            != donor.crop(PATCH_RECT).tobytes()
        ):
            raise ValueError(
                f"crouch c{col}: donor head patch was not copied exactly"
            )
        output.paste(repaired, (col * CELL, CROUCH_ROW * CELL))
        repaired_report.append(
            {
                "column": col,
                "donorColumn": donor_col,
                "patchAlphaBefore": before,
                "patchAlphaAfter": after,
                "donorPatchAlpha": donor_mass,
                "patchAlphaGain": round(gain, 6),
            }
        )

    for col in CLEAN_COLUMNS:
        if cell(output, CROUCH_ROW, col).tobytes() != frames[col].tobytes():
            raise ValueError(f"crouch c{col}: clean authored frame changed")

    for row in range(ROWS):
        if row == CROUCH_ROW:
            continue
        bounds = (0, row * CELL, CELL * COLS, (row + 1) * CELL)
        if output.crop(bounds).tobytes() != source.crop(bounds).tobytes():
            raise ValueError(f"repair modified untouched row {row}")

    return output, {
        "schema": 1,
        "scope": "pawn-slug-matthias-pistol-crouch-head-continuity-v1",
        "row": CROUCH_ROW,
        "patchRect": list(PATCH_RECT),
        "cleanColumns": list(CLEAN_COLUMNS),
        "donorByColumn": {str(k): v for k, v in DONOR_BY_COLUMN.items()},
        "untouchedRowsPixelIdentical": True,
        "cleanCrouchFramesPixelIdentical": True,
        "repairedFrames": repaired_report,
    }


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle(
                    (
                        x,
                        y,
                        min(x + tile - 1, size[0] - 1),
                        min(y + tile - 1, size[1] - 1),
                    ),
                    fill=(205, 205, 205, 255),
                )
    return image


def render_preview(
    source: Image.Image,
    output: Image.Image,
    path: Path,
) -> None:
    width = CELL * COLS
    board = Image.new(
        "RGBA",
        (width, CELL * 2 + 84),
        (18, 20, 24, 255),
    )
    draw = ImageDraw.Draw(board)
    draw.text(
        (8, 8),
        "PISTOL CROUCH · CURRENT",
        fill=(238, 238, 238, 255),
    )
    draw.text(
        (8, CELL + 50),
        "PISTOL CROUCH · REPAIRED",
        fill=(238, 238, 238, 255),
    )
    for index, atlas in enumerate((source, output)):
        strip = atlas.crop(
            (
                0,
                CROUCH_ROW * CELL,
                width,
                (CROUCH_ROW + 1) * CELL,
            )
        )
        bg = checkerboard(strip.size)
        bg.alpha_composite(strip)
        y = 28 if index == 0 else CELL + 70
        board.alpha_composite(bg, (0, y))
    board.thumbnail((1664, 500), Image.Resampling.NEAREST)
    path.parent.mkdir(parents=True, exist_ok=True)
    board.save(path, "PNG", optimize=True)


def self_test() -> None:
    target = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    donor = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw_target = ImageDraw.Draw(target)
    draw_donor = ImageDraw.Draw(donor)
    draw_target.rectangle(
        (160, 180, 235, 300),
        fill=(20, 30, 40, 255),
    )
    draw_donor.rectangle(
        (150, 160, 245, 300),
        fill=(50, 60, 70, 255),
    )
    repaired = transplant_head(target, donor)
    assert outside_patch_bytes(repaired) == outside_patch_bytes(target)
    assert (
        repaired.crop(PATCH_RECT).tobytes()
        == donor.crop(PATCH_RECT).tobytes()
    )
    assert patch_alpha_mass(repaired) > patch_alpha_mass(target)
    print("Matthias pistol crouch head continuity self-test: OK")


def main() -> int:
    cfg = parse_args()
    if cfg.self_test:
        self_test()
        return 0
    required = [cfg.source, cfg.output, cfg.report, cfg.preview]
    if any(value is None for value in required):
        raise SystemExit(
            "--source --output --report --preview are required"
        )
    source = Image.open(cfg.source).convert("RGBA")
    output, report = repair(source)
    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    cfg.report.parent.mkdir(parents=True, exist_ok=True)
    output.save(cfg.output, "PNG", optimize=True)
    report["sourceSha256"] = sha256(cfg.source)
    report["outputSha256"] = sha256(cfg.output)
    cfg.report.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    render_preview(source, output, cfg.preview)
    print(
        json.dumps(
            {
                "output": str(cfg.output),
                "repairedFrames": len(report["repairedFrames"]),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
