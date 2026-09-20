#!/usr/bin/env python3
"""Strict PNG contract helpers for Pawn Slug art pipelines."""
from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from PIL import Image

FORBIDDEN_COLOR_CHUNKS = {b"iCCP", b"gAMA", b"sRGB", b"cHRM"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_TEXTURE_SIDE = 16384


class PngContractError(ValueError):
    """Raised when a PNG violates the runtime contract."""


def iter_png_chunks(path: Path):
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise PngContractError(f"{path} is not a PNG")
    offset = len(PNG_SIGNATURE)
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(data):
            raise PngContractError(f"{path} has a truncated PNG chunk")
        yield chunk_type, data[offset + 8 : offset + 8 + length]
        offset = end
        if chunk_type == b"IEND":
            return
    raise PngContractError(f"{path} is missing IEND")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = bytearray(rgba.tobytes())
    for i in range(0, len(pixels), 4):
        if pixels[i + 3] == 0:
            pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
    return Image.frombytes("RGBA", rgba.size, bytes(pixels))


def save_png_contract(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clean = clean_transparent_rgb(image)
    clean.save(path, format="PNG", optimize=False, compress_level=9)
    validate_png_contract(path)


def validate_png_contract(path: Path, *, max_side: int = MAX_TEXTURE_SIDE) -> dict:
    chunks = list(iter_png_chunks(path))
    names = {kind for kind, _ in chunks}
    bad_chunks = sorted(name.decode("ascii") for name in names & FORBIDDEN_COLOR_CHUNKS)
    if bad_chunks:
        raise PngContractError(f"{path} contains forbidden color chunks: {bad_chunks}")

    ihdr = next((payload for kind, payload in chunks if kind == b"IHDR"), None)
    if ihdr is None or len(ihdr) != 13:
        raise PngContractError(f"{path} has an invalid IHDR")
    width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack(">IIBBBBB", ihdr)
    if bit_depth != 8 or color_type != 6:
        raise PngContractError(f"{path} must be RGBA8 PNG, got bit_depth={bit_depth} color_type={color_type}")
    if interlace != 0:
        raise PngContractError(f"{path} must be non-interlaced")
    if width > max_side or height > max_side:
        raise PngContractError(f"{path} exceeds texture-side limit {max_side}: {width}x{height}")

    with Image.open(path) as image:
        if image.mode != "RGBA":
            raise PngContractError(f"{path} must decode as RGBA, got {image.mode}")
        rgba = image.tobytes()
        dirty = 0
        for i in range(0, len(rgba), 4):
            if rgba[i + 3] == 0 and (rgba[i] or rgba[i + 1] or rgba[i + 2]):
                dirty += 1
                if dirty >= 1:
                    break
        if dirty:
            raise PngContractError(f"{path} has non-zero RGB under fully transparent pixels")

    return {
        "width": width,
        "height": height,
        "bitDepth": bit_depth,
        "colorType": color_type,
        "interlace": interlace,
        "sha256": sha256_file(path),
    }
