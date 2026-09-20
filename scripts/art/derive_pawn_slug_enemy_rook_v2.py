#!/usr/bin/env python3
"""Derive a square, battlement-inspired Rook silhouette from the approved heavy gait."""
from __future__ import annotations

from PIL import Image, ImageDraw

ALPHA_FLOOR = 4
INK = (19, 18, 16, 255)
STEEL_DARK = (48, 47, 42, 255)
STEEL = (67, 64, 56, 255)
STEEL_HI = (111, 100, 82, 255)
VISOR_RED = (119, 38, 31, 255)
VISOR_RED_HI = (178, 60, 47, 255)


def alpha_bbox(image: Image.Image):
    alpha = image.convert("RGBA").getchannel("A")
    return alpha.point(lambda value: 255 if value > ALPHA_FLOOR else 0).getbbox()


def decorate_rook(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    before = alpha_bbox(out)
    if before is None:
        raise ValueError("Rook source frame is empty")
    d = ImageDraw.Draw(out)

    # Battlement roofline: the heavy class now reads as a compact walking tower.
    d.rectangle((28, 17, 53, 23), fill=INK)
    d.rectangle((30, 18, 51, 22), fill=STEEL_DARK)
    for x0, x1 in ((29, 34), (39, 44), (49, 54)):
        d.rectangle((x0, 13, x1, 20), fill=INK)
        d.rectangle((x0 + 1, 14, x1 - 1, 19), fill=STEEL)
    d.line((31, 18, 50, 18), fill=STEEL_HI, width=1)

    # Wide square shoulder block and front slab with a narrow red visor.
    d.polygon([(49, 29), (61, 28), (68, 34), (67, 43), (56, 46), (49, 40)], fill=INK)
    d.polygon([(51, 31), (59, 30), (65, 34), (64, 40), (56, 43), (51, 38)], fill=STEEL_DARK)
    d.rectangle((56, 32, 62, 35), fill=STEEL)
    d.line((57, 32, 61, 32), fill=STEEL_HI, width=1)

    d.polygon([(19, 24), (31, 21), (40, 24), (41, 31), (36, 35), (24, 34), (19, 30)], fill=INK)
    d.polygon([(21, 25), (31, 23), (38, 25), (39, 30), (35, 32), (24, 32), (21, 29)], fill=STEEL_DARK)
    d.rectangle((21, 27, 31, 30), fill=VISOR_RED)
    d.line((22, 27, 28, 27), fill=VISOR_RED_HI, width=1)

    # Ribbed chest + lower slab square the mass without touching the gait or feet.
    d.rectangle((35, 39, 58, 53), fill=INK)
    d.rectangle((37, 40, 56, 51), fill=STEEL_DARK)
    for x in (39, 46, 53):
        d.line((x, 41, x, 50), fill=STEEL, width=2)
    d.line((38, 42, 55, 42), fill=STEEL_HI, width=1)
    d.polygon([(33, 51), (58, 51), (61, 57), (57, 61), (36, 60), (31, 56)], fill=INK)
    d.polygon([(35, 52), (56, 52), (59, 56), (56, 59), (37, 58), (33, 55)], fill=STEEL_DARK)

    after = alpha_bbox(out)
    if after is None or after[3] != before[3]:
        raise ValueError(f"Rook phase {phase} changed foot line: {before} -> {after}")
    return out
