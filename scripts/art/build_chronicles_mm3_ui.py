#!/usr/bin/env python3
"""Build the Chronicles MM3-style UI chrome: carved stone, frame, gems, sandstone.

    python3 scripts/art/build_chronicles_mm3_ui.py [--out frontend/src/assets/chronicles/ui]

Original pixel art in the spirit of early-90s VGA RPG interfaces: a light
grey marble slab, a carved frame with a Greek-key band (9-slice, 16 px
border), a faceted red gem in a gold bezel, and an ochre sandstone for info
panels. Everything is drawn at 1x from short colour ramps with a 4x4 Bayer
dither; CSS scales it by integer factors with `image-rendering: pixelated`.
Deterministic: same script -> same bytes (PNG, no metadata).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]

BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]


def hexrgb(value: int) -> tuple[int, int, int, int]:
    return ((value >> 16) & 255, (value >> 8) & 255, value & 255, 255)


STONE = [hexrgb(v) for v in (0x4c4c52, 0x6e6e74, 0x8e8e93, 0xa9a9ad, 0xc1c1c4, 0xd6d6d8, 0xeaeaea)]
SAND = [hexrgb(v) for v in (0x5a2e12, 0x7f441b, 0x9c5a25, 0xb87033, 0xcf8743, 0xe2a35c)]
GOLD = [hexrgb(v) for v in (0x5c3b0a, 0x8a5c14, 0xbf8a2a, 0xe8bd52, 0xfff0a8)]
RUBY = [hexrgb(v) for v in (0x3d0507, 0x6e0a0e, 0xa5161a, 0xd8352c, 0xff8a70, 0xffffff)]
SAPPHIRE = [hexrgb(v) for v in (0x0a1a4a, 0x14328c, 0x2357c8, 0x3f86ea, 0x8cc4ff, 0xffffff)]


def hash2(x: int, y: int, salt: int) -> float:
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def value_noise(x: int, y: int, size: int, cells: int, salt: int) -> float:
    u, v = x * cells / size, y * cells / size
    x0, y0 = int(u), int(v)
    fx, fy = u - x0, v - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)

    def s(dx: int, dy: int) -> float:
        return hash2((x0 + dx) % cells, (y0 + dy) % cells, salt)

    a = s(0, 0) * (1 - fx) + s(1, 0) * fx
    b = s(0, 1) * (1 - fx) + s(1, 1) * fx
    return a * (1 - fy) + b * fy


def ramp_pick(ramp: list, value: float, x: int, y: int) -> tuple:
    dithered = value + (BAYER4[(y % 4) * 4 + (x % 4)] / 16 - 0.5) / (len(ramp) - 1)
    index = max(0, min(len(ramp) - 1, round(dithered * (len(ramp) - 1))))
    return ramp[index]


def marble(x: int, y: int, size: int, salt: int = 1) -> float:
    base = value_noise(x, y, size, 4, salt) - 0.5
    fine = value_noise(x, y, size, 16, salt + 1) - 0.5
    vein = abs(value_noise(x, y, size, 6, salt + 2) - 0.5)
    v = 0.66 + base * 0.32 + fine * 0.14
    if vein < 0.035:
        v -= 0.22
    return v


def stone_tile(size: int = 64) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        for x in range(size):
            img.putpixel((x, y), ramp_pick(STONE, marble(x, y, size), x, y))
    return img


def sand_tile(size: int = 32) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        for x in range(size):
            v = 0.62 + (value_noise(x, y, size, 4, 7) - 0.5) * 0.35 + (hash2(x, y, 9) - 0.5) * 0.2
            img.putpixel((x, y), ramp_pick(SAND, v, x, y))
    return img


def key_mask(period: int = 8) -> set[tuple[int, int]]:
    """One Greek-key hook, 8 px tall, as groove pixels (x, y) in a unit."""
    pts: set[tuple[int, int]] = set()

    def line(x0: int, y0: int, x1: int, y1: int) -> None:
        for xx in range(min(x0, x1), max(x0, x1) + 1):
            for yy in range(min(y0, y1), max(y0, y1) + 1):
                pts.add((xx % period, yy))

    line(0, 7, period, 7)   # baseline that links the units
    line(0, 0, 0, 7)
    line(0, 0, 6, 0)
    line(6, 0, 6, 5)
    line(2, 5, 6, 5)
    line(2, 2, 2, 5)
    line(2, 2, 4, 2)
    return pts


def frame(size: int = 48, border: int = 16) -> Image.Image:
    """9-slice frame: bevelled stone with a carved Greek-key band."""
    img = Image.new("RGBA", (size, size))
    key = key_mask()
    for y in range(size):
        for x in range(size):
            v = marble(x, y, size, 3)
            # Distance into the border from the outside (0..border-1) along the nearest edge.
            d = min(x, y, size - 1 - x, size - 1 - y)
            if d >= border:
                img.putpixel((x, y), (0, 0, 0, 0))
                continue
            top_left = min(x, y) <= min(size - 1 - x, size - 1 - y)
            if d == 0 or d == border - 1:
                v = 0.0
            elif d in (1, 2):
                v += 0.3 if top_left else -0.3
            elif d in (border - 3, border - 2):
                v += -0.28 if top_left else 0.28
            else:
                # Band rows 4..11 hold the key; along the edge the unit repeats.
                edge_horizontal = y == d or size - 1 - y == d
                along = x if edge_horizontal else y
                across = d - 4
                in_corner = min(x, size - 1 - x) < border and min(y, size - 1 - y) < border
                if in_corner:
                    # Corner block: a plain raised boss with a cross groove.
                    cx = x if x < border else size - 1 - x
                    cy = y if y < border else size - 1 - y
                    if cx == border // 2 or cy == border // 2:
                        v = 0.08
                    elif cx == border // 2 + 1 or cy == border // 2 + 1:
                        v += 0.3
                elif 0 <= across < 8:
                    if (along % 8, across) in key:
                        v = 0.06
                    elif ((along - 1) % 8, across - 1) in key:
                        v += 0.32  # light lip below/right of the groove: carved relief
            img.putpixel((x, y), ramp_pick(STONE, v, x, y))
    return img


def gem(size: int = 14) -> Image.Image:
    """Faceted ruby in a gold bezel, lit from the top-left."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            dx, dy = (x - c) / (size / 2), (y - c) / (size / 2)
            r = (dx * dx + dy * dy) ** 0.5
            if r > 1.0:
                continue
            if r > 0.72:
                light = 0.75 - (dx + dy) * 0.35
                img.putpixel((x, y), ramp_pick(GOLD, light, x, y))
                continue
            facet = 0.55 - (dx + dy) * 0.45 - r * 0.25
            if abs(dx - dy) < 0.12 or abs(dx + dy) < 0.1:
                facet += 0.18
            img.putpixel((x, y), ramp_pick(RUBY, facet, x, y))
    # Specular glint.
    for px, py in ((4, 4), (5, 4), (4, 5)):
        img.putpixel((px, py), RUBY[-1])
    return img


def diamond(width: int = 28, height: int = 18) -> Image.Image:
    """Cut sapphire seen from the front: a wide rhombus with a table facet
    and a silver rim, set at the bottom centre of the view frame."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cx, cy = (width - 1) / 2, (height - 1) / 2
    for y in range(height):
        for x in range(width):
            dx, dy = (x - cx) / (width / 2), (y - cy) / (height / 2)
            r = abs(dx) + abs(dy)
            if r > 1.0:
                continue
            if r > 0.86:
                img.putpixel((x, y), ramp_pick(STONE, 0.95 - (dx + dy) * 0.3, x, y))
                continue
            table = abs(dx) < 0.36 and abs(dy) < 0.32
            facet = 0.42 - dy * 0.4 - dx * 0.18 + (0.1 if table else 0)
            if abs(abs(dx) - 0.36) < 0.05 or abs(abs(dy) - 0.32) < 0.07:
                facet += 0.16
            img.putpixel((x, y), ramp_pick(SAPPHIRE, facet, x, y))
    for px, py in ((int(cx) - 4, int(cy) - 3), (int(cx) - 3, int(cy) - 3)):
        img.putpixel((px, py), SAPPHIRE[-1])
    return img


def save(img: Image.Image, path: Path) -> None:
    img.save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(REPO)} ({path.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="frontend/src/assets/chronicles/ui")
    out = (REPO / parser.parse_args().out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    save(stone_tile(), out / "mm3-stone.png")
    save(sand_tile(), out / "mm3-sandstone.png")
    save(frame(), out / "mm3-frame.png")
    save(gem(), out / "mm3-gem.png")
    save(diamond(), out / "mm3-sapphire.png")


if __name__ == "__main__":
    main()
