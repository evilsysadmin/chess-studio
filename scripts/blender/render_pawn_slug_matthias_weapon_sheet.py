#!/usr/bin/env python3
"""Render one canonical Pawn Slug Matthias weapon sheet from the Blender source."""
from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_pawn_slug_matthias_integrated as canonical


CELL_WORLD = 5.40
CHARACTER_CENTER_Z = 1.50


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/pawn-slug-art')
    parser.add_argument('--weapon', choices=canonical.WEAPONS, required=True)
    argv = os.sys.argv[os.sys.argv.index('--') + 1:] if '--' in os.sys.argv else []
    return parser.parse_args(argv)


def materials():
    return (
        canonical.mat('skin', (0.78, 0.62, 0.49, 1), 0.0, 0.58),
        canonical.mat('uniform_black', (0.075, 0.085, 0.105, 1), 0.05, 0.46),
        canonical.mat('helmet_black', (0.035, 0.042, 0.052, 1), 0.22, 0.24),
        canonical.mat('armor', (0.17, 0.19, 0.22, 1), 0.15, 0.34),
        canonical.mat('boots', (0.045, 0.050, 0.060, 1), 0.10, 0.31),
        canonical.mat('badge', (0.88, 0.84, 0.72, 1), 0.20, 0.28),
        canonical.mat('gunmetal', (0.24, 0.27, 0.31, 1), 0.78, 0.20),
        canonical.mat('polymer', (0.075, 0.085, 0.10, 1), 0.05, 0.36),
        canonical.mat('olive', (0.30, 0.35, 0.19, 1), 0.28, 0.41),
        canonical.mat('brass', (0.62, 0.40, 0.12, 1), 0.76, 0.20),
    )


def atlas_center():
    return Vector((
        (canonical.COLS - 1) * canonical.WORLD_CELL_X / 2,
        0.0,
        -(canonical.ROWS_PER_WEAPON - 1) * canonical.WORLD_CELL_Z / 2 + CHARACTER_CENTER_Z,
    ))


def aim_camera(scene):
    """Lock the orthographic camera to the authored X/Z sprite plane."""
    target = atlas_center()
    cam = scene.camera
    cam.location = (target.x, -78.0, target.z)
    cam.rotation_euler = (math.pi / 2, 0.0, 0.0)
    # One Blender cell must map to one 96x96 raster cell. In this render
    # ortho_scale is the horizontal world span; the image aspect supplies the
    # corresponding five-row vertical span.
    cam.data.ortho_scale = canonical.COLS * canonical.WORLD_CELL_X


def add_front_fill():
    target = atlas_center()
    bpy.ops.object.light_add(type='AREA', location=(target.x - 3.5, -26.0, target.z + 5.0))
    fill = bpy.context.object
    fill.name = 'PawnSlug_Matthias_FrontFill'
    fill.data.energy = 1250
    fill.data.color = (1.0, 0.84, 0.70)
    fill.data.shape = 'RECTANGLE'
    fill.data.size = 42
    fill.data.size_y = 26
    fill.rotation_euler = (target - fill.location).to_track_quat('-Z', 'Y').to_euler()


def normalize_cube_proportions():
    """Make canonical cube dimensions use the same half-extents contract as spheres."""
    original_cube = canonical.cube

    def cube(name, loc, scale, material, rot=(0.0, 0.0, 0.0), parent=None):
        corrected = tuple(component * 2.0 for component in scale)
        return original_cube(name, loc, corrected, material, rot=rot, parent=parent)

    canonical.cube = cube


def descendants(obj):
    for child in obj.children:
        yield child
        yield from descendants(child)


def hide_legacy_front(base):
    """Retain authored legs/torso motion but replace the unreadable old front."""
    prefixes = (
        'head', 'hair', 'brow', 'eye', 'helmet_',
        'front_upper_arm', 'front_forearm', 'front_hand',
        'rear_upper_arm', 'rear_forearm', 'rear_hand',
        'weapon_',
    )
    for obj in descendants(base):
        stem = obj.name.split('.')[0]
        if stem.startswith(prefixes):
            obj.hide_render = True


def tactical_front(origin, base, action, frame, count, weapon, mats):
    """Author a readable tactical face, arms and weapon in the Blender bake."""
    skin, uniform, helmet, armor, _boot, ivory, gunmetal, polymer, olive, brass = mats
    p = canonical.pose(action, frame, count)
    body_z = p['body_z'] - p['crouch']
    crouch = p['crouch']

    # Compact Matthias profile: expressive enough at 96 px without swallowing
    # the torso or the integrated weapon.
    canonical.sphere(
        'tactical_face', canonical.xz(origin, 0.03, 1.80 + body_z, -0.34),
        (0.19, 0.070, 0.17), skin, segments=20, rings=10, parent=base,
    )
    canonical.sphere(
        'tactical_nose', canonical.xz(origin, 0.225, 1.79 + body_z, -0.39),
        (0.042, 0.035, 0.042), skin, segments=12, rings=6, parent=base,
    )
    canonical.cube(
        'tactical_eye', canonical.xz(origin, 0.135, 1.835 + body_z, -0.425),
        (0.018, 0.010, 0.022), helmet, parent=base,
    )
    canonical.cube(
        'tactical_brow', canonical.xz(origin, 0.105, 1.885 + body_z, -0.422),
        (0.065, 0.010, 0.014), helmet, rot=(0, -0.08, 0), parent=base,
    )
    canonical.cube(
        'tactical_hair', canonical.xz(origin, -0.025, 1.93 + body_z, -0.39),
        (0.16, 0.020, 0.040), helmet, parent=base,
    )

    canonical.sphere(
        'tactical_helmet', canonical.xz(origin, -0.02, 2.045 + body_z, -0.08),
        (0.28, 0.15, 0.17), helmet, segments=24, rings=12, parent=base,
    )
    canonical.cube(
        'tactical_helmet_brim', canonical.xz(origin, 0.09, 1.94 + body_z, -0.25),
        (0.22, 0.045, 0.025), helmet, parent=base,
    )
    canonical.sphere(
        'tactical_badge_head', canonical.xz(origin, -0.02, 2.08 + body_z, -0.275),
        (0.035, 0.015, 0.035), ivory, segments=10, rings=6, parent=base,
    )
    canonical.cube(
        'tactical_badge_stem', canonical.xz(origin, -0.02, 2.03 + body_z, -0.276),
        (0.018, 0.012, 0.026), ivory, parent=base,
    )
    canonical.cube(
        'tactical_badge_base', canonical.xz(origin, -0.02, 1.99 + body_z, -0.277),
        (0.050, 0.012, 0.014), ivory, parent=base,
    )

    canonical.cube(
        'tactical_vest_front', canonical.xz(origin, 0.02, 1.22 + body_z, -0.27),
        (0.31, 0.045, 0.31), armor, parent=base,
    )
    canonical.cube(
        'tactical_chest_panel', canonical.xz(origin, 0.10, 1.30 + body_z, -0.322),
        (0.19, 0.024, 0.12), uniform, parent=base,
    )
    canonical.cube(
        'tactical_pouch_front', canonical.xz(origin, -0.17, 1.00 + body_z, -0.31),
        (0.09, 0.035, 0.10), armor, parent=base,
    )

    weapon_z = 1.38 + body_z - crouch * 0.05
    support_x = {
        'pistol': 0.54,
        'machinegun': 0.82,
        'shotgun': 0.93,
        'panzerfaust': 0.94,
    }[weapon]
    rear_x = 0.34

    canonical.limb_box(
        'tactical_rear_arm', origin, (0.08, 1.43 + body_z, -0.35),
        0.48, 0.16, -0.30, uniform, base, depth=0.055,
    )
    canonical.limb_box(
        'tactical_rear_forearm', origin, (0.34, weapon_z, -0.37),
        0.42, 0.15, 0.02, armor, base, depth=0.05,
    )
    canonical.limb_box(
        'tactical_front_arm', origin, (0.19, 1.40 + body_z, -0.38),
        0.48, 0.16, -0.38, uniform, base, depth=0.05,
    )
    canonical.limb_box(
        'tactical_front_forearm', origin, ((support_x + 0.18) / 2, weapon_z - 0.03, -0.40),
        max(0.38, support_x * 0.55), 0.15, 0.01, armor, base, depth=0.05,
    )

    weapon_group = canonical.add_weapon(
        weapon, origin, base, (gunmetal, helmet, polymer, olive, brass), z=weapon_z,
    )
    weapon_group.location.y -= 0.52

    canonical.sphere(
        'tactical_rear_hand', canonical.xz(origin, rear_x + 0.13, weapon_z - 0.055, -0.59),
        (0.075, 0.038, 0.075), skin, segments=12, rings=6, parent=base,
    )
    canonical.sphere(
        'tactical_front_hand', canonical.xz(origin, support_x, weapon_z - 0.045, -0.60),
        (0.075, 0.038, 0.075), skin, segments=12, rings=6, parent=base,
    )


def main():
    cfg = args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    canonical.TOTAL_ROWS = canonical.ROWS_PER_WEAPON
    canonical.WORLD_CELL_X = CELL_WORLD
    canonical.WORLD_CELL_Z = CELL_WORLD
    normalize_cube_proportions()
    canonical.clear_scene()
    scene = canonical.setup_scene()
    aim_camera(scene)
    add_front_fill()
    mats = materials()
    for row, (action, count) in enumerate(canonical.ACTIONS):
        for frame in range(count):
            origin = (frame * canonical.WORLD_CELL_X, 0, -row * canonical.WORLD_CELL_Z)
            base = canonical.build_matthias(origin, action, frame, count, cfg.weapon, mats)
            hide_legacy_front(base)
            tactical_front(origin, base, action, frame, count, cfg.weapon, mats)
    blend_path = out / f'matthias_{cfg.weapon}_integrated_v1.blend'
    png_path = out / f'matthias_{cfg.weapon}_atlas_v1.png'
    scene.render.filepath = str(png_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f'Wrote {blend_path}')
    print(f'Wrote {png_path}')


if __name__ == '__main__':
    main()
