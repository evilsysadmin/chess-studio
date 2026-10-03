#!/usr/bin/env python3
"""Deterministic painter for Pawn Slug far-backdrop art (harbor, alpine, jungle).

The industrial stage ships an approved painted far layer
(games/pawn-slug-godot/art/industrial_front_far_v1_part*.gd). The other
stages only had flat procedural polygons, so they looked much poorer. This
script paints the equivalent far layer for each of them: sky, clouds, light
sources, depth-fogged ridges and the stage's landmark silhouettes, with the
lower edge fading to transparency. The far layer is never collision or
traversal; it sits behind the procedural mid layers.

Same seed and toolchain → same bytes. Output is a WebP embedded as base64 in
GDScript parts, like the industrial art, so the Web export needs no extra
import step.

    python3 scripts/art/paint_pawn_slug_far_art.py            # write .gd parts
    python3 scripts/art/paint_pawn_slug_far_art.py --png DIR  # review PNGs too
"""
from __future__ import annotations

import argparse
import base64
import io
import math
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
ART_DIR = ROOT / "games/pawn-slug-godot/art"
W, H = 2048, 806          # painted at 2x, shipped at OUT
OUT = (1024, 403)
PART_CHARS = 8000
# Mid strips: painted at 2x, tile horizontally (periodic noise + wrapped shapes).
STRIP_W, STRIP_H = 4096, 660
STRIP_OUT = (2048, 330)
PERIODIC = False


def set_canvas(width: int, height: int, periodic: bool) -> None:
    global W, H, PERIODIC
    W, H, PERIODIC = width, height, periodic


# ---------------------------------------------------------------- primitives

def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def value_noise(w: int, h: int, cells_x: int, cells_y: int, seed: int) -> np.ndarray:
    """Smooth value noise: quintic-faded bilinear lattice (no resize artifacts)."""
    grid = rng(seed).random((cells_y + 2, cells_x + 2)).astype(np.float32)
    if PERIODIC and w == W:
        grid[:, cells_x:] = grid[:, :2]
    u = np.linspace(0, cells_x, w, endpoint=False, dtype=np.float32)
    v = np.linspace(0, cells_y, h, endpoint=False, dtype=np.float32)
    iu, iv = u.astype(np.int32), v.astype(np.int32)
    fu, fv = u - iu, v - iv
    fu = fu * fu * fu * (fu * (fu * 6 - 15) + 10)
    fv = fv * fv * fv * (fv * (fv * 6 - 15) + 10)
    g00 = grid[iv[:, None], iu[None, :]]
    g10 = grid[iv[:, None], iu[None, :] + 1]
    g01 = grid[iv[:, None] + 1, iu[None, :]]
    g11 = grid[iv[:, None] + 1, iu[None, :] + 1]
    top = g00 + (g10 - g00) * fu[None, :]
    bottom = g01 + (g11 - g01) * fu[None, :]
    return top + (bottom - top) * fv[:, None]


def fbm(w: int, h: int, base: int, octaves: int, seed: int, aspect: float = 1.0) -> np.ndarray:
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cx = max(1, int(base * (2 ** o)))
        cy = max(1, int(base * (2 ** o) * h / w * aspect))
        out += value_noise(w, h, cx, cy, seed * 131 + o) * amp
        total += amp
        amp *= 0.5
    return out / total


def ridge_line(w: int, base_y: float, amp: float, base: int, octaves: int, seed: int, sharp: float = 0.0) -> np.ndarray:
    n = fbm(w, 4, base, octaves, seed)[1]
    if sharp:
        n = (1 - sharp) * n + sharp * (1 - np.abs(n * 2 - 1))
    n = (n - n.min()) / max(1e-6, n.max() - n.min())
    return base_y - n * amp


def hexc(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def lerp(a, b, t):
    return a + (b - a) * t


class Canvas:
    def __init__(self) -> None:
        self.rgb = np.zeros((H, W, 3), np.float32)
        self.alpha = np.ones((H, W), np.float32)
        self.yy, self.xx = np.mgrid[0:H, 0:W].astype(np.float32)

    track_alpha = False

    def over(self, color, mask: np.ndarray) -> None:
        if self.track_alpha:
            m = np.clip(mask, 0, 1)
            self.alpha = self.alpha + m * (1 - self.alpha)
        mask = np.clip(mask, 0, 1)[..., None]
        color = np.asarray(color, np.float32)
        if color.ndim == 1:
            color = color[None, None, :]
        self.rgb = self.rgb * (1 - mask) + color * mask

    def add(self, color, mask: np.ndarray) -> None:
        self.rgb = self.rgb + np.asarray(color, np.float32)[None, None, :] * np.clip(mask, 0, None)[..., None]

    def glow(self, cx: float, cy: float, radius: float, color, strength: float, squash: float = 1.0) -> None:
        d = np.sqrt((self.xx - cx) ** 2 + ((self.yy - cy) / squash) ** 2) / radius
        self.add(color, strength * np.exp(-d * d))

    def silhouette(self, heights: np.ndarray, color, soft: float = 1.5) -> np.ndarray:
        mask = np.clip((self.yy - heights[None, :]) / soft + 0.5, 0, 1)
        self.over(color, mask)
        return mask


def shapes_mask(draw_fn) -> np.ndarray:
    pad = 600 if PERIODIC else 0
    img = Image.new("L", (W + pad, H), 0)
    draw_fn(ImageDraw.Draw(img))
    out = np.asarray(img, np.float32) / 255.0
    if not pad:
        return out
    # Fold whatever crossed the right edge back onto the left: the strip tiles.
    folded = out[:, :W].copy()
    folded[:, :pad] = np.maximum(folded[:, :pad], out[:, W:])
    return folded


def soft(mask: np.ndarray, radius: float) -> np.ndarray:
    img = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), "L")
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255.0


def sky(c: Canvas, stops: list[tuple[float, str]]) -> None:
    t = c.yy / H
    out = np.zeros_like(c.rgb)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        seg = np.clip((t - t0) / max(1e-6, t1 - t0), 0, 1)[..., None]
        inside = ((t >= t0) & (t <= t1))[..., None]
        out = np.where(inside, lerp(hexc(c0), hexc(c1), seg), out)
    c.rgb = out


def stars(c: Canvas, seed: int, count: int, max_y: float, alpha: float) -> None:
    r = rng(seed)
    xs, ys = r.random(count) * W, r.random(count) ** 1.6 * max_y
    mag = r.random(count) ** 3
    layer = np.zeros((H, W), np.float32)
    for x, y, m in zip(xs, ys, mag):
        layer[int(y), int(x) % W] = 0.35 + m
    layer = soft(layer, 0.9) * 6
    c.add(hexc("dfe8f2"), layer * alpha)


def clouds(c: Canvas, seed: int, top: float, bottom: float, color, lit, light_x: float, density: float, base: int = 5, alpha: float = 1.0) -> None:
    n = fbm(W, H, base, 6, seed, aspect=2.6)
    band = np.clip((c.yy - top) / 60, 0, 1) * np.clip((bottom - c.yy) / 140, 0, 1)
    cov = np.clip((n - (1 - density)) * 3.2, 0, 1) * band
    # Light from one side: brighter where noise rises toward the light.
    shifted = np.roll(n, int(6 if light_x > W / 2 else -6), axis=1)
    shade = np.clip((n - shifted) * 12 + 0.45, 0, 1)
    shade = shade * np.exp(-((c.xx - light_x) / (W * 0.55)) ** 2) + 0.15
    col = lerp(hexc(color)[None, None, :], hexc(lit)[None, None, :], np.clip(shade, 0, 1)[..., None])
    c.over(col, cov * alpha)


def fog_band(c: Canvas, y: float, height: float, color, strength: float, seed: int) -> None:
    n = fbm(W, H, 3, 4, seed, aspect=3.0)
    profile = np.exp(-((c.yy - y) / height) ** 2)
    c.over(hexc(color), profile * strength * (0.55 + 0.6 * n))


def bottom_fade(c: Canvas, start: float, end: float) -> None:
    c.alpha = np.clip((end - c.yy) / (end - start), 0, 1) ** 1.3


def grain(c: Canvas, seed: int, amount: float) -> None:
    c.rgb = c.rgb + (rng(seed).random((H, W, 1)).astype(np.float32) - 0.5) * amount


def windows(draw: ImageDraw.ImageDraw, r: np.random.Generator, x0: float, y0: float, x1: float, y1: float, density: float, size=(4, 6)) -> None:
    y = y0 + 6
    while y < y1 - size[1]:
        x = x0 + 5
        while x < x1 - size[0]:
            if r.random() < density:
                draw.rectangle([x, y, x + size[0], y + size[1]], fill=255)
            x += size[0] * 3
        y += size[1] * 2.6


# ---------------------------------------------------------------- shared props

def lattice_tower(d: ImageDraw.ImageDraw, x0: float, x1: float, y_bottom: float, y_top: float, width: int = 3) -> None:
    for x in (x0, x1):
        d.rectangle([x - width, y_top, x + width, y_bottom], fill=255)
    step = max(18.0, (x1 - x0) * 0.8)
    y = y_bottom
    while y - step > y_top:
        d.line([(x0, y), (x1, y - step)], fill=255, width=2)
        d.line([(x1, y), (x0, y - step)], fill=255, width=2)
        d.line([(x0, y - step), (x1, y - step)], fill=255, width=2)
        y -= step


def rim_light(c: Canvas, mask: np.ndarray, color: str, strength: float, dx: int) -> None:
    c.add(hexc(color), np.clip(mask - np.roll(mask, dx, axis=1), 0, 1) * strength)


def tree_crowns(d: ImageDraw.ImageDraw, r: np.random.Generator, line: np.ndarray, rmin: int, rmax: int, spacing: tuple[int, int]) -> None:
    x = -20.0
    while x < W + 40:
        base = float(line[int(np.clip(x, 0, W - 1))])
        rad = int(r.integers(rmin, rmax))
        cy = base - rad * 0.4
        d.ellipse([x - rad, cy - rad * 0.8, x + rad, cy + rad * 0.8], fill=255)
        for _ in range(3):
            ox, oy = r.normal(0, rad * 0.5), r.normal(-rad * 0.3, rad * 0.25)
            rr = rad * r.uniform(0.45, 0.7)
            d.ellipse([x + ox - rr, cy + oy - rr * 0.8, x + ox + rr, cy + oy + rr * 0.8], fill=255)
        d.rectangle([x - rad, cy, x + rad, H], fill=255)
        x += r.integers(*spacing)


def palms(d: ImageDraw.ImageDraw, r: np.random.Generator, line: np.ndarray, count: int, height: float) -> None:
    for _ in range(count):
        x = float(r.uniform(80, W - 80))
        base = float(line[int(x)]) + 30
        lean = r.uniform(-0.35, 0.35)
        h = height * r.uniform(0.8, 1.2)
        pts = [(x + lean * h * (t / 10) ** 1.6, base - h * t / 10) for t in range(11)]
        d.line(pts, fill=255, width=7)
        tx, ty = pts[-1]
        for f in range(8):
            ang = -math.pi + f * math.pi / 7 + r.normal(0, 0.12)
            ln = r.uniform(70, 110)
            frond = []
            for t in range(9):
                u = t / 8
                frond.append((tx + math.cos(ang) * ln * u, ty + math.sin(ang) * ln * u * 0.6 + (u * u) * ln * 0.55))
            for a, b in zip(frond, frond[1:]):
                d.line([a, b], fill=255, width=max(2, int(9 * (1 - frond.index(a) / 9))))
        d.ellipse([tx - 10, ty - 8, tx + 10, ty + 8], fill=255)


# ---------------------------------------------------------------- harbor

def paint_harbor(seed: int = 31) -> Canvas:
    c = Canvas()
    horizon = 540.0
    sky(c, [(0.0, "0b1726"), (0.28, "1f3349"), (0.50, "5e4656"), (0.64, "c0704e"), (0.67, "e89058"), (1.0, "f2b373")])
    stars(c, seed, 240, 230, 0.4)
    sun_x, sun_y = 1270, horizon - 22
    c.glow(sun_x, sun_y, 620, hexc("ff8a4a"), 0.40, squash=0.38)
    c.glow(sun_x, sun_y, 160, hexc("ffc27a"), 0.65)
    c.over(hexc("fff0c4"), np.clip(58 - np.hypot(c.xx - sun_x, c.yy - sun_y), 0, 1) * (c.yy < horizon))
    clouds(c, seed + 1, 30, 300, "1a2436", "e98a5e", sun_x, 0.58, base=3)
    clouds(c, seed + 2, 300, 470, "3a3044", "ffb878", sun_x, 0.50, base=6, alpha=0.9)
    clouds(c, seed + 3, 430, 520, "6a4450", "ffc890", sun_x, 0.38, base=12, alpha=0.7)

    # Headland with a lighthouse, tapering into the sea.
    head = ridge_line(W, horizon - 6, 90, 3, 6, seed + 4)
    taper = np.clip((820 - c.xx[0]) / 360, 0, 1)
    head = horizon + 10 - (horizon + 10 - head) * taper
    c.silhouette(head, hexc("4a3848"))
    lh_x = 300
    foot = float(head[lh_x])
    lh_top = foot - 132
    lh = shapes_mask(lambda d: (d.polygon([(lh_x - 16, foot + 4), (lh_x + 16, foot + 4), (lh_x + 9, lh_top), (lh_x - 9, lh_top)], fill=255),
                               d.rectangle([lh_x - 14, lh_top - 20, lh_x + 14, lh_top], fill=255),
                               d.polygon([(lh_x - 17, lh_top - 20), (lh_x + 17, lh_top - 20), (lh_x, lh_top - 38)], fill=255),
                               d.rectangle([lh_x - 40, foot - 26, lh_x - 12, foot + 4], fill=255)))
    c.over(hexc("2e2434"), lh)
    rim_light(c, lh, "ff9a60", 0.5, -2)
    c.glow(lh_x, lh_top - 10, 22, hexc("ffe2a0"), 1.4)
    c.glow(lh_x, lh_top - 10, 90, hexc("ffc070"), 0.25)
    ang = -0.06
    px, py = c.xx - lh_x, c.yy - (lh_top - 10)
    along = px * math.cos(ang) + py * math.sin(ang)
    across = np.abs(-px * math.sin(ang) + py * math.cos(ang))
    c.add(hexc("ffe6b0"), np.clip(1 - across / (4 + along * 0.06), 0, 1) * (along > 0) * np.exp(-along / 1100) * 0.22)

    # Sea with sun glitter.
    sea = (c.yy > horizon).astype(np.float32)
    sea_col = lerp(hexc("8a5a58"), hexc("142434"), np.clip((c.yy - horizon) / 230, 0, 1)[..., None])
    c.over(sea_col, sea)
    swell = fbm(W, H, 30, 4, seed + 5, aspect=0.10)
    path = np.exp(-((c.xx - sun_x) / (40 + (c.yy - horizon) * 1.1)) ** 2) * sea
    c.add(hexc("ffc282"), path * np.clip(swell * 2.2 - 0.95, 0, 1) * 1.6)
    c.add(hexc("ffb070"), sea * np.exp(-((c.yy - horizon) / 5) ** 2) * 0.5)

    # Far quay: warehouses, stacked containers, two moored freighters.
    quay = horizon + 30
    r = rng(seed + 6)
    def far_port(d: ImageDraw.ImageDraw) -> None:
        d.rectangle([760, quay, W, quay + 40], fill=255)
        x = 780
        while x < W:
            w = int(r.integers(50, 130)); h = int(r.integers(12, 40))
            d.rectangle([x, quay - h, x + w, quay], fill=255)
            if r.random() < 0.35:
                d.polygon([(x, quay - h), (x + w, quay - h), (x + w / 2, quay - h - 14)], fill=255)
            x += w + int(r.integers(4, 28))
        for sx, sw in ((880, 380), (1540, 320)):
            d.polygon([(sx, quay - 18), (sx + sw, quay - 18), (sx + sw - 30, quay + 18), (sx + 16, quay + 18)], fill=255)
            d.rectangle([sx + sw * 0.70, quay - 78, sx + sw * 0.90, quay - 18], fill=255)
            d.rectangle([sx + sw * 0.76, quay - 112, sx + sw * 0.82, quay - 78], fill=255)
            for k in range(7):
                d.rectangle([sx + 26 + k * 34, quay - 36 - (k * 7 % 3) * 10, sx + 56 + k * 34, quay - 18], fill=255)
    port = shapes_mask(far_port)
    c.over(hexc("3a2c3a"), port)
    lights = shapes_mask(lambda d: windows(d, rng(seed + 7), 770, quay - 40, W, quay + 6, 0.16, (3, 3)))
    c.add(hexc("ffc070"), lights * port * 1.1)

    # Gantry cranes: the stage's signature silhouettes, rim-lit by the sun.
    base = quay + 60
    cranes = ((800, 330, 300), (1130, 380, 340), (1440, 300, 260), (1820, 350, 300))
    def draw_cranes(d: ImageDraw.ImageDraw) -> None:
        for cx, h, boom in cranes:
            lattice_tower(d, cx - 44, cx - 30, base, base - h, 4)
            lattice_tower(d, cx + 30, cx + 44, base, base - h, 4)
            d.line([(cx - 37, base - h * 0.45), (cx + 37, base - h * 0.45)], fill=255, width=5)
            d.rectangle([cx - 70, base - h - 22, cx + 70, base - h], fill=255)
            d.rectangle([cx - boom * 0.42, base - h - 36, cx + boom, base - h - 26], fill=255)
            for k in range(0, int(boom * 1.42), 24):
                x0 = cx - boom * 0.42 + k
                d.line([(x0, base - h - 26), (x0 + 12, base - h - 36)], fill=255, width=2)
            d.polygon([(cx - 8, base - h - 36), (cx + 8, base - h - 36), (cx, base - h - 92)], fill=255)
            d.line([(cx, base - h - 92), (cx + boom * 0.95, base - h - 36)], fill=255, width=2)
            d.line([(cx, base - h - 92), (cx - boom * 0.4, base - h - 36)], fill=255, width=2)
            d.rectangle([cx - 30, base - h - 70, cx - 2, base - h - 36], fill=255)
            hook = cx + boom * 0.62
            d.line([(hook, base - h - 26), (hook, base - h + 90)], fill=255, width=2)
            d.rectangle([hook - 34, base - h + 90, hook + 34, base - h + 116], fill=255)
    crane = shapes_mask(draw_cranes)
    c.over(hexc("1f1824"), crane)
    rim_light(c, crane, "ff9a5c", 0.7, 3 if True else -3)
    for cx, h, boom in cranes:
        c.glow(cx + 70, base - h - 22, 7, hexc("ff4030"), 1.4)
        c.glow(cx, base - h - 92, 6, hexc("ff4030"), 1.2)
        c.glow(cx - 16, base - h - 54, 5, hexc("ffd080"), 1.0)
    fog_band(c, quay + 36, 34, "8a6466", 0.35, seed + 8)
    fog_band(c, quay + 140, 80, "243444", 0.55, seed + 9)
    bottom_fade(c, H * 0.76, H * 0.985)
    grain(c, seed + 10, 0.016)
    return c


# ---------------------------------------------------------------- alpine

def paint_alpine(seed: int = 53) -> Canvas:
    c = Canvas()
    sky(c, [(0.0, "02060d"), (0.35, "0b1828"), (0.62, "1f3346"), (1.0, "3c5266")])
    stars(c, seed, 560, 420, 0.8)
    moon_x, moon_y = 1560, 140
    c.glow(moon_x, moon_y, 360, hexc("5f80a4"), 0.28)
    c.glow(moon_x, moon_y, 110, hexc("b8d0e8"), 0.40)
    disc = np.clip(52 - np.hypot(c.xx - moon_x, c.yy - moon_y), 0, 1)
    craters = fbm(W, H, 90, 3, seed + 1)
    c.over(lerp(hexc("dbe6ef"), hexc("98a9ba"), np.clip(craters * 2.2 - 0.85, 0, 1)[..., None]), disc)
    clouds(c, seed + 2, 50, 330, "0c1622", "8aa8c8", moon_x, 0.44, base=3, alpha=0.85)

    def massif(base_y, amp, base, s, dark, snow, haze, haze_t, lift=None, bare_x=None):
        line = ridge_line(W, base_y, amp, base, 7, s, sharp=0.85)
        if lift is not None:
            line = np.minimum(line, lift)
        mask = np.clip((c.yy - line[None, :]) / 1.4 + 0.5, 0, 1)
        slope = np.gradient(line)
        # Moonlit faces turn toward the moon (right): rising ridgelines catch light.
        face = np.clip(-slope * 0.35 * (1 if moon_x > W / 2 else -1) + 0.5, 0, 1)[None, :]
        depth = np.clip((c.yy - line[None, :]) / amp, 0, 1)
        n = fbm(W, H, 14, 6, s + 50, aspect=1.6)
        gullies = np.abs(fbm(W, H, 30, 4, s + 60, aspect=0.75) * 2 - 1)
        snowy = np.clip(1.1 - depth * 1.9 + (n - 0.5) * 1.2, 0, 1) * np.clip(gullies * 2.4, 0, 1)
        lightness = snowy * (0.25 + 0.75 * face)
        if bare_x is not None:
            # The crag under the fortress is bare rock, so it reads as ground.
            lightness = lightness * (1 - 0.8 * np.exp(-((c.xx - bare_x) / 240) ** 2))
        col = lerp(hexc(dark)[None, None, :], hexc(snow)[None, None, :], lightness[..., None])
        col = lerp(col, hexc(haze)[None, None, :], np.clip(haze_t + depth * 0.25, 0, 1)[..., None])
        c.over(col, mask)
        return line

    massif(430, 320, 2, seed + 3, "1c2938", "b4c8da", "3c5266", 0.45)
    fog_band(c, 470, 50, "3a4e62", 0.5, seed + 4)
    # The nearer ridge rises into the crag the fortress stands on.
    fx, fy, k = 1040, 380.0, 0.72
    wobble = (fbm(W, 4, 24, 3, seed + 7)[1] - 0.5) * 40
    plateau = fy + 30 + np.clip(np.abs(c.xx[0] - fx) - 210 * k, 0, None) * 1.6 + wobble
    massif(600, 300, 3, seed + 5, "121c28", "d2e0ec", "24364a", 0.12, lift=plateau, bare_x=fx)
    r = rng(seed + 6)
    def fortress(d: ImageDraw.ImageDraw) -> None:
        d.rectangle([fx - 260 * k, fy - 40 * k, fx + 300 * k, fy + 50], fill=255)
        for q in range(-260, 300, 18):
            d.rectangle([fx + q * k, fy - 52 * k, fx + (q + 10) * k, fy - 40 * k], fill=255)
        for tx, th, tw in ((-260, 120, 50), (-80, 180, 74), (110, 250, 96), (300, 140, 54)):
            d.rectangle([fx + (tx - tw / 2) * k, fy - th * k, fx + (tx + tw / 2) * k, fy + 40], fill=255)
            for q in range(int(-tw / 2), int(tw / 2), 13):
                d.rectangle([fx + (tx + q) * k, fy - (th + 12) * k, fx + (tx + q + 8) * k, fy - th * k], fill=255)
        d.polygon([(fx + 62 * k, fy - 262 * k), (fx + 158 * k, fy - 262 * k), (fx + 110 * k, fy - 340 * k)], fill=255)
        d.rectangle([fx + 108 * k, fy - 380 * k, fx + 112 * k, fy - 340 * k], fill=255)
        d.polygon([(fx + 112 * k, fy - 380 * k), (fx + 150 * k, fy - 370 * k), (fx + 112 * k, fy - 360 * k)], fill=255)
    fort = shapes_mask(fortress)
    def mound(d: ImageDraw.ImageDraw) -> None:
        rr = rng(seed + 14)
        top = []
        for q in range(0, 41):
            x = fx - 300 * k - 60 + q * (600 * k + 120) / 40
            inside = abs(x - fx - 20 * k) < 270 * k
            top.append((x, fy + (rr.uniform(10, 34) if inside else rr.uniform(40, 90))))
        d.polygon(top + [(fx + 420 * k + 140, fy + 260), (fx - 420 * k - 140, fy + 260)], fill=255)
    stonework = fbm(W, H, 120, 2, seed + 8)
    c.over(lerp(hexc("0c141e"), hexc("223040"), stonework[..., None] * 0.6), fort)
    rock_mask = shapes_mask(mound) * np.clip((fy + 260 - c.yy) / 140, 0, 1)
    rock = fbm(W, H, 50, 5, seed + 15, aspect=0.9)
    c.over(lerp(hexc("0e1822"), hexc("3a4c60"), np.clip(rock * 1.5 - 0.55, 0, 1)[..., None] * 0.7), rock_mask)
    rim_light(c, np.clip(rock_mask * 2, 0, 1), "a8c0d8", 0.35, 2)
    rim_light(c, fort, "c0d4e8", 0.55, 2)
    lit = shapes_mask(lambda d: windows(d, r, fx - 250 * k, fy - 240 * k, fx + 320 * k, fy + 30, 0.12, (3, 6)))
    c.add(hexc("ffae58"), lit * fort * 1.2)
    c.glow(fx + 20, fy + 10, 260, hexc("ff9a40"), 0.06, squash=0.4)
    for sx, sy, ang in ((fx - 80 * k, fy - 180 * k, -1.2), (fx + 110 * k, fy - 250 * k, -1.85), (fx + 300 * k, fy - 140 * k, -1.45)):
        dirx, diry = math.cos(ang), math.sin(ang)
        px, py = c.xx - sx, c.yy - sy
        along = px * dirx + py * diry
        across = np.abs(px * -diry + py * dirx)
        beam = np.clip(1 - across / (6 + along * 0.10), 0, 1) * (along > 0) * np.exp(-along / 800)
        c.add(hexc("d8e6f4"), beam * 0.20)
        c.glow(sx, sy, 9, hexc("fff2d0"), 1.2)
    # Switchback road lights climbing to the gate.
    for q in range(8):
        t = q / 7
        x = fx - 330 + t * 200 + (36 if q % 2 else -36)
        y = 700 - t * (700 - fy - 40)
        c.glow(x, y, 4, hexc("ffc070"), 0.9)

    fog_band(c, 640, 60, "2a3e52", 0.55, seed + 9)
    pine_line = ridge_line(W, 720, 60, 3, 5, seed + 10)
    def pines(d: ImageDraw.ImageDraw) -> None:
        rr = rng(seed + 11)
        x = -10.0
        while x < W + 20:
            base = float(pine_line[int(np.clip(x, 0, W - 1))])
            h = int(rr.integers(50, 130)); w = h * 0.30
            for tier in range(5):
                ty = base - h + tier * h * 0.18
                tw = w * (0.35 + tier * 0.18)
                d.polygon([(x, ty), (x - tw, ty + h * 0.26), (x + tw, ty + h * 0.26)], fill=255)
            d.rectangle([x - w * 0.9, base, x + w * 0.9, H], fill=255)
            x += int(rr.integers(8, 26))
    pm = shapes_mask(pines)
    c.over(hexc("08101a"), pm)
    snow_tips = np.clip(pm - np.roll(pm, 3, axis=0), 0, 1)
    c.add(hexc("8aa4bc"), snow_tips * 0.35)
    fog_band(c, 760, 50, "1e2e3c", 0.45, seed + 12)
    bottom_fade(c, H * 0.78, H * 0.99)
    grain(c, seed + 13, 0.018)
    return c


# ---------------------------------------------------------------- jungle

def paint_jungle(seed: int = 71) -> Canvas:
    c = Canvas()
    sky(c, [(0.0, "030907"), (0.30, "0d1f17"), (0.62, "2a4434"), (1.0, "4c6650")])
    flash_x, flash_y = 1420, 200
    c.glow(flash_x, flash_y, 460, hexc("8fbca4"), 0.32, squash=0.55)
    clouds(c, seed + 1, 0, 360, "08130e", "b4d4c0", flash_x, 0.66, base=3)
    clouds(c, seed + 2, 200, 460, "142419", "7a9c84", flash_x, 0.50, base=7, alpha=0.85)
    def bolt(d: ImageDraw.ImageDraw) -> None:
        rr = rng(seed + 3)
        x, y = flash_x + 30, 250.0
        pts = [(x, y)]
        while y < 500:
            x += rr.normal(0, 14); y += rr.uniform(16, 30)
            pts.append((x, y))
        d.line(pts, fill=255, width=4)
        bx, by = pts[len(pts) // 2]
        d.line([(bx, by), (bx - 50, by + 40), (bx - 66, by + 96)], fill=255, width=2)
    b = shapes_mask(bolt)
    c.add(hexc("e8fff2"), soft(b, 10) * 0.9 + b * 0.9)

    c.silhouette(ridge_line(W, 500, 170, 2, 6, seed + 4), hexc("2e4838"))
    fog_band(c, 500, 50, "4c6a54", 0.45, seed + 5)

    # Stepped temple with a lit shrine, rising out of the canopy.
    tx, ty, tiers, step = 620, 600, 7, 36
    def temple_body(d: ImageDraw.ImageDraw) -> None:
        for k in range(tiers):
            w = 320 - k * 40
            d.rectangle([tx - w, ty - step * (k + 1), tx + w, ty - step * k], fill=255)
        top = ty - step * tiers
        d.rectangle([tx - 50, top - 76, tx + 50, top], fill=255)
        d.polygon([(tx - 62, top - 76), (tx + 62, top - 76), (tx, top - 104)], fill=255)
    def temple_stairs(d: ImageDraw.ImageDraw) -> None:
        d.polygon([(tx - 44, ty), (tx + 44, ty), (tx + 24, ty - step * tiers), (tx - 24, ty - step * tiers)], fill=255)
    def temple_door(d: ImageDraw.ImageDraw) -> None:
        top = ty - step * tiers
        d.rectangle([tx - 16, top - 46, tx + 16, top], fill=255)
    body = shapes_mask(temple_body)
    stone = fbm(W, H, 60, 4, seed + 6)
    c.over(lerp(hexc("1c2e24"), hexc("40584a"), np.clip(stone * 1.3 - 0.35, 0, 1)[..., None] * 0.8), body)
    # Each terrace lip catches the storm light.
    lips = np.zeros((H, W), np.float32)
    for k in range(tiers):
        y = int(ty - step * (k + 1))
        lips[y:y + 3] = 1
    c.add(hexc("9fc4ac"), lips * body * 0.25)
    stairs = shapes_mask(temple_stairs)
    treads = (np.sin(c.yy * math.pi / 6) > 0.3).astype(np.float32)
    c.over(lerp(hexc("263c30"), hexc("4a6656"), treads[..., None]), stairs * 0.9)
    door = shapes_mask(temple_door)
    c.over(hexc("ffae58"), door)
    c.glow(tx, ty - step * tiers - 23, 110, hexc("ff8a30"), 0.25)
    rim_light(c, body, "a9c8b4", 0.35, -3)
    vines = fbm(W, H, 80, 3, seed + 7, aspect=0.25)
    c.over(hexc("1a3020"), np.clip(vines * 3 - 1.9, 0, 1) * body * 0.8)

    def towers(d: ImageDraw.ImageDraw) -> None:
        for x, h in ((1560, 250), (1730, 180), (1900, 280)):
            d.rectangle([x - 36, 620 - h, x + 36, 620], fill=255)
            d.polygon([(x - 44, 620 - h), (x + 44, 620 - h), (x + 20, 620 - h - 30), (x - 28, 620 - h - 14)], fill=255)
            d.rectangle([x - 10, 620 - h + 30, x + 10, 620 - h + 60], fill=0)
    tw_mask = shapes_mask(towers)
    c.over(lerp(hexc("16261c"), hexc("2e4436"), stone[..., None] * 0.6), tw_mask)
    rim_light(c, tw_mask, "b4d4c0", 0.45, -2)

    for i, (line_y, amp, rmin, rmax, col, hi, haze) in enumerate((
        (640, 70, 40, 80, "1e3426", "4e7a58", 0.35),
        (700, 60, 50, 95, "12241a", "3e6a48", 0.15),
        (770, 50, 60, 110, "08140d", "2a4a32", 0.0),
    )):
        line = ridge_line(W, line_y, amp, 6, 4, seed + 20 + i)
        crowns = shapes_mask(lambda d: tree_crowns(d, rng(seed + 30 + i), line, rmin, rmax, (rmin, rmax + 20)))
        leaf = fbm(W, H, 60 + i * 20, 4, seed + 40 + i)
        # Ragged leafy edges instead of clean bubbles.
        crowns = np.clip((soft(crowns, 7) - 0.5 + (leaf - 0.5) * 0.9) * 5 + 0.5, 0, 1)
        if i < 2:
            crowns = np.maximum(crowns, shapes_mask(lambda d: palms(d, rng(seed + 70 + i), line, 5 - i, 150 + i * 40)))
        top_light = np.clip(crowns - np.roll(crowns, 8, axis=0), 0, 1)
        col_arr = lerp(hexc(col)[None, None, :], hexc(hi)[None, None, :], (np.clip(leaf * 1.6 - 0.7, 0, 1) * 0.6 + soft(top_light, 3) * 0.8)[..., None])
        col_arr = lerp(col_arr, hexc("4c6a54")[None, None, :], haze)
        c.over(col_arr, crowns)
        if i < 2:
            fog_band(c, line_y + 20, 34, "5a7a64", 0.30 - i * 0.1, seed + 50 + i)

    # Thin slanted rain.
    def rain(d: ImageDraw.ImageDraw) -> None:
        rr = rng(seed + 60)
        for _ in range(700):
            x, y = rr.uniform(-100, W), rr.uniform(0, H)
            ln = rr.uniform(20, 60)
            d.line([(x, y), (x + ln * 0.18, y + ln)], fill=int(rr.uniform(60, 160)), width=1)
    c.add(hexc("b8d4c0"), shapes_mask(rain) * 0.22)
    bottom_fade(c, H * 0.80, H * 0.99)
    grain(c, seed + 61, 0.018)
    return c


# ---------------------------------------------------------------- mid strips
# Mid-depth silhouettes between the painted far art and the gameplay layers.
# Transparent above, solid base colour at the bottom so the strip sits on
# the far layer's ground fill. Everything wraps: the strip tiles along x.

def strip_canvas() -> Canvas:
    set_canvas(STRIP_W, STRIP_H, periodic=True)
    c = Canvas()
    c.alpha = np.zeros((H, W), np.float32)
    c.track_alpha = True
    return c


def ground(c: Canvas, seed: int, top: float, amp: float, color: str, lip: str, lip_strength: float) -> np.ndarray:
    line = ridge_line(W, top, amp, 6, 4, seed)
    mask = np.clip((c.yy - line[None, :]) / 1.5 + 0.5, 0, 1)
    c.over(hexc(color), mask)
    edge = np.clip(mask - np.roll(mask, 4, axis=0), 0, 1)
    c.over(hexc(lip), edge * lip_strength)
    return line


def lamp(c: Canvas, x: float, y: float, color: str, radius: float, strength: float) -> None:
    d = np.hypot(c.xx - x, c.yy - y) / radius
    halo = np.exp(-d * d) * strength
    c.over(hexc(color), np.clip(halo, 0, 1))


def paint_harbor_mid(seed: int = 131) -> Canvas:
    c = strip_canvas()
    r = rng(seed)
    quay = 560.0
    rust = ["5a3426", "1f4a52", "23304a", "6a5426", "3e2a3a", "2c4a3a"]
    haze = hexc("1c2e38")
    def warehouses(d: ImageDraw.ImageDraw) -> None:
        x = 0.0
        while x < W:
            w = r.uniform(300, 520); h = r.uniform(130, 230)
            d.rectangle([x, quay - h, x + w, quay], fill=255)
            teeth = int(w // 70)
            for t in range(teeth):
                tx = x + t * w / teeth
                d.polygon([(tx, quay - h), (tx + w / teeth, quay - h), (tx + w / teeth, quay - h - 30)], fill=255)
            x += w + r.uniform(260, 520)
    wh = shapes_mask(warehouses)
    body = lerp(hexc("10222a"), hexc("1d3640"), np.clip((quay - c.yy) / 260, 0, 1)[..., None])
    c.over(body, wh)
    rim_light(c, wh, "e08a5a", 0.55, 3)
    lit = shapes_mask(lambda d: windows(d, rng(seed + 1), 0, quay - 230, W, quay - 40, 0.22, (8, 10)))
    c.over(hexc("ffb466"), lit * wh * 0.95)
    doors = shapes_mask(lambda d: [d.rectangle([x, quay - 70, x + 60, quay], fill=255) for x in np.arange(80, W, 410)])
    c.over(hexc("0a161c"), doors * wh)

    def containers(d: ImageDraw.ImageDraw, colors: list) -> None:
        x = 200.0
        while x < W:
            cols = int(r.integers(2, 5))
            for col in range(cols):
                for row in range(int(r.integers(1, 5))):
                    colors.append((x + col * 116, quay - (row + 1) * 50, int(r.integers(len(rust)))))
            x += cols * 116 + r.uniform(380, 700)
    boxes: list = []
    containers(ImageDraw.Draw(Image.new("L", (1, 1))), boxes)
    for bx, by, ci in boxes:
        m = shapes_mask(lambda d: d.rectangle([bx, by, bx + 112, by + 48], fill=255))
        col = lerp(hexc(rust[ci]), haze, 0.35)
        c.over(col, m)
        ribs = (np.sin((c.xx - bx) * math.pi / 7) > 0.6).astype(np.float32)
        c.over(col * 0.7, m * ribs * 0.6)
        c.over(col * 1.6 + 0.04, np.clip(m - np.roll(m, 3, axis=0), 0, 1) * 0.7)
    ground(c, seed + 2, quay, 4, "0f2229", "c07a5a", 0.6)
    def bollards_and_posts(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(40, W, 170):
            d.rectangle([x, quay - 18, x + 16, quay], fill=255)
            d.ellipse([x - 3, quay - 24, x + 19, quay - 14], fill=255)
        for x in np.arange(150, W, 620):
            d.rectangle([x, quay - 300, x + 8, quay], fill=255)
            d.rectangle([x - 30, quay - 304, x + 38, quay - 294], fill=255)
    posts = shapes_mask(bollards_and_posts)
    c.over(hexc("0b1a20"), posts)
    for x in np.arange(150, W, 620):
        lamp(c, x - 22, quay - 290, "ffcf8a", 7, 1.0)
        lamp(c, x + 30, quay - 290, "ffcf8a", 7, 1.0)
        lamp(c, x + 4, quay - 250, "ffb060", 60, 0.10)
    grain(c, seed + 3, 0.02)
    return c


def paint_alpine_mid(seed: int = 153) -> Canvas:
    c = strip_canvas()
    r = rng(seed)
    base = 560.0
    def pines(d: ImageDraw.ImageDraw) -> None:
        x = 0.0
        while x < W:
            if r.random() < 0.55:
                for _ in range(int(r.integers(3, 9))):
                    h = r.uniform(120, 260); w = h * 0.28
                    px = x + r.uniform(-60, 60)
                    for tier in range(6):
                        ty = base - h + tier * h * 0.15
                        tw = w * (0.3 + tier * 0.16)
                        d.polygon([(px, ty), (px - tw, ty + h * 0.22), (px + tw, ty + h * 0.22)], fill=255)
                    d.rectangle([px - 6, base - 30, px + 6, base + 10], fill=255)
            x += r.uniform(180, 420)
    pm = shapes_mask(pines)
    c.over(hexc("0c1622"), pm)
    c.over(hexc("8aa2bc"), np.clip(pm - np.roll(pm, 4, axis=0), 0, 1) * 0.55)
    def bunkers(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(300, W, 1100):
            w = r.uniform(260, 360)
            d.polygon([(x, base), (x + 30, base - 90), (x + w - 30, base - 90), (x + w, base)], fill=255)
    bk = shapes_mask(bunkers)
    concrete = fbm(W, H, 60, 3, seed + 1)
    c.over(lerp(hexc("1c2834"), hexc("33445a"), concrete[..., None] * 0.7), bk)
    slits = shapes_mask(lambda d: [d.rectangle([x + 70, base - 62, x + 200, base - 50], fill=255) for x in np.arange(300, W, 1100)])
    c.over(hexc("05090e"), slits)
    snow_cap = np.clip(bk - np.roll(bk, 10, axis=0), 0, 1)
    c.over(hexc("c4d4e4"), soft(snow_cap, 1.5) * 0.9)
    def towers(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(820, W, 1400):
            lattice_tower(d, x, x + 60, base, base - 300, 4)
            d.rectangle([x - 20, base - 360, x + 80, base - 300], fill=255)
            d.polygon([(x - 30, base - 360), (x + 90, base - 360), (x + 30, base - 392)], fill=255)
        for x in np.arange(1500, W, 2000):
            lattice_tower(d, x, x + 24, base, base - 420, 3)
            d.ellipse([x - 50, base - 470, x + 74, base - 420], fill=255)
    tw = shapes_mask(towers)
    c.over(hexc("0e1824"), tw)
    rim_light(c, tw, "9fb8d0", 0.5, 2)
    for x in np.arange(820, W, 1400):
        c.over(hexc("ffb35a"), shapes_mask(lambda d: d.rectangle([x + 4, base - 344, x + 56, base - 318], fill=255)))
        lamp(c, x + 30, base - 330, "ffb35a", 70, 0.10)
    for x in np.arange(1500, W, 2000):
        lamp(c, x + 12, base - 476, "ff3a2a", 8, 1.0)
    def fence(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(0, W, 90):
            d.line([(x, base + 6), (x + 4, base - 64)], fill=255, width=4)
        for k in range(3):
            pts = [(x, base - 20 - k * 18 + 6 * math.sin(x / 45 + k)) for x in np.arange(0, W + 10, 15)]
            d.line(pts, fill=255, width=2)
    c.over(hexc("101a24"), shapes_mask(fence) * 0.9)
    ground(c, seed + 2, base, 26, "121c28", "b4c8dc", 0.75)
    grain(c, seed + 3, 0.02)
    return c


def paint_jungle_mid(seed: int = 171) -> Canvas:
    c = strip_canvas()
    r = rng(seed)
    base = 575.0
    moss = fbm(W, H, 90, 4, seed + 1)
    def ruins(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(200, W, 900):
            w = r.uniform(300, 460); h = r.uniform(170, 260)
            d.rectangle([x, base - h, x + w, base], fill=255)
            for k in range(int(w // 34)):
                if r.random() < 0.6:
                    d.rectangle([x + k * 34, base - h - r.uniform(8, 40), x + k * 34 + 26, base - h], fill=255)
    def arches(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(200, W, 900):
            for k in range(3):
                ax = x + 40 + k * 100
                d.rectangle([ax, base - 120, ax + 56, base], fill=255)
                d.ellipse([ax, base - 150, ax + 56, base - 92], fill=255)
    rm = np.clip(shapes_mask(ruins) - shapes_mask(arches), 0, 1)
    stone = lerp(hexc("1c2a22"), hexc("38503e"), np.clip(moss * 1.5 - 0.4, 0, 1)[..., None])
    c.over(stone, rm)
    c.over(hexc("2e5a30"), rm * np.clip(moss * 3 - 1.7, 0, 1))
    rim_light(c, rm, "9fc8a8", 0.35, -3)
    def trunks(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(600, W, 760):
            w = r.uniform(46, 80)
            lean = r.uniform(-30, 30)
            d.polygon([(x - w, base), (x + w, base), (x + w * 0.45 + lean, -10), (x - w * 0.45 + lean, -10)], fill=255)
            for side in (-1, 1):
                d.polygon([(x + side * w * 0.3, base - 120), (x + side * w * 2.2, base), (x + side * w * 0.6, base)], fill=255)
    tm = shapes_mask(trunks)
    bark = fbm(W, H, 260, 3, seed + 2, aspect=0.15)
    c.over(lerp(hexc("0c1610"), hexc("22301f"), bark[..., None]), tm)
    rim_light(c, tm, "8fb89c", 0.4, -3)
    def vines(d: ImageDraw.ImageDraw) -> None:
        for x in np.arange(30, W, 70):
            if r.random() < 0.55:
                length = r.uniform(80, 380)
                sway = r.uniform(-30, 30)
                pts = [(x + sway * math.sin(t / 10 * math.pi), t / 10 * length) for t in range(11)]
                d.line(pts, fill=255, width=3)
                for t in range(2, 11, 2):
                    px, py = pts[t]
                    d.ellipse([px - 7, py - 4, px + 7, py + 4], fill=255)
    # Vines hang from the trunks only, never from the strip's top edge.
    trunk_cols = np.arange(600, W, 760)
    vm = shapes_mask(vines) * (np.min(np.abs(c.xx[..., None] - trunk_cols[None, None, :]), axis=2) < 170)
    c.over(hexc("10221a"), vm)
    def ferns(d: ImageDraw.ImageDraw) -> None:
        x = 0.0
        while x < W:
            fx = x + r.uniform(0, 120)
            for k in range(9):
                ang = -math.pi * (0.1 + 0.8 * k / 8)
                ln = r.uniform(60, 120)
                pts = [(fx + math.cos(ang) * ln * t / 6, base + 4 + math.sin(ang) * ln * t / 6 + (t / 6) ** 2 * 22) for t in range(7)]
                d.line(pts, fill=255, width=6)
            x += r.uniform(140, 300)
    fm = shapes_mask(ferns)
    c.over(lerp(hexc("0e2014"), hexc("2e5a36"), moss[..., None] * 0.6), fm)
    c.over(hexc("5c8a60"), np.clip(fm - np.roll(fm, 3, axis=0), 0, 1) * 0.4)
    for x in np.arange(380, W, 900):
        lamp(c, x, base - 60, "ff9a40", 9, 1.0)
        lamp(c, x, base - 60, "ff8a30", 90, 0.12)
    ground(c, seed + 3, base, 20, "10201a", "4e7a58", 0.5)
    # Trunks rise out of frame: fade them into the storm instead of a hard cut.
    c.alpha = c.alpha * np.clip(c.yy / 220, 0, 1) ** 1.5
    grain(c, seed + 4, 0.02)
    return c


MID_PAINTERS = {
    "harbor_dusk_mid_v1": paint_harbor_mid,
    "alpine_night_mid_v1": paint_alpine_mid,
    "jungle_storm_mid_v1": paint_jungle_mid,
}


PAINTERS = {
    "harbor_dusk_far_v1": paint_harbor,
    "alpine_night_far_v1": paint_alpine,
    "jungle_storm_far_v1": paint_jungle,
}


def to_image(c: Canvas, size: tuple[int, int]) -> Image.Image:
    rgba = np.dstack([np.clip(c.rgb, 0, 1), np.clip(c.alpha, 0, 1)])
    img = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")
    return img.resize(size, Image.LANCZOS)


def encode(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=84, method=6, exact=False)
    return buf.getvalue()


def write_parts(name: str, data: bytes) -> list[pathlib.Path]:
    text = base64.b64encode(data).decode("ascii")
    chunks = [text[i:i + PART_CHARS] for i in range(0, len(text), PART_CHARS)]
    paths = []
    for old in ART_DIR.glob(f"{name}_part*.gd"):
        old.unlink()
    for index, chunk in enumerate(chunks):
        path = ART_DIR / f"{name}_part{index}.gd"
        path.write_text(f'extends RefCounted\nconst DATA := "{chunk}"\n', encoding="ascii")
        paths.append(path)
    # Index script, so the runtime never hardcodes how many parts there are.
    preloads = ", ".join(f'preload("res://art/{name}_part{i}.gd")' for i in range(len(chunks)))
    (ART_DIR / f"{name}.gd").write_text(f"extends RefCounted\nconst PARTS := [{preloads}]\n", encoding="ascii")
    return paths


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--png", type=pathlib.Path, help="also write review PNGs here")
    parser.add_argument("--only", choices=sorted(PAINTERS) + sorted(MID_PAINTERS))
    args = parser.parse_args()
    jobs = [(n, p, (2048, 806, False), OUT) for n, p in PAINTERS.items()]
    jobs += [(n, p, (STRIP_W, STRIP_H, True), STRIP_OUT) for n, p in MID_PAINTERS.items()]
    for name, painter, canvas, size in jobs:
        if args.only and name != args.only:
            continue
        set_canvas(*canvas)
        img = to_image(painter(), size)
        data = encode(img)
        if args.png:
            args.png.mkdir(parents=True, exist_ok=True)
            img.save(args.png / f"{name}.png")
        paths = write_parts(name, data)
        print(f"{name}: {len(data)} bytes webp → {len(paths)} part(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
