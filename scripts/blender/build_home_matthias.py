#!/usr/bin/env python3
"""Deterministically build the editable .blend, runtime .glb and optional preview for Home Matthias."""
import argparse
import json
import os
import struct
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import bpy
from mathutils import Vector
from home_matthias_parts import build_character
from home_matthias_premium import (
    ASSET_VERSION,
    CANONICAL_REFERENCE_SHA256,
    apply_premium_canonical_pass,
)
from home_matthias_animations import build_actions


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--blend', required=True)
    parser.add_argument('--glb', required=True)
    parser.add_argument('--preview')
    tail = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(tail)


def parent(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def look_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def add_area(name, location, energy, size, color, target):
    data = bpy.data.lights.new(name=name, type='AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def add_face_anchor(rig):
    """Export an invisible front-of-face node for diagnostics and older clients."""
    anchor = bpy.data.objects.new('Nose', None)
    bpy.context.collection.objects.link(anchor)
    anchor.empty_display_type = 'PLAIN_AXES'
    anchor.empty_display_size = .025
    anchor.location = (0, -.405, 1.345)
    anchor['runtime_role'] = 'matthias-face-direction-anchor'

    world = anchor.matrix_world.copy()
    anchor.parent = rig
    anchor.parent_type = 'BONE'
    anchor.parent_bone = 'head'
    anchor.matrix_world = world
    return anchor


def assert_runtime_face_anchor(path):
    """Fail the canonical build if the exported GLB loses identity/runtime metadata."""
    with open(path, 'rb') as handle:
        magic, version, total_length = struct.unpack('<4sII', handle.read(12))
        assert magic == b'glTF' and version == 2, 'invalid Home Matthias GLB header'
        json_length, json_type = struct.unpack('<II', handle.read(8))
        assert json_type == 0x4E4F534A, 'Home Matthias GLB missing JSON chunk'
        document = json.loads(handle.read(json_length).decode('utf-8').rstrip('\x00 '))
    assert total_length == os.path.getsize(path), 'Home Matthias GLB length mismatch'
    nodes = document.get('nodes', [])
    node_names = {node.get('name') for node in nodes}
    assert 'Nose' in node_names, 'Home Matthias GLB lost runtime face anchor Nose'
    rig_node = next((node for node in nodes if node.get('name') == 'MatthiasRig'), None)
    assert rig_node is not None, 'Home Matthias GLB lost MatthiasRig'
    extras = rig_node.get('extras') or {}
    assert extras.get('matthias_asset_version') == ASSET_VERSION, extras
    assert extras.get('canonical_reference_sha256') == CANONICAL_REFERENCE_SHA256, extras


def configure_preview_samples(scene):
    samples = max(1, int(os.environ.get('BLENDER_PREVIEW_SAMPLES', '64')))
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = samples
    return samples


def render_preview(path):
    parent(path)
    scene = bpy.context.scene
    scene.frame_set(1)
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.render.filepath = os.path.abspath(path)
    scene.world.color = (0.018, 0.010, 0.008)
    samples = configure_preview_samples(scene)

    target = Vector((0, 0, 1.26))

    camera_data = bpy.data.cameras.new('MatthiasPreviewCamera')
    camera_data.lens = 66
    camera = bpy.data.objects.new('MatthiasPreviewCamera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -5.62, 1.40)
    look_at(camera, target)
    scene.camera = camera

    preview_objects = [camera]
    preview_objects.append(add_area('preview key', (-2.6, -3.7, 4.4), 860, 3.1, (1.0, .66, .38), target))
    preview_objects.append(add_area('preview fill', (2.8, -2.2, 2.6), 260, 2.8, (1.0, .72, .52), target))
    preview_objects.append(add_area('preview rim', (1.8, 2.8, 4.0), 520, 2.1, (1.0, .42, .12), target))

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = 'PreviewGround'
    ground_mat = bpy.data.materials.new('preview ground')
    ground_mat.use_nodes = True
    bsdf = ground_mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.020, .012, .010, 1)
    bsdf.inputs['Roughness'].default_value = .90
    ground.data.materials.append(ground_mat)
    preview_objects.append(ground)

    print('Home Matthias preview samples:', samples)
    bpy.ops.render.render(write_still=True)

    for obj in preview_objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def main():
    parsed = args()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.render.fps = 24

    rig = build_character()
    apply_premium_canonical_pass(rig)
    add_face_anchor(rig)
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
    if 'export_extras' in props:
        kwargs['export_extras'] = True

    bpy.ops.export_scene.gltf(**kwargs)
    assert_runtime_face_anchor(parsed.glb)
    if parsed.preview:
        render_preview(parsed.preview)
    print('canonical Blender Matthias:', parsed.blend, parsed.glb, parsed.preview or '')


if __name__ == '__main__':
    main()
