#!/usr/bin/env python3
"""Render deterministic review previews for the canonical Chronicles party blend."""
from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

MEMBERS = ("rook", "bishop", "knight")
ROOT_PREFIX = "ChroniclesParty__"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--output-dir", required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, color, target):
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def render_engine(scene):
    """Choose an Eevee engine by capability, not a guessed Blender version."""
    prop = scene.bl_rna.properties["render"].fixed_type.properties["engine"]
    available = {item.identifier for item in prop.enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in available:
            return candidate
    raise RuntimeError(f"no supported Eevee engine available: {sorted(available)}")


def configure_preview_samples(scene):
    samples = max(1, int(os.environ.get("BLENDER_PREVIEW_SAMPLES", "64")))
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = samples
    return samples


def configure_scene(output_dir):
    scene = bpy.context.scene
    scene.frame_set(1)
    scene.render.resolution_x = 720
    scene.render.resolution_y = 820
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.engine = render_engine(scene)
    samples = configure_preview_samples(scene)
    scene.render.filepath = os.path.join(output_dir, "chronicles-party-preview.png")
    scene.world.color = (0.012, 0.009, 0.007)

    target = (0.0, 0.0, 1.08)
    camera_data = bpy.data.cameras.new("ChroniclesPartyPreviewCamera")
    camera_data.lens = 68
    camera = bpy.data.objects.new("ChroniclesPartyPreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, -5.6, 1.55)
    look_at(camera, target)
    scene.camera = camera

    add_area("chronicles preview key", (-2.8, -3.8, 4.4), 930, 3.2, (1.0, 0.72, 0.46), target)
    add_area("chronicles preview fill", (2.9, -2.0, 2.8), 520, 2.5, (0.36, 0.52, 0.78), target)
    add_area("chronicles preview rim", (1.5, 2.7, 4.1), 780, 2.1, (1.0, 0.36, 0.12), target)

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "ChroniclesPreviewGround"
    mat = bpy.data.materials.new("chronicles preview ground")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.020, 0.015, 0.012, 1)
    bsdf.inputs["Roughness"].default_value = 0.94
    ground.data.materials.append(mat)
    print("Chronicles preview samples:", samples)


def roots():
    found = {}
    for member in MEMBERS:
        root = bpy.data.objects.get(f"{ROOT_PREFIX}{member}")
        if root is None:
            raise RuntimeError(f"missing canonical root: {ROOT_PREFIX}{member}")
        found[member] = root
    return found


def render_member(scene, member_roots, member, output_dir):
    for current, root in member_roots.items():
        root.hide_render = current != member
        root.hide_viewport = current != member
        root.rotation_euler = (0.0, 0.0, math.radians(-8))
    scene.render.filepath = os.path.join(output_dir, f"chronicles-party-{member}.png")
    bpy.ops.render.render(write_still=True)


def render_group(scene, member_roots, output_dir):
    offsets = {"rook": -1.05, "bishop": 0.0, "knight": 1.05}
    for member, root in member_roots.items():
        root.hide_render = False
        root.hide_viewport = False
        root.location.x = offsets[member]
        root.rotation_euler = (0.0, 0.0, 0.0)
    scene.camera.data.lens = 54
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = os.path.join(output_dir, "chronicles-party-group.png")
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.blend))
    configure_scene(args.output_dir)
    scene = bpy.context.scene
    member_roots = roots()

    original_locations = {member: root.location.copy() for member, root in member_roots.items()}
    for member in MEMBERS:
        render_member(scene, member_roots, member, args.output_dir)
        member_roots[member].location = original_locations[member]
    render_group(scene, member_roots, args.output_dir)
    print("Chronicles party previews:", args.output_dir)


if __name__ == "__main__":
    main()
