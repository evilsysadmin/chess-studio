#!/usr/bin/env python3
"""Recover Sven's eight *reference* views from his pinned original art sheet.

These are low-resolution, background-backed 2D drawings. Never claim that
this produces a rigged GLB, a directional animation atlas, clean alpha, or
an approved model. The Dust Veil V41 golden remains the visual authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / 'docs/experiments/chesscom-sven-turnaround-v48.json'
DIRECTIONS = ('front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left')


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_contract(path: Path = CONTRACT) -> dict:
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if (data.get('identity') != 'chesscom-sven-eight-view-reference-v48'
            or data.get('review_only') is not True):
        raise ValueError('untrusted-turnaround-contract')
    for name in ('golden', 'sheet'):
        entry = data.get(name)
        if (not isinstance(entry, dict)
                or not isinstance(entry.get('sha256'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', entry['sha256'])
                or not isinstance(entry.get('size'), list)
                or len(entry['size']) != 2
                or any(type(size) is not int or size <= 0 for size in entry['size'])):
            raise ValueError('invalid-source-contract:' + name)
    views = data.get('views')
    if not isinstance(views, list) or len(views) != len(DIRECTIONS):
        raise ValueError('incomplete-turnaround-views')
    bounds = data['sheet']['size']
    seen = set()
    for direction, view in zip(DIRECTIONS, views):
        if not isinstance(view, dict) or view.get('direction') != direction:
            raise ValueError('turnaround-direction-order-mismatch')
        box = view.get('box')
        if (not isinstance(box, list) or len(box) != 4
                or any(type(value) is not int for value in box)
                or not (0 <= box[0] < box[2] <= bounds[0]
                        and 0 <= box[1] < box[3] <= bounds[1])):
            raise ValueError('invalid-turnaround-crop')
        if tuple(box) in seen:
            raise ValueError('duplicate-turnaround-crop')
        seen.add(tuple(box))
    for a in range(len(views)):
        xa, ya, ra, ba = views[a]['box']
        for b in range(a + 1, len(views)):
            xb, yb, rb, bb = views[b]['box']
            if xa < rb and xb < ra and ya < bb and yb < ba:
                raise ValueError('overlapping-turnaround-crops')
    return data


def verified_rgb(path: Path, contract: dict, name: str) -> Image.Image:
    entry = contract[name]
    if sha256(path) != entry['sha256']:
        raise ValueError(name + '-sha256-mismatch')
    with Image.open(path) as opened:
        if opened.format != 'PNG' or list(opened.size) != entry['size'] or opened.mode != 'RGB':
            raise ValueError(name + '-png-layout-mismatch')
        return opened.copy()


def prepare(golden: Path, sheet: Path, output: Path, contract_path: Path = CONTRACT) -> dict:
    contract = load_contract(contract_path)
    # Both inputs are mandatory: source sheet does not supersede the approved
    # gameplay reference merely because it has more viewpoints.
    verified_rgb(golden, contract, 'golden')
    picture = verified_rgb(sheet, contract, 'sheet')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    views = []
    for view in contract['views']:
        box = view['box']
        image = picture.crop(tuple(box))
        file = output / ('sven-reference-' + view['direction'] + '.png')
        image.save(file)
        views.append({
            'direction': view['direction'], 'box': box, 'file': file.name,
            'size': list(image.size), 'sha256': sha256(file),
            'pixels_unscaled': True, 'transparent': False,
            'purpose': 'manual-3d-modeling-reference-only',
        })
    report = {
        'identity': 'chesscom-sven-eight-view-handoff-v48',
        'golden_sha256': contract['golden']['sha256'],
        'sheet_sha256': contract['sheet']['sha256'],
        'views': views, 'view_count': len(views),
        'readiness': 'multiview-concept-reference-available',
        'runtime_ready': False, 'artist_approved_glb': False,
        'skinned_3d_mesh_present': False, 'animated_atlas_present': False,
        'auto_image_to_3d_ready': False,
        'risk': 'Small effective per-view pixels, sheet labels/background, inconsistent source perspectives; author a real 3D mesh/rig and validate against V41.',
        'review_only': True, 'source_uploaded_externally': False, 'external_cost_incurred': 0,
    }
    (output / 'reference-manifest.json').write_text(
        json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--golden', required=True, type=Path)
    p.add_argument('--sheet', required=True, type=Path)
    p.add_argument('--output-dir', required=True, type=Path)
    p.add_argument('--contract', type=Path, default=CONTRACT)
    args = p.parse_args()
    result = prepare(args.golden, args.sheet, args.output_dir, args.contract)
    print(json.dumps({'readiness': result['readiness'], 'view_count': result['view_count'],
                      'runtime_ready': False}, sort_keys=True))


if __name__ == '__main__':
    main()
