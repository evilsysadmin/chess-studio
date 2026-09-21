#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

VERSION = 'v20'
WEAPON = 'pistol'
SRC_CELL = 128
SRC_COLS = 8
SRC_ROWS = 9
SRC_SIZE = (1024, 1152)
SOURCE_SHA256 = '0f80c7b127b1cd4ea5a5b7bcbfc181dd0bf7a0037bf36288f71cd78aaab75911'
CELL = 416
COLS = 8
ROWS = 18
SIZE = (3328, 7488)
PIVOT_X = 200.0
FOOT_Y = 382.0
SRC_PIVOT_X = 64.0
SRC_FOOT_Y = 116.0
SCALE = 2.75
GUARD = 2
REPLACED_ROWS = list(range(8, 17))
ACTIONS = ['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def clean_cell(cell: Image.Image) -> Image.Image:
    px = cell.load()
    for y in range(CELL):
        for x in range(CELL):
            r,g,b,a = px[x,y]
            if a == 0 or x < GUARD or y < GUARD or x >= CELL-GUARD or y >= CELL-GUARD:
                px[x,y] = (0,0,0,0)
    return cell

def normalize_source_cell(cell: Image.Image) -> Image.Image:
    target = Image.new('RGBA', (CELL, CELL), (0,0,0,0))
    scaled = cell.resize((round(SRC_CELL*SCALE), round(SRC_CELL*SCALE)), Image.Resampling.NEAREST)
    x = round(PIVOT_X - SRC_PIVOT_X*SCALE)
    y = round(FOOT_Y - SRC_FOOT_Y*SCALE)
    target.alpha_composite(scaled, (x, y))
    return clean_cell(target)

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path)
    p.add_argument('--baseline', type=Path)
    p.add_argument('--output', type=Path)
    p.add_argument('--manifest', type=Path)
    p.add_argument('--self-test', action='store_true')
    a = p.parse_args()
    if a.self_test:
        assert SRC_SIZE == (SRC_COLS*SRC_CELL, SRC_ROWS*SRC_CELL)
        assert SIZE == (COLS*CELL, ROWS*CELL)
        assert len(ACTIONS) == ROWS and REPLACED_ROWS == list(range(8,17))
        print('OK strict-v20 pack self-test')
        return 0
    if not all((a.source, a.baseline, a.output, a.manifest)):
        raise SystemExit('source/baseline/output/manifest required')
    if sha(a.source) != SOURCE_SHA256:
        raise SystemExit(f'source SHA mismatch: {sha(a.source)}')
    source = Image.open(a.source).convert('RGBA')
    baseline = Image.open(a.baseline).convert('RGBA')
    if source.size != SRC_SIZE:
        raise SystemExit(f'expected source {SRC_SIZE}, got {source.size}')
    if baseline.size != SIZE:
        raise SystemExit(f'expected baseline {SIZE}, got {baseline.size}')
    out = baseline.copy()
    for row in REPLACED_ROWS:
        for col in range(COLS):
            source_row = row - 8
            src_box = (col*SRC_CELL, source_row*SRC_CELL, (col+1)*SRC_CELL, (source_row+1)*SRC_CELL)
            dst_box = (col*CELL, row*CELL)
            out.paste(normalize_source_cell(source.crop(src_box)), dst_box)
    # clean transparent RGB globally while preserving visible baseline pixels byte-for-byte
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r,g,b,alpha = px[x,y]
            if alpha == 0:
                px[x,y] = (0,0,0,0)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    out.save(a.output, 'PNG', compress_level=9)
    manifest = {
        'schema': 1,
        'kind': 'pawn-slug-godot-strict-atlas',
        'version': VERSION,
        'weapon': WEAPON,
        'source': {
            'filename': a.source.name,
            'sha256': SOURCE_SHA256,
            'cell_size': SRC_CELL,
            'columns': SRC_COLS,
            'rows': SRC_ROWS,
            'pivot_x': SRC_PIVOT_X,
            'foot_y': SRC_FOOT_Y,
        },
        'baseline': {'filename': a.baseline.name, 'sha256': sha(a.baseline), 'generation': 'v19'},
        'atlas': {
            'filename': a.output.name,
            'sha256': sha(a.output),
            'columns': COLS,
            'rows': ROWS,
            'cell_size': CELL,
            'width': SIZE[0],
            'height': SIZE[1],
            'pivot_x': PIVOT_X,
            'foot_y': FOOT_Y,
            'frames_per_pose': COLS,
            'cell_guard_px': GUARD,
        },
        'actions': {name: {'row': row, 'frames': COLS} for row, name in enumerate(ACTIONS)},
        'processing': {
            'blender': False,
            'kind': '2d-generated-combat-bank-normalization',
            'resample': 'nearest',
            'scale': SCALE,
            'replaced_rows': REPLACED_ROWS,
            'preserved_rows': [0,1,2,3,4,5,6,7,17],
            'weapon_contract': 'one compact P99 with a single two-hand grip silhouette',
            'hurt_contract': 'standing flinch with squeezed eye/grimace; never knockdown',
            'layout_contract': 'fixed 8x18 grid',
        },
    }
    a.manifest.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(a.output)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())