#!/usr/bin/env python3
"""Draw procedural pixel-art billboard sources for Chronicles creatures.

    python3 scripts/art/build_chronicles_procedural_sprites.py [--preview sheet.png]

Some creatures have no painted SpriteCook art yet. This draws them as original
pixel art in the same spirit (short colour ramps, 4x4 Bayer dither, one dark
contour per silhouette, lit from the upper left) and writes the same source
files the SpriteCook ones use: `scripts/art/chronicles_sprites/source/
<sprite>.<pose>.png` with poses idle, attack, hurt and dead. Then
`pack_chronicles_sprites.py` packs them into runtime sheets.

They are placeholders. To replace one with SpriteCook art, drop the painted
PNGs on the same paths, record their asset ids in `spritecook-assets.json`,
remove the sprite from PROCEDURAL in this script and from
`procedural-sprites.json`, and pack again. Deterministic: same script ->
same bytes.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "scripts/art/chronicles_sprites/source"
MANIFEST = REPO / "scripts/art/chronicles_sprites/procedural-sprites.json"
BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]


def hexrgb(value: int) -> tuple[int, int, int, int]:
    return ((value >> 16) & 255, (value >> 8) & 255, value & 255, 255)


def ramp(*values: int) -> list:
    return [hexrgb(v) for v in values]


OUTLINE = hexrgb(0x120c08)
FUR = ramp(0x1e1814, 0x3a2e26, 0x584638, 0x786250, 0x9a826a, 0xbaa288)
PINK = ramp(0x5a2228, 0x8a3a40, 0xb85a5e, 0xdc8486, 0xf4b0b0)
GOBLIN = ramp(0x10200c, 0x22401a, 0x3a6428, 0x568a38, 0x78ac4c, 0xa0cc6a)
RAG = ramp(0x1a120a, 0x34241a, 0x50382a, 0x6c4e3a, 0x8a6a50)
WOOD = ramp(0x1e1008, 0x351d0e, 0x4f2d16, 0x6b4021, 0x8a5630, 0xa86e40)
SHELL = ramp(0x3a1408, 0x6a2a10, 0x9a4a1e, 0xc4703a, 0xe0a070, 0xf6dcc4)
SALT = ramp(0x8a8c90, 0xb4b8bc, 0xd8dcdc, 0xf4f6f4)
DROWNED = ramp(0x142424, 0x264040, 0x3e5e5a, 0x5a7e76, 0x7ea098, 0xa8c4ba)
WEED = ramp(0x081a0e, 0x12301a, 0x1e4a26, 0x2e6634, 0x488a48)
CLOTH = ramp(0x14161e, 0x262a36, 0x3a404e, 0x525a6a, 0x6e7686)
ROBE = ramp(0x101410, 0x202a1e, 0x34422e, 0x4a5c40, 0x627656)
HAG = ramp(0x2a2a1a, 0x4a4a30, 0x6a6a46, 0x8c8a60, 0xaeaa80)
ORB = ramp(0x0c3a10, 0x1a6a20, 0x34a030, 0x6ad850, 0xb4ff98, 0xf0fff0)
EYE_RED = hexrgb(0xff3a2a)
EYE_YEL = hexrgb(0xffe050)
EYE_GRN = hexrgb(0xa8ff80)
BONE = ramp(0x6a6450, 0x9a927a, 0xc8c0a4, 0xeee8d4)


class Sprite:
    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.img.load()

    def pick(self, colours: list, value: float, x: int, y: int) -> tuple:
        value = max(0.0, min(1.0, value))
        dithered = value + (BAYER4[(y % 4) * 4 + (x % 4)] / 16 - 0.5) / (len(colours) - 1)
        index = max(0, min(len(colours) - 1, round(dithered * (len(colours) - 1))))
        return colours[index]

    def shape(self, draw_fns, colours: list, light, outline: bool = True) -> None:
        mask = Image.new("L", (self.w, self.h), 0)
        draw = ImageDraw.Draw(mask)
        for fn in draw_fns if isinstance(draw_fns, (list, tuple)) else [draw_fns]:
            fn(draw)
        mp = mask.load()
        for y in range(self.h):
            for x in range(self.w):
                if mp[x, y]:
                    self.px[x, y] = self.pick(colours, light(x, y), x, y)
        if not outline:
            return
        for y in range(self.h):
            for x in range(self.w):
                if not mp[x, y]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < self.w and 0 <= ny < self.h) or not mp[nx, ny]:
                        self.px[x, y] = OUTLINE
                        break

    def dot(self, x: int, y: int, colour: tuple) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = colour


def ellipse(cx, cy, rx, ry):
    return lambda d: d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)


def poly(*points):
    return lambda d: d.polygon(list(points), fill=255)


def line(points, width):
    return lambda d: d.line(points, fill=255, width=width, joint="curve")


def lit(cx: float, cy: float, r: float, base: float = 0.55):
    """Round form lit from the upper left."""
    return lambda x, y: base + 0.4 * (1 - min(1.0, math.hypot(x - (cx - r * 0.35), y - (cy - r * 0.4)) / (r * 1.6)))


# ─── Creatures (pose: 'idle' or 'attack') ──────────────────────────────────
def sewer_rat(pose: str) -> Image.Image:
    s = Sprite(72, 52)
    lunge = 4 if pose == "attack" else 0
    s.shape(line([(60, 44), (68, 36), (66, 24), (70, 16)], 3), PINK, lambda x, y: 0.55)
    s.shape(ellipse(42, 36, 20, 12), FUR, lit(42, 36, 20))
    s.shape([ellipse(26, 30 - lunge, 13, 11), poly((14, 30 - lunge), (4, 36 - lunge), (14, 40 - lunge))], FUR, lit(24, 30, 13))
    s.shape([ellipse(22, 20 - lunge, 5, 6), ellipse(33, 19 - lunge, 5, 6)], PINK, lambda x, y: 0.6)
    s.shape(ellipse(5, 36 - lunge, 3, 2), PINK, lambda x, y: 0.75)
    for ex in (17, 25):
        s.dot(ex, 29 - lunge, EYE_RED)
        s.dot(ex + 1, 29 - lunge, EYE_RED)
    if pose == "attack":
        s.shape(poly((5, 38 - lunge), (16, 37 - lunge), (16, 46 - lunge), (6, 42 - lunge)), PINK, lambda x, y: 0.2)
        for tx in (8, 11):
            s.shape(poly((tx, 38 - lunge), (tx + 2, 38 - lunge), (tx + 1, 42 - lunge)), BONE, lambda x, y: 0.9, outline=False)
    else:
        s.shape(poly((6, 39), (10, 39), (8, 43)), BONE, lambda x, y: 0.9, outline=False)
    for lx in (26, 34, 50, 58):
        s.shape(line([(lx, 44), (lx - 2, 50)], 3), FUR, lambda x, y: 0.35)
    return s.img


def ash_goblin(pose: str) -> Image.Image:
    s = Sprite(64, 76)
    raise_ = pose == "attack"
    # Club in the right hand (screen left): raised overhead to strike.
    if raise_:
        s.shape(line([(18, 34), (10, 8)], 4), WOOD, lambda x, y: 0.55)
        s.shape(ellipse(9, 7, 6, 6), WOOD, lambda x, y: 0.7)
    else:
        s.shape(line([(14, 50), (8, 66)], 4), WOOD, lambda x, y: 0.55)
        s.shape(ellipse(7, 68, 5, 5), WOOD, lambda x, y: 0.65)
    body = [
        poly((22, 36), (42, 36), (44, 58), (20, 58)),
        line([(22, 38), (17, 50) if not raise_ else (18, 32)], 6),
        line([(42, 38), (48, 54)], 6),
        line([(26, 58), (24, 74)], 6),
        line([(38, 58), (40, 74)], 6),
        ellipse(32, 26, 11, 10),
        poly((22, 22), (6, 14), (22, 30)),
        poly((42, 22), (58, 14), (42, 30)),
    ]
    s.shape(body, GOBLIN, lit(30, 30, 18))
    s.shape(poly((20, 52), (44, 52), (46, 62), (18, 62)), RAG, lambda x, y: 0.5 - (x - 18) / 80)
    for ex in (28, 35):
        s.dot(ex, 25, EYE_YEL)
        s.dot(ex + 1, 25, EYE_YEL)
    s.shape(poly((27, 31), (37, 31), (36, 33), (28, 33)), RAG, lambda x, y: 0.05, outline=False)
    s.dot(29, 31, BONE[3])
    s.dot(34, 31, BONE[3])
    return s.img


def salt_crab(pose: str) -> Image.Image:
    s = Sprite(80, 56)
    open_ = pose == "attack"
    for side in (-1, 1):
        for i in range(3):
            x0 = 40 + side * (12 + i * 5)
            s.shape(line([(x0, 38), (x0 + side * 8, 44), (x0 + side * 10, 54)], 3), SHELL, lambda x, y: 0.4)
    s.shape(ellipse(40, 34, 22, 13), SHELL, lit(40, 34, 22))
    # Salt crust on the shell.
    for i in range(16):
        x = 24 + (i * 7) % 32
        y = 26 + (i * 5) % 9
        s.dot(x, y, SALT[3])
        s.dot(x + 1, y, SALT[2])
    for side in (-1, 1):
        cx = 40 + side * (24 if open_ else 22)
        cy = 14 if open_ else 20
        s.shape(line([(40 + side * 14, 30), (cx, cy + 6)], 5), SHELL, lambda x, y: 0.5)
        s.shape(ellipse(cx, cy, 8, 7), SHELL, lit(cx, cy, 8))
        gap = 5 if open_ else 1
        s.shape(poly((cx - 3, cy - 2), (cx + side * 4, cy - 10 - gap), (cx + side * 7, cy - 4)), SHELL, lambda x, y: 0.75)
    for ex in (35, 45):
        s.shape(line([(ex, 24), (ex, 17)], 2), SHELL, lambda x, y: 0.5)
        s.shape(ellipse(ex, 16, 2, 2), CLOTH, lambda x, y: 0.05)
        s.dot(ex - 1, 15, SALT[3])
    return s.img


def drowned(pose: str) -> Image.Image:
    s = Sprite(60, 84)
    reach = pose == "attack"
    arm_end_l = (6, 30) if reach else (12, 56)
    arm_end_r = (54, 30) if reach else (50, 58)
    body = [
        poly((20, 30), (40, 30), (42, 60), (18, 60)),
        line([(20, 32), arm_end_l], 6),
        line([(40, 32), arm_end_r], 6),
        line([(24, 60), (22, 82)], 6),
        line([(36, 60), (38, 82)], 6),
        ellipse(30, 20, 9, 11),
    ]
    s.shape(body, DROWNED, lit(28, 28, 22))
    s.shape(poly((18, 34), (42, 34), (44, 66), (38, 62), (32, 68), (26, 62), (16, 66)), CLOTH,
            lambda x, y: 0.5 - (x - 16) / 70)
    # Seaweed hair and strands over the shoulders.
    s.shape([poly((20, 14), (30, 7), (40, 14), (40, 17), (20, 17)),
             poly((19, 14), (23, 14), (22, 36), (18, 30)),
             poly((37, 14), (41, 14), (42, 32), (38, 36))],
            WEED, lambda x, y: 0.7 - (y - 7) / 40)
    for ex in (26, 33):
        s.dot(ex, 20, OUTLINE)
        s.dot(ex + 1, 20, EYE_GRN)
    s.shape(poly((26, 25), (34, 25), (33, 28), (27, 28)), CLOTH, lambda x, y: 0.0, outline=False)
    for i in range(5):
        s.dot(20 + i * 5, 62 + (i % 2) * 3, WEED[4])
    return s.img


def mire_witch(pose: str) -> Image.Image:
    s = Sprite(72, 92)
    cast = pose == "attack"
    top = (58, 6) if cast else (60, 18)
    s.shape(line([(60, 88), top], 3), WOOD, lambda x, y: 0.55)
    glow = ORB if cast else ORB[:5]
    s.shape(ellipse(top[0], top[1] - 2, 6 if cast else 5, 6 if cast else 5), glow, lambda x, y: 1.0 - math.hypot(x - top[0] + 2, y - top[1]) / 8)
    if cast:
        for i in range(8):
            a = i * math.pi / 4
            s.dot(int(top[0] + math.cos(a) * 9), int(top[1] - 2 + math.sin(a) * 9), ORB[4])
    # Hunched robe and hood.
    s.shape([poly((14, 90), (20, 40), (30, 24), (46, 22), (54, 34), (56, 90))], ROBE, lit(30, 40, 30))
    s.shape(poly((24, 40), (30, 18), (44, 16), (52, 30), (46, 46), (30, 48)), ROBE, lambda x, y: 0.55 - (x - 24) / 60)
    s.shape(ellipse(40, 34, 8, 9), HAG, lit(40, 34, 8))
    s.shape(poly((35, 31), (24, 40), (27, 42), (35, 37)), HAG, lambda x, y: 0.62)
    s.dot(29, 39, HAG[0])
    for ex in (37, 43):
        s.dot(ex, 31, OUTLINE)
        s.dot(ex + 1, 31, EYE_GRN)
    s.shape(poly((35, 39), (45, 38), (43, 41), (36, 41)), ROBE, lambda x, y: 0.0, outline=False)
    s.dot(39, 40, BONE[3])
    s.dot(42, 39, BONE[3])
    hand = (56, 52) if not cast else (56, 40)
    s.shape(line([(44, 50), hand], 5), ROBE, lambda x, y: 0.45)
    s.shape(ellipse(hand[0] + 2, hand[1], 3, 3), HAG, lambda x, y: 0.65)
    for i in range(6):
        s.dot(18 + i * 7, 88 - (i % 3) * 2, WEED[3])
    return s.img


PROCEDURAL = {
    "sewer-rat": sewer_rat,
    "ash-goblin": ash_goblin,
    "salt-crab": salt_crab,
    "drowned": drowned,
    "mire-witch": mire_witch,
}


def hurt(idle: Image.Image) -> Image.Image:
    """Recoil: a red flash over the body, nudged back and tilted."""
    flash = idle.copy()
    px = flash.load()
    for y in range(flash.height):
        for x in range(flash.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (min(255, r + (255 - r) * 3 // 5), g * 3 // 5, b * 3 // 5, a)
    return flash.rotate(-8, resample=Image.NEAREST, expand=True)


def dead(idle: Image.Image) -> Image.Image:
    """Wide beasts belly up, upright ones on their side; darker."""
    if idle.width > idle.height:
        body = idle.transpose(Image.FLIP_TOP_BOTTOM)
    else:
        body = idle.rotate(90, resample=Image.NEAREST, expand=True)
    px = body.load()
    for y in range(body.height):
        for x in range(body.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (int(r * 0.6), int(g * 0.6), int(b * 0.6), a)
    return body.crop(body.getbbox())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", help="also write a 4x contact sheet here")
    args = parser.parse_args()
    SOURCE.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, draw in PROCEDURAL.items():
        idle = draw("idle")
        poses = {"idle": idle, "attack": draw("attack"), "hurt": hurt(idle), "dead": dead(idle)}
        for pose, image in poses.items():
            image.save(SOURCE / f"{name}.{pose}.png", "PNG", optimize=True)
        rows.append(list(poses.values()))
        print(f"wrote {name}: {', '.join(poses)}")
    MANIFEST.write_text(json.dumps({
        "_comment": "Creatures drawn by build_chronicles_procedural_sprites.py: placeholders until painted SpriteCook art replaces them.",
        "sprites": sorted(PROCEDURAL),
    }, indent=2) + "\n")
    if args.preview:
        cell = 100
        sheet = Image.new("RGBA", (cell * 4 * 4, cell * 4 * len(rows)), (60, 60, 64, 255))
        for r, images in enumerate(rows):
            for c, image in enumerate(images):
                big = image.resize((image.width * 4, image.height * 4), Image.NEAREST)
                sheet.alpha_composite(big, (c * cell * 4, r * cell * 4))
        sheet.save(args.preview)


if __name__ == "__main__":
    main()
