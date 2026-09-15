#!/usr/bin/env python3
"""Render one canonical Pawn Slug Matthias weapon sheet from the Blender source."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import bpy

import build_pawn_slug_matthias_integrated as canonical


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/pawn-slug-art')
    parser.add_argument('--weapon', choices=canonical.WEAPONS, required=True)
    argv = os.sys.argv[os.sys.argv.index('--') + 1:] if '--' in os.sys.argv else []
    return parser.parse_args(argv)


def materials():
    return (
        canonical.mat('skin', (0.77, 0.61, 0.49, 1), 0.0, 0.62),
        canonical.mat('uniform_black', (0.025, 0.030, 0.038, 1), 0.05, 0.50),
        canonical.mat('helmet_black', (0.012, 0.015, 0.020, 1), 0.18, 0.28),
        canonical.mat('armor', (0.085, 0.095, 0.105, 1), 0.15, 0.40),
        canonical.mat('boots', (0.020, 0.021, 0.024, 1), 0.10, 0.32),
        canonical.mat('badge', (0.80, 0.78, 0.70, 1), 0.20, 0.30),
        canonical.mat('gunmetal', (0.055, 0.065, 0.075, 1), 0.72, 0.24),
        canonical.mat('polymer', (0.020, 0.024, 0.029, 1), 0.05, 0.43),
        canonical.mat('olive', (0.19, 0.22, 0.15, 1), 0.28, 0.48),
        canonical.mat('brass', (0.40, 0.25, 0.08, 1), 0.72, 0.24),
    )


def main():
    cfg = args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    canonical.TOTAL_ROWS = canonical.ROWS_PER_WEAPON
    canonical.clear_scene()
    scene = canonical.setup_scene()
    mats = materials()
    for row, (action, count) in enumerate(canonical.ACTIONS):
        for frame in range(count):
            origin = (frame * canonical.WORLD_CELL_X, 0, -row * canonical.WORLD_CELL_Z)
            canonical.build_matthias(origin, action, frame, count, cfg.weapon, mats)
    blend_path = out / f'matthias_{cfg.weapon}_integrated_v1.blend'
    png_path = out / f'matthias_{cfg.weapon}_atlas_v1.png'
    scene.render.filepath = str(png_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f'Wrote {blend_path}')
    print(f'Wrote {png_path}')


if __name__ == '__main__':
    main()
