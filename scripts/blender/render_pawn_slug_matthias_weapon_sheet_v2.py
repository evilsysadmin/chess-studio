#!/usr/bin/env python3
"""Render a readable Blender-authored Matthias + integrated weapon atlas.

V2 deliberately builds the visible combat silhouette from scratch instead of
layering a second "front" over the legacy model.  At 96 px the priorities are:
clear body/legs, small readable head, two hands on the weapon, and a weapon
silhouette that projects to screen-right without colliding with neighbour cells.
"""
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

CELL_WORLD = 3.20
ORIGIN_SHIFT_X = -0.24
ORIGIN_SHIFT_Z = -0.24
CHARACTER_CENTER_Z = 1.22


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/pawn-slug-art')
    parser.add_argument('--weapon', choices=canonical.WEAPONS, required=True)
    argv = os.sys.argv[os.sys.argv.index('--') + 1:] if '--' in os.sys.argv else []
    return parser.parse_args(argv)


def materials():
    return {
        'skin': canonical.mat('v2_skin', (0.58, 0.36, 0.24, 1), 0.0, 0.62),
        'uniform': canonical.mat('v2_uniform', (0.018, 0.028, 0.045, 1), 0.03, 0.48),
        'uniform2': canonical.mat('v2_uniform2', (0.045, 0.070, 0.105, 1), 0.05, 0.42),
        'armor': canonical.mat('v2_armor', (0.075, 0.105, 0.145, 1), 0.24, 0.30),
        'helmet': canonical.mat('v2_helmet', (0.020, 0.026, 0.034, 1), 0.28, 0.22),
        'boot': canonical.mat('v2_boot', (0.018, 0.020, 0.025, 1), 0.12, 0.28),
        'ivory': canonical.mat('v2_badge', (0.90, 0.84, 0.68, 1), 0.24, 0.27),
        'gunmetal': canonical.mat('v2_gunmetal', (0.32, 0.42, 0.56, 1), 0.78, 0.18),
        'dark': canonical.mat('v2_weapon_dark', (0.035, 0.045, 0.055, 1), 0.36, 0.28),
        'polymer': canonical.mat('v2_polymer', (0.040, 0.055, 0.080, 1), 0.08, 0.38),
        'olive': canonical.mat('v2_olive', (0.18, 0.34, 0.12, 1), 0.26, 0.39),
        'brass': canonical.mat('v2_brass', (0.62, 0.38, 0.10, 1), 0.76, 0.20),
    }


def cube(name, loc, dims, material, rot=(0.0, 0.0, 0.0), parent=None):
    """Create a cube using real dimensions, not Blender scale half-extents."""
    return canonical.cube(
        name, loc,
        tuple(component for component in dims),
        material, rot=rot, parent=parent,
    )


def limb(name, origin, a, b, thickness, material, parent, y=-0.18):
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    length = math.hypot(dx, dz)
    angle = math.atan2(dz, dx)
    center = ((ax + bx) / 2, (az + bz) / 2)
    # canonical cube dimensions equal the supplied scale because the primitive is size=1.
    return cube(
        name,
        canonical.xz(origin, center[0], center[1], y),
        (length, 0.16, thickness),
        material,
        rot=(0.0, -angle, 0.0),
        parent=parent,
    )


def add_weapon(weapon, origin, base, m, z):
    """Weapon points toward negative world-X, which is screen-right for this camera."""
    y = -0.42
    if weapon == 'pistol':
        cube('v2_pistol_slide', canonical.xz(origin, -0.42, z, y), (0.54, 0.22, 0.16), m['gunmetal'], parent=base)
        cube('v2_pistol_frame', canonical.xz(origin, -0.30, z - 0.13, y), (0.32, 0.20, 0.13), m['polymer'], parent=base)
        cube('v2_pistol_grip', canonical.xz(origin, -0.16, z - 0.31, y), (0.17, 0.20, 0.36), m['polymer'], rot=(0, 0.18, 0), parent=base)
        canonical.cyl('v2_pistol_muzzle', canonical.xz(origin, -0.72, z, y), 0.075, 0.12, m['dark'], rot=(0, math.pi / 2, 0), vertices=12, parent=base)
        return -0.30, -0.50

    if weapon == 'machinegun':
        cube('v2_smg_receiver', canonical.xz(origin, -0.43, z, y), (0.64, 0.24, 0.22), m['gunmetal'], parent=base)
        canonical.cyl('v2_smg_barrel', canonical.xz(origin, -0.91, z + 0.01, y), 0.055, 0.42, m['dark'], rot=(0, math.pi / 2, 0), vertices=12, parent=base)
        cube('v2_smg_handguard', canonical.xz(origin, -0.72, z - 0.01, y), (0.30, 0.25, 0.24), m['polymer'], parent=base)
        cube('v2_smg_mag', canonical.xz(origin, -0.39, z - 0.31, y), (0.14, 0.18, 0.42), m['dark'], rot=(0, 0.10, 0), parent=base)
        cube('v2_smg_stock', canonical.xz(origin, -0.02, z + 0.01, y), (0.28, 0.15, 0.13), m['polymer'], parent=base)
        return -0.27, -0.70

    if weapon == 'shotgun':
        cube('v2_shotgun_receiver', canonical.xz(origin, -0.34, z, y), (0.56, 0.24, 0.22), m['gunmetal'], parent=base)
        canonical.cyl('v2_shotgun_barrel', canonical.xz(origin, -0.92, z + 0.035, y), 0.055, 0.92, m['dark'], rot=(0, math.pi / 2, 0), vertices=14, parent=base)
        canonical.cyl('v2_shotgun_tube', canonical.xz(origin, -0.88, z - 0.08, y), 0.040, 0.72, m['gunmetal'], rot=(0, math.pi / 2, 0), vertices=12, parent=base)
        canonical.cyl('v2_shotgun_pump', canonical.xz(origin, -0.73, z - 0.02, y - 0.01), 0.105, 0.34, m['polymer'], rot=(0, math.pi / 2, 0), vertices=12, parent=base)
        cube('v2_shotgun_stock', canonical.xz(origin, 0.04, z - 0.03, y), (0.34, 0.22, 0.22), m['polymer'], rot=(0, -0.05, 0), parent=base)
        return -0.21, -0.72

    canonical.cyl('v2_panzer_tube', canonical.xz(origin, -0.47, z + 0.03, y), 0.13, 1.18, m['olive'], rot=(0, math.pi / 2, 0), vertices=16, parent=base)
    canonical.cyl('v2_panzer_rear', canonical.xz(origin, 0.13, z + 0.03, y), 0.18, 0.20, m['dark'], rot=(0, math.pi / 2, 0), vertices=16, parent=base)
    canonical.cyl('v2_panzer_warhead', canonical.xz(origin, -1.10, z + 0.03, y), 0.19, 0.34, m['olive'], rot=(0, math.pi / 2, 0), vertices=16, parent=base)
    cube('v2_panzer_grip', canonical.xz(origin, -0.34, z - 0.27, y), (0.16, 0.20, 0.36), m['dark'], rot=(0, 0.10, 0), parent=base)
    cube('v2_panzer_sight', canonical.xz(origin, -0.42, z + 0.20, y), (0.20, 0.10, 0.10), m['gunmetal'], parent=base)
    return -0.20, -0.72


def build_matthias(origin, action, frame, count, weapon, m):
    p = canonical.pose(action, frame, count)
    base = canonical.root(f'v2_{weapon}_{action}_{frame:02d}', origin)
    crouch = p['crouch']
    body_z = p['body_z'] - crouch * 0.64

    hip_z = 0.76 + body_z
    for side, sx, angle, lift in (
        ('rear', 0.11, p['l_leg'], p['l_lift']),
        ('front', -0.15, p['r_leg'], p['r_lift']),
    ):
        foot_x = sx + math.sin(angle) * 0.28
        foot_z = 0.15 + lift + p['jump'] * 0.11
        knee_x = sx + math.sin(angle) * 0.14
        knee_z = 0.46 + lift * 0.44 + body_z * 0.20
        limb(f'v2_{side}_thigh', origin, (sx, hip_z), (knee_x, knee_z), 0.18, m['uniform2'], base, y=0.06 if side == 'rear' else -0.05)
        limb(f'v2_{side}_shin', origin, (knee_x, knee_z), (foot_x, foot_z + 0.10), 0.16, m['uniform'], base, y=0.05 if side == 'rear' else -0.06)
        cube(f'v2_{side}_boot', canonical.xz(origin, foot_x - 0.04, foot_z, -0.08), (0.34, 0.28, 0.18), m['boot'], parent=base)

    # Narrow body on the screen-left half leaves clean negative-X space for the weapon.
    cube('v2_pelvis', canonical.xz(origin, 0.30, 0.77 + body_z, 0.02), (0.42, 0.32, 0.24), m['uniform'], parent=base)
    cube('v2_torso', canonical.xz(origin, 0.30, 1.15 + body_z, 0.02), (0.48, 0.34, 0.56), m['uniform'], rot=(0, p['lean'], 0), parent=base)
    cube('v2_vest', canonical.xz(origin, 0.20, 1.15 + body_z, -0.20), (0.36, 0.08, 0.40), m['armor'], parent=base)
    cube('v2_pouch', canonical.xz(origin, 0.36, 0.96 + body_z, -0.24), (0.15, 0.09, 0.14), m['armor'], parent=base)

    # Small, distinct head: helmet never swallows the torso at 96 px.
    canonical.sphere('v2_face', canonical.xz(origin, 0.30, 1.66 + body_z, -0.20), (0.145, 0.115, 0.145), m['skin'], segments=18, rings=9, parent=base)
    canonical.sphere('v2_helmet', canonical.xz(origin, 0.31, 1.79 + body_z, -0.02), (0.20, 0.16, 0.12), m['helmet'], segments=18, rings=9, parent=base)
    cube('v2_helmet_brim', canonical.xz(origin, 0.16, 1.73 + body_z, -0.19), (0.25, 0.08, 0.055), m['helmet'], parent=base)
    cube('v2_brow', canonical.xz(origin, 0.18, 1.68 + body_z, -0.30), (0.08, 0.035, 0.025), m['helmet'], rot=(0, 0.08, 0), parent=base)
    cube('v2_eye', canonical.xz(origin, 0.15, 1.65 + body_z, -0.315), (0.028, 0.03, 0.028), m['helmet'], parent=base)
    canonical.sphere('v2_badge_head', canonical.xz(origin, 0.31, 1.82 + body_z, -0.185), (0.030, 0.020, 0.030), m['ivory'], segments=10, rings=6, parent=base)
    cube('v2_badge_base', canonical.xz(origin, 0.31, 1.78 + body_z, -0.185), (0.08, 0.035, 0.025), m['ivory'], parent=base)

    weapon_z = 1.23 + body_z - crouch * 0.02
    rear_grip_x, support_x = add_weapon(weapon, origin, base, m, weapon_z)

    shoulder_rear = (0.23, 1.35 + body_z)
    shoulder_front = (0.18, 1.31 + body_z)
    rear_elbow = (-0.04, 1.23 + body_z)
    front_elbow = (-0.22, 1.18 + body_z)
    limb('v2_rear_upper_arm', origin, shoulder_rear, rear_elbow, 0.13, m['uniform'], base, y=-0.20)
    limb('v2_rear_forearm', origin, rear_elbow, (rear_grip_x, weapon_z - 0.03), 0.12, m['armor'], base, y=-0.33)
    limb('v2_front_upper_arm', origin, shoulder_front, front_elbow, 0.13, m['uniform2'], base, y=-0.24)
    limb('v2_front_forearm', origin, front_elbow, (support_x, weapon_z - 0.04), 0.12, m['armor'], base, y=-0.36)
    canonical.sphere('v2_rear_hand', canonical.xz(origin, rear_grip_x, weapon_z - 0.04, -0.48), (0.075, 0.055, 0.075), m['skin'], segments=10, rings=6, parent=base)
    canonical.sphere('v2_front_hand', canonical.xz(origin, support_x, weapon_z - 0.04, -0.49), (0.075, 0.055, 0.075), m['skin'], segments=10, rings=6, parent=base)
    return base


def setup_scene():
    canonical.TOTAL_ROWS = canonical.ROWS_PER_WEAPON
    canonical.WORLD_CELL_X = CELL_WORLD
    canonical.WORLD_CELL_Z = CELL_WORLD
    scene = canonical.setup_scene()
    target = Vector((
        (canonical.COLS - 1) * CELL_WORLD / 2,
        0.0,
        -(canonical.ROWS_PER_WEAPON - 1) * CELL_WORLD / 2 + CHARACTER_CENTER_Z,
    ))
    cam = scene.camera
    cam.location = (target.x, -66.0, target.z)
    cam.rotation_euler = (math.pi / 2, 0.0, 0.0)
    cam.data.ortho_scale = canonical.COLS * CELL_WORLD
    for obj in bpy.context.scene.objects:
        if getattr(obj, 'type', None) == 'LIGHT':
            obj.data.color = (1.0, 1.0, 1.0)
            obj.data.energy *= 0.72

    # Strong neutral front light: dark uniform and gunmetal must remain separable.
    bpy.ops.object.light_add(type='AREA', location=(target.x - 4.0, -22.0, target.z + 6.0))
    front = bpy.context.object
    front.data.energy = 1250
    front.data.color = (1.0, 1.0, 1.0)
    front.data.shape = 'RECTANGLE'
    front.data.size = 36
    front.data.size_y = 24
    front.rotation_euler = (target - front.location).to_track_quat('-Z', 'Y').to_euler()
    return scene


def main():
    cfg = args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    canonical.clear_scene()
    scene = setup_scene()
    m = materials()
    for row, (action, count) in enumerate(canonical.ACTIONS):
        for frame in range(count):
            origin = (frame * CELL_WORLD + ORIGIN_SHIFT_X, 0.0, -row * CELL_WORLD + ORIGIN_SHIFT_Z)
            build_matthias(origin, action, frame, count, cfg.weapon, m)

    blend_path = out / f'matthias_{cfg.weapon}_integrated_v1.blend'
    png_path = out / f'matthias_{cfg.weapon}_atlas_v1.png'
    scene.render.filepath = str(png_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f'Wrote {blend_path}')
    print(f'Wrote {png_path}')


if __name__ == '__main__':
    main()
