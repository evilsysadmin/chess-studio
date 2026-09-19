#!/usr/bin/env python3
"""Shared PNG contract checks for Pawn Slug Godot atlases.

Pillow-only on purpose: the CI art jobs install just Pillow.
Import by sibling name (`from png_contract import ...`); the art scripts run
with scripts/art as sys.path[0].
"""
from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageChops

# WebGL2 desktop drivers commonly expose 16384; the Godot web export samples the atlas as one texture.
MAX_TEXTURE_SIDE = 16384
# Ancillary chunks that make a viewer/engine alter the stored colors.
COLOR_CHUNKS = frozenset({"iCCP", "gAMA", "sRGB", "cHRM", "cICP", "mDCV", "cLLI"})
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def png_chunk_names(data: bytes) -> list[str]:
    if not data.startswith(PNG_SIGNATURE):
        return []
    names: list[str] = []
    pos = len(PNG_SIGNATURE)
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        names.append(data[pos + 4:pos + 8].decode("latin-1"))
        pos += 12 + length
    return names


def dirty_transparent_pixels(image: Image.Image) -> int:
    """Count alpha=0 pixels whose RGB is not zero (halos under transparency)."""
    r, g, b, a = image.convert("RGBA").split()
    transparent = a.point(lambda v: 255 if v == 0 else 0)
    coloured = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v else 0)
    return ImageChops.multiply(transparent, coloured).histogram()[255]


def png_contract_errors(path: Path) -> list[str]:
    """Return every violation of the strict Godot PNG contract for `path`."""
    errors: list[str] = []
    data = path.read_bytes()
    with Image.open(path) as image:
        if image.format != "PNG" or image.mode != "RGBA":
            errors.append(f"PNG must be 8-bit RGBA, got {image.format}/{image.mode}")
        if max(image.size) > MAX_TEXTURE_SIDE:
            errors.append(f"atlas side {max(image.size)}px exceeds {MAX_TEXTURE_SIDE}px texture limit")
        if int(image.info.get("interlace", 0) or 0):
            errors.append("PNG must not be interlaced")
        dirty = dirty_transparent_pixels(image)
    if dirty:
        errors.append(f"{dirty} fully transparent pixels carry non-zero RGB (halo under alpha=0)")
    colour = sorted(COLOR_CHUNKS.intersection(png_chunk_names(data)))
    if colour:
        errors.append(f"PNG carries colour-altering chunks: {', '.join(colour)}")
    return errors


def require_png_contract(path: Path) -> None:
    errors = png_contract_errors(path)
    if errors:
        raise SystemExit("PNG contract violations:\n" + "\n".join(errors))
