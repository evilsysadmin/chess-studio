#!/usr/bin/env python3
"""Build the canonical editable Blender scene and runtime GLB for Pawn Slug POWs.

The runtime contract is one GLB containing all three overlapping pose variants.
Every mesh name is stable and prefixed as:
  <pose>__<group>__<part>
where pose is bound/kneeling/caged and group is body/chains/cage.

Example:
  blender --background --python scripts/blender/build_pawn_slug_pows.py -- \
    --blend art/blender/pawn-slug/pawn_slug_pow_squad_v1.blend \
    --glb frontend/public/models/pawn-slug/pawn_slug_pow_squad_v1.glb
"""
import argparse
import math
import os
import sys

import bpy

POSES = ('bound', 'kneeling', 'caged')
COLORS = {
    'olive': (0.26, 0.31, 0.25, 1),
    'olive_dark': (0.16, 0.20, 0.16, 1),
    'webbing': (0.33, 0.27, 0.20, 1),
    'leather': (0.15, 0.13, 0.11, 1),
    'skin': (0.69, 0.49, 0.38, 1),
    'steel': (0.28, 0.31, 0.34, 1),
    'brass': (0.61, 0.47, 0.21, 1),
    'dark': (0.09, 0.10, 0.10, 1),
    'red': (0.49, 0.18, 0.15, 1),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--blend', required=True)
    parser.add_argument('--glb', required=True)
    tail = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(tail)


def ensure_parent(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def material(name, metallic=0.04, roughness=0.86):
    mat = bpy.data.materials.new(f'pow_{name}')
    mat.diffuse_color = COLORS[name]
    mat.metallic = metallic
    mat.roughness = roughness
    return mat


def build_materials():
    result = {name: material(name) for name in COLORS}
    for name in ('steel', 'brass'):
        result[name].metallic = 0.72
        result[name].roughness = 0.42
    return result


def part_name(pose, group, label):
    return f'{pose}__{group}__{label}'


def finish(obj, pose, group, label, mat):
    obj.name = part_name(pose, group, label)
    obj.data.name = f'{obj.name}_mesh'
    obj.data.materials.append(mat)
    return obj


def box(pose, group, label, size, mat, location=(0, 0, 0), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = finish(bpy.context.object, pose, group, label, mat)
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cylinder(pose, group, label, radius, depth, mat, location=(0, 0, 0), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish(bpy.context.object, pose, group, label, mat)


def sphere(pose, group, label, radius, mat, location=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = finish(bpy.context.object, pose, group, label, mat)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def build_prisoner(pose, m):
    kneeling = pose in ('kneeling', 'caged')
    base = 0.60 if kneeling else 0.72
    body = 'body'
    cylinder(pose, body, 'torso', 0.24, 0.60, m['olive'], (0, base, 0), (math.pi / 2, 0, 0))
    box(pose, body, 'vest', (0.43, 0.32, 0.15), m['olive_dark'], (0, base + 0.02, 0.15))
    box(pose, body, 'left_pouch', (0.13, 0.14, 0.09), m['webbing'], (-0.16, base - 0.10, 0.19))
    box(pose, body, 'right_pouch', (0.13, 0.14, 0.09), m['webbing'], (0.16, base - 0.10, 0.19))
    box(pose, body, 'belt', (0.52, 0.055, 0.10), m['webbing'], (0, base - 0.25, 0.02))
    box(pose, body, 'buckle', (0.08, 0.07, 0.03), m['brass'], (0, base - 0.25, 0.08))
    cylinder(pose, body, 'neck', 0.085, 0.13, m['skin'], (0, base + 0.39, 0), (math.pi / 2, 0, 0))
    sphere(pose, body, 'head', 0.19, m['skin'], (0, base + 0.56, 0.01), (0.93, 1.04, 0.92))
    sphere(pose, body, 'nose', 0.04, m['skin'], (0, base + 0.56, 0.18), (0.8, 1, 1.2))
    cylinder(pose, body, 'helmet', 0.215, 0.11, m['olive_dark'], (0, base + 0.72, 0), (math.pi / 2, 0, 0))
    box(pose, body, 'helmet_brim', (0.35, 0.035, 0.14), m['olive_dark'], (0, base + 0.67, 0.10))
    box(pose, body, 'chinstrap', (0.035, 0.20, 0.035), m['leather'], (0.18, base + 0.52, 0.03), (0, 0, -0.28))

    arm_angle = 0.72 if pose == 'caged' else (0.86 if pose == 'kneeling' else 0.62)
    shoulder = base + 0.10
    cylinder(pose, body, 'left_upper_arm', 0.066, 0.39, m['olive'], (-0.22, shoulder, 0.03), (0, 0, arm_angle))
    cylinder(pose, body, 'right_upper_arm', 0.066, 0.39, m['olive'], (0.22, shoulder, 0.03), (0, 0, -arm_angle))
    hand_y = base - (0.08 if kneeling else 0.03)
    sphere(pose, body, 'left_hand', 0.072, m['skin'], (-0.09, hand_y, 0.20))
    sphere(pose, body, 'right_hand', 0.072, m['skin'], (0.09, hand_y, 0.20))

    if kneeling:
        cylinder(pose, body, 'left_thigh', 0.085, 0.35, m['olive_dark'], (-0.14, 0.34, 0), (0, 0, -0.55))
        cylinder(pose, body, 'right_thigh', 0.085, 0.35, m['olive_dark'], (0.14, 0.34, 0), (0, 0, 0.55))
        cylinder(pose, body, 'left_shin', 0.075, 0.34, m['olive_dark'], (-0.24, 0.18, 0.10), (0, 0, 0.86))
        cylinder(pose, body, 'right_shin', 0.075, 0.34, m['olive_dark'], (0.24, 0.18, 0.10), (0, 0, -0.86))
        box(pose, body, 'left_boot', (0.22, 0.13, 0.32), m['leather'], (-0.30, 0.08, 0.15), (0, -0.12, 0))
        box(pose, body, 'right_boot', (0.22, 0.13, 0.32), m['leather'], (0.30, 0.08, 0.15), (0, 0.12, 0))
    else:
        cylinder(pose, body, 'left_leg', 0.082, 0.46, m['olive_dark'], (-0.14, 0.25, 0), (0, 0, -0.08))
        cylinder(pose, body, 'right_leg', 0.082, 0.46, m['olive_dark'], (0.14, 0.25, 0), (0, 0, 0.08))
        box(pose, body, 'left_boot', (0.20, 0.14, 0.34), m['leather'], (-0.16, 0.07, 0.10))
        box(pose, body, 'right_boot', (0.20, 0.14, 0.34), m['leather'], (0.16, 0.07, 0.10))

    box(pose, body, 'rank_patch', (0.08, 0.09, 0.018), m['red'], (-0.19, base + 0.18, 0.23))
    box(pose, body, 'dog_tags', (0.04, 0.07, 0.012), m['steel'], (0, base + 0.14, 0.255))
    cylinder(pose, body, 'base_plate', 0.46, 0.025, m['dark'], (0, 0.01, 0), (math.pi / 2, 0, 0))

    if pose != 'caged':
        chains = 'chains'
        box(pose, chains, 'cuff_left', (0.13, 0.035, 0.035), m['steel'], (-0.085, hand_y, 0.20))
        box(pose, chains, 'cuff_right', (0.13, 0.035, 0.035), m['steel'], (0.085, hand_y, 0.20))
        for index in range(5):
            box(pose, chains, f'link_{index}', (0.08, 0.018, 0.018), m['steel'], (-0.16 + index * 0.08, base + 0.38 - index * 0.06, 0.30), (0, 0, -0.4 if index % 2 else 0.4))

    if pose == 'caged':
        cage = 'cage'
        box(pose, cage, 'floor', (1.46, 0.10, 0.82), m['steel'], (0, 0.05, 0))
        box(pose, cage, 'roof', (1.46, 0.10, 0.82), m['steel'], (0, 1.78, 0))
        for xi, x in enumerate((-0.68, 0.68)):
            for zi, z in enumerate((-0.34, 0.34)):
                box(pose, cage, f'post_{xi}_{zi}', (0.075, 1.72, 0.075), m['steel'], (x, 0.91, z))
        for index, x in enumerate((-0.55, -0.33, -0.11, 0.11, 0.33, 0.55)):
            box(pose, cage, f'front_bar_{index}', (0.045, 1.58, 0.045), m['steel'], (x, 0.90, 0.36))
        box(pose, cage, 'lock', (0.18, 0.20, 0.06), m['brass'], (0.39, 0.95, 0.40))


def main():
    parsed = parse_args()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.render.fps = 24
    materials = build_materials()
    for pose in POSES:
        build_prisoner(pose, materials)

    ensure_parent(parsed.blend)
    ensure_parent(parsed.glb)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(parsed.blend), compress=True)

    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {
        'filepath': os.path.abspath(parsed.glb),
        'export_format': 'GLB',
        'export_animations': False,
        'export_yup': True,
    }
    if 'export_apply' in props:
        kwargs['export_apply'] = True
    bpy.ops.export_scene.gltf(**kwargs)
    print('Pawn Slug canonical POW Blender scene:', parsed.blend, parsed.glb)


if __name__ == '__main__':
    main()
