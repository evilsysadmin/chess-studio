#!/usr/bin/env python3
"""Build the Chronicles MM3-style shop interiors (one scene per shopkeeper).

    python3 scripts/art/build_chronicles_shop_rooms.py [--out frontend/src/assets/chronicles/ui/shops]

Original pixel art, drawn at 1x (128x144) from short colour ramps with a 4x4
Bayer dither and a dark 1 px contour on figures, in the spirit of the early-90s
VGA RPG shop screens:

- odo-forge: Odo, a bald, bearded and very muscular smith in a leather apron,
  hammer raised over the anvil, the forge glowing behind him.
- brunna-armory: Brunna behind her counter, racks of swords, spears and axes.
- guild-sanctum: a dark study with spellbook shelves, candles, a green
  cauldron and the hooded archivist at her lectern.

The shopkeepers are placeholders until painted art replaces them; CSS shows
them with `image-rendering: pixelated`. Deterministic: same script -> same
bytes (PNG, no metadata).
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
W, H = 128, 144
BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]


def hexrgb(value: int) -> tuple[int, int, int]:
    return ((value >> 16) & 255, (value >> 8) & 255, value & 255)


def ramp(*values: int) -> list[tuple[int, int, int]]:
    return [hexrgb(v) for v in values]


OUTLINE = hexrgb(0x120c08)
STONE = ramp(0x1c1a1e, 0x2c2a30, 0x403d44, 0x56525a, 0x6e6a70, 0x8a858a)
BRICK = ramp(0x2a120c, 0x461e12, 0x642c18, 0x84401f, 0xa4582a)
WOOD = ramp(0x1e1008, 0x351d0e, 0x4f2d16, 0x6b4021, 0x8a5630, 0xa86e40)
FIRE = ramp(0x5a1004, 0xa02008, 0xd84a10, 0xf08a20, 0xffc848, 0xfff2b0)
IRON = ramp(0x101014, 0x22232a, 0x383a44, 0x55586a, 0x7c8094, 0xb4b8c8)
STEEL = ramp(0x2a2e38, 0x4a505e, 0x6e7686, 0x9aa2b2, 0xc8d0dc, 0xf0f4ff)
BRASS = ramp(0x3a2408, 0x6a4612, 0x9c6e22, 0xc89a3a, 0xeccb6a, 0xfff0b0)
SKIN = ramp(0x3a1a10, 0x6a3420, 0x9a5634, 0xc47c4c, 0xe0a070, 0xf4c898)
LEATHER = ramp(0x1e0e06, 0x38200e, 0x54321a, 0x704628, 0x8c5c36)
HAIR_RED = ramp(0x2a0c04, 0x54200a, 0x863612, 0xb4521c, 0xd8782e)
BEARD = ramp(0x1a1008, 0x342012, 0x52341c, 0x6e4a2a, 0x8c6438)
CLOTH_GREEN = ramp(0x0e1a10, 0x1c3220, 0x2c4a30, 0x3e6442, 0x568256)
ROBE = ramp(0x0a0a1a, 0x16162e, 0x242446, 0x34345e, 0x48487a, 0x6060a0)
BOOK = [ramp(0x2a0808, 0x4e1010, 0x781c1c, 0xa02a2a), ramp(0x081a2a, 0x10304e, 0x1c4a78, 0x2a66a0),
        ramp(0x1a2a08, 0x30480e, 0x4a6a18, 0x668c26), ramp(0x2a1a08, 0x4e3410, 0x78501c, 0xa06e2a)]
POTION = ramp(0x062a08, 0x0c4a10, 0x1a7a1c, 0x34b030, 0x7ae860, 0xd8ffb0)
CANDLE = ramp(0x6a5a3a, 0x9c8a60, 0xcab890, 0xeee0c0)
GLOW = ramp(0x2a1a04, 0x6a4a0a, 0xc89a28, 0xffe070, 0xfffad8)


class Canvas:
    def __init__(self) -> None:
        self.img = Image.new("RGB", (W, H), (0, 0, 0))
        self.px = self.img.load()

    def pick(self, colours: list, value: float, x: int, y: int) -> tuple:
        dithered = value + (BAYER4[(y % 4) * 4 + (x % 4)] / 16 - 0.5) / (len(colours) - 1)
        index = max(0, min(len(colours) - 1, round(dithered * (len(colours) - 1))))
        return colours[index]

    def mask(self, draw_fn) -> Image.Image:
        m = Image.new("L", (W, H), 0)
        draw_fn(ImageDraw.Draw(m))
        return m

    def fill(self, m: Image.Image, colours: list, light, outline: bool = False) -> None:
        mp = m.load()
        for y in range(H):
            for x in range(W):
                if mp[x, y]:
                    self.px[x, y] = self.pick(colours, max(0.0, min(1.0, light(x, y))), x, y)
        if outline:
            self.contour(m)

    def contour(self, m: Image.Image) -> None:
        mp = m.load()
        for y in range(H):
            for x in range(W):
                if not mp[x, y]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < W and 0 <= ny < H) or not mp[nx, ny]:
                        self.px[x, y] = OUTLINE
                        break

    def shape(self, draw_fn, colours: list, light, outline: bool = True) -> Image.Image:
        m = self.mask(draw_fn)
        self.fill(m, colours, light, outline)
        return m

    def dot(self, x: int, y: int, colour: tuple) -> None:
        if 0 <= x < W and 0 <= y < H:
            self.px[x, y] = colour


def hash2(x: int, y: int, salt: int) -> float:
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def room(c: Canvas, wall: list, floor: list, horizon: int, light, salt: int, *, brick_h: int = 7, brick_w: int = 14) -> None:
    """Back wall of coursed blocks over a plank floor that recedes to the horizon."""
    for y in range(horizon):
        row = y // brick_h
        for x in range(W):
            offset = (row % 2) * (brick_w // 2)
            mortar = y % brick_h == 0 or (x + offset) % brick_w == 0
            v = light(x, y) + (hash2((x + offset) // brick_w, row, salt) - 0.5) * 0.18
            c.px[x, y] = c.pick(wall, max(0, v - (0.32 if mortar else 0)), x, y)
    for y in range(horizon, H):
        depth = (y - horizon) / (H - horizon)
        for x in range(W):
            # Planks converge toward the centre of the back wall.
            u = (x - W / 2) / (0.55 + depth * 0.9)
            seam = abs(((u / 11) % 1) - 0.5) > 0.46
            v = light(x, y) * (0.55 + depth * 0.45) + (hash2(int(u // 11), 0, salt + 3) - 0.5) * 0.12
            c.px[x, y] = c.pick(floor, max(0, v - (0.25 if seam else 0)), x, y)
    for x in range(W):
        c.px[x, horizon] = OUTLINE


def ellipse(cx: float, cy: float, rx: float, ry: float):
    return lambda d: d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)


def poly(*points):
    return lambda d: d.polygon(list(points), fill=255)


def rect(x0, y0, x1, y1):
    return lambda d: d.rectangle((x0, y0, x1, y1), fill=255)


def lit_from(lx: float, ly: float, base: float = 0.55, reach: float = 90, amount: float = 0.45):
    def light(x: int, y: int) -> float:
        return base + amount * max(0.0, 1 - math.hypot(x - lx, y - ly) / reach) - 0.12
    return light


# ─── Odo's forge ────────────────────────────────────────────────────────────
def odo_forge() -> Image.Image:
    c = Canvas()
    fire = (22, 70)
    warm = lit_from(*fire, base=0.35, reach=110, amount=0.6)
    room(c, STONE, WOOD, 92, warm, 11)

    # Hearth: brick arch, coals and a hood with a chimney up the wall.
    c.shape(rect(0, 18, 18, 92), BRICK, lambda x, y: warm(x, y) + 0.1)
    c.shape(rect(0, 30, 44, 92), BRICK, lambda x, y: warm(x, y))
    c.shape(poly((0, 30), (50, 30), (40, 18), (0, 18)), IRON, lambda x, y: 0.35 + (50 - x) / 160)
    c.shape(ellipse(22, 74, 17, 15), FIRE, lambda x, y: 1.05 - math.hypot(x - 22, y - 80) / 22, outline=False)
    for i in range(14):
        x = 9 + int(hash2(i, 1, 5) * 26)
        y = 79 + int(hash2(i, 2, 5) * 8)
        c.dot(x, y, FIRE[5])
        c.dot(x + 1, y, FIRE[4])
    c.shape(rect(6, 86, 40, 92), STONE, lambda x, y: 0.4)

    # Wall: hanging tongs, a horseshoe, a breastplate and a round shield (the trade is armour).
    c.shape(rect(52, 22, 53, 46), IRON, lambda x, y: 0.5)
    c.shape(rect(56, 22, 57, 44), IRON, lambda x, y: 0.45)
    c.shape(lambda d: d.arc((60, 26, 70, 38), 200, 520, fill=255, width=2), IRON, lambda x, y: 0.6, outline=False)
    c.shape(poly((92, 20), (114, 20), (118, 34), (112, 50), (94, 50), (88, 34)), STEEL,
            lambda x, y: 0.45 + (118 - x) / 70 - (y - 20) / 90)
    c.shape(rect(102, 22, 103, 48), STEEL, lambda x, y: 0.95, outline=False)
    c.shape(ellipse(114, 70, 10, 10), WOOD, lambda x, y: 0.55 - math.hypot(x - 110, y - 66) / 40)
    c.shape(ellipse(114, 70, 3, 3), BRASS, lambda x, y: 0.8 - (x - 112) / 10)

    # Odo: broad shoulders, bald head, red beard, leather apron, hammer raised.
    cx = 68
    skin = lambda x, y: 0.62 + (fire[0] - x) / -150 * -1 * 0.0 + max(0, 1 - math.hypot(x - 40, y - 60) / 80) * 0.45 - 0.12
    # One silhouette of skin (arms, shoulders, torso, neck, head) so the body
    # reads as a single figure with one contour, then hammer and props on top.
    c.shape(rect(cx - 33, 10, cx - 31, 30), WOOD, lambda x, y: 0.6)
    c.shape(rect(cx - 41, 6, cx - 23, 14), IRON, lambda x, y: 0.75 - (x - cx + 41) / 40 - (y - 6) / 30)
    body = [
        poly((cx - 22, 74), (cx - 34, 52), (cx - 27, 48), (cx - 14, 68)),
        poly((cx - 34, 52), (cx - 36, 30), (cx - 28, 29), (cx - 27, 48)),
        ellipse(cx - 32, 30, 5, 5),
        ellipse(cx - 21, 74, 7, 6),
        poly((cx - 24, 70), (cx + 24, 70), (cx + 18, 112), (cx - 18, 112)),
        poly((cx + 18, 72), (cx + 29, 76), (cx + 30, 96), (cx + 20, 97)),
        poly((cx + 20, 92), (cx + 30, 94), (cx + 18, 106), (cx + 8, 103)),
        ellipse(cx + 23, 75, 7, 6),
        ellipse(cx + 9, 103, 4, 3),
        rect(cx - 7, 60, cx + 7, 72),
        ellipse(cx, 52, 11, 13),
    ]
    c.shape(lambda d: [fn(d) for fn in body], SKIN, skin)
    # Pectorals and abdomen shading.
    for y in range(76, 86):
        for x in range(cx - 18, cx + 18):
            if abs(x - cx) < 1 and c.px[x, y] != OUTLINE:
                c.px[x, y] = SKIN[1]
    # Muscle lines in the darkest skin tone: pecs, deltoids, biceps, abs.
    muscle = lambda x, y: 0.05
    for box, start, end in (((cx - 19, 70, cx - 1, 88), 10, 170), ((cx + 1, 70, cx + 19, 88), 10, 170),
                            ((cx - 28, 66, cx - 14, 80), 180, 330), ((cx + 15, 68, cx + 31, 82), 210, 360),
                            ((cx - 37, 34, cx - 27, 52), 270, 450), ((cx + 19, 78, cx + 31, 96), 90, 270)):
        c.shape(lambda d, box=box, start=start, end=end: d.arc(box, start, end, fill=255, width=1), SKIN, muscle, outline=False)
    for y in (84, 87):
        c.shape(rect(cx - 6, y, cx + 6, y), SKIN, muscle, outline=False)
    # Leather apron with straps.
    c.shape(poly((cx - 14, 88), (cx + 14, 88), (cx + 18, 124), (cx - 18, 124)), LEATHER,
            lambda x, y: 0.62 - (x - cx + 14) / 70)
    c.shape(rect(cx - 13, 70, cx - 10, 88), LEATHER, lambda x, y: 0.5)
    c.shape(rect(cx + 10, 70, cx + 13, 88), LEATHER, lambda x, y: 0.4)
    # Beard and face.
    c.shape(poly((cx - 11, 54), (cx + 11, 54), (cx + 9, 68), (cx, 76), (cx - 9, 68)), HAIR_RED,
            lambda x, y: 0.7 - (x - cx + 11) / 50 - (y - 54) / 70)
    c.shape(rect(cx - 5, 60, cx + 5, 61), SKIN, lambda x, y: 0.3, outline=False)
    for ex in (cx - 5, cx + 4):
        c.dot(ex, 50, OUTLINE)
        c.dot(ex + 1, 50, OUTLINE)
    c.shape(rect(cx - 8, 47, cx - 2, 47), HAIR_RED, lambda x, y: 0.2, outline=False)
    c.shape(rect(cx + 2, 47, cx + 8, 47), HAIR_RED, lambda x, y: 0.2, outline=False)
    c.dot(cx - 6, 42, SKIN[5])
    c.dot(cx - 5, 41, SKIN[5])

    # Anvil on a stump, in front of him.
    c.shape(rect(cx - 10, 118, cx + 10, 144), WOOD, lambda x, y: 0.5 - (x - cx) / 60)
    c.shape(poly((cx - 26, 104), (cx + 22, 104), (cx + 30, 108), (cx + 12, 112), (cx + 8, 118),
                 (cx - 8, 118), (cx - 12, 112), (cx - 26, 110)), IRON,
            lambda x, y: 0.7 - (y - 104) / 18 + max(0, 1 - math.hypot(x - 40, y - 100) / 70) * 0.3)
    c.shape(rect(cx - 6, 104, cx + 14, 105), STEEL, lambda x, y: 0.95, outline=False)
    # A glowing blank on the anvil.
    c.shape(rect(cx - 4, 101, cx + 10, 103), FIRE, lambda x, y: 0.85)
    return c.img


# ─── Brunna's armoury ───────────────────────────────────────────────────────
def brunna_armory() -> Image.Image:
    c = Canvas()
    torch = (112, 30)
    light = lit_from(*torch, base=0.42, reach=130, amount=0.45)
    room(c, STONE, WOOD, 88, light, 23)

    # Torch on the right wall.
    c.shape(rect(111, 32, 113, 46), WOOD, lambda x, y: 0.5)
    c.shape(ellipse(112, 28, 4, 6), FIRE, lambda x, y: 1.0 - abs(x - 112) / 6 - (y - 22) / 18, outline=False)

    # Weapon rack: two wooden rails with swords, spears and axes.
    c.shape(rect(6, 18, 100, 21), WOOD, lambda x, y: light(x, y) + 0.05)
    c.shape(rect(6, 70, 100, 73), WOOD, lambda x, y: light(x, y) - 0.05)
    for i, x in enumerate(range(12, 98, 11)):
        kind = i % 3
        if kind == 0:  # sword, point up
            c.shape(poly((x, 8), (x + 2, 12), (x + 2, 52), (x - 2, 52), (x - 2, 12)), STEEL,
                    lambda px, py, x=x: 0.8 - (px - x + 2) / 8 + light(px, py) * 0.2)
            c.shape(rect(x - 5, 52, x + 5, 54), BRASS, lambda px, py: 0.7)
            c.shape(rect(x - 1, 55, x + 1, 64), LEATHER, lambda px, py: 0.5)
            c.shape(ellipse(x, 66, 2, 2), BRASS, lambda px, py: 0.8)
        elif kind == 1:  # spear
            c.shape(rect(x - 1, 14, x + 1, 80), WOOD, lambda px, py: 0.55)
            c.shape(poly((x, 3), (x + 3, 10), (x, 16), (x - 3, 10)), STEEL, lambda px, py, x=x: 0.85 - (px - x) / 8)
        else:  # axe
            c.shape(rect(x - 1, 22, x + 1, 74), WOOD, lambda px, py: 0.5)
            c.shape(poly((x + 1, 24), (x + 9, 18), (x + 10, 36), (x + 1, 32)), STEEL, lambda px, py, x=x: 0.75 - (px - x) / 16)
    # A pair of shields on the wall, below the rack.
    c.shape(poly((18, 76), (34, 76), (34, 86), (26, 92), (18, 86)), BRASS, lambda x, y: 0.75 - (x - 18) / 30)
    c.shape(ellipse(88, 82, 8, 8), WOOD, lambda x, y: 0.6 - math.hypot(x - 84, y - 78) / 24)

    # Brunna: sturdy, red braid, leather vest over a green shirt, arms on the counter.
    cx = 58
    skin = lambda x, y: 0.55 + max(0, 1 - math.hypot(x - torch[0], y - torch[1]) / 120) * 0.35
    c.shape(poly((cx - 20, 82), (cx + 20, 82), (cx + 22, 116), (cx - 22, 116)), CLOTH_GREEN,
            lambda x, y: 0.5 + (x - cx) / 80)
    c.shape(poly((cx - 17, 82), (cx - 6, 82), (cx - 4, 116), (cx - 19, 116)), LEATHER, lambda x, y: 0.55)
    c.shape(poly((cx + 6, 82), (cx + 17, 82), (cx + 19, 116), (cx + 4, 116)), LEATHER, lambda x, y: 0.65)
    c.shape(rect(cx - 5, 70, cx + 5, 83), SKIN, skin)
    # Braid falling over her shoulder.
    c.shape(poly((cx + 8, 64), (cx + 14, 64), (cx + 16, 100), (cx + 11, 104), (cx + 9, 90)), HAIR_RED,
            lambda x, y: 0.55 + ((y // 3) % 2) * 0.2)
    c.shape(ellipse(cx, 62, 10, 12), SKIN, skin)
    c.shape(poly((cx - 11, 60), (cx - 9, 50), (cx, 47), (cx + 10, 50), (cx + 12, 62), (cx + 7, 54), (cx - 6, 54)),
            HAIR_RED, lambda x, y: 0.75 - (y - 47) / 30)
    for ex in (cx - 4, cx + 3):
        c.dot(ex, 62, OUTLINE)
        c.dot(ex + 1, 62, OUTLINE)
    c.shape(rect(cx - 3, 68, cx + 3, 68), SKIN, lambda x, y: 0.25, outline=False)
    # Forearms crossed on the counter.
    c.shape(poly((cx - 26, 108), (cx + 4, 104), (cx + 6, 110), (cx - 24, 114)), SKIN, skin)
    c.shape(poly((cx + 26, 108), (cx - 4, 104), (cx - 6, 110), (cx + 24, 114)), SKIN, skin)

    # Counter with a dagger and a whetstone on top.
    c.shape(rect(0, 112, W - 1, 144), WOOD, lambda x, y: 0.65 - (y - 112) / 60 + light(x, y) * 0.15)
    c.shape(rect(0, 112, W - 1, 115), WOOD, lambda x, y: 0.9, outline=False)
    c.shape(poly((86, 108), (104, 106), (104, 108), (86, 110)), STEEL, lambda x, y: 0.85)
    c.shape(rect(80, 107, 86, 111), LEATHER, lambda x, y: 0.5)
    c.shape(rect(14, 106, 28, 111), STONE, lambda x, y: 0.6)
    return c.img


# ─── Guild sanctum ──────────────────────────────────────────────────────────
def guild_sanctum() -> Image.Image:
    c = Canvas()
    cauldron = (30, 118)
    candles = [(84, 52), (110, 60)]

    def light(x: int, y: int) -> float:
        green = max(0, 1 - math.hypot(x - cauldron[0], y - cauldron[1] + 18) / 70) * 0.35
        warm = max(max(0, 1 - math.hypot(x - cx_, y - cy_) / 48) for cx_, cy_ in candles) * 0.35
        return 0.18 + green + warm

    room(c, ROBE, WOOD, 94, light, 37, brick_h=9, brick_w=18)

    # Shelves of spellbooks across the back wall.
    for shelf_y in (24, 48, 72):
        c.shape(rect(0, shelf_y, 76, shelf_y + 2), WOOD, lambda x, y: light(x, y) + 0.15)
        x = 2
        i = 0
        while x < 74:
            width = 3 + int(hash2(i, shelf_y, 3) * 3)
            height = 12 + int(hash2(i, shelf_y, 4) * 8)
            colours = BOOK[int(hash2(i, shelf_y, 5) * 4) % 4]
            c.shape(rect(x, shelf_y - height, x + width - 1, shelf_y - 1), colours,
                    lambda px, py: light(px, py) + 0.3, outline=False)
            for py in range(shelf_y - height, shelf_y):
                c.dot(x + width - 1, py, OUTLINE)
            c.dot(x + 1, shelf_y - height + 3, BRASS[4])
            x += width
            i += 1
    # Runes glowing faintly on the wall.
    for i, (rx, ry) in enumerate(((96, 18), (112, 30), (100, 40))):
        for k in range(5):
            c.dot(rx + k, ry + (k % 2), POTION[3 + (i + k) % 2])

    # Candles on the lectern side.
    for cx_, cy_ in candles:
        c.shape(rect(cx_ - 1, cy_, cx_ + 1, cy_ + 8), CANDLE, lambda x, y: 0.8)
        c.shape(ellipse(cx_, cy_ - 3, 2, 3), GLOW, lambda x, y, cy_=cy_: 1.0 - (y - cy_ + 6) / 10, outline=False)

    # The hooded archivist at her lectern, face in shadow, eyes catching the light.
    hx, hy = 92, 70
    c.shape(poly((hx - 20, 140), (hx - 14, hy + 2), (hx, hy - 20), (hx + 14, hy + 2), (hx + 22, 140)), ROBE,
            lambda x, y: 0.42 + light(x, y) * 0.6 - (x - hx) / 90)
    c.shape(poly((hx - 11, hy - 4), (hx, hy - 22), (hx + 11, hy - 4), (hx + 9, hy + 10), (hx - 9, hy + 10)), ROBE,
            lambda x, y: 0.55 + light(x, y) * 0.5)
    c.shape(ellipse(hx, hy - 2, 6, 8), ROBE, lambda x, y: 0.02, outline=False)
    c.dot(hx - 3, hy - 3, GLOW[3])
    c.dot(hx + 2, hy - 3, GLOW[3])
    # Pale hands on the open book.
    c.shape(rect(hx - 22, hy + 24, hx - 17, hy + 27), SKIN, lambda x, y: 0.55 + light(x, y) * 0.3)
    c.shape(rect(hx - 6, hy + 24, hx - 1, hy + 27), SKIN, lambda x, y: 0.55 + light(x, y) * 0.3)
    # Lectern and open book.
    c.shape(poly((hx - 34, hy + 26), (hx + 2, hy + 22), (hx + 2, hy + 28), (hx - 34, hy + 32)), WOOD,
            lambda x, y: 0.5 + light(x, y) * 0.4)
    c.shape(rect(hx - 20, hy + 30, hx - 14, 140), WOOD, lambda x, y: 0.4 + light(x, y) * 0.4)
    c.shape(poly((hx - 30, hy + 22), (hx - 16, hy + 19), (hx - 2, hy + 21), (hx - 2, hy + 24), (hx - 16, hy + 22), (hx - 30, hy + 26)),
            CANDLE, lambda x, y: 0.6 + light(x, y) * 0.4)

    # Cauldron on its fire, green brew bubbling.
    c.shape(ellipse(cauldron[0], 136, 16, 6), FIRE, lambda x, y: 0.75 - abs(x - cauldron[0]) / 30, outline=False)
    c.shape(ellipse(cauldron[0], cauldron[1], 20, 16), IRON,
            lambda x, y: 0.35 + max(0, 1 - math.hypot(x - cauldron[0] + 8, y - cauldron[1] + 8) / 18) * 0.4)
    c.shape(ellipse(cauldron[0], cauldron[1] - 13, 18, 4), POTION, lambda x, y: 0.75 - abs(x - cauldron[0]) / 40)
    for i in range(6):
        bx = cauldron[0] - 12 + int(hash2(i, 9, 2) * 24)
        by = cauldron[1] - 18 - int(hash2(i, 8, 2) * 22)
        c.dot(bx, by, POTION[4])
        c.dot(bx + 1, by - 1, POTION[5])
    return c.img


SCENES = {
    "odo-forge": odo_forge,
    "brunna-armory": brunna_armory,
    "guild-sanctum": guild_sanctum,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="frontend/src/assets/chronicles/ui/shops")
    parser.add_argument("--preview", help="also write a 4x contact sheet here")
    args = parser.parse_args()
    out = (REPO / args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    images = {}
    for name, build in SCENES.items():
        img = build()
        images[name] = img
        path = out / f"{name}.png"
        img.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(REPO)} ({path.stat().st_size} bytes)")
    if args.preview:
        sheet = Image.new("RGB", (W * 4 * len(images) + 8 * (len(images) - 1), H * 4), (40, 40, 40))
        for i, img in enumerate(images.values()):
            sheet.paste(img.resize((W * 4, H * 4), Image.NEAREST), (i * (W * 4 + 8), 0))
        sheet.save(args.preview)


if __name__ == "__main__":
    main()
