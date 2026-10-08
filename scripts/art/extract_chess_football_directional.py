#!/usr/bin/env python3
"""Extract the approved Football 4x8 directional sheet by full-figure components.

This is a review candidate only until Godot runtime and visual QA approve it.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

VIEWS = ('front', 'back', 'back_diagonal', 'front_diagonal')
CELL = (128, 144)
FOOTLINE = 130
FRAMES_PER_VIEW = 8
EXPECTED_SOURCE_SHA256 = 'f4102df3dff9620606ddb3c2ff8fb234b150f255562561e2b1b7a8fc3802dee7'
EXPECTED_ATLAS_SHA256 = '7d23e79dd5f9b23d1a04cf27f4d725d249e37f528c23d696ea260cd498644e70'

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def extract(source: Path, destination: Path) -> dict:
    if sha256(source) != EXPECTED_SOURCE_SHA256:
        raise RuntimeError('Source differs from the approved supplemental Football canon')
    rgba = Image.open(source).convert('RGBA')
    assert rgba.size == (1448, 1086), f'unexpected approved canonical source: {rgba.size}'
    arr = np.asarray(rgba)
    number, labels, statistics, centroids = cv2.connectedComponentsWithStats(
        np.uint8(arr[:, :, 3] > 40), connectivity=8
    )
    valid = [(i, *map(int, statistics[i][:4]), int(statistics[i][4]))
             for i in range(1, number) if statistics[i][4] > 1000]
    if len(valid) != 32:
        raise RuntimeError(f'Expected 32 intact footballers; found {len(valid)}. Fail closed.')
    rows = []
    for row_idx in range(4):
        row_items = [(i, x, y, w, h, area) for i, x, y, w, h, area in valid
                     if int((y + 0.5*h) * 4 / rgba.height) == row_idx]
        if len(row_items) != 8:
            raise RuntimeError(f'{VIEWS[row_idx]}: expected 8 complete figures, got {len(row_items)}')
        rows.append(sorted(row_items, key=lambda item:item[1]))
    canvas = Image.new('RGBA', (CELL[0]*8, CELL[1]*4))
    metadata = []
    for row, entries in enumerate(rows):
        max_height = max(e[4] for e in entries)
        scale = 122.0 / max_height
        for col, (component_id,x,y,w,h,area) in enumerate(entries):
            # Conservative two-pixel context retains the semi-transparent outline.
            pad=2
            bounds=(max(0,x-pad), max(0,y-pad), min(rgba.width,x+w+pad), min(rgba.height,y+h+pad))
            crop=rgba.crop(bounds)
            new_size=(round(crop.width*scale),round(crop.height*scale))
            if new_size[0] > 124 or new_size[1] > FOOTLINE:
                raise RuntimeError(f'{row}/{col}: scaling clips source footprint: {new_size}')
            piece=crop.resize(new_size,Image.Resampling.LANCZOS)
            offset=(col*CELL[0]+(CELL[0]-new_size[0])//2,
                    row*CELL[1]+FOOTLINE-new_size[1])
            canvas.alpha_composite(piece,offset)
            metadata.append(dict(view=VIEWS[row],frame=col,source_bounds=bounds,
                                 source_area=area,normalized_size=new_size,offset=offset))
    # Transparencies are preserved; lossless palette indexing reduces Web download.
    indexed=canvas.quantize(colors=128,method=Image.Quantize.FASTOCTREE,
                            dither=Image.Dither.NONE)
    destination.parent.mkdir(parents=True,exist_ok=True)
    indexed.save(destination,optimize=True,compress_level=9)
    if sha256(destination) != EXPECTED_ATLAS_SHA256:
        raise RuntimeError('Generated atlas differs from reviewed canonical bytes')
    decoded=Image.open(destination).convert('RGBA')
    for row in range(4):
        for col in range(8):
            a=decoded.crop((col*128,row*144,col*128+128,row*144+144)).getchannel('A')
            bb=a.point(lambda p:255 if p>24 else 0).getbbox()
            if not bb or bb[0]<3 or bb[2]>125 or bb[1]<2 or bb[3]>134:
                raise RuntimeError(f'{VIEWS[row]} frame {col}: clipped or empty: {bb}')
    manifest = dict(schema=1,visual_contract='football-directional-run-canon-v1',
                    views=list(VIEWS),frames_per_view=8,
                    cell=dict(width=128,height=144),footline=FOOTLINE,
                    source_sha256=sha256(source), atlas_sha256=sha256(destination),
                    component_count=len(valid),frame_details=metadata)
    destination.with_suffix('.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    print(json.dumps({k:v for k,v in extract(args.source,args.output).items() if k!='frame_details'},indent=2))