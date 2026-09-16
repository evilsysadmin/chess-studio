#!/usr/bin/env python3
"""Derive runtime cells from the immutable approved Matthias master.

The master is external to Git. Pillow + OpenCV are required. There are no
generative steps: crop, background matte, uniform resize and lossless WebP pack.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSETS = ROOT / 'frontend/src/assets/pawnSlug'
MASTER_SHA256 = '9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f'

# Only screen-right poses; rear views, lettering and portrait are excluded.
BOXES = {
    'aim': [(100, 573, 191, 687)],
    'walk': [(90, 276, 179, 403), (192, 276, 281, 403), (296, 276, 382, 403), (397, 276, 482, 403)],
    'run': [(78, 419, 170, 546), (181, 419, 275, 546), (287, 419, 379, 546), (388, 419, 480, 546)],
    'crouch': [(774, 755, 881, 883)],
}

# Silhouette guides in normalized crop coordinates protect black clothing from
# the similarly dark sheet background. GrabCut only refines the narrow edge.
GUIDES = {
    'aim': [(12,21),(26,10),(50,1),(66,1),(73,6),(71,19),(72,27),(65,29),(65,38),(94,38),(98,43),(96,48),(78,49),(75,56),(70,60),(64,63),(57,65),(58,76),(65,85),(65,91),(76,96),(76,99),(54,99),(51,91),(48,80),(42,81),(34,90),(26,94),(26,99),(6,99),(5,93),(10,88),(17,75),(22,71),(12,69),(8,59),(8,50),(13,43),(22,40),(17,35),(16,28)],
    'walk': [(24,20),(35,12),(54,4),(72,1),(84,2),(88,6),(85,18),(85,21),(89,26),(81,29),(79,37),(72,42),(67,45),(69,49),(68,54),(80,58),(81,63),(74,66),(68,65),(62,71),(73,78),(76,84),(85,85),(88,89),(77,95),(67,98),(63,94),(58,85),(50,79),(43,75),(35,82),(25,87),(23,92),(22,98),(15,100),(10,98),(6,90),(4,85),(6,80),(17,73),(24,68),(18,64),(16,60),(17,50),(22,45),(29,42),(36,40),(31,36),(30,28)],
    'run': [(23,22),(35,12),(57,3),(76,2),(84,6),(84,17),(88,25),(83,28),(79,38),(69,44),(73,49),(80,53),(82,60),(76,64),(66,63),(62,70),(69,75),(71,80),(84,84),(89,90),(77,98),(69,99),(64,94),(55,86),(45,81),(39,79),(26,84),(19,85),(18,94),(12,96),(8,93),(5,83),(7,76),(18,73),(26,65),(20,64),(16,59),(18,49),(26,44),(34,42),(33,35),(31,28)],
    'crouch': [(19,20),(35,10),(52,4),(64,3),(74,5),(78,11),(75,22),(76,26),(70,29),(69,40),(92,44),(97,48),(96,53),(79,54),(76,61),(70,65),(60,66),(60,76),(69,79),(70,86),(72,91),(78,94),(78,98),(56,98),(49,94),(39,96),(31,98),(8,97),(7,92),(11,86),(8,80),(10,68),(12,57),(19,50),(26,47),(23,40),(22,33)]
}


def extract(source, box, name):
    crop = np.array(source.crop(box))
    rgb = cv2.cvtColor(crop[:, :, :3], cv2.COLOR_RGB2BGR)
    h, w = rgb.shape[:2]
    guide = np.zeros((h, w), np.uint8)
    points = np.array([(round(x*(w-1)/100), round(y*(h-1)/100)) for x,y in GUIDES[name]], np.int32)
    cv2.fillPoly(guide, [points], 255)
    inner = cv2.erode(guide, np.ones((5,5), np.uint8))
    outer = cv2.dilate(guide, np.ones((5,5), np.uint8))
    mask = np.full((h,w), cv2.GC_BGD, np.uint8)
    mask[outer > 0] = cv2.GC_PR_BGD
    mask[guide > 0] = cv2.GC_PR_FGD
    mask[inner > 0] = cv2.GC_FGD
    cv2.setRNGSeed(0)
    cv2.grabCut(rgb, mask, None, np.zeros((1,65)), np.zeros((1,65)), 8, cv2.GC_INIT_WITH_MASK)
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    crop[:,:,3] = np.minimum(crop[:,:,3], alpha)
    return Image.frombytes('RGBA', (w,h), crop.tobytes())


def parse_args():
    parser = argparse.ArgumentParser(description='Derive Pawn Slug runtime art from the approved external Matthias master')
    parser.add_argument('--master', required=True, type=Path, help='path to the exact approved 1536x1024 PNG master')
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_ASSETS, help='runtime asset output directory')
    return parser.parse_args()


def main():
    args = parse_args()
    master = args.master.expanduser().resolve()
    assets = args.output_dir.expanduser().resolve()
    assets.mkdir(parents=True, exist_ok=True)

    master_bytes = master.read_bytes()
    assert hashlib.sha256(master_bytes).hexdigest() == MASTER_SHA256, 'Approved master changed or wrong master supplied'
    source = Image.open(master).convert('RGBA')
    assert source.size == (1536, 1024), 'Approved master dimensions changed'

    cells = {name: [extract(source, b, name) for b in boxes] for name, boxes in BOXES.items()}
    pixels = np.zeros((960, 768, 4), dtype=np.uint8)
    tracks = {'idle': ('aim', 0), 'walk': ('walk', 1), 'run': ('run', 2), 'crouch': ('crouch', 3), 'jump': ('aim', 4)}
    for action, (name, row) in tracks.items():
        for col, cell in enumerate(cells[name]):
            # Shared source-pixel scale retains crouch height and ground anchor.
            raster = cv2.resize(np.array(cell), (round(cell.width * 1.04), round(cell.height * 1.04)), interpolation=cv2.INTER_CUBIC)
            h, w = raster.shape[:2]
            x, y = col * 192 + (192-w)//2, row * 192 + 168-h
            pixels[y:y+h, x:x+w] = raster
    atlas = Image.frombytes('RGBA', (768, 960), pixels.tobytes())
    cv2.imwrite(str(assets / 'matthias_canonical_pistol_v1.webp'), cv2.cvtColor(pixels, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_WEBP_QUALITY, 101])

    meta = {'version': 'canonical-handoff-v1', 'masterSha256': MASTER_SHA256, 'width': 768, 'height': 960,
            'frameWidth': 192, 'frameHeight': 192, 'guardTexels': 2, 'footAnchorPx': 24,
            'sourceFacing': 'right', 'weapon': 'pistol', 'sourceBoxes': BOXES,
            'actions': {a: {'row': row, 'count': len(cells[n])} for a, (n, row) in tracks.items()},
            'fallbacks': {'jump': 'aim pose; existing runtime jump motion', 'unknownAction': 'idle',
                          'otherWeapons': 'immutable weapon-specific R2 atlases'},
            'processing': 'crop + seeded GrabCut background matte + uniform scale + lossless WebP'}
    (assets / 'matthias_canonical_pistol_v1.json').write_text(json.dumps(meta, indent=2) + '\n')

    assert hashlib.sha256(master.read_bytes()).hexdigest() == MASTER_SHA256
    print('Derived atlas:', atlas.size)


if __name__ == '__main__':
    main()
