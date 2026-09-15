#!/usr/bin/env python3
"""Render one canonical Pawn Slug Matthias weapon sheet from the Blender source."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_pawn_slug_matthias_integrated as canonical


CELL_WORLD = 3.20


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
        canonical.mat('gunmetal', (0.10, 0.12, 0.14, 1), 0.72, 0.22),
        canonical.mat('polymer', (0.030, 0.036, 0.043, 1), 0.05, 0.40),
        canonical.mat('olive', (0.24, 0.28, 0.17, 1), 0.28, 0.45),
        canonical.mat('brass', (0.52, 0.33, 0.10, 1), 0.72, 0.22),
    )


def aim_camera(scene):
    """Lock the orthographic camera to the X/Z sprite plane explicitly.

    Euler-only camera setup proved too fragile across Blender versions and could
    turn the integrated weapon into depth. A tracked -Z axis guarantees that
    +X remains screen-horizontal and Z remains screen-vertical.
    """
    center_x = (canonical.COLS - 1) * canonical.WORLD_CELL_X / 2
    center_z = -(canonical.ROWS_PER_WEAPON - 1) * canonical.WORLD_CELL_Z / 2 + 1.08
    cam = scene.camera
    cam.location = (center_x, -78.0, center_z)
    target = Vector((center_x, 0.0, center_z))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def main():
    cfg = args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    canonical.TOTAL_ROWS = canonical.ROWS_PER_WEAPON
    # Give every 96x96 frame enough authored world-space to contain Matthias,
    # his full run/jump silhouette and the longest integrated weapon without
    # bleeding into neighbouring cells. The raster contract stays 1536x480.
    canonical.WORLD_CELL_X = CELL_WORLD
    canonical.WORLD_CELL_Z = CELL_WORLD
    canonical.clear_scene()
    scene = canonical.setup_scene()
    aim_camera(scene)
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
