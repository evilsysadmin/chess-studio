#!/usr/bin/env python3
"""Build the first Blender blockout for the canonical Chess Studio Home.

The goal of this pass is intentionally narrow: lock camera/composition and the
major architectural/prop masses before spending time on detailed modelling.
It never mutates runtime Home assets.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


CONTRACT = "home-blender-v2-blockout-v1"
DEFAULT_REFERENCE = "frontend/src/assets/home-canonical/great-hall-dungeon.webp"


def argv_after_double_dash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=DEFAULT_REFERENCE)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--max-width", type=int, default=1280)
    parser.add_argument("--engine", choices=("workbench", "eevee"), default="workbench")
    return parser.parse_args(argv_after_double_dash())


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple[float, float, float, float], *, roughness=0.7, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def apply_material(obj, mat) -> None:
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)


def cube(name: str, location, scale, mat, *, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    apply_material(obj, mat)
    return obj


def cylinder(name: str, location, radius: float, depth: float, mat, *, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    apply_material(obj, mat)
    return obj


def sphere(name: str, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, mat)
    return obj


def cone(name: str, location, radius1: float, radius2: float, depth: float, mat, *, vertices=32):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    apply_material(obj, mat)
    return obj


def add_simple_piece(name: str, x: float, y: float, z: float, mat, kind: str):
    profiles = {
        "pawn": (0.085, 0.055, 0.20, 0.085, 0.26),
        "rook": (0.10, 0.075, 0.27, 0.10, 0.30),
        "knight": (0.10, 0.055, 0.29, 0.105, 0.33),
        "bishop": (0.09, 0.045, 0.32, 0.09, 0.36),
        "queen": (0.105, 0.055, 0.38, 0.11, 0.43),
        "king": (0.11, 0.06, 0.42, 0.11, 0.47),
    }
    r1, r2, depth, head, height = profiles[kind]
    cylinder(f"{name}_base", (x, y, z + 0.035), r1 * 1.18, 0.07, mat, vertices=24)
    cone(f"{name}_body", (x, y, z + depth / 2 + 0.06), r1, r2, depth, mat, vertices=24)
    sphere(f"{name}_head", (x, y, z + height), (head, head, head), mat)
    if kind == "rook":
        cylinder(f"{name}_crown", (x, y, z + height + 0.075), head * 1.08, 0.09, mat, vertices=12)
    elif kind == "king":
        cube(f"{name}_cross_v", (x, y, z + height + 0.12), (0.025, 0.025, 0.10), mat, bevel=0.01)
        cube(f"{name}_cross_h", (x, y, z + height + 0.15), (0.07, 0.025, 0.025), mat, bevel=0.01)


def curve_tube(name: str, points, bevel_depth: float, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    apply_material(obj, mat)
    return obj


def arch(name: str, x: float, y: float, width: float, spring_z: float, top_z: float, bottom_z: float, mat):
    radius = width / 2.0
    center_z = top_z - radius
    points = [(x - radius, y, bottom_z), (x - radius, y, center_z)]
    for i in range(17):
        theta = math.pi - (math.pi * i / 16.0)
        points.append((x + radius * math.cos(theta), y, center_z + radius * math.sin(theta)))
    points.extend([(x + radius, y, center_z), (x + radius, y, bottom_z)])
    return curve_tube(name, points, 0.19, mat)


def look_at(obj, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location, energy: float, color, size: float, target=(0, 2.0, 2.0)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def add_point_light(name: str, location, energy: float, color, radius=0.22):
    data = bpy.data.lights.new(name, type="POINT")
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def add_table_and_board(materials):
    wood = materials["wood"]
    dark = materials["board_dark"]
    light = materials["board_light"]
    metal = materials["brass"]
    banner = materials["banner"]

    table_y = 1.25
    table_z = 1.08
    cube("HOME_PROP_table_top", (0.0, table_y, table_z), (3.05, 1.5, 0.15), wood, bevel=0.08)
    for x in (-2.58, 2.58):
        for y in (0.05, 2.45):
            cube(f"HOME_PROP_table_leg_{x}_{y}", (x, y, 0.55), (0.15, 0.15, 0.55), wood, bevel=0.035)

    # The canonical board nearly fills the table width; the earlier blockout
    # made it read like a travel set.
    square = 0.47
    board_half = square * 4 + 0.12
    start_x = -4 * square + square / 2
    start_y = table_y - 4 * square + square / 2
    for row in range(8):
        for col in range(8):
            mat = light if (row + col) % 2 == 0 else dark
            cube(
                f"HOME_PROP_board_{row}_{col}",
                (start_x + col * square, start_y + row * square, table_z + 0.17),
                (square / 2, square / 2, 0.018),
                mat,
            )
    cube("HOME_PROP_board_frame", (0, table_y, table_z + 0.135), (board_half, board_half, 0.035), metal, bevel=0.025)

    # The red frontal cloth and side benches are major silhouettes in the
    # canonical Home, not decorative polish.
    cube("HOME_PROP_table_banner", (0, -0.28, 0.72), (1.48, 0.055, 0.72), banner, bevel=0.035)
    for side in (-1, 1):
        x = side * 3.55
        cube(f"HOME_PROP_bench_{side}", (x, 1.2, 0.43), (0.62, 1.45, 0.28), wood, bevel=0.05)
        cube(f"HOME_PROP_bench_cushion_{side}", (x, 1.2, 0.73), (0.58, 1.38, 0.08), banner, bevel=0.05)

    piece_light = materials["piece_light"]
    piece_dark = materials["piece_dark"]
    order = ("rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook")
    board_z = table_z + 0.215
    for col, kind in enumerate(order):
        px = start_x + col * square
        add_simple_piece(f"HOME_PROP_white_back_{col}", px, start_y + 0.5 * square, board_z, piece_light, kind)
        add_simple_piece(f"HOME_PROP_black_back_{col}", px, start_y + 6.5 * square, board_z, piece_dark, kind)
        add_simple_piece(f"HOME_PROP_white_pawn_{col}", px, start_y + 1.5 * square, board_z, piece_light, "pawn")
        add_simple_piece(f"HOME_PROP_black_pawn_{col}", px, start_y + 5.5 * square, board_z, piece_dark, "pawn")


def add_fireplace(name: str, x: float, materials):
    stone = materials["stone"]
    dark = materials["stone_dark"]
    fire = materials["fire"]
    # Tall dark recess is essential to the canonical silhouette.
    cube(f"HOME_PROP_{name}_recess", (x, 6.70, 2.42), (1.10, 0.08, 1.76), dark, bevel=0.08)
    cube(f"HOME_PROP_{name}_hearth", (x, 6.1, 0.88), (1.3, 0.5, 0.88), dark, bevel=0.05)
    cube(f"HOME_PROP_{name}_mantel", (x, 5.83, 1.88), (1.55, 0.24, 0.16), stone, bevel=0.04)
    arch(f"HOME_ARCH_{name}_alcove", x, 6.18, 2.9, 2.65, 4.45, 0.12, stone)
    cube(f"HOME_PROP_{name}_fire", (x, 5.54, 1.00), (0.92, 0.07, 0.72), fire, bevel=0.12)
    add_point_light(f"HOME_LIGHT_{name}", (x, 5.08, 1.32), 580, (1.0, 0.25, 0.06), radius=0.8)


def add_bookshelf(materials):
    wood = materials["wood"]
    brass = materials["brass"]
    x, y = -2.55, 6.22
    cube("HOME_PROP_library_back", (x, y, 2.35), (1.45, 0.28, 2.25), wood, bevel=0.04)
    for idx, z in enumerate((0.5, 1.18, 1.86, 2.54, 3.22, 3.9, 4.48)):
        cube(f"HOME_PROP_library_shelf_{idx}", (x, y - 0.33, z), (1.45, 0.12, 0.065), brass, bevel=0.02)
    for side in (-1, 1):
        cube(f"HOME_PROP_library_post_{side}", (x + side * 1.34, y - 0.31, 2.35), (0.11, 0.13, 2.25), brass, bevel=0.025)
    # Book masses only: enough to match the canonical silhouette before detailing.
    book_colors = (materials["banner"], materials["book_green"], materials["book_brown"])
    for row, z in enumerate((0.82, 1.5, 2.18, 2.86, 3.54, 4.16)):
        for col in range(9):
            bx = x - 1.15 + col * 0.285
            h = 0.22 + 0.035 * ((row + col) % 3)
            cube(f"HOME_PROP_book_{row}_{col}", (bx, y - 0.47, z), (0.09, 0.08, h), book_colors[(row + col) % len(book_colors)])


def add_banner(name: str, x: float, materials):
    banner = materials["banner"]
    brass = materials["brass"]
    cube(f"HOME_PROP_banner_{name}", (x, 5.88, 4.48), (0.46, 0.045, 1.15), banner, bevel=0.025)
    cube(f"HOME_PROP_banner_bar_{name}", (x, 5.82, 5.66), (0.58, 0.06, 0.045), brass, bevel=0.015)


def add_armor(materials):
    steel = materials["steel"]
    brass = materials["brass"]
    stone = materials["stone"]
    x, y = 1.35, 5.35
    cube("HOME_PROP_armor_pedestal", (x, y, 0.3), (0.68, 0.52, 0.3), stone, bevel=0.05)
    cylinder("HOME_PROP_armor_legs", (x, y, 1.03), 0.25, 1.25, steel)
    sphere("HOME_PROP_armor_torso", (x, y, 1.9), (0.56, 0.36, 0.73), steel)
    sphere("HOME_PROP_armor_helmet", (x, y, 2.78), (0.37, 0.34, 0.38), steel)
    cube("HOME_PROP_armor_visor", (x, y - 0.33, 2.78), (0.33, 0.055, 0.11), brass, bevel=0.02)
    curve_tube("HOME_PROP_armor_left_arm", [(x - 0.44, y, 2.18), (x - 0.7, y, 1.58)], 0.115, steel)
    curve_tube("HOME_PROP_armor_right_arm", [(x + 0.44, y, 2.18), (x + 0.7, y, 1.58)], 0.115, steel)


def add_trophy(materials):
    brass = materials["brass"]
    wood = materials["wood"]
    x, y = -3.45, 5.76
    cube("HOME_PROP_trophy_shelf", (x, y, 2.78), (0.56, 0.22, 0.08), wood, bevel=0.025)
    cylinder("HOME_PROP_trophy_stem", (x, y - 0.18, 3.05), 0.07, 0.34, brass)
    sphere("HOME_PROP_trophy_cup", (x, y - 0.18, 3.34), (0.28, 0.22, 0.22), brass)
    curve_tube("HOME_PROP_trophy_handle_l", [(x - 0.18, y - 0.18, 3.42), (x - 0.34, y - 0.18, 3.33), (x - 0.23, y - 0.18, 3.18)], 0.035, brass)
    curve_tube("HOME_PROP_trophy_handle_r", [(x + 0.18, y - 0.18, 3.42), (x + 0.34, y - 0.18, 3.33), (x + 0.23, y - 0.18, 3.18)], 0.035, brass)


def add_side_furnishings(materials):
    wood = materials["wood"]
    brass = materials["brass"]
    leather = materials["leather"]
    paper = materials["paper"]
    globe = materials["globe"]
    plant = materials["plant"]
    ceramic = materials["ceramic"]
    steel = materials["steel"]

    # Left lived-in corner: sofa, side table, helmet/candle and book stack.
    cube("HOME_PROP_left_sofa_base", (-7.75, 0.65, 0.36), (1.05, 0.72, 0.34), leather, bevel=0.10)
    cube("HOME_PROP_left_sofa_back", (-8.25, 1.05, 0.98), (0.16, 0.70, 0.64), leather, bevel=0.08)
    cylinder("HOME_PROP_left_side_table", (-7.05, 2.45, 0.55), 0.54, 1.10, wood, vertices=24)
    sphere("HOME_PROP_left_helmet", (-7.05, 2.45, 1.26), (0.28, 0.24, 0.24), steel)
    cube("HOME_PROP_left_candle", (-6.55, 2.33, 1.15), (0.055, 0.055, 0.27), paper, bevel=0.015)
    for idx in range(4):
        cube(
            f"HOME_PROP_left_book_stack_{idx}",
            (-8.15 + idx * 0.04, -0.65, 0.16 + idx * 0.09),
            (0.52 - idx * 0.03, 0.35, 0.055),
            materials["book_brown"] if idx % 2 else materials["book_green"],
            bevel=0.02,
        )

    # Library work area behind the main board.
    cube("HOME_PROP_library_desk", (-3.45, 4.05, 0.82), (1.35, 0.58, 0.10), wood, bevel=0.05)
    cube("HOME_PROP_library_desk_leg_l", (-4.55, 4.05, 0.42), (0.10, 0.10, 0.42), wood, bevel=0.025)
    cube("HOME_PROP_library_desk_leg_r", (-2.35, 4.05, 0.42), (0.10, 0.10, 0.42), wood, bevel=0.025)
    cube("HOME_PROP_library_chair_seat", (-4.65, 3.25, 0.48), (0.44, 0.42, 0.12), leather, bevel=0.06)
    cube("HOME_PROP_library_chair_back", (-4.65, 3.60, 0.98), (0.42, 0.10, 0.55), leather, bevel=0.06)
    cube("HOME_PROP_library_lamp_base", (-3.10, 3.92, 1.00), (0.09, 0.09, 0.12), brass, bevel=0.02)
    cube("HOME_PROP_library_lamp_shade", (-3.10, 3.92, 1.24), (0.24, 0.18, 0.14), paper, bevel=0.04)

    # Right cabinet + globe, one of the strongest canonical silhouettes.
    cube("HOME_PROP_right_cabinet", (7.55, 5.18, 1.05), (1.15, 0.46, 1.05), wood, bevel=0.04)
    cylinder("HOME_PROP_globe_stand", (6.78, 4.72, 1.22), 0.10, 0.66, brass, vertices=24)
    sphere("HOME_PROP_globe", (6.78, 4.72, 1.82), (0.58, 0.58, 0.58), globe)
    curve_tube(
        "HOME_PROP_globe_meridian",
        [
            (6.78 + 0.67 * math.cos(i * math.pi / 16), 4.72, 1.82 + 0.67 * math.sin(i * math.pi / 16))
            for i in range(17)
        ],
        0.025,
        brass,
    )

    # Plant and ceramic pot mark the stair edge in the master.
    cylinder("HOME_PROP_plant_pot", (5.10, 1.70, 0.52), 0.34, 0.48, ceramic, vertices=28)
    for idx, (dx, dy) in enumerate(((-0.25, 0.05), (0.22, 0.02), (-0.12, 0.18), (0.10, -0.10), (0.30, 0.15))):
        curve_tube(
            f"HOME_PROP_plant_leaf_{idx}",
            [(5.10, 1.70, 0.76), (5.10 + dx * 0.55, 1.70 + dy, 1.13), (5.10 + dx, 1.70 + dy * 1.7, 1.46)],
            0.055,
            plant,
        )


def add_stairs(materials):
    stone = materials["stone"]
    brass = materials["brass"]
    dark = materials["dark"]
    fire = materials["fire"]

    # Pull the Dungeon inward: in the master it is a major lower-right mass,
    # not something clipped off the edge.
    bridge_x = 6.28
    arch_x = 6.52
    cube("HOME_ARCH_dungeon_bridge", (bridge_x, 2.55, 1.42), (2.18, 0.74, 0.13), stone, bevel=0.05)
    cube("HOME_ARCH_dungeon_bridge_lip", (bridge_x, 1.92, 1.62), (2.10, 0.12, 0.18), stone, bevel=0.04)

    cube("HOME_ARCH_dungeon_void", (arch_x, 1.72, -0.05), (1.78, 0.10, 1.50), dark, bevel=0.12)
    arch("HOME_ARCH_dungeon_arch", arch_x, 1.55, 3.58, 0.68, 1.58, -1.58, stone)
    arch("HOME_ARCH_dungeon_arch_inner", arch_x + 0.10, 1.42, 2.92, 0.52, 1.24, -1.50, materials["stone_dark"])

    # Gate/fire read even in Workbench and make the lower chamber unambiguous.
    for idx, x in enumerate((5.65, 6.00, 6.35, 6.70, 7.05, 7.40)):
        cube(f"HOME_PROP_dungeon_gate_{idx}", (x, 1.48, -0.25), (0.045, 0.045, 0.98), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_gate_cross", (6.52, 1.46, -0.22), (1.12, 0.05, 0.055), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_fire_left", (5.85, 1.32, -0.62), (0.18, 0.06, 0.36), fire, bevel=0.09)
    cube("HOME_PROP_dungeon_fire_right", (7.15, 1.32, -0.72), (0.18, 0.06, 0.42), fire, bevel=0.09)

    for idx, x in enumerate((4.82, 5.30, 5.78, 6.26, 6.74, 7.22, 7.70)):
        cylinder(f"HOME_ARCH_dungeon_baluster_{idx}", (x, 1.77, 1.94), 0.085, 0.58, stone, vertices=20)
    cube("HOME_ARCH_dungeon_balustrade_top", (6.26, 1.77, 2.26), (1.82, 0.12, 0.10), stone, bevel=0.025)

    cylinder("HOME_ARCH_dungeon_post", (4.68, 1.88, 1.40), 0.27, 2.00, stone, vertices=32)
    sphere("HOME_PROP_dungeon_finial", (4.68, 1.88, 2.50), (0.24, 0.24, 0.24), materials["stone_dark"])

    steps = 12
    for i in range(steps):
        t = i / (steps - 1)
        x = 5.02 + 2.82 * t
        y = 1.46 - 2.50 * t
        z = 0.76 - 1.72 * t
        cube(
            f"HOME_ARCH_dungeon_step_{i}",
            (x, y, z),
            (0.72, 0.38, 0.08),
            stone,
            bevel=0.025,
        )

    curve_tube(
        "HOME_PROP_dungeon_rail",
        [(4.62, 1.60, 2.22), (5.72, 0.72, 1.54), (6.90, -0.22, 0.78), (7.90, -1.02, 0.12)],
        0.050,
        brass,
    )
    curve_tube(
        "HOME_PROP_dungeon_rail_lower",
        [(4.62, 1.60, 1.86), (5.72, 0.72, 1.18), (6.90, -0.22, 0.42), (7.90, -1.02, -0.24)],
        0.027,
        brass,
    )
    cube("HOME_ARCH_dungeon_lower_floor", (6.88, -0.62, -1.53), (2.00, 1.78, 0.10), dark, bevel=0.02)


def build_scene(reference: Path, samples: int, max_width: int, engine: str):
    reset_scene()
    scene = bpy.context.scene
    if engine == "workbench":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
    else:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except TypeError:
            scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100

    ref_image = bpy.data.images.load(str(reference), check_existing=False)
    width, height = int(ref_image.size[0]), int(ref_image.size[1])
    if width <= 0 or height <= 0:
        width, height = 1814, 867
    render_width = min(width, max(640, max_width))
    render_height = round(height * render_width / width)
    scene.render.resolution_x = render_width
    scene.render.resolution_y = render_height

    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False

    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = max(8, samples)

    world = bpy.data.worlds.new("HOME_WORLD")
    world.use_nodes = True
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.012, 0.007, 0.004, 1.0)
    bg.inputs["Strength"].default_value = 0.22

    materials = {
        "stone": material("HOME_MAT_stone", (0.17, 0.12, 0.09, 1), roughness=0.88),
        "stone_dark": material("HOME_MAT_stone_dark", (0.075, 0.05, 0.04, 1), roughness=0.95),
        "wood": material("HOME_MAT_wood", (0.16, 0.065, 0.025, 1), roughness=0.7),
        "brass": material("HOME_MAT_brass", (0.47, 0.25, 0.055, 1), roughness=0.32, metallic=0.82),
        "steel": material("HOME_MAT_steel", (0.16, 0.17, 0.18, 1), roughness=0.42, metallic=0.72),
        "board_light": material("HOME_MAT_board_light", (0.52, 0.33, 0.16, 1), roughness=0.65),
        "board_dark": material("HOME_MAT_board_dark", (0.08, 0.035, 0.018, 1), roughness=0.75),
        "rug": material("HOME_MAT_rug", (0.28, 0.02, 0.018, 1), roughness=0.9),
        "banner": material("HOME_MAT_banner", (0.34, 0.018, 0.012, 1), roughness=0.82),
        "book_green": material("HOME_MAT_book_green", (0.08, 0.16, 0.10, 1), roughness=0.88),
        "book_brown": material("HOME_MAT_book_brown", (0.22, 0.08, 0.035, 1), roughness=0.88),
        "piece_light": material("HOME_MAT_piece_light", (0.76, 0.66, 0.48, 1), roughness=0.55),
        "piece_dark": material("HOME_MAT_piece_dark", (0.035, 0.025, 0.022, 1), roughness=0.52),
        "leather": material("HOME_MAT_leather", (0.28, 0.018, 0.016, 1), roughness=0.72),
        "paper": material("HOME_MAT_paper", (0.72, 0.58, 0.38, 1), roughness=0.88),
        "globe": material("HOME_MAT_globe", (0.36, 0.28, 0.16, 1), roughness=0.62),
        "plant": material("HOME_MAT_plant", (0.09, 0.20, 0.07, 1), roughness=0.84),
        "ceramic": material("HOME_MAT_ceramic", (0.48, 0.43, 0.33, 1), roughness=0.52),
        "dark": material("HOME_MAT_dark", (0.018, 0.012, 0.01, 1), roughness=0.9),
        "window": material(
            "HOME_MAT_window",
            (0.025, 0.07, 0.11, 1),
            roughness=0.22,
            emission=(0.09, 0.28, 0.44, 1),
            emission_strength=1.45,
        ),
        "fire": material(
            "HOME_MAT_fire",
            (0.55, 0.08, 0.01, 1),
            roughness=0.35,
            emission=(1.0, 0.19, 0.025, 1),
            emission_strength=5.0,
        ),
    }

    # Canonical Great Hall blockout v2: reproduce the asymmetric visual masses
    # from great-hall-dungeon.webp before adding any decorative detail.
    # Split the floor so the Dungeon can actually descend below the Great Hall
    # rather than sitting on top of a solid slab.
    cube("HOME_ARCH_floor_back", (0, 5.80, -0.18), (9.35, 3.60, 0.18), materials["stone_dark"])
    cube("HOME_ARCH_floor_front_left", (-2.10, -1.10, -0.18), (7.25, 3.30, 0.18), materials["stone_dark"])
    cube("HOME_ARCH_back_wall", (0, 7.0, 3.2), (9.35, 0.25, 3.4), materials["stone"])
    cube("HOME_ARCH_left_wall", (-9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
    cube("HOME_ARCH_right_wall", (9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
    cube("HOME_ARCH_rug", (0, 1.95, 0.018), (3.55, 4.45, 0.018), materials["rug"])

    # Large canonical masses, left-to-right: fireplace, library, armor portal,
    # second fireplace, window and dungeon stair.
    for x in (-7.6, -4.8, -0.65, 2.85, 5.95, 8.25):
        cylinder(f"HOME_ARCH_column_{x}", (x, 6.55, 2.6), 0.25, 5.2, materials["stone"], vertices=40)
        cylinder(f"HOME_ARCH_column_base_{x}", (x, 6.55, 0.25), 0.4, 0.5, materials["stone_dark"], vertices=36)

    add_fireplace("fireplace_left", -6.15, materials)
    add_bookshelf(materials)
    cube("HOME_PROP_armor_recess", (1.35, 6.72, 2.46), (0.95, 0.08, 1.78), materials["dark"], bevel=0.08)
    arch("HOME_ARCH_armor_portal", 1.35, 6.18, 2.55, 2.55, 4.35, 0.15, materials["stone"])
    add_fireplace("fireplace_right", 4.45, materials)

    cube("HOME_ARCH_window_right", (8.0, 6.62, 3.58), (0.78, 0.07, 1.46), materials["window"], bevel=0.08)
    arch("HOME_ARCH_window_right_frame", 8.0, 6.48, 1.78, 3.32, 4.48, 2.08, materials["brass"])

    for name, x in (("left", -4.7), ("center", -0.15), ("right", 3.05), ("far_right", 7.2)):
        add_banner(name, x, materials)

    add_table_and_board(materials)
    add_armor(materials)
    add_trophy(materials)
    add_side_furnishings(materials)
    add_stairs(materials)

    # Chandelier and warm pools of light.
    cylinder("HOME_PROP_chandelier_drop", (0, 2.45, 5.10), 0.055, 1.55, materials["brass"])
    curve_tube("HOME_PROP_chandelier_ring", [
        (1.38 * math.cos(i * math.tau / 20), 2.45 + 0.62 * math.sin(i * math.tau / 20), 4.34)
        for i in range(21)
    ], 0.060, materials["brass"])
    for idx, x in enumerate((-0.95, -0.32, 0.32, 0.95)):
        cube(f"HOME_PROP_chandelier_candle_{idx}", (x, 2.45, 4.40), (0.055, 0.055, 0.18), materials["fire"])
        add_point_light(f"HOME_LIGHT_chandelier_{idx}", (x, 2.25, 4.48), 95, (1.0, 0.58, 0.23), radius=0.25)

    # Side chandeliers are intentionally partial in frame, matching the master.
    for side in (-1, 1):
        cx = side * 7.65
        curve_tube(
            f"HOME_PROP_side_chandelier_{side}",
            [
                (cx + 0.82 * math.cos(i * math.tau / 18), 1.65 + 0.42 * math.sin(i * math.tau / 18), 5.02)
                for i in range(19)
            ],
            0.045,
            materials["brass"],
        )

    for idx, x in enumerate((-6.0, -3.0, 3.0, 6.0)):
        cube(f"HOME_PROP_torch_{idx}", (x, 6.02, 2.45), (0.06, 0.08, 0.34), materials["brass"], bevel=0.025)
        sphere(f"HOME_PROP_torch_flame_{idx}", (x, 5.92, 2.82), (0.12, 0.08, 0.22), materials["fire"])
        add_point_light(f"HOME_LIGHT_torch_{idx}", (x, 5.55, 2.85), 185, (1.0, 0.34, 0.09), radius=0.35)

    add_area_light("HOME_LIGHT_key", (-3.8, -2.0, 6.5), 900, (1.0, 0.58, 0.3), 6.0, target=(0, 2.4, 1.8))
    add_area_light("HOME_LIGHT_fill", (5.0, 1.0, 5.2), 520, (0.22, 0.38, 0.58), 5.0, target=(0, 3.2, 2.0))
    add_area_light("HOME_LIGHT_back", (0, 7.0, 5.8), 650, (1.0, 0.41, 0.14), 4.0, target=(0, 2.5, 2.2))

    camera_data = bpy.data.cameras.new("HOME_CAMERA_CANONICAL")
    camera_data.lens = 42.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new("HOME_CAMERA_CANONICAL", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, -15.8, 5.25)
    target = (0.0, 2.65, 2.00)
    look_at(camera, target)
    scene.camera = camera

    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.look = "Medium High Contrast"
        except Exception:
            pass
    return scene, camera, target, width, height, render_width, render_height


def render(scene, path: Path) -> None:
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    root = Path.cwd()
    reference = (root / args.reference).resolve()
    if not reference.is_file():
        raise SystemExit(f"Canonical Home reference not found: {reference}")

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    scene, camera, target, width, height, render_width, render_height = build_scene(reference, args.samples, args.max_width, args.engine)

    blend_path = out_dir / "home-v2-blockout.blend"
    beauty_path = out_dir / "home-v2-preview.png"
    clay_path = out_dir / "home-v2-clay.png"
    metadata_path = out_dir / "home-v2-camera.json"

    render(scene, beauty_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    clay = material("HOME_MAT_clay_override", (0.34, 0.30, 0.26, 1), roughness=0.88)
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data.materials:
            obj.data.materials.clear()
            obj.data.materials.append(clay)
    render(scene, clay_path)

    metadata = {
        "contract": CONTRACT,
        "reference": args.reference,
        "reference_size": [width, height],
        "render_size": [render_width, render_height],
        "engine": args.engine,
        "camera": {
            "name": camera.name,
            "lens_mm": camera.data.lens,
            "sensor_width_mm": camera.data.sensor_width,
            "position": [round(v, 6) for v in camera.location],
            "rotation_euler": [round(v, 6) for v in camera.rotation_euler],
            "target": list(target),
        },
        "object_count": len(bpy.data.objects),
        "named_groups": {
            "architecture": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_ARCH_")),
            "props": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_PROP_")),
            "lights": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_LIGHT_")),
        },
        "notes": [
            "Blockout only: camera, silhouette and destination masses before detail.",
            "The current runtime Home is intentionally untouched and remains the rollback baseline.",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"contract": CONTRACT, "output": str(out_dir), "objects": metadata["object_count"]}))


if __name__ == "__main__":
    main()
