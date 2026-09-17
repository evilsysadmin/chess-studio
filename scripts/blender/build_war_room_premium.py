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
    set_socket(bsdf, 0.18, "Coat Roughness", "Clearcoat Roughness")
    set_socket(bsdf, sheen, "Sheen Weight", "Sheen")
    if emission:
        set_socket(bsdf, emission, "Emission Color", "Emission")
        set_socket(bsdf, 3.2, "Emission Strength")
    if texture:
        tex = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        links.new(tex.outputs["Generated"], mapping.inputs["Vector"])
        if texture == "wood":
            proc = nodes.new("ShaderNodeTexWave")
            proc.wave_type = "BANDS"
            proc.bands_direction = "X"
            proc.inputs["Scale"].default_value = scale
            proc.inputs["Distortion"].default_value = 6.5
            proc.inputs["Detail"].default_value = 5.0
            links.new(mapping.outputs["Vector"], proc.inputs["Vector"])
            fac = proc.outputs["Color"]
        else:
            proc = nodes.new("ShaderNodeTexNoise")
            proc.inputs["Scale"].default_value = scale
            proc.inputs["Detail"].default_value = 7.0
            proc.inputs["Roughness"].default_value = 0.7
            links.new(mapping.outputs["Vector"], proc.inputs["Vector"])
            fac = proc.outputs["Fac"]
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = tuple(max(0.0, c * 0.55) for c in rgba[:3]) + (1.0,)
        ramp.color_ramp.elements[1].color = tuple(min(1.0, c * 1.28 + 0.025) for c in rgba[:3]) + (1.0,)
        links.new(fac, ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], socket(bsdf, "Base Color"))
        if bump:
            b = nodes.new("ShaderNodeBump")
            b.inputs["Strength"].default_value = bump
            b.inputs["Distance"].default_value = 0.07
            links.new(fac, b.inputs["Height"])
            links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
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


def add_pawn(prefix, x, y, z, body, trim, owner, role=ROLE_PREVIEW):
    cylinder(prefix + "_base", (x, y, z + 0.08), 0.31, 0.16, body, owner, vertices=28, role=role)
    cylinder(prefix + "_stem", (x, y, z + 0.35), 0.19, 0.42, body, owner, vertices=28, role=role)
    torus(prefix + "_collar", (x, y, z + 0.56), 0.19, 0.035, trim, owner, rotation=(math.pi / 2, 0, 0), role=role)
    sphere(prefix + "_head", (x, y, z + 0.78), 0.21, body, owner, role=role)


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
    for rank, side in ((0, "black"), (7, "white")):
        body = mats["ebony"] if side == "black" else mats["ivory"]
        trim = mats["red"] if side == "black" else mats["brass"]
        for file in range(8):
            x = file - 3.5
            add_pawn(f"WR_PREVIEW_{side}_major_{file}", x, rank - 3.5, BOARD_Z + 0.07,
                     body, trim, owner)
            if file in (0, 7):
                cube(f"WR_PREVIEW_rook_crown_{side}_{file}", (x, rank - 3.5, BOARD_Z + 0.96),
                     (0.24, 0.24, 0.10), body, owner, bevel=0.025, role=ROLE_PREVIEW)


def add_room(static, mats):
    # Architecture and parquet-like floor.
    cube("WR_ARCH_floor", (0, 0, -0.12), (8.8, 7.3, 0.12), mats["walnut_dark"], static, bevel=0.02)
    cube("WR_ARCH_back_wall", (0, 7.02, 3.35), (8.8, 0.18, 3.35), mats["walnut_dark"], static, bevel=0.02)
    cube("WR_ARCH_left_wall", (-8.68, 0.8, 3.35), (0.18, 6.25, 3.35), mats["walnut_dark"], static, bevel=0.02)
    cube("WR_ARCH_right_wall", (8.68, 0.8, 3.35), (0.18, 6.25, 3.35), mats["walnut_dark"], static, bevel=0.02)
    for z in (1.25, 3.15, 5.45):
        cube(f"WR_ARCH_back_rail_{z}", (0, 6.78, z), (8.45, 0.06, 0.05), mats["brass_dark"], static, bevel=0.018)
    for x in (-7.3, -4.2, -1.55, 1.55, 4.2, 7.3):
        cube(f"WR_ARCH_back_stile_{x}", (x, 6.78, 3.35), (0.05, 0.06, 2.45), mats["walnut"], static, bevel=0.018)
    for idx in range(15):
        x = -8.15 + idx * 1.16
        cube(f"WR_ARCH_floor_plank_{idx}", (x, 0.1, 0.012), (0.54, 6.55, 0.025),
             mats["walnut"], static, bevel=0.012)

    # Rug and hero table.
    cube("WR_DECOR_rug", (0, 0, 0.065), (6.55, 6.55, 0.035), mats["rug"], static, bevel=0.025)
    for side in (-1, 1):
        cube(f"WR_DECOR_rug_x_{side}", (0, side * 6.31, 0.105), (6.25, 0.06, 0.012), mats["brass_dark"], static, bevel=0.01)
        cube(f"WR_DECOR_rug_y_{side}", (side * 6.31, 0, 0.105), (0.06, 6.25, 0.012), mats["brass_dark"], static, bevel=0.01)
    cube("WR_TABLE_main", (0, 0, 0.47), (5.86, 5.86, 0.38), mats["walnut"], static, bevel=0.13)
    cube("WR_TABLE_board_frame", (0, 0, 0.96), (4.62, 4.62, 0.12), mats["walnut_dark"], static, bevel=0.09)
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
    for idx, dx in enumerate((-0.43, 0.0, 0.43)):
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.25, radius2=0.04, depth=0.72,
                                       location=(-4.55 + dx, 5.63, 1.54 + (idx % 2) * 0.12))
        flame = bpy.context.object
        flame.name = f"WR_FIREPLACE_flame_{idx}"
        flame.data.materials.append(mats["fire"])
        tag(flame)
        relink(flame, static)
    light("WR_LIGHT_fireplace", "POINT", (-4.55, 5.15, 2.05), 760.0, (1.0, 0.19, 0.035), static, radius=1.0)

    # Back desk.
    cube("WR_DESK_top", (0, 6.0, 2.18), (1.82, 0.52, 0.12), mats["walnut"], static, bevel=0.08)
    for x in (-1.48, 1.48):
        cube(f"WR_DESK_pedestal_{x}", (x, 6.18, 1.27), (0.35, 0.43, 0.78), mats["walnut_dark"], static, bevel=0.06)
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
        shelf_x = side * 5.35
        cube(f"WR_SHELF_{side}", (shelf_x, 6.02, 2.65), (1.7, 0.42, 0.08), mats["walnut"], static, bevel=0.04)
        for book in range(6):
            cube(f"WR_BOOK_{side}_{book}", (shelf_x + (book - 2.5) * 0.18, 5.77, 2.87 + (book % 2) * 0.02),
                 (0.075, 0.20, 0.26), mats["book_a"] if book % 2 else mats["book_b"], static, bevel=0.018)
        sphere(f"WR_VASE_body_{side}", (shelf_x + side * 1.15, 5.72, 3.02), 0.25, mats["green"], static, scale=(0.9, 0.9, 1.22))
        cylinder(f"WR_VASE_neck_{side}", (shelf_x + side * 1.15, 5.72, 3.30), 0.10, 0.23, mats["green"], static)
        light(f"WR_LIGHT_picture_{side}", "AREA", (px, 5.85, 5.95), 180.0, (1.0, 0.48, 0.18), static, size=1.2)

    # Tall night window on the right.
    cube("WR_WINDOW_frame", (8.43, 2.85, 3.42), (0.12, 1.42, 2.18), mats["brass_dark"], static, bevel=0.05)
    cube("WR_WINDOW_night", (8.29, 2.85, 3.42), (0.025, 1.20, 1.94), mats["window"], static, bevel=0.01)
    for y in (1.75, 2.85, 3.95):
        cube(f"WR_WINDOW_bar_{y}", (8.20, y, 3.42), (0.03, 0.035, 1.90), mats["brass"], static, bevel=0.012)
    light("WR_LIGHT_window", "AREA", (7.75, 2.8, 4.0), 330.0, (0.25, 0.42, 1.0), static, size=3.1)

    # Leather benches.
    for side in (-1, 1):
        x = side * 7.15
        cube(f"WR_BENCH_seat_{side}", (x, -4.8, 0.72), (0.9, 1.2, 0.24), mats["leather"], static, bevel=0.12)
        cube(f"WR_BENCH_back_{side}", (x + side * 0.62, -4.8, 1.30), (0.18, 1.20, 0.72), mats["leather_dark"], static, bevel=0.12)
        for y in (-5.65, -4.0):
            cylinder(f"WR_BENCH_leg_{side}_{y}", (x, y, 0.35), 0.08, 0.55, mats["walnut"], static, vertices=20)

    # Armour silhouettes and polearms.
    for side in (-1, 1):
        x = side * 7.33
        sphere(f"WR_ARMOR_helmet_{side}", (x, 4.35, 2.03), 0.35, mats["armor"], static, scale=(0.9, 0.8, 1.05))
        sphere(f"WR_ARMOR_torso_{side}", (x, 4.35, 1.38), 0.48, mats["armor"], static, scale=(0.85, 0.62, 1.25))
        cylinder(f"WR_ARMOR_base_{side}", (x, 4.35, 0.33), 0.62, 0.22, mats["charcoal"], static)
        cylinder(f"WR_ARMOR_halberd_{side}", (x - side * 0.43, 4.20, 1.92), 0.035, 3.0, mats["brass_dark"], static, vertices=14)


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

    if scene.world is None:
        scene.world = bpy.data.worlds.new("WR_WORLD")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.012, 0.007, 0.005, 1.0)
    bg.inputs["Strength"].default_value = 0.16

    static = collection("WR_STATIC_SHELL")
    dynamic = collection("WR_PREVIEW_DYNAMIC")
    mats = {
        "walnut": material("WR_MAT_walnut", (0.20, 0.075, 0.028, 1), rough=0.38, coat=0.28, texture="wood", scale=5.5, bump=0.22),
        "walnut_dark": material("WR_MAT_walnut_dark", (0.055, 0.020, 0.010, 1), rough=0.48, coat=0.20, texture="wood", scale=6.4, bump=0.18),
        "brass": material("WR_MAT_brass", (0.58, 0.28, 0.045, 1), metal=0.92, rough=0.18, coat=0.32, texture="metal", scale=20, bump=0.06),
        "brass_dark": material("WR_MAT_brass_dark", (0.20, 0.075, 0.015, 1), metal=0.88, rough=0.27, coat=0.24, texture="metal", scale=24, bump=0.05),
        "ivory": material("WR_MAT_ivory", (0.88, 0.73, 0.49, 1), rough=0.34, coat=0.22, texture="stone", scale=7.0, bump=0.10),
        "ebony": material("WR_MAT_ebony", (0.010, 0.012, 0.016, 1), metal=0.12, rough=0.20, coat=0.62, texture="stone", scale=9.0, bump=0.04),
        "red": material("WR_MAT_red_metal", (0.34, 0.012, 0.016, 1), metal=0.78, rough=0.21, coat=0.55),
        "velvet": material("WR_MAT_velvet", (0.27, 0.010, 0.020, 1), rough=0.80, sheen=0.68, texture="fabric", scale=38, bump=0.10),
        "velvet_dark": material("WR_MAT_velvet_dark", (0.085, 0.003, 0.008, 1), rough=0.90, sheen=0.50, texture="fabric", scale=44, bump=0.08),
        "leather": material("WR_MAT_leather", (0.22, 0.015, 0.021, 1), rough=0.40, coat=0.24, sheen=0.18, texture="leather", scale=45, bump=0.16),
        "leather_dark": material("WR_MAT_leather_dark", (0.065, 0.006, 0.009, 1), rough=0.50, coat=0.18, texture="leather", scale=45, bump=0.13),
        "stone": material("WR_MAT_stone", (0.46, 0.39, 0.31, 1), rough=0.56, coat=0.07, texture="stone", scale=5.5, bump=0.24),
        "stone_light": material("WR_MAT_stone_light", (0.72, 0.65, 0.54, 1), rough=0.46, coat=0.10, texture="stone", scale=4.8, bump=0.18),
        "rug": material("WR_MAT_rug", (0.25, 0.009, 0.016, 1), rough=0.92, sheen=0.30, texture="fabric", scale=52, bump=0.20),
        "armor": material("WR_MAT_armor", (0.075, 0.082, 0.095, 1), metal=0.94, rough=0.27, coat=0.30, texture="metal", scale=28, bump=0.06),
        "charcoal": material("WR_MAT_charcoal", (0.008, 0.006, 0.004, 1), rough=0.98),
        "green": material("WR_MAT_green_glaze", (0.015, 0.17, 0.07, 1), rough=0.22, coat=0.70),
        "book_a": material("WR_MAT_book_burgundy", (0.19, 0.025, 0.018, 1), rough=0.72, sheen=0.12),
        "book_b": material("WR_MAT_book_green", (0.035, 0.12, 0.065, 1), rough=0.72, sheen=0.12),
        "picture_a": material("WR_MAT_picture_a", (0.28, 0.11, 0.025, 1), rough=0.64, texture="stone", scale=5.0, bump=0.04),
        "picture_b": material("WR_MAT_picture_b", (0.18, 0.055, 0.022, 1), rough=0.64, texture="stone", scale=7.0, bump=0.04),
        "window": material("WR_MAT_window_night", (0.008, 0.018, 0.09, 1), rough=0.18, coat=0.55),
        "fire": material("WR_MAT_fire", (1.0, 0.10, 0.008, 1), rough=0.12, emission=(1.0, 0.04, 0.002, 1)),
    }

    add_room(static, mats)
    add_preview_board(dynamic, mats)

    key = light("WR_LIGHT_key", "AREA", (-4.6, -2.8, 8.5), 1150.0, (1.0, 0.58, 0.31), static, size=5.2)
    look_at(key, (0, 0.5, 1.1))
    fill = light("WR_LIGHT_fill", "AREA", (5.5, -3.2, 5.6), 500.0, (0.52, 0.65, 1.0), static, size=4.8)
    look_at(fill, (0.2, 0.2, 1.5))
    top = light("WR_LIGHT_top", "AREA", (0, 2.0, 8.3), 720.0, (1.0, 0.45, 0.18), static, size=4.0)
    look_at(top, (0, 1.0, 1.0))
    for side in (-1, 1):
        light(f"WR_LIGHT_sconce_{side}", "POINT", (side * 8.0, 2.6, 4.2), 280.0, (1.0, 0.21, 0.035), static, radius=1.1)

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
        "WR_WINDOW_frame", "WR_LIGHT_key", "WR_LIGHT_fireplace", "WR_CAMERA_hero",
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


def export_shell(path):
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
