#!/usr/bin/env python3
"""Build the first Blender blockout for the canonical Chess Studio Home.

The goal of this pass is intentionally narrow: lock camera/composition and the
major architectural/prop masses before spending time on detailed modelling.
It never mutates runtime Home assets.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


CONTRACT = "home-blender-canon-20260918-v1"
DEFAULT_REFERENCE = "scripts/blender/references/home_canon_20260918.webp.b64"


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


def materialize_reference(reference: Path, out_dir: Path) -> Path:
    if reference.suffix != ".b64":
        return reference
    target = out_dir / "home-canon-20260918.webp"
    target.write_bytes(base64.b64decode(reference.read_text(encoding="utf-8").strip()))
    return target


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness=0.7,
    metallic=0.0,
    emission=None,
    emission_strength=0.0,
    bump_scale=None,
    bump_strength=0.14,
):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if bump_scale is not None:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.62
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.12
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
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
    piece_scale = 1.18
    r1 *= piece_scale
    r2 *= piece_scale
    depth *= piece_scale
    head *= piece_scale
    height *= piece_scale
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


def flat_panel(name: str, points_xz, y: float, depth: float, mat, *, bevel=0.03):
    half = depth / 2.0
    front = [(x, y - half, z) for x, z in points_xz]
    back = [(x, y + half, z) for x, z in points_xz]
    vertices = front + back
    count = len(points_xz)
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
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


def gothic_arch(name: str, x: float, y: float, width: float, shoulder_z: float, top_z: float, bottom_z: float, mat, *, bevel=0.19):
    half = width / 2.0
    points = [(x - half, y, bottom_z), (x - half, y, shoulder_z)]
    for i in range(1, 10):
        t = i / 9.0
        # Convex rise into a pointed apex; intentionally architectural rather
        # than mathematically perfect so the silhouette matches the painted master.
        points.append((x - half * (1.0 - t), y, shoulder_z + (top_z - shoulder_z) * (t ** 0.72)))
    for i in range(1, 10):
        t = i / 9.0
        points.append((x + half * t, y, top_z - (top_z - shoulder_z) * (t ** 1.38)))
    points.extend([(x + half, y, shoulder_z), (x + half, y, bottom_z)])
    return curve_tube(name, points, bevel, mat)


def look_at(obj, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def join_meshes(name: str, prefixes: tuple[str, ...]):
    """Collapse repeated mesh props without changing their rendered appearance."""
    candidates = [
        obj
        for obj in list(bpy.data.objects)
        if obj.type == "MESH" and any(obj.name.startswith(prefix) for prefix in prefixes)
    ]
    if len(candidates) < 2:
        return candidates[0] if candidates else None

    # Bake per-object bevels before joining; otherwise Blender keeps only the
    # active object's modifier stack and the compacted shell visibly changes.
    baked = []
    for obj in candidates:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if obj.modifiers:
            bpy.ops.object.convert(target="MESH")
        baked.append(obj)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in baked:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = baked[0]
    bpy.ops.object.join()
    baked[0].name = name
    return baked[0]


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

    table_y = 1.05
    table_z = 1.12
    cube("HOME_PROP_table_top", (0.0, table_y, table_z), (3.72, 1.72, 0.18), wood, bevel=0.10)
    cube("HOME_PROP_table_apron_front", (0.0, -0.56, 0.90), (3.40, 0.10, 0.22), wood, bevel=0.045)
    cube("HOME_PROP_table_apron_back", (0.0, 2.66, 0.90), (3.40, 0.10, 0.22), wood, bevel=0.045)
    for x in (-3.20, 3.20):
        for y in (-0.30, 2.40):
            cube(f"HOME_PROP_table_leg_{x}_{y}", (x, y, 0.55), (0.15, 0.15, 0.55), wood, bevel=0.035)
            cylinder(f"HOME_PROP_table_leg_collar_{x}_{y}", (x, y, 0.93), 0.20, 0.10, metal, vertices=18)

    # The canonical board nearly fills the table width; the earlier blockout
    # made it read like a travel set.
    square = 0.50
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

    # The frontal cloth is one of the master image's strongest silhouettes.
    # Pull it forward so it cannot disappear inside the table and give it the
    # canonical pointed lower edge plus a narrow brass backing/trim.
    drape_points = [
        (-1.92, 1.28),
        (1.92, 1.28),
        (1.92, 0.22),
        (0.0, -0.10),
        (-1.92, 0.22),
    ]
    flat_panel("HOME_PROP_table_banner_trim", drape_points, -0.68, 0.08, metal, bevel=0.045)
    flat_panel(
        "HOME_PROP_table_banner",
        [(x * 0.955, 0.64 + (z - 0.64) * 0.92) for x, z in drape_points],
        -0.725,
        0.055,
        banner,
        bevel=0.035,
    )

    # Large canonical horse-head relief on the table drape.
    emblem_y = -0.765
    sphere("HOME_PROP_table_horse_head", (-0.10, emblem_y, 0.73), (0.28, 0.040, 0.24), metal)
    cube("HOME_PROP_table_horse_muzzle", (-0.31, emblem_y, 0.66), (0.15, 0.032, 0.070), metal, bevel=0.022)
    curve_tube(
        "HOME_PROP_table_horse_neck",
        [(0.00, emblem_y, 0.66), (0.15, emblem_y, 0.37), (0.04, emblem_y, 0.18)],
        0.085,
        metal,
    )
    cone("HOME_PROP_table_horse_ear", (-0.16, emblem_y, 1.02), 0.075, 0.018, 0.25, metal, vertices=14)
    cube("HOME_PROP_table_mark_v", (0.0, emblem_y, 0.28), (0.040, 0.028, 0.15), metal, bevel=0.01)
    cube("HOME_PROP_table_mark_h", (0.0, emblem_y, 0.32), (0.13, 0.028, 0.040), metal, bevel=0.01)

    # Canonical lived-in table props, kept outside the board interaction footprint.
    for idx, (px, py, pz) in enumerate(((-2.55, 0.20, 1.36), (-2.48, 0.18, 1.45), (-2.58, 0.18, 1.54))):
        cube(
            f"HOME_PROP_table_book_{idx}",
            (px, py, pz),
            (0.58 - idx * 0.05, 0.34, 0.045),
            materials["book_brown"] if idx != 1 else materials["book_green"],
            bevel=0.025,
        )
    cylinder("HOME_PROP_table_candle_base", (-2.72, 1.60, 1.36), 0.17, 0.08, metal, vertices=20)
    cube("HOME_PROP_table_candle", (-2.72, 1.60, 1.57), (0.055, 0.055, 0.20), materials["paper"], bevel=0.02)
    cone("HOME_PROP_table_candle_flame", (-2.72, 1.60, 1.82), 0.055, 0.012, 0.18, materials["fire_hot"], vertices=14)
    add_point_light("HOME_LIGHT_table_candle", (-2.72, 1.40, 1.88), 58, (1.0, 0.48, 0.20), radius=0.30)

    cube("HOME_PROP_table_folio", (2.65, 0.35, 1.37), (0.56, 0.36, 0.055), materials["book_brown"], bevel=0.035)
    cylinder("HOME_PROP_table_hourglass_top", (-2.10, 2.05, 1.56), 0.12, 0.045, metal, vertices=18)
    cylinder("HOME_PROP_table_hourglass_bottom", (-2.10, 2.05, 1.34), 0.12, 0.045, metal, vertices=18)
    curve_tube(
        "HOME_PROP_table_hourglass_frame_l",
        [(-2.18, 2.05, 1.36), (-2.18, 2.05, 1.55)],
        0.022,
        metal,
    )
    curve_tube(
        "HOME_PROP_table_hourglass_frame_r",
        [(-2.02, 2.05, 1.36), (-2.02, 2.05, 1.55)],
        0.022,
        metal,
    )

    for side in (-1, 1):
        x = side * 4.18
        cube(f"HOME_PROP_bench_frame_{side}", (x, 0.98, 0.50), (0.72, 1.62, 0.12), wood, bevel=0.045)
        cube(f"HOME_PROP_bench_cushion_{side}", (x, 0.98, 0.74), (0.69, 1.55, 0.20), banner, bevel=0.12)
        for by in (0.08, 2.32):
            for dx in (-0.40, 0.40):
                bx = x + dx
                cube(f"HOME_PROP_bench_leg_{side}_{dx}_{by}", (bx, by, 0.26), (0.10, 0.10, 0.26), wood, bevel=0.03)
                cylinder(f"HOME_PROP_bench_foot_{side}_{dx}_{by}", (bx, by, 0.05), 0.12, 0.10, materials["dark"], vertices=16)
        for tuft in (-0.72, 0.0, 0.72):
            sphere(f"HOME_PROP_bench_tuft_{side}_{tuft}", (x, 1.2 + tuft, 0.91), (0.07, 0.035, 0.035), materials["dark"])

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
    cube(f"HOME_PROP_{name}_hearth_slab", (x, 5.62, 0.28), (1.42, 0.46, 0.12), stone, bevel=0.05)
    for side in (-1, 1):
        cube(f"HOME_PROP_{name}_jamb_{side}", (x + side * 1.18, 6.02, 1.20), (0.18, 0.34, 1.15), stone, bevel=0.05)
        cube(f"HOME_PROP_{name}_corbel_{side}", (x + side * 1.22, 5.82, 1.95), (0.24, 0.28, 0.18), stone, bevel=0.05)
    cube(f"HOME_PROP_{name}_mantel", (x, 5.83, 1.88), (1.55, 0.24, 0.16), stone, bevel=0.04)
    cube(f"HOME_ARCH_{name}_lintel", (x, 5.98, 2.38), (1.30, 0.28, 0.18), stone, bevel=0.05)
    cube(f"HOME_ARCH_{name}_upper_block", (x, 6.18, 2.82), (1.08, 0.20, 0.30), stone, bevel=0.04)
    for bar in (-0.54, -0.18, 0.18, 0.54):
        cube(f"HOME_PROP_{name}_grate_{bar}", (x + bar, 5.48, 0.76), (0.028, 0.035, 0.48), materials["steel"], bevel=0.01)
    cube(f"HOME_PROP_{name}_grate_cross", (x, 5.47, 0.62), (0.72, 0.035, 0.025), materials["steel"], bevel=0.01)
    hot = materials["fire_hot"]
    cube(f"HOME_PROP_{name}_embers", (x, 5.54, 0.58), (0.88, 0.07, 0.08), fire, bevel=0.06)
    flame_offsets = (-0.62, -0.38, -0.16, 0.08, 0.30, 0.52)
    for idx, offset in enumerate(flame_offsets):
        height = 0.34 + 0.13 * ((idx * 5) % 4)
        cone(
            f"HOME_PROP_{name}_flame_{idx}",
            (x + offset, 5.53, 0.67 + height / 2),
            0.13 + 0.025 * (idx % 2),
            0.025,
            height,
            fire,
            vertices=18,
        )
        if idx % 2 == 0:
            cone(
                f"HOME_PROP_{name}_flame_hot_{idx}",
                (x + offset * 0.98, 5.50, 0.65 + height * 0.30),
                0.070,
                0.012,
                height * 0.52,
                hot,
                vertices=14,
            )
    add_point_light(f"HOME_LIGHT_{name}", (x, 5.00, 1.22), 360, (1.0, 0.30, 0.07), radius=1.15)


def add_bookshelf(materials):
    wood = materials["wood"]
    brass = materials["brass"]
    x, y = -6.55, 6.18
    cube("HOME_PROP_library_back", (x, y, 2.55), (1.70, 0.34, 2.48), materials["dark"], bevel=0.05)
    cube("HOME_PROP_library_frame", (x, y - 0.22, 2.55), (1.58, 0.22, 2.38), wood, bevel=0.06)
    for idx, z in enumerate((0.55, 1.25, 1.95, 2.65, 3.35, 4.05, 4.75)):
        cube(f"HOME_PROP_library_shelf_{idx}", (x, y - 0.42, z), (1.55, 0.12, 0.075), wood, bevel=0.025)
    for side in (-1, 1):
        cube(f"HOME_PROP_library_post_{side}", (x + side * 1.34, y - 0.31, 2.35), (0.11, 0.13, 2.25), brass, bevel=0.025)
    # Book masses only: enough to match the canonical silhouette before detailing.
    book_colors = (materials["banner"], materials["book_green"], materials["book_brown"])
    for row, z in enumerate((0.82, 1.5, 2.18, 2.86, 3.54, 4.16)):
        for col in range(9):
            bx = x - 1.15 + col * 0.285
            h = 0.22 + 0.035 * ((row + col) % 3)
            cube(f"HOME_PROP_book_{row}_{col}", (bx, y - 0.47, z), (0.09, 0.08, h), book_colors[(row + col) % len(book_colors)])
    armillary_center = (x + 0.72, y - 0.58, 3.38)
    sphere("HOME_PROP_library_armillary_core", armillary_center, (0.16, 0.09, 0.16), brass)
    curve_tube(
        "HOME_PROP_library_armillary_ring",
        [
            (armillary_center[0] + 0.34 * math.cos(i * math.tau / 24), armillary_center[1], armillary_center[2] + 0.34 * math.sin(i * math.tau / 24))
            for i in range(25)
        ],
        0.025,
        brass,
    )
    cylinder("HOME_PROP_library_armillary_stand", (armillary_center[0], armillary_center[1], 2.96), 0.055, 0.52, brass, vertices=18)


def add_banner(name: str, x: float, materials):
    banner = materials["banner"]
    brass = materials["brass"]
    points = [
        (x - 0.48, 5.62),
        (x + 0.48, 5.62),
        (x + 0.48, 3.84),
        (x, 3.44),
        (x - 0.48, 3.84),
    ]
    flat_panel(f"HOME_PROP_banner_{name}", points, 5.82, 0.08, banner, bevel=0.028)
    cube(f"HOME_PROP_banner_bar_{name}", (x, 5.72, 5.70), (0.60, 0.07, 0.045), brass, bevel=0.015)

    relief_y = 5.73
    sphere(f"HOME_PROP_banner_horse_head_{name}", (x - 0.06, relief_y, 4.77), (0.16, 0.035, 0.14), brass)
    cube(f"HOME_PROP_banner_horse_muzzle_{name}", (x - 0.19, relief_y, 4.72), (0.09, 0.028, 0.045), brass, bevel=0.018)
    curve_tube(
        f"HOME_PROP_banner_horse_neck_{name}",
        [(x + 0.01, relief_y, 4.69), (x + 0.10, relief_y, 4.48), (x + 0.04, relief_y, 4.29)],
        0.055,
        brass,
    )
    cone(f"HOME_PROP_banner_horse_ear_{name}", (x - 0.09, relief_y, 4.95), 0.045, 0.012, 0.18, brass, vertices=12)
    cube(f"HOME_PROP_banner_mark_v_{name}", (x, relief_y, 3.84), (0.035, 0.022, 0.18), brass, bevel=0.01)
    cube(f"HOME_PROP_banner_mark_h_{name}", (x, relief_y, 3.91), (0.12, 0.022, 0.035), brass, bevel=0.01)


def add_armor(materials):
    steel = materials["steel"]
    brass = materials["brass"]
    stone = materials["stone"]
    dark = materials["dark"]
    x, y = -4.92, 5.10

    cube("HOME_PROP_armor_pedestal", (x, y, 0.24), (0.72, 0.54, 0.24), stone, bevel=0.05)

    # Humanoid stance: two distinct greaves instead of the old single pawn-like
    # cylinder, plus pelvis, tapered cuirass and articulated limbs.
    for side in (-1, 1):
        lx = x + side * 0.19
        cube(f"HOME_PROP_armor_boot_{side}", (lx, y - 0.05, 0.58), (0.16, 0.24, 0.12), steel, bevel=0.05)
        cone(f"HOME_PROP_armor_greave_{side}", (lx, y, 0.98), 0.15, 0.11, 0.70, steel, vertices=24)
        sphere(f"HOME_PROP_armor_knee_{side}", (lx, y - 0.01, 1.30), (0.17, 0.13, 0.14), brass)
        cone(f"HOME_PROP_armor_thigh_{side}", (lx, y, 1.55), 0.15, 0.19, 0.48, steel, vertices=24)

    cube("HOME_PROP_armor_pelvis", (x, y, 1.78), (0.35, 0.24, 0.18), steel, bevel=0.08)
    cone("HOME_PROP_armor_cuirass", (x, y, 2.14), 0.50, 0.37, 0.72, steel, vertices=28)
    cube("HOME_PROP_armor_belt", (x, y - 0.03, 1.84), (0.40, 0.25, 0.07), brass, bevel=0.03)

    sphere("HOME_PROP_armor_shoulder_l", (x - 0.48, y, 2.34), (0.22, 0.18, 0.20), steel)
    sphere("HOME_PROP_armor_shoulder_r", (x + 0.48, y, 2.34), (0.22, 0.18, 0.20), steel)
    curve_tube("HOME_PROP_armor_left_arm", [(x - 0.48, y, 2.27), (x - 0.66, y, 1.95), (x - 0.60, y - 0.02, 1.66)], 0.10, steel)
    curve_tube("HOME_PROP_armor_right_arm", [(x + 0.48, y, 2.27), (x + 0.66, y, 1.95), (x + 0.60, y - 0.02, 1.66)], 0.10, steel)
    sphere("HOME_PROP_armor_gauntlet_l", (x - 0.60, y - 0.02, 1.62), (0.13, 0.11, 0.13), brass)
    sphere("HOME_PROP_armor_gauntlet_r", (x + 0.60, y - 0.02, 1.62), (0.13, 0.11, 0.13), brass)

    # Helmet with neck gap and a face slit, much closer to the canonical suit
    # of armour silhouette than a round pawn head.
    cylinder("HOME_PROP_armor_neck", (x, y, 2.58), 0.15, 0.20, dark, vertices=20)
    sphere("HOME_PROP_armor_helmet", (x, y, 2.83), (0.34, 0.30, 0.34), steel)
    cube("HOME_PROP_armor_visor", (x, y - 0.285, 2.82), (0.30, 0.05, 0.09), dark, bevel=0.02)
    cube("HOME_PROP_armor_brow", (x, y - 0.30, 2.95), (0.28, 0.045, 0.045), brass, bevel=0.015)

    # Weapon rack frames the armour without becoming part of its body.
    for idx, wx in enumerate((x - 0.88, x - 0.68, x + 0.68, x + 0.88)):
        curve_tube(
            f"HOME_PROP_armor_weapon_{idx}",
            [(wx, y + 0.10, 0.45), (wx, y + 0.08, 3.55)],
            0.035,
            dark,
        )


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
    cube("HOME_PROP_left_sofa_base", (-7.75, -0.05, 0.42), (1.55, 1.05, 0.40), leather, bevel=0.14)
    cube("HOME_PROP_left_sofa_back", (-8.42, 0.58, 1.32), (0.22, 1.02, 0.92), leather, bevel=0.12)
    cube("HOME_PROP_left_sofa_arm", (-6.48, -0.02, 0.80), (0.22, 0.95, 0.48), leather, bevel=0.11)
    cube("HOME_PROP_left_sofa_arm_outer", (-8.42, -0.02, 0.80), (0.22, 0.95, 0.48), leather, bevel=0.11)
    cube("HOME_PROP_left_sideboard", (-7.55, 2.62, 0.62), (1.30, 0.48, 0.62), wood, bevel=0.06)
    cylinder("HOME_PROP_left_side_table", (-6.35, 2.35, 0.58), 0.54, 1.16, wood, vertices=24)
    sphere("HOME_PROP_left_helmet", (-6.35, 2.35, 1.34), (0.30, 0.25, 0.25), steel)
    cube("HOME_PROP_left_candle", (-6.55, 2.33, 1.15), (0.055, 0.055, 0.27), paper, bevel=0.015)
    sphere("HOME_PROP_left_horse_body", (-7.52, 2.12, 1.50), (0.28, 0.15, 0.18), brass)
    curve_tube(
        "HOME_PROP_left_horse_neck",
        [(-7.66, 2.12, 1.55), (-7.82, 2.12, 1.74), (-7.94, 2.12, 1.88)],
        0.065,
        brass,
    )
    sphere("HOME_PROP_left_horse_head", (-8.02, 2.12, 1.91), (0.12, 0.07, 0.10), brass)
    for idx, hx in enumerate((-7.68, -7.42)):
        curve_tube(
            f"HOME_PROP_left_horse_leg_{idx}",
            [(hx, 2.12, 1.38), (hx - 0.04, 2.12, 1.10)],
            0.035,
            brass,
        )
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

    # Canonical globe sits in the left foreground study zone. Keep the right
    # staircase clear so the Dungeon path reads immediately.
    gx, gy = -7.55, -0.15
    cube("HOME_PROP_right_cabinet", (7.55, 5.55, 0.82), (0.88, 0.38, 0.82), wood, bevel=0.04)
    cylinder("HOME_PROP_globe_stand", (gx, gy, 0.64), 0.11, 0.72, brass, vertices=24)
    sphere("HOME_PROP_globe", (gx, gy, 1.48), (0.72, 0.72, 0.72), globe)
    curve_tube(
        "HOME_PROP_globe_meridian",
        [
            (gx + 0.82 * math.cos(i * math.pi / 16), gy, 1.48 + 0.82 * math.sin(i * math.pi / 16))
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


def add_equestrian_statue(materials):
    dark = materials["steel"]
    brass = materials["brass"]
    stone = materials["stone_dark"]
    x, y = 6.10, 5.92

    cube("HOME_PROP_equestrian_plinth", (x, y, 2.58), (0.72, 0.55, 0.46), stone, bevel=0.06)
    sphere("HOME_PROP_equestrian_horse_body", (x, y, 3.34), (0.62, 0.30, 0.42), dark)
    curve_tube(
        "HOME_PROP_equestrian_horse_neck",
        [(x + 0.36, y, 3.48), (x + 0.58, y - 0.02, 3.78), (x + 0.76, y - 0.03, 3.92)],
        0.15,
        dark,
    )
    sphere("HOME_PROP_equestrian_horse_head", (x + 0.86, y - 0.03, 3.96), (0.24, 0.18, 0.20), dark)
    cone("HOME_PROP_equestrian_horse_ear", (x + 0.92, y - 0.02, 4.18), 0.055, 0.015, 0.20, dark, vertices=12)

    for idx, (dx, dz) in enumerate(((-0.42, 0.0), (-0.18, 0.05), (0.25, 0.02), (0.46, 0.10))):
        curve_tube(
            f"HOME_PROP_equestrian_leg_{idx}",
            [(x + dx, y, 3.15), (x + dx * 1.15, y + 0.02, 2.78 + dz)],
            0.07,
            dark,
        )

    # Rider: deliberately simple in blockout, only the canonical silhouette.
    cone("HOME_PROP_equestrian_rider_body", (x - 0.02, y, 4.18), 0.22, 0.15, 0.54, dark, vertices=18)
    sphere("HOME_PROP_equestrian_rider_head", (x - 0.02, y, 4.58), (0.16, 0.14, 0.17), dark)
    curve_tube(
        "HOME_PROP_equestrian_rider_arm",
        [(x + 0.10, y, 4.28), (x + 0.36, y - 0.01, 4.10)],
        0.055,
        dark,
    )
    curve_tube(
        "HOME_PROP_equestrian_lance",
        [(x + 0.22, y + 0.04, 4.18), (x - 0.40, y + 0.04, 5.18)],
        0.030,
        brass,
    )


def add_stairs(materials):
    stone = materials["stone"]
    brass = materials["brass"]
    dark = materials["dark"]
    fire = materials["fire"]

    # Canonical Home: the stair rises from the room toward the back-right
    # landing. The Dungeon opening lives under that landing instead of opening
    # as a giant foreground void.
    lower_x, lower_y, lower_z = 4.20, 1.62, 0.16
    upper_x, upper_y, upper_z = 7.40, 5.08, 2.18

    steps = 12
    for i in range(steps):
        t = i / (steps - 1)
        x = lower_x + (upper_x - lower_x) * t
        y = lower_y + (upper_y - lower_y) * t
        z = lower_z + (upper_z - lower_z) * t
        cube(
            f"HOME_ARCH_dungeon_step_{i}",
            (x, y, z),
            (0.72, 0.34, 0.075),
            stone,
            bevel=0.028,
        )

    # Upper gallery / bridge creates the horizontal silhouette visible below
    # the moonlit windows.
    cube("HOME_ARCH_dungeon_bridge", (7.55, 5.26, 2.08), (1.40, 0.64, 0.12), stone, bevel=0.05)
    cube("HOME_ARCH_dungeon_bridge_lip", (7.55, 4.72, 2.28), (1.34, 0.10, 0.16), stone, bevel=0.04)

    # Dungeon portal tucked under the upper landing.
    cube("HOME_ARCH_dungeon_void", (7.55, 6.54, 0.72), (1.18, 0.08, 1.18), dark, bevel=0.10)
    arch("HOME_ARCH_dungeon_arch", 7.55, 6.22, 2.55, 0.84, 2.22, -0.48, stone)
    arch("HOME_ARCH_dungeon_arch_inner", 7.55, 6.08, 2.08, 0.72, 1.92, -0.38, materials["stone_dark"])

    for idx, x in enumerate((6.82, 7.18, 7.54, 7.90, 8.26)):
        cube(f"HOME_PROP_dungeon_gate_{idx}", (x, 6.04, 0.66), (0.035, 0.035, 0.78), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_gate_cross", (7.54, 6.02, 0.64), (0.88, 0.040, 0.045), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_fire_left", (7.16, 5.96, 0.18), (0.12, 0.05, 0.24), fire, bevel=0.07)
    cube("HOME_PROP_dungeon_fire_right", (7.94, 5.96, 0.18), (0.12, 0.05, 0.24), fire, bevel=0.07)

    # Balustrades track the rising stair.
    rail_points = []
    rail_lower = []
    for i in range(7):
        t = i / 6.0
        x = lower_x - 0.18 + (upper_x - lower_x) * t
        y = lower_y + (upper_y - lower_y) * t
        z = lower_z + 1.10 + (upper_z - lower_z) * t
        cylinder(f"HOME_ARCH_dungeon_baluster_{i}", (x, y, z - 0.34), 0.065, 0.58, stone, vertices=18)
        rail_points.append((x, y, z))
        rail_lower.append((x, y, z - 0.28))

    curve_tube("HOME_PROP_dungeon_rail", rail_points, 0.045, brass)
    curve_tube("HOME_PROP_dungeon_rail_lower", rail_lower, 0.025, brass)

    # Far-right gallery balustrade above the portal.
    for idx, x in enumerate((6.45, 6.85, 7.25, 7.65, 8.05, 8.45)):
        cylinder(f"HOME_ARCH_dungeon_gallery_baluster_{idx}", (x, 5.02, 2.62), 0.065, 0.54, stone, vertices=18)
    cube("HOME_ARCH_dungeon_balustrade_top", (7.45, 5.02, 2.93), (1.28, 0.10, 0.085), stone, bevel=0.025)

    cylinder("HOME_ARCH_dungeon_post", (4.56, 1.58, 0.88), 0.22, 1.52, stone, vertices=28)
    sphere("HOME_PROP_dungeon_finial", (4.56, 1.58, 1.74), (0.19, 0.19, 0.19), materials["stone_dark"])

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
        width, height = 320, 180
    canon_width, canon_height = 1672, 941
    render_width = min(canon_width, max(640, max_width))
    render_height = round(canon_height * render_width / canon_width)
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
    bg.inputs["Strength"].default_value = 0.052

    materials = {
        "stone": material("HOME_MAT_stone", (0.145, 0.115, 0.090, 1), roughness=0.92, bump_scale=5.0, bump_strength=0.24),
        "stone_dark": material("HOME_MAT_stone_dark", (0.040, 0.032, 0.028, 1), roughness=0.97, bump_scale=6.5, bump_strength=0.20),
        "floor_stone": material("HOME_MAT_floor_stone", (0.090, 0.065, 0.048, 1), roughness=0.94, bump_scale=7.0, bump_strength=0.18),
        "wood": material("HOME_MAT_wood", (0.105, 0.036, 0.014, 1), roughness=0.70, bump_scale=4.0, bump_strength=0.11),
        "brass": material("HOME_MAT_brass", (0.42, 0.22, 0.050, 1), roughness=0.27, metallic=0.88),
        "steel": material("HOME_MAT_steel", (0.24, 0.25, 0.26, 1), roughness=0.27, metallic=0.90),
        "board_light": material("HOME_MAT_board_light", (0.52, 0.33, 0.16, 1), roughness=0.65),
        "board_dark": material("HOME_MAT_board_dark", (0.08, 0.035, 0.018, 1), roughness=0.75),
        "rug": material("HOME_MAT_rug", (0.34, 0.016, 0.020, 1), roughness=0.92, bump_scale=24.0, bump_strength=0.10),
        "banner": material("HOME_MAT_banner", (0.43, 0.018, 0.014, 1), roughness=0.84, bump_scale=18.0, bump_strength=0.06),
        "book_green": material("HOME_MAT_book_green", (0.08, 0.16, 0.10, 1), roughness=0.88),
        "book_brown": material("HOME_MAT_book_brown", (0.22, 0.08, 0.035, 1), roughness=0.88),
        "piece_light": material("HOME_MAT_piece_light", (0.76, 0.66, 0.48, 1), roughness=0.55),
        "piece_dark": material("HOME_MAT_piece_dark", (0.035, 0.025, 0.022, 1), roughness=0.52),
        "leather": material("HOME_MAT_leather", (0.30, 0.018, 0.018, 1), roughness=0.76, bump_scale=16.0, bump_strength=0.06),
        "paper": material("HOME_MAT_paper", (0.72, 0.58, 0.38, 1), roughness=0.88),
        "globe": material("HOME_MAT_globe", (0.36, 0.28, 0.16, 1), roughness=0.62),
        "plant": material("HOME_MAT_plant", (0.09, 0.20, 0.07, 1), roughness=0.84),
        "ceramic": material("HOME_MAT_ceramic", (0.48, 0.43, 0.33, 1), roughness=0.52),
        "dark": material("HOME_MAT_dark", (0.018, 0.012, 0.01, 1), roughness=0.9),
        "window": material(
            "HOME_MAT_window",
            (0.012, 0.038, 0.070, 1),
            roughness=0.28,
            emission=(0.025, 0.095, 0.19, 1),
            emission_strength=0.32,
        ),
        "moon": material(
            "HOME_MAT_moon",
            (0.82, 0.86, 0.84, 1),
            roughness=0.42,
            emission=(0.55, 0.66, 0.74, 1),
            emission_strength=1.35,
        ),
        "fire": material(
            "HOME_MAT_fire",
            (0.92, 0.16, 0.018, 1),
            roughness=0.30,
            emission=(1.0, 0.20, 0.018, 1),
            emission_strength=2.15,
        ),
        "fire_hot": material(
            "HOME_MAT_fire_hot",
            (1.0, 0.62, 0.12, 1),
            roughness=0.24,
            emission=(1.0, 0.52, 0.08, 1),
            emission_strength=3.10,
        ),
    }

    # Canonical Great Hall blockout v2: reproduce the asymmetric visual masses
    # from great-hall-dungeon.webp before adding any decorative detail.
    # Split the floor so the Dungeon can actually descend below the Great Hall
    # rather than sitting on top of a solid slab.
    cube("HOME_ARCH_floor_back", (0, 5.80, -0.18), (9.35, 3.60, 0.18), materials["floor_stone"])
    cube("HOME_ARCH_floor_front_left", (-2.10, -1.10, -0.18), (7.25, 3.30, 0.18), materials["floor_stone"])
    cube("HOME_ARCH_back_wall", (0, 7.0, 3.2), (9.35, 0.25, 3.4), materials["stone"])
    cube("HOME_ARCH_left_wall", (-9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
    cube("HOME_ARCH_right_wall", (9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])

    # One large pointed rib and a heavy cornice give the back wall the gothic
    # silhouette of the canonical mock instead of reading as a flat stage set.
    cube("HOME_ARCH_back_cornice", (0.0, 6.70, 5.70), (8.78, 0.20, 0.15), materials["stone_dark"], bevel=0.035)
    gothic_arch(
        "HOME_ARCH_master_vault",
        0.15,
        6.36,
        10.6,
        3.66,
        6.28,
        0.18,
        materials["stone_dark"],
        bevel=0.105,
    )
    cube("HOME_ARCH_rug", (0, 1.95, 0.018), (3.55, 4.45, 0.018), materials["rug"])

    # Stone slab seams keep the floor from reading as one flat dark plane.
    grout = materials["stone_dark"]
    for idx, x in enumerate((-8.0, -6.4, -4.8, -3.2, 3.2, 4.8, 6.4, 8.0)):
        cube(f"HOME_ARCH_floor_grout_v_{idx}", (x, 2.25, 0.018), (0.018, 5.55, 0.010), grout)
    for idx, y in enumerate((-2.2, -0.8, 0.6, 4.8, 6.2)):
        cube(f"HOME_ARCH_floor_grout_h_{idx}", (0, y, 0.018), (8.75, 0.018, 0.010), grout)

    # Narrow brass/brown rug border approximates the ornate woven edge from the master.
    rug_border = materials["brass"]
    cube("HOME_PROP_rug_border_front", (0, -2.34, 0.050), (3.52, 0.035, 0.014), rug_border)
    cube("HOME_PROP_rug_border_back", (0, 6.24, 0.050), (3.52, 0.035, 0.014), rug_border)
    cube("HOME_PROP_rug_border_left", (-3.50, 1.95, 0.050), (0.035, 4.28, 0.014), rug_border)
    cube("HOME_PROP_rug_border_right", (3.50, 1.95, 0.050), (0.035, 4.28, 0.014), rug_border)
    for idx, x in enumerate((-2.95, -2.25, -1.55, -0.85, 0.0, 0.85, 1.55, 2.25, 2.95)):
        motif = cube(f"HOME_PROP_rug_front_motif_{idx}", (x, -2.12, 0.066), (0.085, 0.085, 0.010), rug_border)
        motif.rotation_euler[2] = math.radians(45)
    for idx, x in enumerate((-2.70, -1.80, -0.90, 0.0, 0.90, 1.80, 2.70)):
        motif = cube(f"HOME_PROP_rug_inner_motif_{idx}", (x, -1.72, 0.062), (0.050, 0.050, 0.009), materials["stone_dark"])
        motif.rotation_euler[2] = math.radians(45)

    # Large canonical masses, left-to-right: fireplace, library, armor portal,
    # second fireplace, window and dungeon stair.
    for x in (-7.6, -4.8, -0.65, 2.85, 5.95, 8.25):
        cylinder(f"HOME_ARCH_column_{x}", (x, 6.55, 2.6), 0.25, 5.2, materials["stone"], vertices=40)
        cylinder(f"HOME_ARCH_column_base_{x}", (x, 6.55, 0.25), 0.4, 0.5, materials["stone_dark"], vertices=36)
        cylinder(f"HOME_ARCH_column_ring_low_{x}", (x, 6.55, 0.70), 0.31, 0.12, materials["stone_dark"], vertices=28)
        cylinder(f"HOME_ARCH_column_ring_high_{x}", (x, 6.55, 4.70), 0.31, 0.12, materials["stone_dark"], vertices=28)

    add_fireplace("fireplace_left", -3.55, materials)
    fireplace_left_origin = Vector((-3.55, 6.10, 0.35))
    for obj in list(bpy.data.objects):
        if ("fireplace_left" in obj.name) and obj.type != "LIGHT":
            obj.location = fireplace_left_origin + (obj.location - fireplace_left_origin) * 1.12
            obj.scale *= 1.12

    add_bookshelf(materials)
    library_origin = Vector((-6.55, 6.18, 2.55))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HOME_PROP_library_") or obj.name.startswith("HOME_PROP_book_"):
            obj.location = library_origin + (obj.location - library_origin) * 1.12
            obj.scale *= 1.12

    cube("HOME_PROP_armor_recess", (-4.92, 6.72, 2.46), (0.90, 0.08, 1.72), materials["dark"], bevel=0.08)
    gothic_arch("HOME_ARCH_armor_portal", -4.92, 6.18, 2.45, 2.50, 4.65, 0.18, materials["stone"])

    add_fireplace("fireplace_right", 2.72, materials)
    fireplace_origin = Vector((2.72, 6.10, 0.35))
    for obj in list(bpy.data.objects):
        if ("fireplace_right" in obj.name) and obj.type != "LIGHT":
            obj.location = fireplace_origin + (obj.location - fireplace_origin) * 1.12
            obj.scale *= 1.12
    add_point_light("HOME_LIGHT_fireplace_right_boost", (2.72, 4.78, 1.46), 165, (1.0, 0.30, 0.07), radius=1.12)
    for idx, cx in enumerate((2.10, 2.72, 3.34)):
        cube(f"HOME_PROP_fireplace_right_mantel_candle_{idx}", (cx, 5.54, 2.62), (0.055, 0.055, 0.23), materials["paper"], bevel=0.018)
        cone(f"HOME_PROP_fireplace_right_mantel_flame_{idx}", (cx, 5.54, 2.92), 0.050, 0.010, 0.17, materials["fire_hot"], vertices=12)

    cube("HOME_ARCH_window_right", (7.58, 6.62, 3.72), (1.24, 0.07, 1.86), materials["window"], bevel=0.08)
    gothic_arch("HOME_ARCH_window_right_frame", 7.58, 6.48, 2.62, 3.14, 5.22, 1.72, materials["brass"], bevel=0.12)
    for offset in (-0.48, 0.0, 0.48):
        cube(f"HOME_PROP_window_mullion_v_{offset}", (7.58 + offset * 1.28, 6.46, 3.62), (0.035, 0.045, 1.56), materials["brass"], bevel=0.012)
    for idx, z in enumerate((2.78, 3.55, 4.25)):
        cube(f"HOME_PROP_window_mullion_h_{idx}", (7.58, 6.46, z + 0.10), (1.13, 0.045, 0.030), materials["brass"], bevel=0.012)
    cube("HOME_PROP_window_sill", (7.58, 6.20, 1.80), (1.42, 0.28, 0.12), materials["stone"], bevel=0.04)
    sphere("HOME_PROP_window_moon", (8.08, 6.40, 4.48), (0.46, 0.035, 0.46), materials["moon"])

    for name, x in (("far_left", -7.55), ("center", 0.0), ("far_right", 7.55)):
        add_banner(name, x, materials)

    # The central standard is a major landmark in the approved mock.
    center_banner_objects = [
        obj for obj in list(bpy.data.objects)
        if obj.name.endswith("_center") and obj.name.startswith("HOME_PROP_banner_")
    ]
    banner_origin = Vector((0.0, 5.82, 4.55))
    for obj in center_banner_objects:
        obj.location = banner_origin + (obj.location - banner_origin) * 1.22
        obj.scale *= 1.22

    add_table_and_board(materials)
    add_armor(materials)
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HOME_PROP_armor_"):
            origin = Vector((-4.92, 5.10, 0.24))
            obj.location = origin + (obj.location - origin) * 1.34
            obj.scale *= 1.34
    add_trophy(materials)
    add_side_furnishings(materials)
    add_stairs(materials)
    add_equestrian_statue(materials)

    # Chandelier and warm pools of light.
    cylinder("HOME_PROP_chandelier_drop", (-1.05, 2.02, 5.02), 0.075, 1.62, materials["brass"])
    ring_points = [
        (-1.05 + 2.34 * math.cos(i * math.tau / 24), 2.02 + 1.42 * math.sin(i * math.tau / 24), 4.12)
        for i in range(25)
    ]
    curve_tube("HOME_PROP_chandelier_ring", ring_points, 0.060, materials["brass"])
    for idx, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        rx = 1.74 * math.cos(angle)
        ry = 2.20 + 1.18 * math.sin(angle)
        curve_tube(
            f"HOME_PROP_chandelier_chain_{idx}",
            [(-1.05, 2.02, 5.84), (rx - 1.05, ry, 4.16)],
            0.025,
            materials["brass"],
        )
    for idx in range(8):
        angle = idx * math.tau / 8.0
        cx = -1.05 + 2.16 * math.cos(angle)
        cy = 2.02 + 1.32 * math.sin(angle)
        cube(f"HOME_PROP_chandelier_candle_{idx}", (cx, cy, 4.30), (0.055, 0.055, 0.24), materials["fire_hot"])
        add_point_light(f"HOME_LIGHT_chandelier_{idx}", (cx, cy - 0.08, 4.42), 58, (1.0, 0.46, 0.16), radius=0.40)

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
        cone(f"HOME_PROP_torch_flame_{idx}", (x, 5.92, 2.82), 0.10, 0.018, 0.34, materials["fire_hot"], vertices=16)
        add_point_light(f"HOME_LIGHT_torch_{idx}", (x, 5.55, 2.85), 78, (1.0, 0.36, 0.10), radius=0.44)

    # Global lights establish readable stone/wood while practicals keep the
    # warmth local. Cool right-side fill hints at the window/exterior.
    add_area_light("HOME_LIGHT_key", (-3.8, -2.0, 6.5), 235, (0.76, 0.62, 0.48), 6.5, target=(0, 2.4, 1.6))
    add_area_light("HOME_LIGHT_fill", (5.4, 0.6, 5.0), 112, (0.14, 0.27, 0.45), 5.8, target=(1.8, 3.0, 1.8))
    add_area_light("HOME_LIGHT_back", (0, 7.0, 5.8), 220, (0.70, 0.42, 0.24), 4.2, target=(0, 2.5, 2.2))
    add_area_light("HOME_LIGHT_floor_bounce", (0, -3.2, 2.6), 105, (0.38, 0.28, 0.20), 8.0, target=(0, 1.4, 0.15))
    add_area_light("HOME_LIGHT_moon", (8.4, 4.2, 5.6), 270, (0.16, 0.34, 0.62), 4.4, target=(3.2, 2.2, 1.8))
    add_area_light("HOME_LIGHT_table_read", (0.0, -3.0, 5.8), 205, (0.86, 0.69, 0.52), 4.5, target=(0, 1.0, 1.25))
    add_area_light("HOME_LIGHT_library_read", (-4.6, 2.8, 5.4), 135, (0.78, 0.48, 0.26), 3.0, target=(-2.65, 5.9, 2.6))
    add_area_light("HOME_LIGHT_armor_rim", (4.8, 3.4, 5.2), 185, (0.38, 0.48, 0.60), 2.8, target=(1.55, 5.28, 2.4))

    # Preserve the visual richness while collapsing repeated geometry. This is
    # deliberately late so modelling stays readable and editable above.
    join_meshes("HOME_PROP_board_compact", ("HOME_PROP_board_",))
    join_meshes("HOME_PROP_white_army", ("HOME_PROP_white_",))
    join_meshes("HOME_PROP_black_army", ("HOME_PROP_black_",))
    join_meshes("HOME_PROP_library_books", ("HOME_PROP_book_",))
    join_meshes("HOME_ARCH_floor_grout_compact", ("HOME_ARCH_floor_grout_",))
    join_meshes("HOME_PROP_rug_motifs", ("HOME_PROP_rug_front_motif_", "HOME_PROP_rug_inner_motif_"))
    join_meshes("HOME_PROP_left_book_stack", ("HOME_PROP_left_book_stack_",))
    join_meshes("HOME_PROP_dungeon_gate", ("HOME_PROP_dungeon_gate_",))
    join_meshes("HOME_ARCH_dungeon_balusters", ("HOME_ARCH_dungeon_baluster_",))
    join_meshes("HOME_ARCH_dungeon_steps", ("HOME_ARCH_dungeon_step_",))
    join_meshes("HOME_PROP_chandelier_candles", ("HOME_PROP_chandelier_candle_",))
    join_meshes("HOME_PROP_fireplace_left_flames", ("HOME_PROP_fireplace_left_flame_",))
    join_meshes("HOME_PROP_fireplace_right_flames", ("HOME_PROP_fireplace_right_flame_",))
    join_meshes(
        "HOME_PROP_fireplace_right_mantel_candles",
        ("HOME_PROP_fireplace_right_mantel_candle_", "HOME_PROP_fireplace_right_mantel_flame_"),
    )
    join_meshes("HOME_PROP_torches", ("HOME_PROP_torch_",))

    camera_data = bpy.data.cameras.new("HOME_CAMERA_CANONICAL")
    camera_data.lens = 42.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new("HOME_CAMERA_CANONICAL", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (-1.10, -15.45, 4.18)
    target = (0.10, 2.62, 1.42)
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
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    reference_source = (root / args.reference).resolve()
    if not reference_source.is_file():
        raise SystemExit(f"Canonical Home reference not found: {reference_source}")
    reference = materialize_reference(reference_source, out_dir)

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
        "reference_contract": "user-approved-home-canon-2026-09-18",
        "reference_size": [width, height],
        "render_size": [render_width, render_height],
        "canon_full_size": [1672, 941],
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
        "mesh_count": sum(1 for o in bpy.data.objects if o.type == "MESH"),
        "named_groups": {
            "architecture": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_ARCH_")),
            "props": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_PROP_")),
            "lights": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_LIGHT_")),
        },
        "notes": [
            "The 2026-09-18 user-approved mock is the visual source of truth.",
            "The current runtime Home is intentionally untouched and remains the rollback baseline.",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "contract": CONTRACT,
        "output": str(out_dir),
        "objects": metadata["object_count"],
        "meshes": metadata["mesh_count"],
    }))


if __name__ == "__main__":
    main()
