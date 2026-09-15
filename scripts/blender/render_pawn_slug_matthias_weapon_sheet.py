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
        canonical.mat('uniform_black', (0.045, 0.055, 0.068, 1), 0.05, 0.48),
        canonical.mat('helmet_black', (0.025, 0.030, 0.038, 1), 0.18, 0.26),
        canonical.mat('armor', (0.11, 0.125, 0.145, 1), 0.15, 0.38),
        canonical.mat('boots', (0.028, 0.030, 0.035, 1), 0.10, 0.31),
        canonical.mat('badge', (0.80, 0.78, 0.70, 1), 0.20, 0.30),
        canonical.mat('gunmetal', (0.10, 0.12, 0.14, 1), 0.72, 0.22),
        canonical.mat('polymer', (0.030, 0.036, 0.043, 1), 0.05, 0.40),
        canonical.mat('olive', (0.24, 0.28, 0.17, 1), 0.28, 0.45),
        canonical.mat('brass', (0.52, 0.33, 0.10, 1), 0.72, 0.22),
    )


def atlas_center():
    return Vector((
        (canonical.COLS - 1) * canonical.WORLD_CELL_X / 2,
        0.0,
        -(canonical.ROWS_PER_WEAPON - 1) * canonical.WORLD_CELL_Z / 2 + 1.08,
    ))


def aim_camera(scene):
    """Lock the orthographic camera to the authored X/Z sprite plane."""
    target = atlas_center()
    cam = scene.camera
    cam.location = (target.x, -78.0, target.z)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # Blender's ortho_scale is the VERTICAL world span, not the width. The
    # raster is 1536x480 (aspect 3.2), so a five-cell-high 16.0 world-unit
    # viewport automatically becomes 51.2 units wide: exactly 16 cells.
    # Using COLS * WORLD_CELL_X here crushed several authored rows into every
    # 96px frame even though the final PNG dimensions looked correct.
    cam.data.ortho_scale = canonical.TOTAL_ROWS * canonical.WORLD_CELL_Z


def add_front_fill():
    """Give black tactical kit readable form without flattening the premium rim."""
    target = atlas_center()
    bpy.ops.object.light_add(type='AREA', location=(target.x - 3.5, -26.0, target.z + 5.0))
    fill = bpy.context.object
    fill.name = 'PawnSlug_Matthias_FrontFill'
    fill.data.energy = 1050
    fill.data.color = (1.0, 0.82, 0.66)
    fill.data.shape = 'RECTANGLE'
    fill.data.size = 42
    fill.data.size_y = 26
    fill.rotation_euler = (target - fill.location).to_track_quat('-Z', 'Y').to_euler()


def descendants(obj):
    for child in obj.children:
        yield child
        yield from descendants(child)


def separate_visual_layers(base):
    """Keep face, hands and weapon readable in the orthographic gameplay bake.

    The first canonical pass authored all parts around y=0. In a real 3D scene
    that caused the helmet front hemisphere to cover the eyes and the vest to
    swallow most forearms/weapon geometry. These are actual depth corrections,
    not a runtime overlay: the final frame is still one Blender render.
    """
    for obj in descendants(base):
        stem = obj.name.split('.')[0]
        if stem in {'helmet_dome', 'helmet_brim'}:
            obj.location.y += 0.16
        elif stem.startswith(('front_upper_arm', 'front_forearm', 'front_hand')):
            obj.location.y -= 0.34
        elif stem.startswith(('rear_upper_arm', 'rear_forearm', 'rear_hand')):
            obj.location.y -= 0.25
        elif stem.startswith('weapon_'):
            # Moving the weapon root also moves all authored weapon components.
            obj.location.y -= 0.38


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
    add_front_fill()
    mats = materials()
    for row, (action, count) in enumerate(canonical.ACTIONS):
        for frame in range(count):
            origin = (frame * canonical.WORLD_CELL_X, 0, -row * canonical.WORLD_CELL_Z)
            base = canonical.build_matthias(origin, action, frame, count, cfg.weapon, mats)
            separate_visual_layers(base)
    blend_path = out / f'matthias_{cfg.weapon}_integrated_v1.blend'
    png_path = out / f'matthias_{cfg.weapon}_atlas_v1.png'
    scene.render.filepath = str(png_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f'Wrote {blend_path}')
    print(f'Wrote {png_path}')


if __name__ == '__main__':
    main()
