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
MESH_COMPRESSION_EXTENSION = "EXT_meshopt_compression"

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


def anchor(name, loc, owner, *, role=ROLE_STATIC):
    obj = bpy.data.objects.new(name, None)
    obj.location = loc
    tag(obj, role)
    owner.objects.link(obj)
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
    mat["war_room_texture_kind"] = texture or ""
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


def draped_banner(name, center, side, mat, owner):
    """Build a shallow gathered cloth panel with real silhouette and fold relief."""
    cx, cy, cz = center
    half_height = 1.36
    columns = (-1.0, -0.66, -0.33, 0.0, 0.33, 0.66, 1.0)
    rows = (
        (1.00, 0.58, 0.00),
        (0.28, 0.50, side * 0.04),
        (-0.48, 0.31, side * 0.30),
        (-1.00, 0.56, side * 0.15),
    )

    verts = []
    front_rows = []
    for row_index, (height, width, shift) in enumerate(rows):
        row = []
        for column_index, factor in enumerate(columns):
            # Alternate shallow forward/back relief so grazing light does the
            # work that the old striped primitives tried to fake.
            fold_depth = 0.030 if column_index % 2 == 0 else 0.085
            if row_index == 2:
                fold_depth *= 0.62
            row.append(len(verts))
            verts.append((
                cx + shift + factor * width,
                cy - fold_depth,
                cz + height * half_height,
            ))
        front_rows.append(row)

    back_rows = []
    for row in front_rows:
        back = []
        for index in row:
            x, _y, z = verts[index]
            back.append(len(verts))
            verts.append((x, cy + 0.028, z))
        back_rows.append(back)

    faces = []
    for row_index in range(len(front_rows) - 1):
        for column_index in range(len(columns) - 1):
            tl = front_rows[row_index][column_index]
            tr = front_rows[row_index][column_index + 1]
            bl = front_rows[row_index + 1][column_index]
            br = front_rows[row_index + 1][column_index + 1]
            faces.append((tl, bl, br, tr))

            btl = back_rows[row_index][column_index]
            btr = back_rows[row_index][column_index + 1]
            bbl = back_rows[row_index + 1][column_index]
            bbr = back_rows[row_index + 1][column_index + 1]
            faces.append((btl, btr, bbr, bbl))

    for row_index in range(len(front_rows) - 1):
        faces.append((
            front_rows[row_index][0],
            back_rows[row_index][0],
            back_rows[row_index + 1][0],
            front_rows[row_index + 1][0],
        ))
        faces.append((
            front_rows[row_index][-1],
            front_rows[row_index + 1][-1],
            back_rows[row_index + 1][-1],
            back_rows[row_index][-1],
        ))

    for column_index in range(len(columns) - 1):
        faces.append((
            front_rows[0][column_index],
            front_rows[0][column_index + 1],
            back_rows[0][column_index + 1],
            back_rows[0][column_index],
        ))
        faces.append((
            front_rows[-1][column_index],
            back_rows[-1][column_index],
            back_rows[-1][column_index + 1],
            front_rows[-1][column_index + 1],
        ))

    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    tag(obj)
    owner.objects.link(obj)
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
    cube("WR_ARCH_right_wall", (8.68, 0.8, 3.35), (0.18, 6.25, 3.35), mats["wall_wood"], static, bevel=0.02)    # Canonical v2 split: dark walnut wainscot below, warm mineral plaster
    # above. The broad matte fields break the all-brown box effect while the
    # original rails/stiles remain the architectural frame in front.
    upper_bays = (
        (-7.86, 0.53),
        (-5.75, 1.47),
        (-2.88, 1.22),
        (0.00, 1.45),
        (2.88, 1.22),
        (5.75, 1.47),
        (7.86, 0.53),
    )
    for index, (x, half_width) in enumerate(upper_bays):
        cube(f"WR_ARCH_upper_plaster_{index}", (x, 6.815, 4.73),
             (half_width, 0.018, 1.38), mats["wall_plaster"], static, bevel=0.018)
    for side in (-1, 1):
        cube(f"WR_ARCH_side_upper_plaster_{side}", (side * 8.485, 0.85, 4.73),
             (0.018, 5.95, 1.38), mats["wall_plaster"], static, bevel=0.018)

    # Canon side-bay articulation. Shallow piers and wainscot relief turn the
    # previously flat side walls into readable gothic architecture while keeping
    # the tactical centre visually quiet.
    for side in (-1, 1):
        pier_y = (-4.35, -1.65, 1.05) if side < 0 else (-4.35, -1.65, 0.15)
        for index, y in enumerate(pier_y):
            cube(f"WR_ARCH_side_pier_{side}_{index}", (side * 8.45, y, 3.20),
                 (0.08, 0.19, 2.78), mats["stone_dark"], static, bevel=0.050)
            cube(f"WR_ARCH_side_pier_base_{side}_{index}", (side * 8.39, y, 0.48),
                 (0.12, 0.28, 0.18), mats["stone_dark"], static, bevel=0.045)
            cube(f"WR_ARCH_side_pier_cap_{side}_{index}", (side * 8.39, y, 5.82),
                 (0.12, 0.28, 0.16), mats["stone"], static, bevel=0.045)
        cube(f"WR_ARCH_side_wainscot_rail_{side}", (side * 8.44, -1.62, 2.40),
             (0.07, 4.55, 0.10), mats["trim_wood"], static, bevel=0.030)
        cube(f"WR_ARCH_side_base_rail_{side}", (side * 8.44, -1.62, 0.52),
             (0.07, 4.55, 0.14), mats["trim_wood"], static, bevel=0.032)
        panel_y = (-3.02, -0.28) if side < 0 else (-3.02,)
        for index, y in enumerate(panel_y):
            cube(f"WR_ARCH_side_panel_{side}_{index}", (side * 8.475, y, 1.40),
                 (0.018, 0.98, 0.62), mats["wall_recess"], static, bevel=0.030)

    for z in (1.25, 3.15, 5.45):
        cube(f"WR_ARCH_back_rail_{z}", (0, 6.78, z), (8.45, 0.06, 0.05), mats["brass_dark"], static, bevel=0.018)
    for x in (-7.3, -4.2, -1.55, 1.55, 4.2, 7.3):
        cube(f"WR_ARCH_back_stile_{x}", (x, 6.78, 3.35), (0.05, 0.06, 2.45), mats["trim_wood"], static, bevel=0.018)
    # Expose the mineral floor instead of carpeting the entire room with
    # parquet. The canonical v2 room uses wood as furniture/joinery and stone as
    # the visual breathing space around the command table.
    for x in (-6.20, -2.05, 2.10, 6.25):
        cube(f"WR_ARCH_floor_joint_x_{x}", (x, 0.05, 0.006), (0.018, 6.58, 0.008),
             mats["stone_dark"], static, bevel=0.004)
    for y in (-4.55, -0.55, 3.45):
        cube(f"WR_ARCH_floor_joint_y_{y}", (0, y, 0.006), (8.22, 0.018, 0.008),
             mats["stone_dark"], static, bevel=0.004)

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
    cube("WR_TABLE_main", (0, 0, 0.47), (5.32, 5.32, 0.38), mats["table_wood"], static, bevel=0.13)
    cube("WR_TABLE_board_frame", (0, 0, 0.96), (4.62, 4.62, 0.12), mats["frame_wood"], static, bevel=0.09)
    # Restrained leather band: furniture detail, not a second frame competing with the board.
    for side in (-1, 1):
        cube(f"WR_TABLE_inlay_x_{side}", (0, side * 4.90, 1.075), (4.58, 0.16, 0.018),
             mats["table_leather"], static, bevel=0.022)
        cube(f"WR_TABLE_inlay_y_{side}", (side * 4.90, 0, 1.075), (0.16, 4.58, 0.018),
             mats["table_leather"], static, bevel=0.022)
        cube(f"WR_TABLE_inlay_pipe_x_{side}", (0, side * 5.07, 1.097), (4.60, 0.010, 0.009),
             mats["brass_dark"], static, bevel=0.005)
        cube(f"WR_TABLE_inlay_pipe_y_{side}", (side * 5.07, 0, 1.097), (0.010, 4.60, 0.009),
             mats["brass_dark"], static, bevel=0.005)
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
    cube("WR_FIREPLACE_mantel", (-4.55, 5.76, 3.53), (1.78, 0.64, 0.12), mats["stone_light"], static, bevel=0.075)
    cube("WR_FIREPLACE_mantel_cap", (-4.55, 5.76, 3.70), (1.88, 0.68, 0.055), mats["stone"], static, bevel=0.04)
    cube("WR_FIREPLACE_mantel_shadow", (-4.55, 5.08, 3.39), (1.84, 0.08, 0.06), mats["stone_dark"], static, bevel=0.025)
    cube("WR_FIREPLACE_hearth", (-4.55, 5.35, 0.72), (1.48, 0.78, 0.10), mats["stone"], static, bevel=0.07)
    cube("WR_FIREPLACE_hearth_lip", (-4.55, 4.72, 0.82), (1.56, 0.12, 0.055), mats["stone_dark"], static, bevel=0.025)
    cube("WR_FIREPLACE_inner_lintel", (-4.55, 5.69, 2.58), (1.05, 0.09, 0.12), mats["stone_dark"], static, bevel=0.035)
    # A soot-darkened inner reveal stops the surround reading as a bright toy block.
    cube("WR_FIREPLACE_soot_header", (-4.55, 5.73, 2.38), (0.90, 0.035, 0.055),
         mats["charcoal"], static, bevel=0.018)
    for px in (-5.43, -3.67):
        cube(f"WR_FIREPLACE_soot_jamb_{px}", (px, 5.73, 1.67), (0.045, 0.035, 0.66),
             mats["charcoal"], static, bevel=0.014)
    for px in (-5.57, -3.53):
        cube(f"WR_FIREPLACE_inner_jamb_{px}", (px, 5.69, 1.70), (0.11, 0.09, 0.76), mats["stone_dark"], static, bevel=0.03)
    for px in (-5.78, -3.32):
        cube(f"WR_FIREPLACE_pilaster_{px}", (px, 5.77, 2.16), (0.16, 0.12, 1.06), mats["stone"], static, bevel=0.045)
        cube(f"WR_FIREPLACE_cap_{px}", (px, 5.73, 3.23), (0.24, 0.18, 0.10), mats["stone_light"], static, bevel=0.045)
        cube(f"WR_FIREPLACE_foot_{px}", (px, 5.66, 1.02), (0.24, 0.20, 0.10), mats["stone_dark"], static, bevel=0.035)
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

    # Organic hearth silhouette: one broad low body plus three overlapping,
    # uneven tongues. The overlap keeps the fire reading as one mass while the
    # different heights/leans avoid both the old egg row and the later polygon crown.
    sphere("WR_FIREPLACE_flame_body", (-4.55, 5.53, 1.40), 0.25,
           mats["fire"], static, scale=(2.05, 0.52, 0.58))
    for idx, (dx, dz, sx, sz, tilt) in enumerate((
        (-0.25, 0.18, 0.62, 1.25, -0.22),
        (0.02, 0.32, 0.56, 1.58, 0.08),
        (0.30, 0.12, 0.48, 0.96, 0.24),
    )):
        tongue = sphere(
            f"WR_FIREPLACE_flame_tongue_{idx}",
            (-4.55 + dx, 5.51, 1.42 + dz),
            0.20,
            mats["fire"],
            static,
            scale=(sx, 0.34, sz),
        )
        tongue.rotation_euler.y = tilt

    # Two small hotter cores stay low and off-centre so they reinforce depth
    # instead of creating another symmetric row of mini flames.
    for idx, (dx, dz, sx, sz, tilt) in enumerate((
        (-0.12, 0.12, 0.40, 0.90, -0.10),
        (0.12, 0.18, 0.34, 1.02, 0.14),
    )):
        core = sphere(f"WR_FIREPLACE_flame_core_{idx}", (-4.55 + dx, 5.46, 1.40 + dz),
                      0.14, mats["fire_core"], static, scale=(sx, 0.28, sz))
        core.rotation_euler.y = tilt

    light("WR_LIGHT_fireplace", "POINT", (-4.55, 5.15, 1.82), 292.0, (1.0, 0.23, 0.048), static, radius=1.35)
    anchor("WR_ANCHOR_fireplace_practical", (-4.55, 5.05, 1.92), static)

    # Back desk.
    cube("WR_DESK_top", (0, 6.0, 2.18), (1.82, 0.52, 0.12), mats["table_wood"], static, bevel=0.08)
    cube("WR_DESK_blotter", (0.18, 5.45, 2.33), (0.92, 0.26, 0.025), mats["desk_leather"], static, bevel=0.025)
    cube("WR_DESK_blotter_edge", (0.18, 5.17, 2.34), (0.98, 0.025, 0.028), mats["brass_dark"], static, bevel=0.012)
    # A couple of overlapping dispatch sheets keep the blotter from reading as
    # one empty green slab. Their offsets are broad enough to survive the hero
    # camera, with one small brass weight instead of a pile of desk clutter.
    dispatch_sheet_a = cube("WR_DESK_dispatch_sheet_a", (0.42, 5.40, 2.385),
                            (0.30, 0.18, 0.012), mats["ivory"], static, bevel=0.012)
    dispatch_sheet_a.rotation_euler.z = -0.10
    dispatch_sheet_b = cube("WR_DESK_dispatch_sheet_b", (0.68, 5.47, 2.405),
                            (0.24, 0.15, 0.010), mats["ivory"], static, bevel=0.010)
    dispatch_sheet_b.rotation_euler.z = 0.08
    cylinder("WR_DESK_dispatch_weight", (0.79, 5.39, 2.435), 0.065, 0.035,
             mats["brass"], static, vertices=18)
    # Give the rear desk furniture weight at the runtime camera distance.
    cube("WR_DESK_apron", (0, 5.49, 1.91), (1.70, 0.08, 0.20), mats["frame_wood"], static, bevel=0.045)
    cube("WR_DESK_center_shadow", (0, 6.16, 1.33), (0.72, 0.12, 0.55), mats["wall_recess"], static, bevel=0.04)
    for x in (-1.48, 1.48):
        cube(f"WR_DESK_pedestal_{x}", (x, 6.18, 1.27), (0.35, 0.43, 0.78), mats["frame_wood"], static, bevel=0.06)
        for row in range(3):
            drawer_z = 1.02 + row * 0.38
            cube(f"WR_DESK_drawer_{x}_{row}", (x, 5.72, drawer_z), (0.27, 0.035, 0.14),
                 mats["wall_recess"], static, bevel=0.022)
            sphere(f"WR_DESK_knob_{x}_{row}", (x, 5.67, drawer_z), 0.045, mats["brass"], static)
    cylinder("WR_DESK_lamp_base", (-0.72, 5.58, 2.39), 0.24, 0.08, mats["brass"], static)
    cylinder("WR_DESK_lamp_stem", (-0.72, 5.58, 2.68), 0.035, 0.55, mats["brass"], static)
    # Banker's-lamp trim: a thin elliptical brass lip and tiny top finial stop
    # the green shade reading as a floating flattened sphere at hero distance.
    sphere("WR_DESK_lamp_shade_lip", (-0.72, 5.56, 2.84), 0.34,
           mats["brass_dark"], static, scale=(1.48, 0.68, 0.10))
    sphere("WR_DESK_lamp_shade", (-0.72, 5.56, 2.98), 0.34,
           mats["green"], static, scale=(1.4, 0.65, 0.45))
    sphere("WR_DESK_lamp_finial", (-0.72, 5.56, 3.14), 0.055,
           mats["brass"], static, scale=(0.90, 0.72, 0.68))

    # Ceremonial rampant-horse crest. Keep the circular plaque from the approved
    # composition, but replace the old vertical pawn silhouette with a broad,
    # rearing heraldic relief that still reads at the gameplay camera distance.
    cylinder("WR_CREST_plaque", (0, 6.72, 4.65), 1.32, 0.12, mats["charcoal"], static, vertices=64)
    bpy.context.object.rotation_euler.x = math.pi / 2
    torus("WR_CREST_ring", (0, 6.59, 4.65), 1.13, 0.055, mats["brass"], static, rotation=(math.pi / 2, 0, 0))
    cube("WR_CREST_shield", (0, 6.51, 4.64), (0.68, 0.055, 0.70), mats["book_a"], static, bevel=0.22)

    # Graphic rampant-horse relief. A single shallow extruded silhouette reads
    # more clearly from the gameplay camera than a pile of primitive anatomy,
    # while also reducing runtime mesh pressure.
    relief_mesh = bpy.data.meshes.new("WR_CREST_horse_relief_mesh")
    relief_vertices = []
    relief_faces = []

    def append_relief_prism(points, y_front=6.385, y_back=6.455):
        # Ensure CCW in X/Z so the front face normal points toward the camera (-Y).
        area = sum(
            points[i][0] * points[(i + 1) % len(points)][1]
            - points[(i + 1) % len(points)][0] * points[i][1]
            for i in range(len(points))
        )
        ring = list(points if area > 0 else reversed(points))
        base = len(relief_vertices)
        relief_vertices.extend((x, y_front, z) for x, z in ring)
        relief_vertices.extend((x, y_back, z) for x, z in ring)
        count = len(ring)
        relief_faces.append(tuple(base + i for i in range(count)))
        relief_faces.append(tuple(base + count + i for i in reversed(range(count))))
        for i in range(count):
            j = (i + 1) % count
            relief_faces.append((
                base + i,
                base + j,
                base + count + j,
                base + count + i,
            ))

    # Main silhouette: rearing body, long neck/head, one raised foreleg,
    # grounded hind leg and a high curling tail.
    append_relief_prism([
        (0.26, 4.04), (0.17, 4.05), (0.07, 4.38), (-0.02, 4.50),
        (-0.17, 4.65), (-0.31, 4.83), (-0.52, 4.64), (-0.63, 4.67),
        (-0.60, 4.75), (-0.34, 4.97), (-0.17, 5.05), (-0.32, 5.20),
        (-0.61, 5.28), (-0.80, 5.34), (-0.78, 5.44), (-0.57, 5.49),
        (-0.50, 5.65), (-0.43, 5.57), (-0.31, 5.67), (-0.30, 5.53),
        (-0.18, 5.45), (0.04, 5.18), (0.31, 5.10), (0.49, 4.92),
        (0.70, 5.02), (0.89, 4.92), (0.80, 4.80), (0.61, 4.71),
        (0.48, 4.54), (0.53, 4.27), (0.60, 4.08), (0.52, 4.02),
        (0.42, 4.05), (0.32, 4.36),
    ])

    # Second raised foreleg sits a hair in front of the body relief, giving the
    # classic rampant pose without creating another runtime object.
    append_relief_prism([
        (-0.10, 5.00), (0.03, 4.95), (-0.06, 4.73),
        (-0.15, 4.65), (-0.24, 4.69), (-0.18, 4.83),
    ], y_front=6.372, y_back=6.442)

    relief_mesh.from_pydata(relief_vertices, [], relief_faces)
    relief_mesh.update()
    horse_relief = bpy.data.objects.new("WR_CREST_horse_relief", relief_mesh)
    horse_relief.data.materials.append(mats["brass"])
    tag(horse_relief)
    static.objects.link(horse_relief)
    bpy.context.scene["war_room_heraldry"] = "rampant-horse-v3-graphic"

    # Draped velvet banners: the cloth silhouette now narrows into the tieback
    # and fans out below it, with real shallow fold relief instead of vertical
    # stripe geometry.
    for side in (-1, 1):
        center = side * 2.13
        draped_banner(f"WR_CURTAIN_panel_{side}", (center, 6.54, 4.72), side,
                      mats["velvet_dark"], static)
        cube(f"WR_CURTAIN_rod_{side}", (center, 6.48, 6.18), (0.70, 0.040, 0.040),
             mats["brass_dark"], static, bevel=0.018)
        for edge in (-1, 1):
            sphere(f"WR_CURTAIN_finial_{side}_{edge}",
                   (center + edge * 0.72, 6.48, 6.18), 0.07, mats["brass"], static)
        torus(f"WR_CURTAIN_tie_{side}", (center + side * 0.30, 6.34, 4.07), 0.16, 0.026,
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
    # Pull the cold practical slightly into the room instead of leaving it
    # pinned to the wall plane. Runtime uses the anchor for its v2 PointLight;
    # Blender aims the preview AREA inward so both proofs express the same depth cue.
    moon_preview = light("WR_LIGHT_window", "AREA", (7.20, 2.60, 4.65), 255.0,
                         (0.24, 0.34, 0.62), static, size=3.8)
    look_at(moon_preview, (4.20, 0.40, 1.35))
    anchor("WR_ANCHOR_window_moonlight", (7.35, 2.75, 4.45), static)

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

    # Ceremonial armour display. Angular plate construction keeps the suits
    # reading as armour rather than glossy toy figures at the hero camera.
    for side in (-1, 1):
        x = side * 7.33
        cylinder(f"WR_ARMOR_base_{side}", (x, 4.35, 0.33), 0.62, 0.22, mats["charcoal"], static)
        cube(f"WR_ARMOR_stand_{side}", (x, 4.35, 1.12), (0.11, 0.11, 0.78), mats["charcoal"], static, bevel=0.025)

        cube(f"WR_ARMOR_breastplate_{side}", (x, 4.34, 1.48), (0.40, 0.25, 0.46),
             mats["armor"], static, bevel=0.15)
        cube(f"WR_ARMOR_abdomen_{side}", (x, 4.34, 1.15), (0.33, 0.23, 0.18),
             mats["armor_dark"], static, bevel=0.09)
        torus(f"WR_ARMOR_gorget_{side}", (x, 4.32, 1.91), 0.19, 0.035, mats["brass_dark"], static)
        torus(f"WR_ARMOR_belt_{side}", (x, 4.34, 1.06), 0.30, 0.035, mats["brass_dark"], static)
        cube(f"WR_ARMOR_breastplate_ridge_{side}", (x, 4.065, 1.50), (0.028, 0.028, 0.34),
             mats["brass_dark"], static, bevel=0.010)
        cube(f"WR_ARMOR_breastplate_brow_{side}", (x, 4.06, 1.72), (0.31, 0.030, 0.025),
             mats["brass_dark"], static, bevel=0.010)

        cube(f"WR_ARMOR_skirt_{side}", (x, 4.34, 0.92), (0.37, 0.27, 0.17),
             mats["armor_dark"], static, bevel=0.07)
        for leg in (-1, 1):
            cube(f"WR_ARMOR_greave_{side}_{leg}", (x + leg * 0.18, 4.34, 0.64), (0.105, 0.12, 0.25),
                 mats["armor"], static, bevel=0.055)
            cube(f"WR_ARMOR_sabatons_{side}_{leg}", (x + leg * 0.18, 4.16, 0.37), (0.12, 0.20, 0.075),
                 mats["armor_dark"], static, bevel=0.065)

        for shoulder in (-1, 1):
            pauldron = cube(f"WR_ARMOR_pauldron_{side}_{shoulder}",
                            (x + shoulder * 0.43, 4.34, 1.66), (0.22, 0.27, 0.15),
                            mats["armor"], static, bevel=0.11)
            pauldron.rotation_euler.y = -shoulder * 0.16
            cube(f"WR_ARMOR_upper_arm_{side}_{shoulder}",
                 (x + shoulder * 0.45, 4.34, 1.37), (0.115, 0.14, 0.21),
                 mats["armor_dark"], static, bevel=0.075)
            cube(f"WR_ARMOR_forearm_{side}_{shoulder}",
                 (x + shoulder * 0.47, 4.31, 1.10), (0.105, 0.13, 0.18),
                 mats["armor"], static, bevel=0.070)
            cube(f"WR_ARMOR_gauntlet_{side}_{shoulder}",
                 (x + shoulder * 0.47, 4.28, 0.91), (0.115, 0.13, 0.075),
                 mats["armor_dark"], static, bevel=0.055)

        cube(f"WR_ARMOR_helmet_{side}", (x, 4.34, 2.16), (0.27, 0.24, 0.27),
             mats["armor"], static, bevel=0.14)
        cube(f"WR_ARMOR_helmet_brow_{side}", (x, 4.075, 2.22), (0.25, 0.035, 0.045),
             mats["armor_dark"], static, bevel=0.020)
        cube(f"WR_ARMOR_visor_{side}", (x, 4.065, 2.13), (0.22, 0.030, 0.040),
             mats["charcoal"], static, bevel=0.014)
        cube(f"WR_ARMOR_helmet_jaw_{side}", (x, 4.10, 2.01), (0.22, 0.16, 0.070),
             mats["armor_dark"], static, bevel=0.050)
        cube(f"WR_ARMOR_helmet_ridge_{side}", (x, 4.34, 2.45), (0.025, 0.16, 0.070),
             mats["brass_dark"], static, bevel=0.014)

        shaft_x = x - side * 0.52
        cylinder(f"WR_ARMOR_halberd_{side}", (shaft_x, 4.20, 1.92), 0.028, 3.2,
                 mats["brass_dark"], static, vertices=16)
        axe = cube(f"WR_ARMOR_halberd_blade_{side}", (shaft_x - side * 0.12, 4.20, 3.43),
                   (0.14, 0.035, 0.16), mats["armor"], static, bevel=0.035)
        axe.rotation_euler.y = side * 0.42
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.075, radius2=0.0, depth=0.34,
                                       location=(shaft_x, 4.20, 3.69))
        spike = bpy.context.object
        spike.name = f"WR_ARMOR_halberd_spike_{side}"
        spike.data.materials.append(mats["armor"])
        tag(spike)
        relink(spike, static)



def add_gothic_canon_v2(static, mats):
    """Structural parity pass for the approved 2026-09-18 gothic-study canon.

    Keep the existing room as the editable baseline, then add the large canonical
    masses that are already present in the Three.js scene: burgundy heraldry,
    deep bookcase, second fireplace, chandelier, globe and table drape.
    """
    bpy.context.scene["war_room_visual_canon"] = "cinematic-gothic-study-2026-09-18-v1"
    # Separate the heraldic crest from the chandelier in projection. The crest
    # remains centered on the rear wall, but sits slightly higher so the horse
    # silhouette reads through the fixture instead of collapsing into its spokes.
    for obj in list(static.objects):
        if obj.name.startswith("WR_CREST_"):
            obj.location.z += 0.34

    # Retire legacy modern-study decoration only inside the v2 generator. The
    # historical implementation remains in source control as rollback, but these
    # rectangular paintings/floating shelves visually fight the approved gothic canon.
    legacy_prefixes = (
        "WR_ART_", "WR_SHELF_", "WR_BOOK_", "WR_VASE_", "WR_CURTAIN_",
        "WR_LIGHT_picture_",
    )
    for obj in list(static.objects):
        if obj.name.startswith(legacy_prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)

    # Break the last big mirror cue from the baseline room. V2 keeps the left
    # ceremonial suit as a military accent; the right suit is removed so the
    # globe + night window can read as a different, quieter secondary zone.
    for obj in list(static.objects):
        if obj.name.startswith("WR_ARMOR_") and obj.location.x > 0:
            bpy.data.objects.remove(obj, do_unlink=True)

    # The baseline leather benches were another mirrored cue and sat so close
    # to the camera edges that they read as anonymous blocks. Keep one lived-in
    # seating zone on the left, move it slightly into the room, and clear the
    # right side for the globe/window composition.
    for obj in list(static.objects):
        if not obj.name.startswith("WR_BENCH_"):
            continue
        if obj.location.x > 0:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            obj.location.x += 0.48
            obj.location.y += 0.62

    # Layer the surviving left bench as furniture rather than one anonymous
    # upholstered block: a narrow wooden plinth under the seat and a separate
    # top cushion keep the existing footprint while giving the foreground edge
    # a readable construction hierarchy.
    left_bench_x, left_bench_y = -6.67, -4.18
    cube("WR_CANON_bench_wood_base", (left_bench_x, left_bench_y, 0.47),
         (0.84, 1.12, 0.10), mats["frame_wood"], static, bevel=0.055)
    cube("WR_CANON_bench_cushion", (left_bench_x, left_bench_y, 0.99),
         (0.78, 1.08, 0.085), mats["leather_dark"], static, bevel=0.10)

    burgundy = material(
        "WR_MAT_canon_burgundy", (0.205, 0.012, 0.022, 1),
        rough=0.84, coat=0.035, sheen=0.44, texture="fabric", scale=36, bump=0.075,
    )
    burgundy_dark = material(
        "WR_MAT_canon_burgundy_dark", (0.128, 0.009, 0.016, 1),
        rough=0.91, sheen=0.25, texture="fabric", scale=42, bump=0.055,
    )
    heraldic_brass = material(
        "WR_MAT_canon_heraldic_brass", (0.58, 0.27, 0.060, 1),
        metal=0.94, rough=0.22, coat=0.20, texture="metal", scale=22, bump=0.028,
    )
    horse_relief = static.objects.get("WR_CREST_horse_relief")
    if horse_relief is not None and horse_relief.data.materials:
        horse_relief.data.materials[0] = heraldic_brass

    # The single surviving ceremonial suit sits in a deliberately dark corner.
    # Keep the plate itself subdued, but lift a handful of existing trim pieces
    # into the same heraldic brass so the armour silhouette survives runtime
    # lighting without adding another lamp or brightening the whole left wall.
    for trim_name in (
        "WR_ARMOR_gorget_-1",
        "WR_ARMOR_belt_-1",
        "WR_ARMOR_breastplate_ridge_-1",
        "WR_ARMOR_breastplate_brow_-1",
        "WR_ARMOR_helmet_brow_-1",
    ):
        trim_obj = static.objects.get(trim_name)
        if trim_obj is not None and trim_obj.data.materials:
            trim_obj.data.materials[0] = heraldic_brass

    def add_pointed_arch_frame(prefix, cx):
        """Stone lancet frame: curved in segments so it reads as gothic, not as a roof truss."""
        y = 6.43
        span = 1.48
        jamb_bottom = 3.18
        shoulder = 5.04
        peak = 6.48
        for side in (-1, 1):
            cube(
                f"WR_CANON_arch_{prefix}_jamb_{side}",
                (cx + side * span, y, (jamb_bottom + shoulder) / 2),
                (0.155, 0.105, (shoulder - jamb_bottom) / 2),
                mats["stone"], static, bevel=0.052,
            )
            cube(
                f"WR_CANON_arch_{prefix}_foot_{side}",
                (cx + side * span, y - 0.01, jamb_bottom + 0.08),
                (0.25, 0.130, 0.120), mats["stone_light"], static, bevel=0.050,
            )
            cube(
                f"WR_CANON_arch_{prefix}_capital_{side}",
                (cx + side * span, y - 0.01, shoulder),
                (0.26, 0.135, 0.135), mats["stone_light"], static, bevel=0.052,
            )
            points = (
                Vector((cx + side * span, y, shoulder)),
                Vector((cx + side * span * 0.90, y, shoulder + 0.38)),
                Vector((cx + side * span * 0.68, y, shoulder + 0.76)),
                Vector((cx + side * span * 0.37, y, peak - 0.27)),
                Vector((cx, y, peak)),
            )
            for segment in range(len(points) - 1):
                start = points[segment]
                end = points[segment + 1]
                direction = end - start
                beam = cube(
                    f"WR_CANON_arch_{prefix}_curve_{side}_{segment}",
                    (start + end) / 2,
                    (0.145, 0.100, direction.length / 2),
                    mats["stone"], static, bevel=0.048,
                )
                beam.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    # One ceremonial lancet is enough. Keeping only the left arch removes the
    # twin-altar symmetry that made v2 feel like a stage set rather than a lived
    # command room.
    add_pointed_arch_frame("left", -4.55)

    # Shallow tracery belongs only to the dominant left hearth.
    prefix, cx = "left", -4.55
    cube(f"WR_CANON_arch_{prefix}_keystone", (cx, 6.34, 6.18),
         (0.18, 0.055, 0.20), mats["stone"], static, bevel=0.055)
    cube(f"WR_CANON_arch_{prefix}_sill", (cx, 6.36, 3.26),
         (1.33, 0.055, 0.075), mats["stone"], static, bevel=0.030)
    for lobe, (dx, dz) in enumerate(((0.0, 0.24), (0.0, -0.24), (-0.24, 0.0), (0.24, 0.0))):
        torus(f"WR_CANON_arch_{prefix}_tracery_{lobe}",
              (cx + dx, 6.30, 5.42 + dz), 0.18, 0.036,
              mats["stone"], static, rotation=(math.pi / 2, 0, 0))
    cube(f"WR_CANON_arch_{prefix}_tracery_v", (cx, 6.30, 5.18),
         (0.038, 0.035, 0.48), mats["stone"], static, bevel=0.014)
    cube(f"WR_CANON_arch_{prefix}_tracery_h", (cx, 6.30, 5.42),
         (0.48, 0.035, 0.038), mats["stone"], static, bevel=0.014)

    # The opposite wall gets a broad campaign painting instead of a mirrored
    # lancet. Large, quiet rectangular masses give the eye somewhere to rest
    # and bring back the hierarchy that made the classic room feel inhabited.
    px = 4.86
    # Recess the campaign display into a darker wall bay so the right side reads
    # as layered architecture rather than another bright ceremonial focal point.
    cube("WR_CANON_campaign_recess", (px, 6.535, 4.95),
         (1.78, 0.070, 1.20), mats["wall_recess"], static, bevel=0.045)
    cube("WR_CANON_campaign_reveal_top", (px, 6.44, 6.06),
         (1.72, 0.075, 0.065), mats["stone_dark"], static, bevel=0.025)
    for side in (-1, 1):
        cube(f"WR_CANON_campaign_reveal_side_{side}", (px + side * 1.66, 6.44, 4.95),
             (0.065, 0.075, 1.06), mats["stone_dark"], static, bevel=0.022)
    cube("WR_CANON_campaign_frame_back", (px, 6.38, 4.95),
         (1.46, 0.075, 0.94), mats["frame_wood"], static, bevel=0.075)
    cube("WR_CANON_campaign_frame_outer", (px, 6.38, 4.95),
         (1.36, 0.045, 0.84), mats["brass_dark"], static, bevel=0.055)
    cube("WR_CANON_campaign_canvas", (px, 6.31, 4.95),
         (1.20, 0.028, 0.68), mats["wall_recess"], static, bevel=0.018)
    # Restrained campaign-map relief: a long front line, two route legs,
    # three field pins and one objective ring. The elements stay broad enough
    # to survive the gameplay camera while remaining subordinate to the board.
    cube("WR_CANON_campaign_horizon", (px, 6.275, 5.03),
         (0.91, 0.018, 0.020), mats["brass_dark"], static, bevel=0.008)
    # Two broad shallow territory reliefs sit behind the route linework. They
    # give the panel a cartographic base without introducing another colour or
    # turning the display into a UI map.
    territory_a = sphere("WR_CANON_campaign_territory_a", (px - 0.48, 6.292, 4.91),
                         0.26, mats["brass_dark"], static, scale=(1.45, 0.08, 0.74))
    territory_a.rotation_euler.y = -0.18
    territory_b = sphere("WR_CANON_campaign_territory_b", (px + 0.28, 6.292, 4.82),
                         0.22, mats["brass_dark"], static, scale=(1.10, 0.08, 0.88))
    territory_b.rotation_euler.y = 0.24
    route = cube("WR_CANON_campaign_route", (px - 0.18, 6.27, 4.83),
                 (0.58, 0.018, 0.024), mats["brass_dark"], static, bevel=0.008)
    route.rotation_euler.y = -0.24
    route_branch = cube("WR_CANON_campaign_route_branch", (px + 0.30, 6.268, 5.04),
                        (0.34, 0.018, 0.022), mats["brass_dark"], static, bevel=0.008)
    route_branch.rotation_euler.y = 0.34
    for index, (dx, dz) in enumerate(((-0.70, -0.22), (-0.16, -0.08), (0.26, 0.08))):
        sphere(f"WR_CANON_campaign_pin_{index}", (px + dx, 6.238, 4.95 + dz), 0.046,
               mats["brass"], static, scale=(1.0, 0.55, 1.0))
    torus("WR_CANON_campaign_objective", (px + 0.54, 6.26, 5.17),
          0.16, 0.024, mats["brass_dark"], static, rotation=(math.pi / 2, 0, 0))

    # Shallow mortar courses break the upper wall into believable masonry.
    # They stay behind the hero props and use one existing material so runtime
    # batching can collapse them aggressively.
    for course, z in enumerate((3.62, 4.18, 4.74, 5.30, 5.86, 6.36)):
        cube(
            f"WR_CANON_masonry_course_{course}",
            (0, 6.555, z), (8.10, 0.018, 0.018),
            mats["stone_dark"], static, bevel=0.006,
        )

    # Rear-wall pilasters give the canon its layered stone/wood cadence.
    for index, x in enumerate((-7.72, -3.20, 3.20, 7.72)):
        cube(f"WR_CANON_rear_pilaster_{index}", (x, 6.50, 4.60),
             (0.22, 0.115, 1.62), mats["stone"], static, bevel=0.065)
        cube(f"WR_CANON_rear_pilaster_cap_{index}", (x, 6.47, 6.16),
             (0.31, 0.135, 0.12), mats["stone"], static, bevel=0.050)
        cube(f"WR_CANON_rear_pilaster_base_{index}", (x, 6.47, 3.09),
             (0.24, 0.110, 0.10), mats["stone"], static, bevel=0.040)

    # Two tall heraldic banners frame the room edges. Removing the inner pair
    # opens breathing room around the crest, desk and campaign painting.
    for index, x in enumerate((-6.55, 6.55)):
        draped_banner(f"WR_CANON_banner_{index}", (x, 6.48, 4.78), -1 if x < 0 else 1, burgundy, static)
        cube(f"WR_CANON_banner_rod_{index}", (x, 6.38, 6.22), (0.72, 0.045, 0.045),
             mats["brass_dark"], static, bevel=0.018)
        for edge in (-1, 1):
            sphere(f"WR_CANON_banner_finial_{index}_{edge}",
                   (x + edge * 0.76, 6.38, 6.22), 0.075, mats["brass"], static)
        # Restrained cross + horse-head relief: readable from the hero camera.
        cube(f"WR_CANON_banner_cross_v_{index}", (x, 6.335, 4.54), (0.055, 0.028, 0.42),
             mats["brass"], static, bevel=0.018)
        cube(f"WR_CANON_banner_cross_h_{index}", (x, 6.332, 4.70), (0.30, 0.028, 0.055),
             mats["brass"], static, bevel=0.018)
        sphere(f"WR_CANON_banner_horse_head_{index}", (x - 0.11, 6.325, 5.18), 0.17,
               mats["brass"], static, scale=(1.12, 0.32, 0.78))
        muzzle = cube(f"WR_CANON_banner_horse_muzzle_{index}", (x - 0.25, 6.318, 5.10),
                      (0.14, 0.026, 0.055), mats["brass"], static, bevel=0.04)
        muzzle.rotation_euler.y = -0.16

    # Deep bookcase to the left of the central desk. It deliberately overlaps the
    # old rear joinery: the canon needs a real dark mass and visible book depth.
    bx, by = -2.62, 6.16
    cube("WR_CANON_bookshelf_back", (bx, 6.63, 2.52), (1.18, 0.12, 1.95),
         mats["walnut_dark"], static, bevel=0.035)
    for side in (-1, 1):
        cube(f"WR_CANON_bookshelf_post_{side}", (bx + side * 1.18, by, 2.52),
             (0.11, 0.48, 2.10), mats["frame_wood"], static, bevel=0.045)
    for level, z in enumerate((0.62, 1.30, 1.98, 2.66, 3.34, 4.02)):
        cube(f"WR_CANON_bookshelf_shelf_{level}", (bx, by, z), (1.17, 0.50, 0.065),
             mats["frame_wood"], static, bevel=0.028)
        if level < 5:
            for book in range(7):
                px = bx - 0.92 + book * 0.30
                height = 0.38 + (book % 3) * 0.065
                depth_offset = (0.0, -0.025, 0.015, 0.0, -0.018)[(book + level) % 5]
                lean = (0.0, -0.085, 0.0, 0.070, 0.0)[(book + level * 2) % 5]
                book_obj = cube(
                    f"WR_CANON_book_{level}_{book}",
                    (px, 5.72 + depth_offset, z + 0.10 + height / 2),
                    (0.105, 0.19, height / 2),
                    mats["book_a"] if (book + level) % 2 else mats["book_b"],
                    static, bevel=0.018,
                )
                book_obj.rotation_euler.y = lean

    # Right-hand fireplace: the approved mock is asymmetric but balanced by two
    # warm hearths. The side window remains visible farther right as the cold key.
    rx = 4.85
    # Secondary hearth: deliberately lower and narrower than the ceremonial
    # left fireplace so the two sides no longer compete at equal weight.
    cube("WR_CANON_right_fireplace_body", (rx, 6.34, 1.84), (1.18, 0.43, 1.20),
         mats["stone_dark"], static, bevel=0.095)
    cube("WR_CANON_right_fireplace_opening", (rx, 5.86, 1.55), (0.74, 0.12, 0.62),
         mats["charcoal"], static, bevel=0.042)
    cube("WR_CANON_right_fireplace_mantel", (rx, 5.78, 3.05), (1.42, 0.56, 0.11),
         mats["stone"], static, bevel=0.068)
    cube("WR_CANON_right_fireplace_hearth", (rx, 5.38, 0.70), (1.18, 0.67, 0.09),
         mats["stone_dark"], static, bevel=0.065)
    for side in (-1, 1):
        cube(f"WR_CANON_right_fireplace_pilaster_{side}", (rx + side * 1.18, 5.75, 2.12),
             (0.15, 0.13, 1.02), mats["stone"], static, bevel=0.045)
    # Keep this hearth visibly secondary to the ceremonial left fireplace:
    # a low ember bed and two small wisps read as a maintained room fire rather
    # than a duplicated hero effect.
    for idx, (dx, dz, sx) in enumerate((
        (-0.42, 0.02, 1.18), (-0.12, 0.06, 1.34), (0.20, 0.03, 1.12), (0.43, 0.08, 0.94),
    )):
        sphere(f"WR_CANON_right_fireplace_ember_{idx}", (rx + dx, 5.50, 1.24 + dz), 0.105,
               mats["ember"], static, scale=(sx, 0.62, 0.46))
    for idx, (dx, dz, sx, sz) in enumerate((
        (-0.18, 0.12, 0.40, 0.82), (0.18, 0.08, 0.34, 0.70),
    )):
        sphere(f"WR_CANON_right_fireplace_flame_{idx}", (rx + dx, 5.52, 1.34 + dz), 0.16,
               mats["fire"], static, scale=(sx, 0.34, sz))
    light("WR_CANON_right_fire_light", "POINT", (rx, 5.18, 1.68), 150.0,
          (1.0, 0.19, 0.035), static, radius=1.00)
    anchor("WR_ANCHOR_right_fireplace_practical", (rx, 5.05, 1.92), static)
    cube("WR_CANON_right_fireplace_mantel_cap", (rx, 5.78, 3.18), (1.50, 0.60, 0.050),
         mats["stone_light"], static, bevel=0.038)
    cube("WR_CANON_right_fireplace_mantel_shadow", (rx, 5.18, 2.91), (1.42, 0.07, 0.052),
         mats["charcoal"], static, bevel=0.022)
    cube("WR_CANON_right_fireplace_hearth_lip", (rx, 4.86, 0.79), (1.26, 0.10, 0.050),
         mats["stone_dark"], static, bevel=0.022)
    cube("WR_CANON_right_fireplace_inner_lintel", (rx, 5.72, 2.18), (0.82, 0.08, 0.10),
         mats["stone_dark"], static, bevel=0.030)
    for side in (-1, 1):
        cube(f"WR_CANON_right_fireplace_inner_jamb_{side}", (rx + side * 0.84, 5.72, 1.55),
             (0.090, 0.08, 0.59), mats["stone_dark"], static, bevel=0.026)
        cube(f"WR_CANON_right_fireplace_cap_{side}", (rx + side * 0.98, 5.76, 2.78),
             (0.18, 0.15, 0.080), mats["stone"], static, bevel=0.034)
        cube(f"WR_CANON_right_fireplace_foot_{side}", (rx + side * 0.98, 5.70, 0.98),
             (0.18, 0.17, 0.080), mats["stone_dark"], static, bevel=0.030)


    # Lived-in dispatch station between the central desk and the secondary
    # hearth. This is intentionally low and asymmetric: it adds the layered,
    # inhabited depth of the classic room without stealing focus from the board.
    dx, dy = 2.95, 5.78
    cube("WR_CANON_dispatch_body", (dx, dy, 1.02), (0.70, 0.38, 0.70),
         mats["walnut_dark"], static, bevel=0.055)
    cube("WR_CANON_dispatch_top", (dx, dy - 0.02, 1.76), (0.78, 0.43, 0.085),
         mats["frame_wood"], static, bevel=0.045)
    for row, z in enumerate((0.72, 1.08, 1.44)):
        cube(f"WR_CANON_dispatch_drawer_{row}", (dx, dy - 0.405, z), (0.58, 0.035, 0.135),
             mats["table_wood"], static, bevel=0.025)
        sphere(f"WR_CANON_dispatch_pull_{row}", (dx, dy - 0.455, z), 0.045,
               mats["brass"], static, scale=(1.35, 0.55, 0.72))

    # A couple of folios and rolled campaign maps keep the station functional
    # rather than decorative. Broad silhouettes survive the gameplay camera.
    cube("WR_CANON_dispatch_folio_0", (dx - 0.25, dy - 0.08, 1.88), (0.28, 0.23, 0.035),
         mats["book_a"], static, bevel=0.018)
    folio = cube("WR_CANON_dispatch_folio_1", (dx - 0.18, dy - 0.10, 1.94), (0.25, 0.20, 0.028),
                 mats["book_b"], static, bevel=0.016)
    folio.rotation_euler.z = -0.10
    for index, (x, z, angle) in enumerate(((dx + 0.22, 1.90, math.pi / 2), (dx + 0.39, 1.86, math.pi / 2))):
        roll = cylinder(f"WR_CANON_dispatch_map_{index}", (x, dy - 0.10, z), 0.055, 0.46,
                        mats["ivory"], static, vertices=18)
        roll.rotation_euler.y = angle

    cylinder("WR_CANON_dispatch_candle_base", (dx + 0.58, dy - 0.10, 1.90), 0.10, 0.055,
             mats["brass_dark"], static, vertices=18)
    cylinder("WR_CANON_dispatch_candle", (dx + 0.58, dy - 0.10, 2.08), 0.045, 0.30,
             mats["ivory"], static, vertices=16)
    sphere("WR_CANON_dispatch_flame", (dx + 0.58, dy - 0.10, 2.27), 0.060,
           mats["fire_core"], static, scale=(0.50, 0.50, 1.12))
    light("WR_CANON_dispatch_light", "POINT", (dx + 0.58, dy - 0.18, 2.30), 42.0,
          (1.0, 0.39, 0.12), static, radius=0.75)



    # Framed high-back command chair. The rounded upholstered crown + three
    # buttons read as a little face in the runtime camera, so keep the leather
    # as one tall inset and let an exposed wooden frame carry the silhouette.
    # The frame sits slightly toward the camera so the side posts remain visible
    # instead of disappearing behind the upholstery.
    chair_x = 0.48
    cube("WR_CANON_command_chair_back", (chair_x, 6.44, 2.88), (0.45, 0.12, 0.53),
         burgundy_dark, static, bevel=0.15)
    for side in (-1, 1):
        side_x = chair_x + side * 0.56
        cube(f"WR_CANON_command_chair_side_{side}",
             (side_x, 6.30, 2.90), (0.055, 0.11, 0.62),
             mats["frame_wood"], static, bevel=0.032)
        sphere(f"WR_CANON_command_chair_finial_{side}",
               (side_x, 6.30, 3.53), 0.080,
               mats["brass_dark"], static, scale=(0.82, 0.62, 1.0))
    cube("WR_CANON_command_chair_top", (chair_x, 6.30, 3.47), (0.60, 0.11, 0.065),
         mats["frame_wood"], static, bevel=0.040)


    # Dressed stone faces around both hearths. The big v2 fireplaces were
    # structurally sound but their broad uninterrupted slabs read like toy
    # blocks at gameplay distance. A restrained block rhythm and corbels give
    # them real masonry scale without adding expensive sculpted meshes.
    def add_fireplace_blockwork(prefix, cx):
        for index, dx in enumerate((-0.82, -0.41, 0.0, 0.41, 0.82)):
            cube(
                f"WR_CANON_fireplace_block_{prefix}_lintel_{index}",
                (cx + dx, 5.545, 2.68), (0.18, 0.055, 0.115),
                mats["stone_light"] if index % 2 == 0 else mats["stone"],
                static, bevel=0.030,
            )
        for side in (-1, 1):
            for row, z in enumerate((1.18, 1.54, 1.90, 2.26)):
                cube(
                    f"WR_CANON_fireplace_block_{prefix}_jamb_{side}_{row}",
                    (cx + side * 1.07, 5.545, z), (0.13, 0.055, 0.145),
                    mats["stone"],
                    static, bevel=0.030,
                )
            # The lintel/jamb rhythm carries the masonry scale by itself. Keep
            # the surround lean enough to stay inside the runtime batching
            # budget; extra corbels/keys were visually redundant at hero scale.

    add_fireplace_blockwork("left", -4.55)
    add_fireplace_blockwork("right", rx)

    # Cold floor globe becomes the right-side hero prop once the mirrored
    # armour is retired. Give it enough cartographic language to read as a real
    # globe at gameplay distance instead of a black sphere inside a brass hoop.
    gx, gy = 7.12, 4.54
    sphere("WR_CANON_globe_sphere", (gx, gy, 1.53), 0.54, mats["book_b"], static,
           scale=(1.0, 1.0, 1.0))
    torus("WR_CANON_globe_ring", (gx, gy, 1.53), 0.66, 0.035, mats["brass"], static,
          rotation=(math.pi / 2, 0, 0))
    torus("WR_CANON_globe_equator", (gx, gy, 1.53), 0.545, 0.014, mats["brass_dark"], static)
    torus("WR_CANON_globe_meridian", (gx, gy, 1.53), 0.545, 0.012, mats["brass_dark"], static,
          rotation=(math.pi / 2, 0, 0))
    for index, (dx, dz, sx, sz, angle) in enumerate((
        (-0.20, 0.14, 1.25, 0.72, -0.28),
        (0.18, 0.02, 0.92, 1.20, 0.34),
        (0.02, -0.24, 0.72, 0.62, -0.12),
    )):
        land = sphere(f"WR_CANON_globe_land_{index}", (gx + dx, gy - 0.505, 1.53 + dz),
                      0.115, mats["brass"], static, scale=(sx, 0.10, sz))
        land.rotation_euler.y = angle
    cylinder("WR_CANON_globe_stem", (gx, gy, 0.82), 0.105, 0.78, mats["brass_dark"], static, vertices=24)
    cylinder("WR_CANON_globe_foot", (gx, gy, 0.38), 0.32, 0.10, mats["brass_dark"], static, vertices=28)

    # Chandelier over the board. Keep it high enough to never occlude legal
    # destinations, but large enough to own the upper centre of the composition.
    cz = 6.28
    chandelier_x = 1.90
    chandelier_y = 3.38
    torus("WR_CANON_chandelier_ring", (chandelier_x, chandelier_y, cz), 0.86, 0.044, mats["brass"], static)
    cylinder("WR_CANON_chandelier_hub", (chandelier_x, chandelier_y, cz), 0.16, 0.23, mats["brass_dark"], static, vertices=28)
    # Three slim suspension stays make the fixture feel physically hung rather
    # than floating. They converge on the same short central chain so the added
    # structure stays legible without creating a cage above the board.
    suspension_apex = Vector((chandelier_x, chandelier_y, 6.71))
    for stay_index, angle in enumerate((math.pi / 2, math.pi / 2 + math.tau / 3, math.pi / 2 + 2 * math.tau / 3)):
        stay_start = Vector((
            chandelier_x + math.cos(angle) * 0.70,
            chandelier_y + math.sin(angle) * 0.54,
            cz + 0.03,
        ))
        stay_direction = suspension_apex - stay_start
        stay = cylinder(
            f"WR_CANON_chandelier_stay_{stay_index}",
            (stay_start + suspension_apex) / 2,
            0.018,
            stay_direction.length,
            mats["brass_dark"],
            static,
            vertices=12,
        )
        stay.rotation_euler = stay_direction.to_track_quat("Z", "Y").to_euler()
    cylinder("WR_CANON_chandelier_chain", (chandelier_x, chandelier_y, 6.84), 0.030, 0.26, mats["brass_dark"], static, vertices=16)
    for index in range(6):
        angle = index * math.tau / 6.0
        x = chandelier_x + math.cos(angle) * 0.70
        y = chandelier_y + math.sin(angle) * 0.54
        cylinder(f"WR_CANON_chandelier_candle_{index}", (x, y, cz + 0.20),
                 0.054, 0.31, mats["ivory"], static, vertices=18)
        sphere(f"WR_CANON_chandelier_flame_{index}", (x, y, cz + 0.39), 0.076,
               mats["fire_core"], static, scale=(0.44, 0.44, 1.10))
        # short radial arm from hub; cylinders are aligned to Z by default.
        midpoint = Vector((chandelier_x + (x - chandelier_x) * 0.50, chandelier_y + (y - chandelier_y) * 0.50, cz))
        endpoint = Vector((x, y, cz))
        origin = Vector((chandelier_x, chandelier_y, cz))
        direction = endpoint - origin
        arm = cylinder(f"WR_CANON_chandelier_arm_{index}", midpoint, 0.030,
                       direction.length, mats["brass_dark"], static, vertices=14)
        arm.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    light("WR_CANON_chandelier_light", "POINT", (chandelier_x, chandelier_y, 6.04), 126.0,
          (1.0, 0.48, 0.18), static, radius=1.9)
    anchor("WR_ANCHOR_chandelier_practical", (chandelier_x, chandelier_y, 5.96), static)

    # Burgundy heraldic drape on the camera-facing table edge.
    front_y = -5.50
    verts = [
        (-2.85, front_y - 0.035, 0.84), (2.85, front_y - 0.035, 0.84),
        (2.85, front_y - 0.035, 0.38), (0.0, front_y - 0.035, 0.18),
        (-2.85, front_y - 0.035, 0.38),
        (-2.85, front_y + 0.035, 0.84), (2.85, front_y + 0.035, 0.84),
        (2.85, front_y + 0.035, 0.38), (0.0, front_y + 0.035, 0.18),
        (-2.85, front_y + 0.035, 0.38),
    ]
    faces = [
        (0, 4, 3, 2, 1), (5, 6, 7, 8, 9),
        (0, 1, 6, 5), (1, 2, 7, 6), (2, 3, 8, 7),
        (3, 4, 9, 8), (4, 0, 5, 9),
    ]
    mesh_data = bpy.data.meshes.new("WR_CANON_table_drape_mesh")
    mesh_data.from_pydata(verts, [], faces)
    mesh_data.update()
    drape = bpy.data.objects.new("WR_CANON_table_drape", mesh_data)
    drape.data.materials.append(burgundy_dark)
    tag(drape)
    static.objects.link(drape)

    # Two shallow velvet folds break the broad front panel into cloth rather
    # than a flat heraldic sticker. Keep them off-centre so the brass horse
    # remains the only focal mark on the drape.
    for fold_index, (fold_x, fold_z, fold_scale) in enumerate((
        (-1.58, 0.60, 1.00),
        (1.12, 0.57, 0.82),
    )):
        sphere(
            f"WR_CANON_table_drape_fold_{fold_index}",
            (fold_x, front_y - 0.072, fold_z),
            0.16,
            burgundy,
            static,
            scale=(0.22, 0.16, fold_scale),
        )

    # Small rampant horse relief on the drape, intentionally broad rather than
    # anatomically fussy so it survives the gameplay camera.
    emblem_y = front_y - 0.085
    body = sphere("WR_CANON_table_horse_body", (0.06, emblem_y, 0.68), 0.20,
                  mats["brass"], static, scale=(1.30, 0.28, 0.72))
    body.rotation_euler.y = -0.26
    sphere("WR_CANON_table_horse_head", (-0.24, emblem_y, 0.82), 0.11,
           mats["brass"], static, scale=(1.12, 0.30, 0.78))
    for index, (x, z, ang) in enumerate(((-0.07, 0.49, -0.72), (0.12, 0.47, 0.58))):
        leg = cylinder(f"WR_CANON_table_horse_leg_{index}", (x, emblem_y, z),
                       0.035, 0.34, mats["brass"], static, vertices=14)
        leg.rotation_euler.y = ang
    tail = cylinder("WR_CANON_table_horse_tail", (0.27, emblem_y, 0.74),
                    0.030, 0.30, mats["brass"], static, vertices=14)
    tail.rotation_euler.y = 0.88
    drape_fill = light("WR_CANON_drape_fill", "AREA", (0, -7.0, 2.3), 135.0,
                       (1.0, 0.36, 0.18), static, size=3.4)
    look_at(drape_fill, (0, -5.50, 0.44))


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
    scene.view_settings.exposure = -0.24

    if scene.world is None:
        scene.world = bpy.data.worlds.new("WR_WORLD")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.004, 0.006, 0.012, 1.0)
    bg.inputs["Strength"].default_value = 0.082

    static = collection("WR_STATIC_SHELL")
    dynamic = collection("WR_PREVIEW_DYNAMIC")
    mats = {
        "walnut": material("WR_MAT_board_walnut", (0.17, 0.070, 0.032, 1), rough=0.42, coat=0.20, texture="wood", scale=4.4, bump=0.09),
        "walnut_dark": material("WR_MAT_walnut_dark", (0.045, 0.019, 0.012, 1), rough=0.52, coat=0.12, texture="wood", scale=3.2, bump=0.06),
        "wall_wood": material("WR_MAT_wall_walnut", (0.032, 0.022, 0.016, 1), rough=0.64, coat=0.05, texture="wood", scale=3.1, bump=0.042),
        "wall_recess": material("WR_MAT_wall_recess", (0.014, 0.012, 0.011, 1), rough=0.72, coat=0.02, texture="wood", scale=3.3, bump=0.032),
        "wall_plaster": material("WR_MAT_wall_plaster", (0.205, 0.176, 0.137, 1), rough=0.91, coat=0.008, texture="stone", scale=5.1, bump=0.070),
        "trim_wood": material("WR_MAT_trim_walnut", (0.054, 0.032, 0.021, 1), rough=0.48, coat=0.15, texture="wood", scale=3.7, bump=0.042),
        "floor_dark": material("WR_MAT_floor_underlay", (0.050, 0.043, 0.035, 1), rough=0.78, coat=0.018, texture="stone", scale=4.8, bump=0.062),
        "table_wood": material("WR_MAT_table_walnut", (0.038, 0.024, 0.016, 1), rough=0.43, coat=0.22, texture="wood", scale=4.1, bump=0.047),
        "frame_wood": material("WR_MAT_frame_walnut", (0.030, 0.018, 0.012, 1), rough=0.37, coat=0.28, texture="wood", scale=3.2, bump=0.04),
        "brass": material("WR_MAT_brass", (0.36, 0.155, 0.042, 1), metal=0.92, rough=0.29, coat=0.16, texture="metal", scale=22, bump=0.032),
        "brass_dark": material("WR_MAT_brass_dark", (0.125, 0.052, 0.017, 1), metal=0.88, rough=0.38, coat=0.10, texture="metal", scale=26, bump=0.028),
        "ivory": material("WR_MAT_ivory", (0.80, 0.70, 0.55, 1), rough=0.43, coat=0.17, texture="stone", scale=5.2, bump=0.055),
        "ebony": material("WR_MAT_ebony", (0.008, 0.010, 0.014, 1), metal=0.08, rough=0.24, coat=0.58, texture="stone", scale=6.2, bump=0.025),
        "red": material("WR_MAT_red_metal", (0.30, 0.012, 0.016, 1), metal=0.74, rough=0.24, coat=0.50),
        "velvet": material("WR_MAT_velvet", (0.018, 0.012, 0.014, 1), rough=0.90, sheen=0.24, texture="fabric", scale=38, bump=0.08),
        "velvet_dark": material("WR_MAT_velvet_dark", (0.006, 0.005, 0.006, 1), rough=0.95, sheen=0.18, texture="fabric", scale=44, bump=0.06),
        "leather": material("WR_MAT_leather", (0.112, 0.034, 0.028, 1), rough=0.50, coat=0.18, sheen=0.14, texture="leather", scale=47, bump=0.105),
        "leather_dark": material("WR_MAT_leather_dark", (0.040, 0.016, 0.014, 1), rough=0.59, coat=0.11, texture="leather", scale=50, bump=0.082),
        "desk_leather": material("WR_MAT_desk_leather", (0.010, 0.045, 0.030, 1), rough=0.52, coat=0.12, texture="leather", scale=52, bump=0.07),
        "table_leather": material("WR_MAT_table_leather", (0.006, 0.020, 0.016, 1), rough=0.60, coat=0.08, texture="leather", scale=56, bump=0.055),
        "stone": material("WR_MAT_stone", (0.155, 0.123, 0.088, 1), rough=0.84, coat=0.010, texture="stone", scale=4.3, bump=0.115),
        "stone_light": material("WR_MAT_stone_light", (0.235, 0.195, 0.145, 1), rough=0.81, coat=0.010, texture="stone", scale=4.3, bump=0.095),
        "stone_dark": material("WR_MAT_stone_shadow", (0.061, 0.047, 0.035, 1), rough=0.83, coat=0.010, texture="stone", scale=4.4, bump=0.090),
        "rug": material("WR_MAT_rug", (0.074, 0.010, 0.016, 1), rough=0.94, sheen=0.22, texture="fabric", scale=54, bump=0.12),
        "armor": material("WR_MAT_armor", (0.175, 0.170, 0.158, 1), metal=0.93, rough=0.37, coat=0.12, texture="metal", scale=28, bump=0.040),
        "armor_dark": material("WR_MAT_armor_dark", (0.070, 0.064, 0.056, 1), metal=0.90, rough=0.45, coat=0.08, texture="metal", scale=22, bump=0.030),
        "charcoal": material("WR_MAT_charcoal", (0.008, 0.006, 0.004, 1), rough=0.98),
        "green": material("WR_MAT_green_glaze", (0.012, 0.12, 0.055, 1), rough=0.24, coat=0.62),
        "book_a": material("WR_MAT_book_burgundy", (0.14, 0.020, 0.016, 1), rough=0.74, sheen=0.10),
        "book_b": material("WR_MAT_book_green", (0.030, 0.090, 0.050, 1), rough=0.74, sheen=0.10),
        "picture_a": material("WR_MAT_picture_a", (0.020, 0.016, 0.014, 1), rough=0.82, texture="stone", scale=4.5, bump=0.022),
        "picture_b": material("WR_MAT_picture_b", (0.016, 0.014, 0.013, 1), rough=0.84, texture="stone", scale=5.4, bump=0.022),
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
    add_gothic_canon_v2(static, mats)
    add_preview_board(dynamic, mats)

    key = light("WR_LIGHT_key", "AREA", (-4.6, -2.8, 8.5), 430.0, (1.0, 0.72, 0.44), static, size=5.8)
    look_at(key, (0, 0.5, 1.1))
    fill = light("WR_LIGHT_fill", "AREA", (5.5, -3.2, 5.6), 165.0, (0.54, 0.58, 0.66), static, size=5.4)
    look_at(fill, (0.2, 0.2, 1.5))
    top = light("WR_LIGHT_top", "AREA", (0, 2.0, 8.3), 185.0, (1.0, 0.56, 0.28), static, size=5.0)
    look_at(top, (0, 1.0, 1.0))
    for side in (-1, 1):
        sconce_energy = 142.0 if side < 0 else 96.0
        light(f"WR_LIGHT_sconce_{side}", "POINT", (side * 8.0, 2.6, 4.2),
              sconce_energy, (1.0, 0.31, 0.09), static, radius=1.55)

    # Canon lighting pass: reveal the gothic shell without competing with the
    # board. These broad washes target the rear architecture rather than the
    # tactical surface.
    rear_left = light("WR_LIGHT_rear_wash_left", "AREA", (-5.7, 0.6, 5.7), 300.0,
                      (1.0, 0.58, 0.32), static, size=4.2)
    look_at(rear_left, (-4.5, 6.2, 3.35))
    rear_right = light("WR_LIGHT_rear_wash_right", "AREA", (5.8, 0.7, 5.4), 208.0,
                       (0.72, 0.63, 0.54), static, size=4.0)
    look_at(rear_right, (4.8, 6.2, 3.35))

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
        "WR_ARCH_floor", "WR_ARCH_back_wall", "WR_ARCH_upper_plaster_3",
        "WR_ARCH_side_upper_plaster_-1", "WR_ARCH_side_upper_plaster_1",
        "WR_TABLE_main", "WR_TABLE_board_frame",
        "WR_TABLE_inlay_x_-1", "WR_TABLE_inlay_x_1",
        "WR_ANCHOR_board_origin", "WR_FIREPLACE_body", "WR_DESK_top", "WR_DESK_apron", "WR_CREST_plaque",
        "WR_WINDOW_frame", "WR_WINDOW_moon", "WR_CANON_banner_0",
        "WR_FIREPLACE_log_0", "WR_FIREPLACE_flame_core_0", "WR_FIREPLACE_mantel_cap",
        "WR_ARMOR_belt_-1",
        "WR_CANON_banner_1",
        "WR_ANCHOR_fireplace_practical", "WR_ANCHOR_right_fireplace_practical", "WR_ANCHOR_chandelier_practical", "WR_ANCHOR_window_moonlight",
        "WR_LIGHT_key", "WR_LIGHT_fireplace", "WR_CAMERA_hero",
        "WR_CANON_chandelier_ring", "WR_CANON_right_fireplace_body",
        "WR_CANON_bookshelf_back", "WR_CANON_table_drape",
        "WR_CANON_arch_left_curve_-1_0", "WR_CANON_campaign_canvas",
        "WR_CANON_masonry_course_2",
        "WR_CANON_fireplace_block_left_lintel_0", "WR_CANON_fireplace_block_right_lintel_0",
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


def runtime_texture_factor(kind, u, v):
    """Neutral microvariation multiplied by an explicit authored glTF base-color factor."""
    if kind == "wood":
        grain = 0.5 + 0.5 * math.sin((u * 7.0 + 0.16 * math.sin(v * 11.0)) * math.tau)
        fine = 0.5 + 0.5 * math.sin((u * 31.0 + v * 1.6) * math.tau)
        return 0.86 + grain * 0.11 + fine * 0.035
    if kind == "stone":
        broad = 0.5 + 0.5 * math.sin((u * 5.0 + v * 7.0 + 0.22 * math.sin(u * 17.0)) * math.tau)
        fleck = 0.5 + 0.5 * math.sin((u * 23.0 - v * 19.0) * math.tau)
        return 0.88 + broad * 0.08 + fleck * 0.03
    if kind == "fabric":
        warp = abs(math.sin(u * math.tau * 24.0))
        weft = abs(math.sin(v * math.tau * 28.0))
        return 0.86 + (warp * 0.055) + (weft * 0.055)
    if kind == "leather":
        pores = 0.5 + 0.5 * math.sin((u * 37.0 + v * 41.0 + math.sin(v * 13.0)) * math.tau)
        cloud = 0.5 + 0.5 * math.sin((u * 4.0 - v * 5.0) * math.tau)
        return 0.86 + pores * 0.04 + cloud * 0.075
    if kind == "metal":
        brush = 0.5 + 0.5 * math.sin((u * 3.0 + v * 46.0) * math.tau)
        return 0.91 + brush * 0.075
    return 0.90 + (0.5 + 0.5 * math.sin((u * 9.0 + v * 11.0) * math.tau)) * 0.07


def install_runtime_base_color_texture(mat, bsdf, kind, *, size=64):
    """Attach a tiny glTF-safe UV texture while keeping the editable material procedural."""
    base_socket = socket(bsdf, "Base Color")
    if base_socket is None:
        return False

    rgba = tuple(float(v) for v in base_socket.default_value)
    image_name = f"{mat.name}_runtime_basecolor"
    old = bpy.data.images.get(image_name)
    if old is not None:
        bpy.data.images.remove(old)
    image = bpy.data.images.new(image_name, width=size, height=size, alpha=False)
    pixels = [0.0] * (size * size * 4)
    cursor = 0
    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            factor = runtime_texture_factor(kind, u, v)
            pixels[cursor] = max(0.0, min(1.0, factor))
            pixels[cursor + 1] = max(0.0, min(1.0, factor))
            pixels[cursor + 2] = max(0.0, min(1.0, factor))
            pixels[cursor + 3] = 1.0
            cursor += 4
    image.pixels.foreach_set(pixels)
    image.update()
    image.colorspace_settings.name = "sRGB"
    image.pack()

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    uv = nodes.new("ShaderNodeTexCoord")
    uv.name = f"{mat.name}_runtime_uv"
    tex = nodes.new("ShaderNodeTexImage")
    tex.name = f"{mat.name}_runtime_basecolor"
    tex.image = image
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], base_socket)
    mat["war_room_runtime_texture"] = "uv-basecolor-v1"
    return True


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
    runtime_textures = 0
    base_color_factors = {}
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

        base_socket = socket(bsdf, "Base Color")
        if base_socket is not None:
            base_color_factors[mat.name] = [float(v) for v in base_socket.default_value[:4]]
        # Runtime albedo is intentionally factor-only for now. Blender keeps
        # its procedural richness in the editable .blend/preview, while the GLB
        # gets a deterministic PBR colour that cannot disappear because of UV or
        # embedded-image exporter quirks.
        mat["war_room_runtime_material"] = "gltf-safe-pbr-v4-factor-only"

    if removed_links < 10:
        raise RuntimeError(f"runtime material sanitization suspiciously small: {removed_links}")
    return removed_links, runtime_textures, base_color_factors


def patch_runtime_glb_base_color_factors(path, factors):
    """Persist authored albedo independently from optional runtime microtextures.

    glTF multiplies baseColorFactor by baseColorTexture. Carrying the authored
    room palette in the factor means a missing/unsupported texture can never
    bleach the War Room back to default white.
    """
    raw = Path(path).read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise RuntimeError(f"invalid GLB header: {path}")

    _magic, version, _declared_size = struct.unpack_from("<4sII", raw, 0)
    if version != 2:
        raise RuntimeError(f"unsupported GLB version: {version}")

    chunks = []
    offset = 12
    patched = 0
    while offset + 8 <= len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            data = json.loads(chunk.decode("utf-8").rstrip("\x00 \t\r\n"))
            for row in data.get("materials", []):
                name = row.get("name")
                factor = factors.get(name)
                if factor is None:
                    continue
                pbr = row.setdefault("pbrMetallicRoughness", {})
                pbr["baseColorFactor"] = [round(float(v), 6) for v in factor]
                patched += 1
            encoded = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            encoded += b" " * ((4 - len(encoded) % 4) % 4)
            chunks.append((chunk_type, encoded))
        else:
            chunks.append((chunk_type, chunk))

    if patched < 12:
        raise RuntimeError(f"runtime GLB base-color factor patch suspiciously small: {patched}")

    total = 12 + sum(8 + len(chunk) for _chunk_type, chunk in chunks)
    out = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    for chunk_type, chunk in chunks:
        out.extend(struct.pack("<II", len(chunk), chunk_type))
        out.extend(chunk)
    Path(path).write_bytes(out)
    return patched


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


def validate_runtime_glb(path, expected_factors=None):
    data = read_glb_json(path)
    extensions_used = set(data.get("extensionsUsed", []))
    if MESH_COMPRESSION_EXTENSION not in extensions_used:
        raise RuntimeError(
            f"runtime GLB missing {MESH_COMPRESSION_EXTENSION}: {sorted(extensions_used)}"
        )
    compressed_views = sum(
        1
        for row in data.get("bufferViews", [])
        if MESH_COMPRESSION_EXTENSION in row.get("extensions", {})
    )
    if compressed_views < 12:
        raise RuntimeError(f"runtime GLB meshopt coverage suspiciously small: {compressed_views}")
    materials = {row.get("name"): row for row in data.get("materials", [])}
    node_names = {row.get("name") for row in data.get("nodes", [])}
    required_runtime_anchors = {
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_right_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
    }
    missing_runtime_anchors = sorted(required_runtime_anchors - node_names)
    if missing_runtime_anchors:
        raise RuntimeError(f"runtime GLB practical anchors missing: {missing_runtime_anchors}")
    required_heraldry = {
        "WR_CREST_shield",
        "WR_CREST_horse_relief",
    }
    missing_heraldry = sorted(required_heraldry - node_names)
    if missing_heraldry:
        raise RuntimeError(f"runtime GLB rampant-horse heraldry missing: {missing_heraldry}")
    legacy_pawn_crest = sorted(
        name for name in node_names
        if isinstance(name, str) and name.startswith("WR_CREST_pawn_")
    )
    if legacy_pawn_crest:
        raise RuntimeError(f"runtime GLB still contains legacy pawn crest: {legacy_pawn_crest}")
    required_colours = {
        "WR_MAT_wall_walnut",
        "WR_MAT_wall_plaster",
        "WR_MAT_trim_walnut",
        "WR_MAT_floor_underlay",
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

    unexpected_textures = []
    bleached = []
    drifted = []
    for name in sorted(required_colours):
        pbr = materials[name].get("pbrMetallicRoughness", {})
        has_texture = isinstance(pbr.get("baseColorTexture"), dict)
        if has_texture:
            unexpected_textures.append(name)
        factor = pbr.get("baseColorFactor")
        if not isinstance(factor, list) or len(factor) < 3 or min(factor[:3]) >= 0.95:
            bleached.append((name, factor))
        expected = (expected_factors or {}).get(name)
        if expected is not None and isinstance(factor, list) and len(factor) >= 3:
            if any(abs(float(factor[index]) - float(expected[index])) > 0.012 for index in range(3)):
                drifted.append((name, factor, expected))
    if unexpected_textures:
        raise RuntimeError(f"runtime GLB unexpectedly depends on base-colour textures: {unexpected_textures}")
    if bleached:
        raise RuntimeError(f"runtime GLB lost authored base colours: {bleached}")
    if drifted:
        raise RuntimeError(f"runtime GLB base-colour factors drifted: {drifted}")


def runtime_batch_cell(obj):
    """Keep static batches spatially local so frustum culling still has useful granularity."""
    x, y, z = obj.matrix_world.translation
    return (
        math.floor((float(x) + 3.0) / 6.0),
        math.floor((float(y) + 3.0) / 6.0),
        math.floor((float(z) + 2.0) / 4.0),
    )


def collapse_runtime_static_shell():
    """Apply authored modifiers and batch compatible static meshes for runtime only.

    This runs after the hero preview and .blend have already been written, so the
    editable source remains untouched. Grouping is deliberately conservative:
    same material signature plus a coarse spatial cell. Runtime light anchors
    are empties and therefore never participate.
    """
    static_meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.get("war_room_role") == ROLE_STATIC
    ]
    source_count = len(static_meshes)
    if source_count < 200:
        raise RuntimeError(f"runtime static source mesh count suspiciously small: {source_count}")

    # Joining discards non-active object modifiers in Blender, so bake every
    # authored bevel/shape modifier first. The preview has already rendered.
    for obj in static_meshes:
        if not obj.modifiers:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    groups = {}
    for obj in static_meshes:
        # Preserve authored crest node names as a runtime/QA contract. The
        # heraldry is small, visually important, and deliberately exempt from
        # batching so semantic validation cannot be erased by an optimization.
        if obj.name.startswith("WR_CREST_"):
            continue
        material_signature = tuple(
            material.name if material else ""
            for material in obj.data.materials
        )
        # The campaign painting is authored from several meshes so the preview
        # can keep wood, canvas and gilt relief materials. At runtime those
        # pieces occupy one tiny wall patch; joining them preserves all material
        # slots while avoiding several one-off draw-call batches.
        if obj.name.startswith(("WR_CANON_campaign_", "WR_CANON_right_fireplace_", "WR_CANON_dispatch_", "WR_CANON_command_", "WR_CANON_globe_", "WR_CANON_bookshelf_", "WR_CANON_book_")):
            key = (("__v2_decor_cluster__",), runtime_batch_cell(obj))
        else:
            key = (material_signature, runtime_batch_cell(obj))
        groups.setdefault(key, []).append(obj)

    merged_away = 0
    batches = 0
    for _key, objects in sorted(groups.items(), key=lambda row: repr(row[0])):
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        active = objects[0]
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"WR_RUNTIME_BATCH_{batches:03d}"
        active["war_room_contract"] = CONTRACT
        active["war_room_role"] = ROLE_STATIC
        bpy.ops.object.material_slot_remove_unused()
        merged_away += len(objects) - 1
        batches += 1

    bpy.ops.object.select_all(action="DESELECT")
    remaining = sum(
        1 for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.get("war_room_role") == ROLE_STATIC
    )
    if remaining > 150:
        raise RuntimeError(f"runtime static batching ineffective: {source_count} -> {remaining}")
    if merged_away < 120:
        raise RuntimeError(f"runtime static batching merged too little: {merged_away}")

    bpy.context.scene["war_room_runtime_source_meshes"] = source_count
    bpy.context.scene["war_room_runtime_batched_meshes"] = remaining
    bpy.context.scene["war_room_runtime_batches"] = batches
    return source_count, remaining, merged_away


def meshopt_export_kwargs():
    properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    required = {"export_meshopt_compression_enable", "export_meshopt_extension"}
    missing = sorted(required - properties)
    if missing:
        raise RuntimeError(f"canonical Blender lacks Meshopt glTF export support: {missing}")
    return {
        "export_meshopt_compression_enable": True,
        "export_meshopt_extension": MESH_COMPRESSION_EXTENSION,
    }

def export_shell(path):
    sanitized_links, runtime_textures, base_color_factors = sanitize_runtime_materials()
    bpy.context.scene["war_room_runtime_material_links_removed"] = sanitized_links
    bpy.context.scene["war_room_runtime_texture_count"] = runtime_textures
    source_meshes, batched_meshes, merged_away = collapse_runtime_static_shell()
    print(
        f"War Room runtime batching: {source_meshes} -> {batched_meshes} meshes "
        f"({merged_away} merged)"
    )
    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in bpy.context.scene.objects:
        is_static_mesh = obj.type == "MESH" and obj.get("war_room_role") == ROLE_STATIC
        is_runtime_anchor = obj.type == "EMPTY" and obj.name in {
            "WR_ANCHOR_fireplace_practical",
            "WR_ANCHOR_right_fireplace_practical",
            "WR_ANCHOR_chandelier_practical",
            "WR_ANCHOR_window_moonlight",
        }
        if is_static_mesh or is_runtime_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 70:
        raise RuntimeError(f"runtime shell selection too small: {selected}")
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False,
        **meshopt_export_kwargs(),
    )
    patched_factors = patch_runtime_glb_base_color_factors(path, base_color_factors)
    bpy.context.scene["war_room_runtime_base_color_factor_count"] = patched_factors
    bpy.context.scene["war_room_runtime_mesh_compression"] = MESH_COMPRESSION_EXTENSION
    validate_runtime_glb(path, base_color_factors)
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
