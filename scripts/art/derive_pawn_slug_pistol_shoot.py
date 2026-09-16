#!/usr/bin/env python3
"""Derive the runtime pistol SHOOT strip from the immutable Matthias master.

The master and generated WebP belong in R2, never Git. This script is only the
reproducible textual recipe used by the asset-publish workflow.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

MASTER_SHA256 = '9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f'
FRAME_WIDTH = 192
FRAME_HEIGHT = 192
BOTTOM_GUTTER = 24

# Two clean front-facing SHOOT poses. Muzzle flash remains a runtime FX, so the
# crops deliberately stop before the baked flare in the source sheet.
SHOOT_BOXES = (
    (100, 573, 191, 687),
    (205, 573, 299, 687),
)

# Normalized silhouette guide inherited from the approved canonical pistol
# extraction. It protects Matthias' black uniform from the similarly dark sheet
# background while GrabCut only resolves the narrow edge.
SHOOT_GUIDE = (
    (12,21),(26,10),(50,1),(66,1),(73,6),(71,19),(72,27),(65,29),
    (65,38),(94,38),(98,43),(96,48),(78,49),(75,56),(70,60),(64,63),
    (57,65),(58,76),(65,85),(65,91),(76,96),(76,99),(54,99),(51,91),
    (48,80),(42,81),(34,90),(26,94),(26,99),(6,99),(5,93),(10,88),
    (17,75),(22,71),(12,69),(8,59),(8,50),(13,43),(22,40),(17,35),
    (16,28),
)


def extract(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = np.array(source.crop(box))
    rgb = cv2.cvtColor(crop[:, :, :3], cv2.COLOR_RGB2BGR)
    height, width = rgb.shape[:2]
    guide = np.zeros((height, width), np.uint8)
    points = np.array([
        (round(x * (width - 1) / 100), round(y * (height - 1) / 100))
        for x, y in SHOOT_GUIDE
    ], np.int32)
    cv2.fillPoly(guide, [points], 255)
    inner = cv2.erode(guide, np.ones((5, 5), np.uint8))
    outer = cv2.dilate(guide, np.ones((5, 5), np.uint8))
    mask = np.full((height, width), cv2.GC_BGD, np.uint8)
    mask[outer > 0] = cv2.GC_PR_BGD
    mask[guide > 0] = cv2.GC_PR_FGD
    mask[inner > 0] = cv2.GC_FGD
    cv2.setRNGSeed(0)
    cv2.grabCut(
        rgb,
        mask,
        None,
        np.zeros((1, 65)),
        np.zeros((1, 65)),
        8,
        cv2.GC_INIT_WITH_MASK,
    )
    alpha = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)
    crop[:, :, 3] = np.minimum(crop[:, :, 3], alpha)
    return Image.fromarray(crop)


def derive(master: Path, output: Path) -> None:
    payload = master.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != MASTER_SHA256:
        raise SystemExit(f'wrong Matthias master SHA-256: {digest}')

    source = Image.open(master).convert('RGBA')
    if source.size != (1536, 1024):
        raise SystemExit(f'wrong Matthias master dimensions: {source.size}')

    pixels = np.zeros((FRAME_HEIGHT, FRAME_WIDTH * len(SHOOT_BOXES), 4), dtype=np.uint8)
    for column, box in enumerate(SHOOT_BOXES):
        cell = extract(source, box)
        raster = cv2.resize(
            np.array(cell),
            (round(cell.width * 1.04), round(cell.height * 1.04)),
            interpolation=cv2.INTER_CUBIC,
        )
        height, width = raster.shape[:2]
        x = column * FRAME_WIDTH + (FRAME_WIDTH - width) // 2
        y = FRAME_HEIGHT - BOTTOM_GUTTER - height
        pixels[y:y + height, x:x + width] = raster

    output.parent.mkdir(parents=True, exist_ok=True)
    ok = cv2.imwrite(
        str(output),
        cv2.cvtColor(pixels, cv2.COLOR_RGBA2BGRA),
        [cv2.IMWRITE_WEBP_QUALITY, 101],
    )
    if not ok:
        raise SystemExit(f'could not write {output}')
    print(f'DERIVED {output} {output.stat().st_size} bytes sha256={hashlib.sha256(output.read_bytes()).hexdigest()}')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--master', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    derive(args.master.expanduser().resolve(), args.output.expanduser().resolve())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
