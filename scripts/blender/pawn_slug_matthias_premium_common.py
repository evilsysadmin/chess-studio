"""Premium Blender renderer for Pawn Slug Matthias + integrated weapons.

The sheet is authored at 2x and downsampled by CI.  Matthias intentionally reuses
Home's premium visual language (grizzled face, officer cap, midnight uniform,
brass trim) instead of the old block-primitive soldier.  Each weapon is physically
held by both hands inside every frame; runtime never overlays a second gun sprite.
"""
from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

COLS = 16
ROWS = 5
CELL = 3.60
CELL_PX = 192  # authored at 2x; CI downsamples to 96px/cell
WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")
ACTIONS = (("idle", 10), ("walk", 10), ("run", 16), ("crouch", 10), ("jump", 9))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-art")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    argv = os.sys.argv[os.sys.argv.index("--") + 1 :] if "--" in os.sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, rgb, rough=0.55, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
    return m


def finish(obj, mat, smooth=True, bevel_width=0.0):
    if smooth and hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel_width > 0 and getattr(obj, "modifiers", None) is not None:
        mod = obj.modifiers.new("edge_softness", "BEVEL")
        mod.width = bevel_width
        mod.segments = 2
    if mat:
        obj.data.materials.append(mat)
    return obj


def root(name, loc):
    obj = bpy.data.objects.new(name, None)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def parent_keep_world(obj, parent):
    if parent is None:
        return obj
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def sphere(name, loc, dims, mat, parent=None, seg=28):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=seg,
        ring_count=max(12, seg // 2),
        radius=1.0,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, mat, smooth=True)
    return parent_keep_world(obj, parent)


def box(name, loc, dims, mat, rot=(0.0, 0.0, 0.0), parent=None, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, mat, smooth=False, bevel_width=min(bevel, min(dims) * 0.22) if bevel else 0)
    return parent_keep_world(obj, parent)


def cyl(name, loc, radius, depth, mat, rot=(0.0, 0.0, 0.0), parent=None, verts=28, bevel=0.014):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    finish(obj, mat, smooth=True, bevel_width=bevel)
    return parent_keep_world(obj, parent)


def cone(name, loc, r1, r2, depth, mat, rot=(0.0, 0.0, 0.0), parent=None, verts=32, bevel=0.014):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts,
        radius1=r1,
        radius2=r2,
        depth=depth,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    finish(obj, mat, smooth=True, bevel_width=bevel)
    return parent_keep_world(obj, parent)


def torus(name, loc, major, minor, mat, rot=(0.0, 0.0, 0.0), parent=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=28,
        minor_segments=10,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    finish(obj, mat, smooth=True)
    return parent_keep_world(obj, parent)


def xz(origin, x, z, y=0.0):
    return (origin[0] + x, y, origin[2] + z)


def cyl_segment(name, origin, a, b, radius, mat, parent, y=-0.08, verts=24):
    ax, az = a
    bx, bz = b
    start = Vector(xz(origin, ax, az, y))
    end = Vector(xz(origin, bx, bz, y))
    direction = end - start
    length = max(0.02, direction.length)
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    finish(obj, mat, smooth=True, bevel_width=min(0.015, radius * 0.22))
    return parent_keep_world(obj, parent)


def mats():
    return {
        "skin": material("warm ivory", (0.62, 0.47, 0.34), 0.48),
        "skin_hi": material("ivory highlight", (0.82, 0.64, 0.46), 0.42),
        "cheek": material("warm cheek", (0.55, 0.31, 0.23), 0.58),
        "navy": material("midnight uniform", (0.018, 0.033, 0.055), 0.42, 0.04),
        "cloth": material("midnight cloth", (0.035, 0.060, 0.095), 0.67),
        "armor": material("tactical plate", (0.075, 0.105, 0.135), 0.38, 0.30),
        "leather": material("dark leather", (0.055, 0.030, 0.018), 0.76),
        "brass": material("aged brass", (0.52, 0.30, 0.075), 0.24, 0.84),
        "steel": material("gunmetal trim", (0.14, 0.18, 0.22), 0.30, 0.72),
        "gunmetal": material("weapon gunmetal", (0.20, 0.27, 0.34), 0.22, 0.84),
        "dark": material("weapon black", (0.018, 0.024, 0.032), 0.28, 0.46),
        "polymer": material("weapon polymer", (0.045, 0.060, 0.075), 0.52, 0.06),
        "olive": material("launcher olive", (0.17, 0.26, 0.105), 0.45, 0.24),
        "hair": material("iron grey", (0.065, 0.072, 0.078), 0.86),
        "white": material("eye white", (0.83, 0.79, 0.69), 0.46),
        "iris": material("cold iris", (0.045, 0.13, 0.16), 0.32),
        "black": material("pupil", (0.003, 0.004, 0.006), 0.50),
        "red": material("campaign red", (0.29, 0.025, 0.022), 0.64),
        "cream": material("shirt cream", (0.62, 0.55, 0.43), 0.70),
    }


def pose(action, frame, count):
    phase = frame / max(1, count - (0 if action in {"crouch", "jump"} else 1))
    t = phase * math.tau
    wave = math.sin(t)
    pulse = math.cos(t)
    if action == "idle":
        return dict(bob=max(0.0, -pulse) * 0.018, lean=wave * 0.006, step=0.04 * wave, lift_a=0.0, lift_b=0.0, crouch=0.0, jump=0.0)
    if action == "walk":
        return dict(bob=abs(wave) * 0.035, lean=-0.03 + wave * 0.012, step=0.36 * wave, lift_a=0.10 * max(0.0, wave), lift_b=0.10 * max(0.0, -wave), crouch=0.0, jump=0.0)
    if action == "run":
        return dict(bob=abs(wave) * 0.055, lean=-0.085 + wave * 0.018, step=0.60 * wave, lift_a=0.18 * max(0.0, wave), lift_b=0.18 * max(0.0, -wave), crouch=0.0, jump=0.0)
    if action == "crouch":
        settle = min(1.0, frame / max(1, count - 1) * 1.35)
        return dict(bob=0.0, lean=-0.045, step=0.04, lift_a=0.0, lift_b=0.0, crouch=0.36 * settle, jump=0.0)
    jump_phase = frame / max(1, count - 1)
    jump = math.sin(jump_phase * math.pi) * 0.36
    tuck = math.sin(jump_phase * math.pi) * 0.18
    return dict(bob=jump, lean=-0.055 + (jump_phase - 0.5) * 0.05, step=0.08, lift_a=0.11 + tuck, lift_b=0.11 + tuck, crouch=0.0, jump=jump)
