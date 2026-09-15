#!/usr/bin/env python3
"""Deterministically build the editable .blend and runtime .glb for Home Matthias."""
import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import bpy
from home_matthias_parts import build_character
from home_matthias_animations import build_actions


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--blend', required=True)
    parser.add_argument('--glb', required=True)
    tail = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(tail)


def parent(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def main():
    parsed = args()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.render.fps = 24

    rig = build_character()
    build_actions(rig)

    parent(parsed.blend)
    parent(parsed.glb)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(parsed.blend), compress=True)

    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {
        'filepath': os.path.abspath(parsed.glb),
        'export_format': 'GLB',
        'export_animations': True,
        'export_yup': True,
    }
    if 'export_apply' in props:
        kwargs['export_apply'] = True
    if 'export_animation_mode' in props:
        kwargs['export_animation_mode'] = 'NLA_TRACKS'
    elif 'export_nla_strips' in props:
        kwargs['export_nla_strips'] = True
    if 'export_optimize_animation_size' in props:
        kwargs['export_optimize_animation_size'] = True

    bpy.ops.export_scene.gltf(**kwargs)
    print('canonical Blender Matthias:', parsed.blend, parsed.glb)


if __name__ == '__main__':
    main()
