#!/usr/bin/env python3
"""Derive a stronger Knight silhouette from the approved Pawn Slug row-1 gait."""
from __future__ import annotations

from PIL import Image, ImageDraw

CELL = 80
FRAMES = 8
SOURCE_ROW = 1
ALPHA_FLOOR = 4

INK = (20, 19, 17, 255)
STEEL = (71, 65, 55, 255)
STEEL_HI = (119, 103, 73, 255)
PLUME = (92, 39, 31, 255)
PLUME_HI = (147, 58, 42, 255)
VISOR_RED = (126, 45, 35, 255)


def alpha_bbox(image: Image.Image):
    alpha = image.convert("RGBA").getchannel("A")
    return alpha.point(lambda value: 255 if value > ALPHA_FLOOR else 0).getbbox()


def decorate_knight(frame: Image.Image, phase: int) -> Image.Image:
    out = frame.convert("RGBA").copy()
    before = alpha_bbox(out)
    if before is None:
        raise ValueError("Knight source frame is empty")
    d = ImageDraw.Draw(out)

    # Angular brow/visor makes the helmet read as the fast assault class at native size.
    d.polygon([(19, 21), (30, 17), (40, 19), (43, 24), (38, 28), (25, 28), (18, 25)], fill=INK)
    d.polygon([(21, 22), (30, 19), (38, 20), (41, 23), (37, 26), (25, 26), (20, 24)], fill=STEEL)
    d.line([(22, 22), (35, 21)], fill=STEEL_HI, width=1)
    d.rectangle((18, 24, 24, 27), fill=INK)
    d.line([(19, 25), (23, 25)], fill=VISOR_RED, width=1)

    # Swept plume/mane follows the existing torso phase without altering gait timing.
    sway = {0: 0, 1: 2, 2: 3, 3: 1, 4: -1, 5: -2, 6: -1, 7: 1}[phase]
    d.polygon(
        [(39, 18), (45, 16), (52 + sway, 14), (60 + sway, 16), (67 + sway, 20),
         (61 + sway, 23), (54 + sway, 22), (47, 20), (40, 21)],
        fill=INK,
    )
    d.polygon(
        [(43, 18), (48, 17), (54 + sway, 16), (61 + sway, 18), (64 + sway, 20),
         (59 + sway, 21), (53 + sway, 20), (47, 19)],
        fill=PLUME,
    )
    d.line([(49, 18), (58 + sway, 19)], fill=PLUME_HI, width=1)

    # One heavy pauldron and knee guard reinforce the quick-armoured silhouette.
    d.polygon([(48, 30), (58, 29), (65, 34), (63, 42), (55, 44), (48, 39)], fill=INK)
    d.polygon([(50, 31), (57, 31), (62, 34), (61, 39), (55, 41), (50, 38)], fill=STEEL)
    d.line([(53, 34), (56, 37), (59, 34)], fill=STEEL_HI, width=1)
    d.polygon([(41, 55), (49, 54), (53, 58), (50, 63), (43, 63), (39, 59)], fill=INK)
    d.polygon([(42, 56), (48, 56), (51, 58), (49, 61), (43, 61), (41, 59)], fill=STEEL)

    after = alpha_bbox(out)
    if after is None or after[3] != before[3]:
        raise ValueError(f"Knight phase {phase} changed foot line: {before} -> {after}")
    return out
