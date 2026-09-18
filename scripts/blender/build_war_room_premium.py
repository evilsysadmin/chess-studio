#!/usr/bin/env python3
"""Deterministically build a premium Chess Studio War Room in Blender.

The generated .blend is the editable source of truth for the static room shell.
The board squares and representative pieces exist only in the preview so the
live Three.js chess state can remain authoritative when the shell is integrated.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

CONTRACT = "war-room-premium-v1"
ROLE_STATIC = "static-shell"
ROLE_PREVIEW = "preview-only"
ROLE_ANCHOR = "dynamic-anchor"
PREVIEW_SIZE = (1600, 900)
BOARD_Z = 1.12

# Desktop War Room camera parity. These numbers mirror the canonical wide
# Three.js framing profile (22° vertical FOV, targetY=2.2, targetZ=-0.16,
# direction cameraY=6.0/cameraZ=10.6). Blender uses Y as room depth and Z as
# vertical, while the runtime uses Y vertical and Z depth, so the axes are
# deliberately remapped here rather than art-directed by eye.
RUNTIME_WIDE_FOV_DEG = 22.0
RUNTIME_WIDE_HALF_SPAN = 5.38
RUNTIME_WIDE_PADDING = 1.07
RUNTIME_WIDE_TARGET = (0.0, 0.16, 2.20)
RUNTIME_WIDE_DIRECTION = (0.0, -10.6, 6.0)


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--preview", required=True)
    parser.add_argument("--manifest", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(argv)


def wipe():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def collection(name):
    found = bpy.data.collections.get(name)
    if found is None:
        found = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(found)
    return found


def relink(obj, owner):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    owner.objects.link(obj)


def tag(obj, role=ROLE_STATIC):
    obj["war_room_contract"] = CONTRACT
    obj["war_room_role"] = role
    return obj


def socket(bsdf, *names):
    for name in names:
        value = bsdf.inputs.get(name)
        if value is not None:
            return value
    return None


def set_socket(bsdf, value, *names):
    found = socket(bsdf, *names)
    if found is not None:
        found.default_value = value


def material(name, rgba, *, metal=0.0, rough=0.5, coat=0.0, sheen=0.0,
             texture=None, scale=6.0, bump=0.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    set_socket(bsdf, rgba, "Base Color")
    set_socket(bsdf, metal, "Metallic")
    set_socket(bsdf, rough, "Roughness")
    set_socket(bsdf, 1.47, "IOR")
    set_socket(bsdf, coat, "Coat Weight", "Clearcoat")
    set_socket(bsdf, 0.20, "Coat Roughness", "Clearcoat Roughness")
    set_socket(bsdf, sheen, "Sheen Weight", "Sheen")
    if emission:
        set_socket(bsdf, emission, "Emission Color", "Emission")
        set_socket(bsdf, 2.5, "Emission Strength")
    if texture:
        tex = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        links.new(tex.outputs["Generated"], mapping.inputs["Vector"])
        proc = nodes.new("ShaderNodeTexNoise")

        if texture == "wood":
            mapping.inputs["Scale"].default_value = (0.85, 7.5, 1.5)
            proc.inputs["Scale"].default_value = max(1.2, scale * 0.42)
            proc.inputs["Detail"].default_value = 6.0
            proc.inputs["Roughness"].default_value = 0.62
            proc.inputs["Distortion"].default_value = 0.35
            dark_mul, light_mul, bump_strength = 0.74, 1.10, bump * 0.30
        elif texture == "metal":
            mapping.inputs["Scale"].default_value = (1.0, 1.0, 9.0)
            proc.inputs["Scale"].default_value = max(3.0, scale * 0.20)
            proc.inputs["Detail"].default_value = 3.0
            proc.inputs["Roughness"].default_value = 0.42
            proc.inputs["Distortion"].default_value = 0.08
            dark_mul, light_mul, bump_strength = 0.88, 1.08, bump * 0.28
        elif texture == "fabric":
            mapping.inputs["Scale"].default_value = (12.0, 12.0, 1.0)
            proc.inputs["Scale"].default_value = max(2.0, scale * 0.24)
            proc.inputs["Detail"].default_value = 5.0
            proc.inputs["Roughness"].default_value = 0.70
            proc.inputs["Distortion"].default_value = 0.10
            dark_mul, light_mul, bump_strength = 0.82, 1.08, bump * 0.45
        elif texture == "leather":
            mapping.inputs["Scale"].default_value = (4.0, 4.0, 4.0)
            proc.inputs["Scale"].default_value = max(3.0, scale * 0.18)
            proc.inputs["Detail"].default_value = 8.0
            proc.inputs["Roughness"].default_value = 0.76
            proc.inputs["Distortion"].default_value = 0.18
            dark_mul, light_mul, bump_strength = 0.80, 1.07, bump * 0.48
        else:
            proc.inputs["Scale"].default_value = max(1.5, scale * 0.55)
            proc.inputs["Detail"].default_value = 5.0
            proc.inputs["Roughness"].default_value = 0.68
            proc.inputs["Distortion"].default_value = 0.22
            dark_mul, light_mul, bump_strength = 0.83, 1.09, bump * 0.38

        links.new(mapping.outputs["Vector"], proc.inputs["Vector"])
        fac = proc.outputs["Fac"]
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.20
        ramp.color_ramp.elements[1].position = 0.82
        ramp.color_ramp.elements[0].color = tuple(max(0.0, ch * dark_mul) for ch in rgba[:3]) + (1.0,)
        ramp.color_ramp.elements[1].color = tuple(min(1.0, ch * light_mul + 0.008) for ch in rgba[:3]) + (1.0,)
        links.new(fac, ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], socket(bsdf, "Base Color"))
        if bump_strength:
            node = nodes.new("ShaderNodeBump")
            node.inputs["Strength"].default_value = bump_strength
            node.inputs["Distance"].default_value = 0.035
            links.new(fac, node.inputs["Height"])
            links.new(node.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def cube(name, loc, half, mat, owner, *, bevel=0.05, role=ROLE_STATIC):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = half
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("premium-bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    obj.data.materials.append(mat)
    tag(obj, role)
    relink(obj, owner)
    return obj


def cylinder(name, loc, radius, depth, mat, owner, *, vertices=32, role=ROLE_STATIC):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    tag(obj, role)
    relink(obj, owner)
    return obj


def sphere(name, loc, radius, mat, owner, *, role=ROLE_STATIC, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    tag(obj, role)
    relink(obj, owner)
    return obj


def torus(name, loc, major, minor, mat, owner, *, rotation=(0, 0, 0), role=ROLE_STATIC):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, major_segments=48, minor_segments=12,
        location=loc, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    tag(obj, role)
    relink(obj, owner)
    return obj


def light(name, kind, loc, energy, color, owner, *, size=3.0, radius=1.2):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.shape = "DISK"
        data.size = size
    if kind == "POINT":
        data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    tag(obj)
    owner.objects.link(obj)
    return obj


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_piece_body(prefix, x, y, z, body, trim, owner, role=ROLE_PREVIEW, height=1.0):
    cylinder(prefix + "_base", (x, y, z + 0.08), 0.31, 0.16, body, owner, vertices=28, role=role)
    cylinder(prefix + "_foot", (x, y, z + 0.20), 0.25, 0.08, trim, owner, vertices=28, role=role)
    cylinder(prefix + "_stem", (x, y, z + 0.39 * height), 0.17, 0.42 * height, body, owner, vertices=28, role=role)
    torus(prefix + "_collar", (x, y, z + 0.60 * height), 0.19, 0.033, trim, owner, rotation=(math.pi / 2, 0, 0), role=role)


def add_pawn(prefix, x, y, z, body, trim, owner, role=ROLE_PREVIEW):
    add_piece_body(prefix, x, y, z, body, trim, owner, role, height=0.95)
    sphere(prefix + "_head", (x, y, z + 0.80), 0.20, body, owner, role=role)


def add_preview_major(kind, prefix, x, y, z, body, trim, owner, facing):
    add_piece_body(prefix, x, y, z, body, trim, owner, ROLE_PREVIEW, height=1.15)
    if kind == "rook":
        cylinder(prefix + "_tower", (x, y, z + 0.78), 0.22, 0.34, body, owner, vertices=24, role=ROLE_PREVIEW)
        cube(prefix + "_crown", (x, y, z + 0.99), (0.27, 0.27, 0.10), body, owner, bevel=0.025, role=ROLE_PREVIEW)
        for index, (dx, dy) in enumerate(((-0.18, -0.18), (-0.18, 0.18), (0.18, -0.18), (0.18, 0.18))):
            cube(prefix + f"_merlon_{index}", (x + dx, y + dy, z + 1.12), (0.07, 0.07, 0.09),
                 trim, owner, bevel=0.015, role=ROLE_PREVIEW)
    elif kind == "knight":
        sphere(prefix + "_head", (x, y + facing * 0.03, z + 0.89), 0.25, body, owner,
               role=ROLE_PREVIEW, scale=(0.80, 0.67, 1.20))
        sphere(prefix + "_muzzle", (x, y + facing * 0.19, z + 0.93), 0.16, body, owner,
               role=ROLE_PREVIEW, scale=(0.72, 1.05, 0.58))
        sphere(prefix + "_ear", (x - 0.08, y - facing * 0.01, z + 1.14), 0.07, trim, owner,
               role=ROLE_PREVIEW, scale=(0.65, 0.55, 1.5))
    elif kind == "bishop":
        sphere(prefix + "_head", (x, y, z + 0.89), 0.21, body, owner, role=ROLE_PREVIEW, scale=(0.88, 0.88, 1.15))
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.12, radius2=0.015, depth=0.34, location=(x, y, z + 1.17))
        finial = bpy.context.object
        finial.name = prefix + "_mitre"
        finial.data.materials.append(trim)
        tag(finial, ROLE_PREVIEW)
        relink(finial, owner)
    elif kind == "queen":
        sphere(prefix + "_head", (x, y, z + 0.90), 0.19, body, owner, role=ROLE_PREVIEW)
        torus(prefix + "_crown", (x, y, z + 1.07), 0.22, 0.035, trim, owner, rotation=(math.pi / 2, 0, 0), role=ROLE_PREVIEW)
        for index in range(5):
            angle = index * math.tau / 5.0
            sphere(prefix + f"_jewel_{index}",
                   (x + math.cos(angle) * 0.19, y + math.sin(angle) * 0.19, z + 1.18),
                   0.055, trim, owner, role=ROLE_PREVIEW)
    else:
        sphere(prefix + "_head", (x, y, z + 0.90), 0.20, body, owner, role=ROLE_PREVIEW)
        cube(prefix + "_cross_v", (x, y, z + 1.18), (0.045, 0.045, 0.20), trim, owner, bevel=0.015, role=ROLE_PREVIEW)
        cube(prefix + "_cross_h", (x, y, z + 1.23), (0.13, 0.045, 0.045), trim, owner, bevel=0.015, role=ROLE_PREVIEW)


def add_preview_board(owner, mats):
    anchor = bpy.data.objects.new("WR_ANCHOR_board_origin", None)
    anchor.location = (0, 0, BOARD_Z)
    tag(anchor, ROLE_ANCHOR)
    owner.objects.link(anchor)
    for rank in range(8):
        for file in range(8):
            x, y = file - 3.5, rank - 3.5
            tile_mat = mats["ivory"] if (file + rank) % 2 else mats["walnut"]
            cube(f"WR_PREVIEW_square_{file}_{rank}", (x, y, BOARD_Z), (0.495, 0.495, 0.055),
                 tile_mat, owner, bevel=0.018, role=ROLE_PREVIEW)
    for rank, side in ((1, "black"), (6, "white")):
        body = mats["ebony"] if side == "black" else mats["ivory"]
        trim = mats["red"] if side == "black" else mats["brass"]
        for file in range(8):
            add_pawn(f"WR_PREVIEW_{side}_pawn_{file}", file - 3.5, rank - 3.5, BOARD_Z + 0.07,
                     body, trim, owner)
    order = ("rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook")
    for rank, side in ((0, "black"), (7, "white")):
        body = mats["ebony"] if side == "black" else mats["ivory"]
        trim = mats["red"] if side == "black" else mats["brass"]
        facing = 1 if side == "black" else -1
        for file, kind in enumerate(order):
            x = file - 3.5
            add_preview_major(kind, f"WR_PREVIEW_{side}_{kind}_{file}", x, rank - 3.5, BOARD_Z + 0.07,
                              body, trim, owner, facing)


def add_room(static, mats):
    # Architecture and parquet-like floor.
    cube("WR_ARCH_floor", (0, 0, -0.12), (8.8, 7.3, 0.12), mats["floor_dark"], static, bevel=0.02)
    cube("WR_ARCH_back_wall", (0, 7.02, 3.35), (8.8, 0.18, 3.35), mats["wall_wood"], static, bevel=0.02)
    cube("WR_ARCH_left_wall", (-8.68, 0.8, 3.35), (0.18, 6.25, 3.35), mats["wall_wood"], static, bevel=0.02)
    cube("WR_ARCH_right_wall", (8.68, 0.8, 3.35), (0.18, 6.25, 3.35), mats["wall_wood"], static, bevel=0.02)
    for z in (1.25, 3.15, 5.45):
        cube(f"WR_ARCH_back_rail_{z}", (0, 6.78, z), (8.45, 0.06, 0.05), mats["brass_dark"], static, bevel=0.018)
    for x in (-7.3, -4.2, -1.55, 1.55, 4.2, 7.3):
        cube(f"WR_ARCH_back_stile_{x}", (x, 6.78, 3.35), (0.05, 0.06, 2.45), mats["trim_wood"], static, bevel=0.018)
    for idx in range(15):
        x = -8.15 + idx * 1.16
        cube(f"WR_ARCH_floor_plank_{idx}", (x, 0.1, 0.012), (0.54, 6.55, 0.025),
             mats["parquet"], static, bevel=0.012)

    # Premium room moulding: wood-on-wood relief catches grazing light without
    # turning the room into dashboard ornamentation.
    cube("WR_ARCH_cornice_back", (0, 6.72, 6.32), (8.46, 0.10, 0.12), mats["trim_wood"], static, bevel=0.035)
    cube("WR_ARCH_baseboard_back", (0, 6.72, 0.42), (8.46, 0.10, 0.16), mats["trim_wood"], static, bevel=0.035)
    for side in (-1, 1):
        cube(f"WR_ARCH_side_cornice_{side}", (side * 8.52, 0.75, 6.32), (0.10, 6.0, 0.12), mats["trim_wood"], static, bevel=0.035)
        cube(f"WR_ARCH_side_baseboard_{side}", (side * 8.52, 0.75, 0.42), (0.10, 6.0, 0.16), mats["trim_wood"], static, bevel=0.035)

    # Recessed lower panels break the large back wall into believable joinery.
    for index, x in enumerate((-6.35, -2.55, 2.55, 6.35)):
        cube(f"WR_ARCH_wainscot_recess_{index}", (x, 6.76, 1.92), (1.22, 0.045, 0.58),
             mats["wall_recess"], static, bevel=0.025)
        cube(f"WR_ARCH_wainscot_top_{index}", (x, 6.68, 2.55), (1.34, 0.055, 0.045),
             mats["trim_wood"], static, bevel=0.018)
        for edge in (-1, 1):
            cube(f"WR_ARCH_wainscot_edge_{index}_{edge}", (x + edge * 1.28, 6.68, 1.92),
                 (0.04, 0.055, 0.60), mats["trim_wood"], static, bevel=0.014)

    # Rug and hero table.
    cube("WR_DECOR_rug", (0, 0, 0.065), (6.55, 6.55, 0.035), mats["rug"], static, bevel=0.025)
    for side in (-1, 1):
        cube(f"WR_DECOR_rug_x_{side}", (0, side * 6.31, 0.105), (6.25, 0.06, 0.012), mats["brass_dark"], static, bevel=0.01)
        cube(f"WR_DECOR_rug_y_{side}", (side * 6.31, 0, 0.105), (0.06, 6.25, 0.012), mats["brass_dark"], static, bevel=0.01)
    cube("WR_TABLE_main", (0, 0, 0.47), (5.86, 5.86, 0.38), mats["table_wood"], static, bevel=0.13)
    cube("WR_TABLE_board_frame", (0, 0, 0.96), (4.62, 4.62, 0.12), mats["frame_wood"], static, bevel=0.09)
    for side in (-1, 1):
        cube(f"WR_TABLE_gold_x_{side}", (0, side * 4.42, 1.10), (4.36, 0.035, 0.035), mats["brass"], static, bevel=0.016)
        cube(f"WR_TABLE_gold_y_{side}", (side * 4.42, 0, 1.10), (0.035, 4.36, 0.035), mats["brass"], static, bevel=0.016)
    for x in (-4.53, 4.53):
        for y in (-4.53, 4.53):
            cylinder(f"WR_TABLE_finial_{x}_{y}", (x, y, 1.11), 0.13, 0.18, mats["brass"], static, vertices=24)
            sphere(f"WR_TABLE_finial_ball_{x}_{y}", (x, y, 1.25), 0.11, mats["brass"], static)

    # Marble fireplace, firebox and props.
    cube("WR_FIREPLACE_body", (-4.55, 6.35, 2.03), (1.55, 0.46, 1.48), mats["stone"], static, bevel=0.10)
    cube("WR_FIREPLACE_opening", (-4.55, 5.86, 1.70), (0.93, 0.12, 0.78), mats["charcoal"], static, bevel=0.04)
    cube("WR_FIREPLACE_mantel", (-4.55, 5.76, 3.53), (1.78, 0.64, 0.16), mats["stone_light"], static, bevel=0.08)
    cube("WR_FIREPLACE_mantel_shadow", (-4.55, 5.08, 3.42), (1.84, 0.08, 0.07), mats["stone_dark"], static, bevel=0.025)
    cube("WR_FIREPLACE_hearth", (-4.55, 5.35, 0.72), (1.48, 0.78, 0.12), mats["stone_light"], static, bevel=0.08)
    cube("WR_FIREPLACE_inner_lintel", (-4.55, 5.69, 2.58), (1.05, 0.09, 0.12), mats["stone_dark"], static, bevel=0.035)
    for px in (-5.57, -3.53):
        cube(f"WR_FIREPLACE_inner_jamb_{px}", (px, 5.69, 1.70), (0.11, 0.09, 0.76), mats["stone_dark"], static, bevel=0.03)
    for px in (-5.78, -3.32):
        cube(f"WR_FIREPLACE_pilaster_{px}", (px, 5.77, 2.16), (0.16, 0.12, 1.06), mats["stone_light"], static, bevel=0.045)
        cube(f"WR_FIREPLACE_cap_{px}", (px, 5.73, 3.23), (0.24, 0.18, 0.10), mats["stone_light"], static, bevel=0.045)
    # Hearth: crossed charred logs, low grate and layered emissive wisps.
    # Keep flame geometry restrained; the old three giant cones read as toy
    # triangles in the runtime GLB, especially on mobile.
    for idx, (dx, rot) in enumerate(((-0.30, math.radians(78)), (0.30, math.radians(102)))):
        log = cylinder(f"WR_FIREPLACE_log_{idx}", (-4.55 + dx * 0.25, 5.56, 1.03),
                       0.12, 1.18, mats["charred_wood"], static, vertices=18)
        log.rotation_euler = (0, math.pi / 2, rot - math.pi / 2)
    for idx, x in enumerate((-4.93, -4.55, -4.17)):
        ember = sphere(f"WR_FIREPLACE_ember_{idx}", (x, 5.47, 1.08 + (idx % 2) * 0.05),
                       0.11, mats["ember"], static, scale=(1.25, 0.72, 0.45))
        ember.rotation_euler.z = idx * 0.18
    cube("WR_FIREPLACE_grate_bar", (-4.55, 5.45, 1.12), (0.74, 0.045, 0.045),
         mats["iron"], static, bevel=0.018)
    for idx, x in enumerate((-5.10, -4.73, -4.36, -3.99)):
        cube(f"WR_FIREPLACE_grate_tooth_{idx}", (x, 5.46, 1.30), (0.035, 0.035, 0.20),
             mats["iron"], static, bevel=0.012)

    for idx, (dx, dz, sx, sy, sz) in enumerate((
        (-0.34, 0.22, 0.58, 0.42, 1.20),
        (-0.08, 0.36, 0.50, 0.38, 1.48),
        (0.18, 0.18, 0.62, 0.44, 1.08),
        (0.39, 0.30, 0.46, 0.36, 1.34),
    )):
        sphere(f"WR_FIREPLACE_flame_outer_{idx}", (-4.55 + dx, 5.55, 1.28 + dz),
               0.22, mats["fire"], static, scale=(sx, sy, sz))
    for idx, (dx, dz, sx, sy, sz) in enumerate((
        (-0.18, 0.12, 0.44, 0.34, 0.88),
        (0.05, 0.24, 0.38, 0.30, 1.05),
        (0.26, 0.10, 0.36, 0.30, 0.82),
    )):
        sphere(f"WR_FIREPLACE_flame_core_{idx}", (-4.55 + dx, 5.50, 1.25 + dz),
               0.16, mats["fire_core"], static, scale=(sx, sy, sz))

    light("WR_LIGHT_fireplace", "POINT", (-4.55, 5.15, 1.82), 330.0, (1.0, 0.25, 0.055), static, radius=1.35)

    # Back desk.
    cube("WR_DESK_top", (0, 6.0, 2.18), (1.82, 0.52, 0.12), mats["table_wood"], static, bevel=0.08)
    cube("WR_DESK_blotter", (0.18, 5.45, 2.33), (0.92, 0.26, 0.025), mats["desk_leather"], static, bevel=0.025)
    cube("WR_DESK_blotter_edge", (0.18, 5.17, 2.34), (0.98, 0.025, 0.028), mats["brass_dark"], static, bevel=0.012)
    for x in (-1.48, 1.48):
        cube(f"WR_DESK_pedestal_{x}", (x, 6.18, 1.27), (0.35, 0.43, 0.78), mats["frame_wood"], static, bevel=0.06)
        for row in range(3):
            sphere(f"WR_DESK_knob_{x}_{row}", (x, 5.73, 1.02 + row * 0.38), 0.045, mats["brass"], static)
    cylinder("WR_DESK_lamp_base", (-0.72, 5.58, 2.39), 0.24, 0.08, mats["brass"], static)
    cylinder("WR_DESK_lamp_stem", (-0.72, 5.58, 2.68), 0.035, 0.55, mats["brass"], static)
    sphere("WR_DESK_lamp_shade", (-0.72, 5.56, 2.98), 0.34, mats["green"], static, scale=(1.4, 0.65, 0.45))

    # Ceremonial pawn crest.
    cylinder("WR_CREST_plaque", (0, 6.72, 4.65), 1.32, 0.12, mats["charcoal"], static, vertices=64)
    bpy.context.object.rotation_euler.x = math.pi / 2
    torus("WR_CREST_ring", (0, 6.59, 4.65), 1.13, 0.055, mats["brass"], static, rotation=(math.pi / 2, 0, 0))
    cylinder("WR_CREST_pawn_base", (0, 6.47, 4.10), 0.33, 0.15, mats["brass"], static)
    cylinder("WR_CREST_pawn_stem", (0, 6.47, 4.43), 0.20, 0.55, mats["brass"], static)
    sphere("WR_CREST_pawn_head", (0, 6.47, 4.86), 0.25, mats["brass"], static)

    # Velvet banners with folds.
    for side in (-1, 1):
        center = side * 2.13
        for fold in range(8):
            x = center + side * (fold - 3.5) * 0.12
            cylinder(f"WR_CURTAIN_{side}_{fold}", (x, 6.56, 4.72), 0.105, 2.75,
                     mats["velvet"] if fold % 2 == 0 else mats["velvet_dark"], static, vertices=18)
        torus(f"WR_CURTAIN_tie_{side}", (center + side * 0.42, 6.38, 4.0), 0.17, 0.026,
              mats["brass"], static, rotation=(math.pi / 2, 0, 0))

    # Paintings, shelves, books and decorative vessels.
    for side in (-1, 1):
        px = side * 5.35
        cube(f"WR_ART_frame_{side}", (px, 6.57, 4.68), (1.33, 0.10, 1.02), mats["brass_dark"], static, bevel=0.06)
        cube(f"WR_ART_canvas_{side}", (px, 6.43, 4.68), (1.16, 0.025, 0.84),
             mats["picture_a"] if side < 0 else mats["picture_b"], static, bevel=0.015)
        # Thin bas-relief linework gives the frames authored content without
        # relying on a baked bitmap that would age poorly in the runtime shell.
        for edge in (-1, 1):
            cube(f"WR_ART_inner_v_{side}_{edge}", (px + edge * 0.95, 6.38, 4.68),
                 (0.018, 0.022, 0.68), mats["art_gilt"], static, bevel=0.008)
            cube(f"WR_ART_inner_h_{side}_{edge}", (px, 6.38, 4.68 + edge * 0.64),
                 (0.95, 0.022, 0.018), mats["art_gilt"], static, bevel=0.008)
        if side < 0:
            for index, (dx, dz, sx, sz) in enumerate((
                (-0.46, 0.18, 0.40, 0.018),
                (-0.18, -0.16, 0.018, 0.44),
                (0.18, 0.08, 0.018, 0.34),
                (0.42, -0.24, 0.32, 0.018),
            )):
                cube(f"WR_ART_relief_left_{index}", (px + dx, 6.34, 4.68 + dz),
                     (sx, 0.018, sz), mats["art_gilt"], static, bevel=0.008)
        else:
            torus(f"WR_ART_relief_right_ring", (px, 6.34, 4.72), 0.37, 0.022,
                  mats["art_gilt"], static, rotation=(math.pi / 2, 0, 0))
            cube("WR_ART_relief_right_axis", (px, 6.34, 4.72), (0.52, 0.018, 0.018),
                 mats["art_gilt"], static, bevel=0.008)
            cube("WR_ART_relief_right_mark", (px + 0.22, 6.34, 4.46), (0.018, 0.018, 0.30),
                 mats["art_gilt"], static, bevel=0.008)
        shelf_x = side * 5.35
        cube(f"WR_SHELF_{side}", (shelf_x, 6.02, 2.65), (1.7, 0.42, 0.08), mats["table_wood"], static, bevel=0.04)
        for book in range(6):
            cube(f"WR_BOOK_{side}_{book}", (shelf_x + (book - 2.5) * 0.18, 5.77, 2.87 + (book % 2) * 0.02),
                 (0.075, 0.20, 0.26), mats["book_a"] if book % 2 else mats["book_b"], static, bevel=0.018)
        sphere(f"WR_VASE_body_{side}", (shelf_x + side * 1.15, 5.72, 3.02), 0.25, mats["green"], static, scale=(0.9, 0.9, 1.22))
        cylinder(f"WR_VASE_neck_{side}", (shelf_x + side * 1.15, 5.72, 3.30), 0.10, 0.23, mats["green"], static)
        light(f"WR_LIGHT_picture_{side}", "AREA", (px, 5.85, 5.95), 110.0, (1.0, 0.68, 0.42), static, size=1.2)

    # Tall night window on the right.
    cube("WR_WINDOW_frame", (8.43, 2.85, 3.42), (0.12, 1.42, 2.18), mats["brass_dark"], static, bevel=0.05)
    cube("WR_WINDOW_night", (8.29, 2.85, 3.42), (0.025, 1.20, 1.94), mats["window"], static, bevel=0.01)
    sphere("WR_WINDOW_moon", (8.20, 3.53, 4.48), 0.28, mats["moon"], static, scale=(0.18, 1.0, 1.0))
    for index, (y, height) in enumerate(((1.92, 0.42), (2.20, 0.66), (2.52, 0.50), (2.88, 0.76), (3.24, 0.54), (3.58, 0.70))):
        cube(f"WR_WINDOW_horizon_{index}", (8.19, y, 1.66 + height / 2),
             (0.035, 0.12, height / 2), mats["horizon"], static, bevel=0.012)
    cube("WR_WINDOW_sill", (8.12, 2.85, 1.34), (0.16, 1.50, 0.09), mats["trim_wood"], static, bevel=0.035)
    cube("WR_WINDOW_header", (8.12, 2.85, 5.50), (0.16, 1.50, 0.09), mats["trim_wood"], static, bevel=0.035)
    for y in (1.75, 2.85, 3.95):
        cube(f"WR_WINDOW_bar_{y}", (8.20, y, 3.42), (0.03, 0.035, 1.90), mats["brass"], static, bevel=0.012)
    light("WR_LIGHT_window", "AREA", (7.75, 2.8, 4.0), 570.0, (0.16, 0.30, 1.0), static, size=3.6)

    # Leather benches.
    for side in (-1, 1):
        x = side * 7.15
        cube(f"WR_BENCH_seat_{side}", (x, -4.8, 0.72), (0.9, 1.2, 0.24), mats["leather"], static, bevel=0.12)
        cube(f"WR_BENCH_back_{side}", (x + side * 0.62, -4.8, 1.30), (0.18, 1.20, 0.72), mats["leather_dark"], static, bevel=0.12)
        for button_y in (-5.45, -4.8, -4.15):
            for button_z in (1.08, 1.52):
                sphere(f"WR_BENCH_button_{side}_{button_y}_{button_z}",
                       (x - side * 0.195, button_y, button_z), 0.035, mats["brass_dark"], static)
        for y in (-5.65, -4.0):
            cylinder(f"WR_BENCH_leg_{side}_{y}", (x, y, 0.35), 0.08, 0.55, mats["walnut"], static, vertices=20)

    # Armour display: layered plates and shoulders rather than two generic blobs.
    for side in (-1, 1):
        x = side * 7.33
        cylinder(f"WR_ARMOR_base_{side}", (x, 4.35, 0.33), 0.62, 0.22, mats["charcoal"], static)
        cube(f"WR_ARMOR_stand_{side}", (x, 4.35, 1.12), (0.11, 0.11, 0.78), mats["charcoal"], static, bevel=0.025)
        sphere(f"WR_ARMOR_breastplate_{side}", (x, 4.35, 1.45), 0.47, mats["armor"], static, scale=(0.82, 0.50, 1.18))
        torus(f"WR_ARMOR_gorget_{side}", (x, 4.33, 1.90), 0.19, 0.035, mats["brass_dark"], static)
        cube(f"WR_ARMOR_breastplate_ridge_{side}", (x, 4.08, 1.48), (0.035, 0.035, 0.38),
             mats["brass_dark"], static, bevel=0.012)
        for leg in (-1, 1):
            cube(f"WR_ARMOR_greave_{side}_{leg}", (x + leg * 0.18, 4.35, 0.67), (0.11, 0.12, 0.27),
                 mats["armor"], static, bevel=0.05)
        for shoulder in (-1, 1):
            sphere(f"WR_ARMOR_pauldron_{side}_{shoulder}", (x + shoulder * 0.43, 4.35, 1.63), 0.22,
                   mats["armor"], static, scale=(1.10, 0.72, 0.65))
        sphere(f"WR_ARMOR_helmet_{side}", (x, 4.35, 2.12), 0.34, mats["armor"], static, scale=(0.88, 0.78, 1.02))
        cube(f"WR_ARMOR_visor_{side}", (x, 4.13, 2.12), (0.24, 0.035, 0.07), mats["armor_dark"], static, bevel=0.02)
        cube(f"WR_ARMOR_skirt_{side}", (x, 4.35, 0.98), (0.38, 0.28, 0.23), mats["armor_dark"], static, bevel=0.05)
        cylinder(f"WR_ARMOR_halberd_{side}", (x - side * 0.50, 4.20, 1.92), 0.03, 3.2, mats["brass_dark"], static, vertices=14)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.16, radius2=0.0, depth=0.48,
                                       location=(x - side * 0.50, 4.20, 3.58))
        blade = bpy.context.object
        blade.name = f"WR_ARMOR_halberd_blade_{side}"
        blade.data.materials.append(mats["armor"])
        tag(blade)
        relink(blade, static)


def build():
    scene = bpy.context.scene
    scene["war_room_contract"] = CONTRACT
    engine_property = scene.bl_rna.properties["render"].fixed_type.properties["engine"]
    available_engines = {item.identifier for item in engine_property.enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in available_engines:
            scene.render.engine = candidate
            break
    else:
        raise RuntimeError(f"no supported Eevee engine available: {sorted(available_engines)}")
    scene.render.resolution_x, scene.render.resolution_y = PREVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = -0.40

    if scene.world is None:
        scene.world = bpy.data.worlds.new("WR_WORLD")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.004, 0.006, 0.012, 1.0)
    bg.inputs["Strength"].default_value = 0.11

    static = collection("WR_STATIC_SHELL")
    dynamic = collection("WR_PREVIEW_DYNAMIC")
    mats = {
        "walnut": material("WR_MAT_board_walnut", (0.17, 0.070, 0.032, 1), rough=0.42, coat=0.20, texture="wood", scale=4.4, bump=0.09),
        "walnut_dark": material("WR_MAT_walnut_dark", (0.045, 0.019, 0.012, 1), rough=0.52, coat=0.12, texture="wood", scale=3.2, bump=0.06),
        "wall_wood": material("WR_MAT_wall_walnut", (0.058, 0.020, 0.011, 1), rough=0.58, coat=0.08, texture="wood", scale=2.9, bump=0.045),
        "wall_recess": material("WR_MAT_wall_recess", (0.032, 0.010, 0.007, 1), rough=0.64, coat=0.04, texture="wood", scale=3.1, bump=0.035),
        "trim_wood": material("WR_MAT_trim_walnut", (0.095, 0.032, 0.015, 1), rough=0.41, coat=0.22, texture="wood", scale=3.5, bump=0.045),
        "parquet": material("WR_MAT_parquet", (0.12, 0.043, 0.020, 1), rough=0.50, coat=0.11, texture="wood", scale=5.1, bump=0.06),
        "floor_dark": material("WR_MAT_floor_underlay", (0.020, 0.009, 0.007, 1), rough=0.72, coat=0.03, texture="wood", scale=2.6, bump=0.025),
        "table_wood": material("WR_MAT_table_walnut", (0.105, 0.030, 0.013, 1), rough=0.37, coat=0.30, texture="wood", scale=3.9, bump=0.05),
        "frame_wood": material("WR_MAT_frame_walnut", (0.052, 0.016, 0.010, 1), rough=0.33, coat=0.34, texture="wood", scale=3.2, bump=0.04),
        "brass": material("WR_MAT_brass", (0.38, 0.16, 0.035, 1), metal=0.92, rough=0.27, coat=0.20, texture="metal", scale=22, bump=0.032),
        "brass_dark": material("WR_MAT_brass_dark", (0.13, 0.052, 0.016, 1), metal=0.88, rough=0.36, coat=0.14, texture="metal", scale=26, bump=0.028),
        "ivory": material("WR_MAT_ivory", (0.80, 0.70, 0.55, 1), rough=0.43, coat=0.17, texture="stone", scale=5.2, bump=0.055),
        "ebony": material("WR_MAT_ebony", (0.008, 0.010, 0.014, 1), metal=0.08, rough=0.24, coat=0.58, texture="stone", scale=6.2, bump=0.025),
        "red": material("WR_MAT_red_metal", (0.30, 0.012, 0.016, 1), metal=0.74, rough=0.24, coat=0.50),
        "velvet": material("WR_MAT_velvet", (0.20, 0.008, 0.016, 1), rough=0.84, sheen=0.68, texture="fabric", scale=38, bump=0.08),
        "velvet_dark": material("WR_MAT_velvet_dark", (0.060, 0.003, 0.007, 1), rough=0.92, sheen=0.50, texture="fabric", scale=44, bump=0.06),
        "leather": material("WR_MAT_leather", (0.16, 0.012, 0.018, 1), rough=0.46, coat=0.22, sheen=0.18, texture="leather", scale=45, bump=0.12),
        "leather_dark": material("WR_MAT_leather_dark", (0.048, 0.005, 0.008, 1), rough=0.56, coat=0.14, texture="leather", scale=48, bump=0.09),
        "desk_leather": material("WR_MAT_desk_leather", (0.010, 0.045, 0.030, 1), rough=0.52, coat=0.12, texture="leather", scale=52, bump=0.07),
        "stone": material("WR_MAT_stone", (0.30, 0.27, 0.22, 1), rough=0.66, coat=0.035, texture="stone", scale=4.1, bump=0.10),
        "stone_light": material("WR_MAT_stone_light", (0.48, 0.43, 0.36, 1), rough=0.60, coat=0.045, texture="stone", scale=3.9, bump=0.085),
        "stone_dark": material("WR_MAT_stone_shadow", (0.16, 0.135, 0.105, 1), rough=0.72, coat=0.02, texture="stone", scale=4.4, bump=0.075),
        "rug": material("WR_MAT_rug", (0.18, 0.007, 0.013, 1), rough=0.94, sheen=0.30, texture="fabric", scale=52, bump=0.14),
        "armor": material("WR_MAT_armor", (0.095, 0.105, 0.12, 1), metal=0.94, rough=0.24, coat=0.22, texture="metal", scale=28, bump=0.035),
        "armor_dark": material("WR_MAT_armor_dark", (0.028, 0.032, 0.040, 1), metal=0.92, rough=0.34, coat=0.16, texture="metal", scale=22, bump=0.025),
        "charcoal": material("WR_MAT_charcoal", (0.008, 0.006, 0.004, 1), rough=0.98),
        "green": material("WR_MAT_green_glaze", (0.012, 0.12, 0.055, 1), rough=0.24, coat=0.62),
        "book_a": material("WR_MAT_book_burgundy", (0.14, 0.020, 0.016, 1), rough=0.74, sheen=0.10),
        "book_b": material("WR_MAT_book_green", (0.030, 0.090, 0.050, 1), rough=0.74, sheen=0.10),
        "picture_a": material("WR_MAT_picture_a", (0.075, 0.020, 0.012, 1), rough=0.78, texture="stone", scale=4.5, bump=0.022),
        "picture_b": material("WR_MAT_picture_b", (0.050, 0.015, 0.012, 1), rough=0.80, texture="stone", scale=5.4, bump=0.022),
        "art_gilt": material("WR_MAT_art_gilt", (0.24, 0.095, 0.022, 1), metal=0.84, rough=0.38, coat=0.12, texture="metal", scale=28, bump=0.02),
        "window": material("WR_MAT_window_night", (0.003, 0.010, 0.055, 1), rough=0.20, coat=0.44),
        "moon": material("WR_MAT_window_moon", (0.56, 0.68, 0.90, 1), rough=0.26, emission=(0.16, 0.28, 0.62, 1)),
        "horizon": material("WR_MAT_window_horizon", (0.004, 0.007, 0.014, 1), rough=0.96),
        "fire": material("WR_MAT_fire", (0.88, 0.085, 0.006, 1), rough=0.18, emission=(1.0, 0.045, 0.002, 1)),
        "fire_core": material("WR_MAT_fire_core", (1.0, 0.32, 0.015, 1), rough=0.16, emission=(1.0, 0.18, 0.008, 1)),
        "ember": material("WR_MAT_ember", (0.24, 0.010, 0.003, 1), rough=0.38, emission=(0.44, 0.012, 0.002, 1)),
        "charred_wood": material("WR_MAT_charred_log", (0.018, 0.008, 0.004, 1), rough=0.90, texture="wood", scale=3.2, bump=0.08),
        "iron": material("WR_MAT_hearth_iron", (0.025, 0.028, 0.032, 1), metal=0.86, rough=0.52, texture="metal", scale=30, bump=0.018),
    }

    add_room(static, mats)
    add_preview_board(dynamic, mats)

    key = light("WR_LIGHT_key", "AREA", (-4.6, -2.8, 8.5), 690.0, (1.0, 0.70, 0.50), static, size=5.8)
    look_at(key, (0, 0.5, 1.1))
    fill = light("WR_LIGHT_fill", "AREA", (5.5, -3.2, 5.6), 455.0, (0.32, 0.46, 1.0), static, size=5.4)
    look_at(fill, (0.2, 0.2, 1.5))
    top = light("WR_LIGHT_top", "AREA", (0, 2.0, 8.3), 300.0, (1.0, 0.58, 0.32), static, size=5.0)
    look_at(top, (0, 1.0, 1.0))
    for side in (-1, 1):
        light(f"WR_LIGHT_sconce_{side}", "POINT", (side * 8.0, 2.6, 4.2), 115.0, (1.0, 0.31, 0.08), static, radius=1.35)

    cam_data = bpy.data.cameras.new("WR_CAMERA_hero")
    cam = bpy.data.objects.new("WR_CAMERA_hero", cam_data)

    vertical_fov = math.radians(RUNTIME_WIDE_FOV_DEG)
    distance = (RUNTIME_WIDE_HALF_SPAN / math.tan(vertical_fov / 2.0)) * RUNTIME_WIDE_PADDING
    direction = Vector(RUNTIME_WIDE_DIRECTION).normalized()
    target = Vector(RUNTIME_WIDE_TARGET)
    cam.location = target + direction * distance

    # Blender's landscape AUTO sensor fit is horizontal. Convert the runtime's
    # 22° vertical lens to an equivalent 16:9 focal length instead of merely
    # copying the Three.js FOV number.
    cam_data.sensor_width = 36.0
    sensor_height = cam_data.sensor_width / (PREVIEW_SIZE[0] / PREVIEW_SIZE[1])
    cam_data.lens = sensor_height / (2.0 * math.tan(vertical_fov / 2.0))
    look_at(cam, target)
    cam["war_room_camera_profile"] = "three-wide-v1"
    cam["runtime_vertical_fov_deg"] = RUNTIME_WIDE_FOV_DEG
    cam["runtime_distance"] = round(distance, 5)
    tag(cam)
    static.objects.link(cam)
    scene.camera = cam


def manifest(path):
    objects = []
    for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
        role = obj.get("war_room_role")
        if role:
            objects.append({
                "name": obj.name,
                "type": obj.type,
                "role": role,
                "location": [round(float(v), 5) for v in obj.location],
            })
    data = {
        "contract": CONTRACT,
        "preview": {"width": PREVIEW_SIZE[0], "height": PREVIEW_SIZE[1]},
        "board_anchor": {"name": "WR_ANCHOR_board_origin", "top_z": BOARD_Z, "square": 1.0},
        "camera": {
            "profile": "three-wide-v1",
            "vertical_fov_deg": RUNTIME_WIDE_FOV_DEG,
            "target": list(RUNTIME_WIDE_TARGET),
        },
        "objects": objects,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def validate():
    scene = bpy.context.scene
    required = {
        "WR_ARCH_floor", "WR_ARCH_back_wall", "WR_TABLE_main", "WR_TABLE_board_frame",
        "WR_ANCHOR_board_origin", "WR_FIREPLACE_body", "WR_DESK_top", "WR_CREST_plaque",
        "WR_WINDOW_frame", "WR_WINDOW_moon", "WR_ART_relief_right_ring",
        "WR_FIREPLACE_log_0", "WR_FIREPLACE_flame_core_0",
        "WR_LIGHT_key", "WR_LIGHT_fireplace", "WR_CAMERA_hero",
    }
    missing = sorted(required - {obj.name for obj in scene.objects})
    if missing:
        raise RuntimeError(f"missing War Room contract objects: {missing}")
    roles = {}
    for obj in scene.objects:
        role = obj.get("war_room_role")
        if role:
            roles[role] = roles.get(role, 0) + 1
    if roles.get(ROLE_STATIC, 0) < 75:
        raise RuntimeError(f"static shell too small: {roles}")
    if roles.get(ROLE_PREVIEW, 0) < 120:
        raise RuntimeError(f"preview scene too small: {roles}")
    anchor = bpy.data.objects["WR_ANCHOR_board_origin"]
    if tuple(round(v, 3) for v in anchor.location) != (0.0, 0.0, round(BOARD_Z, 3)):
        raise RuntimeError(f"board anchor drift: {tuple(anchor.location)}")
    if scene.camera is None or not (42 <= scene.camera.data.lens <= 56):
        raise RuntimeError("hero camera contract failed")


def sanitize_runtime_materials():
    """Disconnect Blender-only procedural links before the glTF runtime export.

    The editable .blend and hero preview keep the rich procedural materials. glTF
    cannot represent our Noise/Mapping/ColorRamp chains, though, and otherwise
    falls back to white for Base Color. The Principled sockets still retain the
    authored PBR fallback values, so disconnecting only for export gives Three.js
    a faithful coloured shell instead of a bleached room.
    """
    materials = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != ROLE_STATIC:
            continue
        for mat in obj.data.materials:
            if mat and mat.use_nodes and mat.node_tree:
                materials[mat.name] = mat

    removed_links = 0
    for mat in materials.values():
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            continue
        for socket_name in ("Base Color", "Normal"):
            target = bsdf.inputs.get(socket_name)
            if target is None:
                continue
            for link in list(target.links):
                mat.node_tree.links.remove(link)
                removed_links += 1
        mat["war_room_runtime_material"] = "gltf-safe-pbr-v1"

    if removed_links < 10:
        raise RuntimeError(f"runtime material sanitization suspiciously small: {removed_links}")
    return removed_links


def read_glb_json(path):
    raw = Path(path).read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise RuntimeError(f"invalid GLB header: {path}")
    _magic, version, declared_size = struct.unpack_from("<4sII", raw, 0)
    if version != 2 or declared_size != len(raw):
        raise RuntimeError(f"invalid GLB envelope: version={version} declared={declared_size} actual={len(raw)}")

    offset = 12
    while offset + 8 <= len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            return json.loads(chunk.decode("utf-8").rstrip("\x00 \t\r\n"))
    raise RuntimeError(f"GLB JSON chunk missing: {path}")


def validate_runtime_glb(path):
    data = read_glb_json(path)
    materials = {row.get("name"): row for row in data.get("materials", [])}
    required_colours = {
        "WR_MAT_wall_walnut",
        "WR_MAT_trim_walnut",
        "WR_MAT_parquet",
        "WR_MAT_table_walnut",
        "WR_MAT_frame_walnut",
        "WR_MAT_stone",
        "WR_MAT_stone_light",
        "WR_MAT_leather",
        "WR_MAT_armor",
    }
    missing = sorted(required_colours - set(materials))
    if missing:
        raise RuntimeError(f"runtime GLB materials missing: {missing}")

    bleached = []
    for name in sorted(required_colours):
        pbr = materials[name].get("pbrMetallicRoughness", {})
        factor = pbr.get("baseColorFactor")
        if not isinstance(factor, list) or len(factor) < 3 or min(factor[:3]) >= 0.95:
            bleached.append((name, factor))
    if bleached:
        raise RuntimeError(f"runtime GLB lost authored base colours: {bleached}")


def export_shell(path):
    sanitized_links = sanitize_runtime_materials()
    bpy.context.scene["war_room_runtime_material_links_removed"] = sanitized_links
    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.get("war_room_role") == ROLE_STATIC:
            obj.select_set(True)
            selected += 1
    if selected < 70:
        raise RuntimeError(f"runtime shell selection too small: {selected}")
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False,
    )
    validate_runtime_glb(path)
    bpy.ops.object.select_all(action="DESELECT")


def render(path):
    scene = bpy.context.scene
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    eevee = getattr(scene, "eevee", None)
    if eevee is not None and hasattr(eevee, "taa_render_samples"):
        eevee.taa_render_samples = max(16, int(os.environ.get("BLENDER_PREVIEW_SAMPLES", "48")))
    bpy.ops.render.render(write_still=True)


def main():
    opt = args()
    wipe()
    build()
    validate()
    blend = Path(opt.blend)
    glb = Path(opt.glb)
    preview = Path(opt.preview)
    out_manifest = Path(opt.manifest)
    for path in (blend, glb, preview, out_manifest):
        path.parent.mkdir(parents=True, exist_ok=True)
    manifest(out_manifest)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    render(preview)
    export_shell(glb)
    print(f"War Room premium OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
