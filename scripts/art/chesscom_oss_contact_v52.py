#!/usr/bin/env python3
"""Assemble actual Blender PNGs into review-only 8-view and tactical-zoom sheets."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def create_contact(output_dir: Path):
    images = []
    for index, direction in enumerate(DIRECTIONS):
        image = output_dir / f"view-{index:02d}-{direction}.png"
        with Image.open(image) as original:
            original.load()
            if original.size != (256, 384) or original.mode not in ("RGBA", "RGB"):
                raise ValueError("incorrect-blender-frame:" + direction)
            images.append(original.convert("RGBA"))

    background = (10, 20, 27, 255)
    sheet = Image.new("RGBA", (4 * 280 + 20, 2 * 452 + 64), background)
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 15), "CHESSCOM // CC0 TECHNICAL REFERENCE - NOT SVEN", fill="#dfac62")
    draw.text((20, 35), "Real Blender renders | 8 views | artistic approval required", fill="#a7beca")

    tactical = Image.new("RGB", (4 * 220 + 24, 2 * 214 + 64), (12, 21, 26))
    td = ImageDraw.Draw(tactical)
    td.text((14, 14), "ACTUAL 72px CHARACTER TEST // NOT APPROVED", fill="#dfac62")
    for i, (label, source) in enumerate(zip(DIRECTIONS, images)):
        col, row = i % 4, i // 4
        x, y = 20 + 280 * col, 64 + 452 * row
        draw.rounded_rectangle((x - 4, y - 4, x + 260, y + 413), radius=8,
                               fill=(20, 33, 43), outline=(52, 70, 82))
        sheet.alpha_composite(source, (x, y + 20))
        draw.text((x + 105, y + 405), label, fill="#e4c89c")
        tx, ty = 16 + 220 * col, 52 + 214 * row
        td.rectangle((tx, ty, tx + 205, ty + 183), fill=(24, 35, 43))
        # At actual tactical size, the character is 72 pixels tall.
        small = source.resize((48, 72), Image.Resampling.LANCZOS)
        tactical.paste(small, (tx + 77, ty + 45), small)
        td.text((tx + 96, ty + 165), label, fill="#c1d7df")
    sheet.convert("RGB").save(output_dir / "eight-view-contact.png", optimize=True)
    tactical.save(output_dir / "tactical-72px-contact.png", optimize=True)
    return output_dir / "eight-view-contact.png"


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output-dir", type=Path, required=True)
    args = p.parse_args()
    print(create_contact(args.output_dir))
