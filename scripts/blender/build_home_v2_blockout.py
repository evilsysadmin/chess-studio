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
    variation=0.0,
    variation_scale=3.0,
    grain=False,
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
    if variation > 0.0:
        color_noise = nodes.new("ShaderNodeTexNoise")
        color_noise.inputs["Scale"].default_value = variation_scale
        color_noise.inputs["Detail"].default_value = 3.5
        color_noise.inputs["Roughness"].default_value = 0.68
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.26
        ramp.color_ramp.elements[1].position = 0.76
        darker = tuple(max(0.0, c * (1.0 - variation)) for c in color[:3]) + (1.0,)
        lighter = tuple(min(1.0, c * (1.0 + variation)) for c in color[:3]) + (1.0,)
        ramp.color_ramp.elements[0].color = darker
        ramp.color_ramp.elements[1].color = lighter
        links.new(color_noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if grain:
        texcoord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.vector_type = "POINT"
        mapping.inputs["Scale"].default_value = (1.0, 7.0, 7.0)
        grain_noise = nodes.new("ShaderNodeTexNoise")
        grain_noise.inputs["Scale"].default_value = 3.8
        grain_noise.inputs["Detail"].default_value = 5.0
        grain_noise.inputs["Roughness"].default_value = 0.70
        if "Distortion" in grain_noise.inputs:
            grain_noise.inputs["Distortion"].default_value = 0.28
        grain_ramp = nodes.new("ShaderNodeValToRGB")
        grain_ramp.color_ramp.elements[0].position = 0.22
        grain_ramp.color_ramp.elements[1].position = 0.80
        grain_ramp.color_ramp.elements[0].color = tuple(max(0.0, c * 0.48) for c in color[:3]) + (1.0,)
        grain_ramp.color_ramp.elements[1].color = tuple(min(1.0, c * 1.72) for c in color[:3]) + (1.0,)
        links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], grain_noise.inputs["Vector"])
        links.new(grain_noise.outputs["Fac"], grain_ramp.inputs["Fac"])
        links.new(grain_ramp.outputs["Color"], bsdf.inputs["Base Color"])
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


def smooth_curved_mesh(obj, *, keep_axial_caps_flat=False) -> None:
    """Export clean normals without rounding intentionally planar caps."""
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        if keep_axial_caps_flat and abs(poly.normal.z) > 0.95:
            poly.use_smooth = False
        else:
            poly.use_smooth = True


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
    smooth_curved_mesh(obj, keep_axial_caps_flat=True)
    apply_material(obj, mat)
    return obj


def sphere(name: str, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth_curved_mesh(obj)
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
    smooth_curved_mesh(obj, keep_axial_caps_flat=True)
    apply_material(obj, mat)
    return obj


def add_simple_piece(name: str, x: float, y: float, z: float, mat, kind: str):
    """Build a readable stylised tournament piece at Home-camera distance."""
    profiles = {
        "pawn": (0.085, 0.055, 0.20, 0.085, 0.26),
        "rook": (0.10, 0.075, 0.27, 0.10, 0.30),
        "knight": (0.10, 0.055, 0.29, 0.105, 0.33),
        "bishop": (0.09, 0.045, 0.32, 0.09, 0.36),
        "queen": (0.105, 0.055, 0.38, 0.11, 0.43),
        "king": (0.11, 0.06, 0.42, 0.11, 0.47),
    }
    r1, r2, depth, head, height = profiles[kind]
    piece_scale = 1.12
    r1 *= piece_scale
    r2 *= piece_scale
    depth *= piece_scale
    head *= piece_scale
    height *= piece_scale

    # Shared turned base. Two stepped rings give every piece a deliberate
    # carved silhouette instead of the old cone+sphere placeholder.
    cylinder(f"{name}_foot", (x, y, z + 0.025), r1 * 1.28, 0.050, mat, vertices=28)
    cylinder(f"{name}_base", (x, y, z + 0.066), r1 * 1.12, 0.045, mat, vertices=28)
    cone(f"{name}_body", (x, y, z + depth / 2 + 0.075), r1, r2, depth, mat, vertices=28)
    cylinder(f"{name}_collar", (x, y, z + depth + 0.080), r2 * 1.34, 0.038, mat, vertices=24)

    if kind == "pawn":
        sphere(f"{name}_head", (x, y, z + height + 0.025), (head, head, head), mat)
        return

    if kind == "rook":
        crown_z = z + height + 0.050
        cylinder(f"{name}_crown", (x, y, crown_z), head * 1.16, 0.105, mat, vertices=20)
        for idx, (dx, dy) in enumerate((
            (-head * 0.74, -head * 0.74),
            (head * 0.74, -head * 0.74),
            (-head * 0.74, head * 0.74),
            (head * 0.74, head * 0.74),
        )):
            cube(
                f"{name}_merlon_{idx}",
                (x + dx, y + dy, crown_z + 0.075),
                (head * 0.28, head * 0.28, 0.055),
                mat,
                bevel=0.012,
            )
        return

    if kind == "knight":
        # Side-profile horse heads are intentionally oriented toward board
        # centre so their silhouette survives the fixed frontal Home camera.
        facing = -1.0 if x >= 0.0 else 1.0
        neck = cone(
            f"{name}_neck",
            (x, y, z + height - 0.010),
            head * 0.72,
            head * 0.48,
            0.23,
            mat,
            vertices=22,
        )
        neck.rotation_euler[1] = math.radians(18.0 * facing)
        sphere(
            f"{name}_head",
            (x + facing * head * 0.38, y, z + height + 0.105),
            (head * 0.92, head * 0.70, head * 0.78),
            mat,
        )
        sphere(
            f"{name}_muzzle",
            (x + facing * head * 1.12, y, z + height + 0.055),
            (head * 0.72, head * 0.54, head * 0.42),
            mat,
        )
        for ear_idx, ex in enumerate((-0.30, 0.18)):
            ear = cone(
                f"{name}_ear_{ear_idx}",
                (x + facing * head * ex, y, z + height + 0.225),
                head * 0.22,
                0.006,
                0.105,
                mat,
                vertices=12,
            )
            ear.rotation_euler[1] = math.radians(-8.0 * facing)
        return

    if kind == "bishop":
        sphere(
            f"{name}_head",
            (x, y, z + height + 0.010),
            (head * 0.76, head * 0.76, head * 0.92),
            mat,
        )
        mitre = cone(
            f"{name}_mitre",
            (x, y, z + height + 0.105),
            head * 0.50,
            0.008,
            0.155,
            mat,
            vertices=20,
        )
        mitre.rotation_euler[1] = math.radians(7.0)
        return

    if kind == "queen":
        crown_z = z + height + 0.010
        sphere(f"{name}_head", (x, y, crown_z), (head * 0.76, head * 0.76, head * 0.76), mat)
        cylinder(f"{name}_crown_ring", (x, y, crown_z + 0.090), head * 1.02, 0.040, mat, vertices=20)
        for idx in range(6):
            angle = idx * math.tau / 6.0
            sphere(
                f"{name}_crown_bead_{idx}",
                (
                    x + math.cos(angle) * head * 0.78,
                    y + math.sin(angle) * head * 0.78,
                    crown_z + 0.135,
                ),
                (head * 0.18, head * 0.18, head * 0.18),
                mat,
            )
        sphere(f"{name}_finial", (x, y, crown_z + 0.175), (head * 0.22, head * 0.22, head * 0.22), mat)
        return

    # King: compact orb plus a crisp cross, visibly taller than the queen.
    sphere(f"{name}_head", (x, y, z + height), (head * 0.72, head * 0.72, head * 0.72), mat)
    cube(f"{name}_cross_v", (x, y, z + height + 0.145), (0.023, 0.023, 0.105), mat, bevel=0.010)
    cube(f"{name}_cross_h", (x, y, z + height + 0.175), (0.073, 0.023, 0.023), mat, bevel=0.010)


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


def gothic_arch(name: str, x: float, y: float, width: float, shoulder_z: float, top_z: float, bottom_z: float, mat, *, bevel=0.13):
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


def configure_cinematic_compositor(scene) -> None:
    """Add restrained practical-light halo using Blender 5.x compositor API."""
    if bpy.app.version < (5, 0, 0):
        raise RuntimeError("Canonical Home preview requires Blender 5.x compositor API")

    tree = bpy.data.node_groups.new("HOME_COMPOSITOR_CINEMATIC", "CompositorNodeTree")
    scene.compositing_node_group = tree
    tree.interface.new_socket(
        name="Image",
        in_out="OUTPUT",
        socket_type="NodeSocketColor",
    )

    nodes = tree.nodes
    links = tree.links
    layers = nodes.new("CompositorNodeRLayers")
    glare = nodes.new("CompositorNodeGlare")
    output = nodes.new("NodeGroupOutput")

    glare.inputs["Type"].default_value = "Fog Glow"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = 1.15
    glare.inputs["Size"].default_value = 0.68
    glare.inputs["Strength"].default_value = 0.40

    links.new(layers.outputs["Image"], glare.inputs["Image"])
    links.new(glare.outputs["Image"], output.inputs["Image"])

    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = True


def add_table_and_board(materials):
    wood = materials["wood"]
    dark = materials["board_dark"]
    light = materials["board_light"]
    metal = materials["brass"]
    heraldry = materials["heraldry_gold"]
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
            cylinder(f"HOME_PROP_table_leg_foot_{x}_{y}", (x, y, 0.14), 0.22, 0.12, wood, vertices=20)
    for side in (-1, 1):
        panel_x = side * 2.58
        cube(f"HOME_PROP_table_front_panel_{side}", (panel_x, -0.70, 0.76), (0.48, 0.055, 0.30), materials["wood"], bevel=0.055)
        cube(
            f"HOME_PROP_table_front_panel_inset_{side}",
            (panel_x, -0.765, 0.76),
            (0.37, 0.014, 0.205),
            materials["dark"],
            bevel=0.032,
        )
        cube(
            f"HOME_PROP_table_front_panel_trim_top_{side}",
            (panel_x, -0.784, 0.985),
            (0.39, 0.010, 0.018),
            materials["brass_dark"],
            bevel=0.008,
        )
        cube(
            f"HOME_PROP_table_front_panel_trim_bottom_{side}",
            (panel_x, -0.784, 0.535),
            (0.39, 0.010, 0.018),
            materials["brass_dark"],
            bevel=0.008,
        )
        sphere(f"HOME_PROP_table_front_rosette_{side}", (panel_x, -0.80, 0.77), (0.082, 0.022, 0.082), materials["gold"])
        leg_x = side * 3.12
        cube(f"HOME_PROP_table_front_leg_plinth_{side}", (leg_x, -0.40, 0.24), (0.26, 0.28, 0.18), wood, bevel=0.045)
        cube(f"HOME_PROP_table_front_leg_shaft_{side}", (leg_x, -0.40, 0.58), (0.18, 0.20, 0.28), wood, bevel=0.05)
        cube(f"HOME_PROP_table_front_leg_capital_{side}", (leg_x, -0.40, 0.91), (0.28, 0.28, 0.11), wood, bevel=0.045)
        cylinder(f"HOME_PROP_table_front_leg_band_{side}", (leg_x, -0.40, 0.69), 0.22, 0.055, materials["gold"], vertices=18)

    # The canonical board nearly fills the table width; the earlier blockout
    # made it read like a travel set.
    square = 0.54
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
    for idx, (bx, by) in enumerate((
        (-board_half + 0.055, table_y - board_half + 0.055),
        (board_half - 0.055, table_y - board_half + 0.055),
        (-board_half + 0.055, table_y + board_half - 0.055),
        (board_half - 0.055, table_y + board_half - 0.055),
    )):
        sphere(
            f"HOME_PROP_board_corner_boss_{idx}",
            (bx, by, table_z + 0.190),
            (0.055, 0.055, 0.026),
            materials["brass_dark"],
        )

    # The frontal cloth is one of the master image's strongest silhouettes.
    # Pull it forward so it cannot disappear inside the table and give it the
    # canonical pointed lower edge plus a narrow brass backing/trim.
    drape_points = [
        (-1.72, 1.26),
        (1.72, 1.26),
        (1.72, 0.28),
        (0.0, 0.04),
        (-1.72, 0.28),
    ]
    flat_panel("HOME_PROP_table_banner_trim", drape_points, -0.68, 0.08, metal, bevel=0.045)
    flat_panel(
        "HOME_PROP_table_banner",
        [(x * 0.975, 0.65 + (z - 0.65) * 0.96) for x, z in drape_points],
        -0.725,
        0.055,
        banner,
        bevel=0.035,
    )
    curve_tube(
        "HOME_PROP_table_banner_gold_border",
        [
            (-1.60, -0.790, 1.17),
            (-1.60, -0.790, 0.30),
            (0.0, -0.790, 0.08),
            (1.60, -0.790, 0.30),
            (1.60, -0.790, 1.17),
        ],
        0.028,
        heraldry,
    )
    for idx, x in enumerate((-1.35, -0.90, -0.45, 0.0, 0.45, 0.90, 1.35)):
        sphere(
            f"HOME_PROP_table_banner_stud_{idx}",
            (x, -0.802, 1.16),
            (0.028, 0.014, 0.028),
            heraldry,
        )

    # Large canonical horse-head relief on the table drape.
    emblem_y = -0.790
    horse_points = [
        (-0.22, 1.08), (-0.08, 1.02), (0.02, 0.92), (0.16, 0.86),
        (0.22, 0.72), (0.16, 0.58), (0.25, 0.46), (0.18, 0.30),
        (0.28, 0.16), (0.04, 0.16), (-0.10, 0.28), (-0.20, 0.42),
        (-0.34, 0.52), (-0.52, 0.56), (-0.68, 0.68), (-0.62, 0.78),
        (-0.44, 0.80), (-0.30, 0.90),
    ]
    flat_panel(
        "HOME_PROP_table_horse_silhouette",
        [(x * 0.84 + 0.02, (z - 0.58) * 0.84 + 0.67) for x, z in horse_points],
        emblem_y,
        0.040,
        heraldry,
        bevel=0.018,
    )
    cone("HOME_PROP_table_horse_ear", (-0.13, emblem_y - 0.035, 1.03), 0.045, 0.006, 0.14, heraldry, vertices=12)
    for idx, (mx, mz) in enumerate(((0.10, 0.82), (0.16, 0.68), (0.18, 0.54))):
        cone(f"HOME_PROP_table_horse_mane_{idx}", (mx, emblem_y - 0.035, mz), 0.046, 0.006, 0.125, heraldry, vertices=10)
    sphere("HOME_PROP_table_horse_eye", (-0.23, emblem_y - 0.055, 0.79), (0.013, 0.009, 0.013), materials["dark"])
    curve_tube(
        "HOME_PROP_table_horse_jaw_line",
        [(-0.44, emblem_y - 0.058, 0.67), (-0.29, emblem_y - 0.060, 0.56), (-0.08, emblem_y - 0.060, 0.53)],
        0.018,
        materials["dark"],
    )
    curve_tube(
        "HOME_PROP_table_horse_mane_line",
        [(0.02, emblem_y - 0.058, 0.94), (0.12, emblem_y - 0.060, 0.79), (0.09, emblem_y - 0.060, 0.63)],
        0.016,
        materials["dark"],
    )
    cube("HOME_PROP_table_mark_v", (0.0, emblem_y, 0.17), (0.032, 0.024, 0.095), heraldry, bevel=0.01)
    cube("HOME_PROP_table_mark_h", (0.0, emblem_y, 0.20), (0.085, 0.024, 0.030), heraldry, bevel=0.01)

    # Canonical lived-in table props, kept outside the board interaction footprint.
    for idx, (px, py, pz) in enumerate(((-2.55, 0.20, 1.36), (-2.48, 0.18, 1.45), (-2.58, 0.18, 1.54))):
        book_half_w = 0.42 - idx * 0.04
        cube(
            f"HOME_PROP_table_book_{idx}",
            (px, py, pz),
            (book_half_w, 0.26, 0.040),
            materials["book_brown"] if idx != 1 else materials["book_green"],
            bevel=0.025,
        )
        cube(
            f"HOME_PROP_table_book_pages_{idx}",
            (px, py - 0.267, pz),
            (book_half_w * 0.84, 0.010, 0.026),
            materials["paper"],
            bevel=0.008,
        )
    cylinder("HOME_PROP_table_candle_base", (-2.72, 1.60, 1.36), 0.14, 0.06, metal, vertices=20)
    cylinder("HOME_PROP_table_candle", (-2.72, 1.60, 1.55), 0.045, 0.30, materials["wax"], vertices=18)
    cone("HOME_PROP_table_candle_flame", (-2.72, 1.60, 1.76), 0.030, 0.006, 0.10, materials["fire_hot"], vertices=12)
    add_point_light("HOME_LIGHT_table_candle", (-2.72, 1.40, 1.88), 70, (1.0, 0.50, 0.22), radius=0.34)

    cube("HOME_PROP_table_folio", (2.72, 0.35, 1.37), (0.38, 0.28, 0.045), materials["book_brown"], bevel=0.030)
    cube(
        "HOME_PROP_table_folio_pages",
        (2.72, 0.315, 1.405),
        (0.32, 0.235, 0.015),
        materials["paper"],
        bevel=0.018,
    )
    cube(
        "HOME_PROP_table_folio_spine",
        (2.37, 0.35, 1.39),
        (0.035, 0.26, 0.050),
        materials["brass_dark"],
        bevel=0.012,
    )
    cube(
        "HOME_PROP_table_folio_clasp",
        (2.95, 0.055, 1.415),
        (0.055, 0.020, 0.022),
        materials["brass"],
        bevel=0.008,
    )
    cylinder("HOME_PROP_table_hourglass_top", (-2.10, 2.05, 1.56), 0.12, 0.045, metal, vertices=18)
    cylinder("HOME_PROP_table_hourglass_bottom", (-2.10, 2.05, 1.34), 0.12, 0.045, metal, vertices=18)
    sphere(
        "HOME_PROP_table_hourglass_glass_top",
        (-2.10, 2.05, 1.49),
        (0.075, 0.050, 0.075),
        materials["window"],
    )
    sphere(
        "HOME_PROP_table_hourglass_glass_bottom",
        (-2.10, 2.05, 1.41),
        (0.075, 0.050, 0.075),
        materials["window"],
    )
    cone(
        "HOME_PROP_table_hourglass_sand",
        (-2.10, 2.02, 1.405),
        0.055,
        0.016,
        0.060,
        materials["gold"],
        vertices=16,
    )
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
        cube(
            f"HOME_PROP_bench_cushion_{side}",
            (x, 0.98, 0.74),
            (0.69, 1.55, 0.20),
            materials["bench_velvet"],
            bevel=0.12,
        )
        for by in (0.08, 2.32):
            for dx in (-0.40, 0.40):
                bx = x + dx
                cube(f"HOME_PROP_bench_leg_{side}_{dx}_{by}", (bx, by, 0.26), (0.10, 0.10, 0.26), wood, bevel=0.03)
                cylinder(f"HOME_PROP_bench_foot_{side}_{dx}_{by}", (bx, by, 0.05), 0.12, 0.10, materials["dark"], vertices=16)
        for tuft in (-0.72, 0.0, 0.72):
            sphere(f"HOME_PROP_bench_tuft_{side}_{tuft}", (x, 1.2 + tuft, 0.91), (0.07, 0.035, 0.035), materials["dark"])
        for stud, sy in enumerate((-0.88, -0.48, -0.08, 0.32, 0.72, 1.12, 1.52)):
            sphere(
                f"HOME_PROP_bench_front_button_{side}_{stud}",
                (x - side * 0.70, 0.80 + sy, 0.72),
                (0.027, 0.027, 0.027),
                materials["gold"],
            )

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
    cube(f"HOME_PROP_{name}_firebox_back", (x, 6.585, 1.22), (0.92, 0.025, 0.74), materials["soot_stone"], bevel=0.045)
    for course, z in enumerate((0.66, 0.94, 1.22, 1.50, 1.78)):
        cube(
            f"HOME_PROP_{name}_firebox_course_{course}",
            (x, 6.552, z),
            (0.86, 0.012, 0.010),
            materials["stone_dark"],
        )
        offset = 0.24 if course % 2 else -0.24
        for joint, jx in enumerate((-0.52, 0.0, 0.52)):
            cube(
                f"HOME_PROP_{name}_firebox_joint_{course}_{joint}",
                (x + jx + offset, 6.548, z + 0.13),
                (0.010, 0.012, 0.11),
                materials["stone_dark"],
            )
    cube(f"HOME_PROP_{name}_hearth", (x, 6.52, 0.88), (1.15, 0.10, 0.88), dark, bevel=0.05)
    cube(f"HOME_PROP_{name}_hearth_slab", (x, 5.62, 0.28), (1.42, 0.46, 0.12), stone, bevel=0.05)
    for side in (-1, 1):
        cube(f"HOME_PROP_{name}_jamb_{side}", (x + side * 1.18, 6.02, 1.20), (0.18, 0.34, 1.15), stone, bevel=0.05)
        cube(f"HOME_PROP_{name}_corbel_{side}", (x + side * 1.22, 5.82, 1.95), (0.24, 0.28, 0.18), stone, bevel=0.05)
    cube(f"HOME_PROP_{name}_mantel", (x, 5.83, 1.88), (1.55, 0.24, 0.16), stone, bevel=0.04)
    gothic_arch(f"HOME_ARCH_{name}_alcove", x, 6.18, 2.9, 2.62, 4.72, 0.12, materials["arch_stone"])
    for bar in (-0.54, -0.18, 0.18, 0.54):
        cube(f"HOME_PROP_{name}_grate_{bar}", (x + bar, 5.56, 0.76), (0.028, 0.035, 0.48), materials["steel"], bevel=0.01)
    cube(f"HOME_PROP_{name}_grate_cross", (x, 5.55, 0.62), (0.72, 0.035, 0.025), materials["steel"], bevel=0.01)
    hot = materials["fire_hot"]
    cube(f"HOME_PROP_{name}_embers", (x, 5.65, 0.58), (0.88, 0.07, 0.08), fire, bevel=0.06)
    flame_offsets = (-0.54, -0.28, 0.00, 0.27, 0.52)
    flame_heights = (0.38, 0.56, 0.70, 0.48, 0.34)
    flame_leans = (-0.05, 0.06, -0.02, 0.07, -0.05)
    for idx, (offset, height, lean) in enumerate(zip(flame_offsets, flame_heights, flame_leans)):
        cx = x + offset
        base = 0.58
        width = 0.16 + 0.018 * (idx % 2)
        outer_points = [
            (cx - width, base),
            (cx - width * 0.78, base + height * 0.24),
            (cx - width * 0.44, base + height * 0.45),
            (cx - width * 0.24, base + height * 0.70),
            (cx + lean, base + height),
            (cx + width * 0.34, base + height * 0.62),
            (cx + width * 0.72, base + height * 0.30),
            (cx + width, base),
        ]
        flat_panel(
            f"HOME_PROP_{name}_flame_{idx}",
            outer_points,
            5.585,
            0.035,
            fire,
            bevel=0.022,
        )
        inner_h = height * (0.48 if idx != 2 else 0.60)
        inner_w = width * 0.48
        inner_points = [
            (cx - inner_w, base),
            (cx - inner_w * 0.55, base + inner_h * 0.34),
            (cx + lean * 0.45, base + inner_h),
            (cx + inner_w * 0.58, base + inner_h * 0.32),
            (cx + inner_w, base),
        ]
        flat_panel(
            f"HOME_PROP_{name}_flame_hot_{idx}",
            inner_points,
            5.545,
            0.030,
            hot,
            bevel=0.016,
        )
    add_point_light(f"HOME_LIGHT_{name}", (x, 5.34, 1.20), 390, (1.0, 0.24, 0.045), radius=1.10)


def add_bookshelf(materials):
    wood = materials["wood"]
    brass = materials["brass"]
    x, y = -2.65, 6.20
    cube("HOME_PROP_library_back", (x, y, 2.55), (1.70, 0.34, 2.48), materials["dark"], bevel=0.05)
    cube("HOME_PROP_library_frame", (x, y - 0.22, 2.55), (1.58, 0.22, 2.38), wood, bevel=0.06)
    for idx, z in enumerate((0.55, 1.25, 1.95, 2.65, 3.35, 4.05, 4.75)):
        cube(f"HOME_PROP_library_shelf_{idx}", (x, y - 0.42, z), (1.55, 0.12, 0.075), wood, bevel=0.025)
    for side in (-1, 1):
        cube(f"HOME_PROP_library_post_{side}", (x + side * 1.34, y - 0.31, 2.35), (0.11, 0.13, 2.25), wood, bevel=0.025)
        cylinder(f"HOME_PROP_library_post_band_{side}", (x + side * 1.34, y - 0.46, 2.42), 0.14, 0.055, brass, vertices=16)
    cube("HOME_PROP_library_cabinet", (x, y - 0.38, 0.46), (1.48, 0.24, 0.40), wood, bevel=0.05)
    for side in (-1, 1):
        cube(f"HOME_PROP_library_door_{side}", (x + side * 0.72, y - 0.64, 0.46), (0.62, 0.035, 0.32), materials["wood"], bevel=0.035)
        sphere(f"HOME_PROP_library_handle_{side}", (x + side * 0.16, y - 0.69, 0.46), (0.035, 0.018, 0.035), brass)
    # Book masses only: enough to match the canonical silhouette before detailing.
    book_colors = (materials["book_red"], materials["book_green"], materials["book_brown"], materials["book_olive"])
    for row, z in enumerate((0.82, 1.5, 2.18, 2.86, 3.54, 4.16)):
        for col in range(9):
            bx = x - 1.15 + col * 0.285
            h = 0.18 + 0.030 * ((row * 2 + col) % 4)
            w = 0.070 + 0.012 * ((row + col) % 3)
            book = cube(
                f"HOME_PROP_book_{row}_{col}",
                (bx, y - 0.47, z),
                (w, 0.075, h),
                book_colors[(row + col * 2) % len(book_colors)],
                bevel=0.008,
            )
            book.rotation_euler[1] = math.radians((-3, 1, 0, 2, -1)[(row + col) % 5])
            if (row * 9 + col) % 7 == 0:
                cube(
                    f"HOME_PROP_book_band_{row}_{col}",
                    (bx, y - 0.552, z + h * 0.42),
                    (w * 0.94, 0.010, 0.012),
                    brass,
                    bevel=0.004,
                )

    # Break the shelf grid with a few deliberate horizontal stacks and bookends.
    for idx, (sx, sz, width, tone) in enumerate((
        (x - 0.86, 1.84, 0.34, materials["book_brown"]),
        (x + 0.14, 3.22, 0.30, materials["book_green"]),
        (x - 0.38, 4.54, 0.28, materials["book_red"]),
    )):
        for layer in range(2):
            cube(
                f"HOME_PROP_library_horizontal_book_{idx}_{layer}",
                (sx + 0.035 * layer, y - 0.55, sz + 0.045 * layer),
                (width, 0.085, 0.026),
                tone if layer == 0 else materials["book_olive"],
                bevel=0.010,
            )
    for idx, (bx, bz) in enumerate(((x - 1.28, 2.18), (x + 1.26, 3.54))):
        cube(
            f"HOME_PROP_library_bookend_{idx}",
            (bx, y - 0.57, bz),
            (0.035, 0.070, 0.18),
            materials["brass_dark"],
            bevel=0.012,
        )
        cube(
            f"HOME_PROP_library_bookend_foot_{idx}",
            (bx, y - 0.56, bz - 0.17),
            (0.11, 0.085, 0.025),
            brass,
            bevel=0.010,
        )

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
    cube("HOME_PROP_library_crown", (x, y - 0.32, 4.92), (1.62, 0.18, 0.12), wood, bevel=0.04)
    for side in (-1, 1):
        sphere(f"HOME_PROP_library_finial_{side}", (x + side * 1.28, y - 0.46, 5.08), (0.10, 0.07, 0.10), brass)


def add_banner(name: str, x: float, materials):
    banner = materials["wall_banner"]
    brass = materials["brass"]
    gold = materials["brass_dark"]
    points = [
        (x - 0.48, 5.62),
        (x + 0.48, 5.62),
        (x + 0.48, 3.84),
        (x, 3.44),
        (x - 0.48, 3.84),
    ]
    flat_panel(f"HOME_PROP_banner_{name}", points, 5.82, 0.08, banner, bevel=0.028)
    cube(f"HOME_PROP_banner_bar_{name}", (x, 5.72, 5.70), (0.60, 0.07, 0.045), brass, bevel=0.015)
    for side in (-1, 1):
        sphere(
            f"HOME_PROP_banner_bar_finial_{name}_{side}",
            (x + side * 0.64, 5.72, 5.70),
            (0.065, 0.050, 0.065),
            materials["brass_dark"],
        )

    relief_y = 5.73
    sphere(f"HOME_PROP_banner_horse_head_{name}", (x - 0.06, relief_y, 4.77), (0.20, 0.040, 0.17), gold)
    cube(f"HOME_PROP_banner_horse_muzzle_{name}", (x - 0.19, relief_y, 4.72), (0.09, 0.028, 0.045), gold, bevel=0.018)
    curve_tube(
        f"HOME_PROP_banner_horse_neck_{name}",
        [(x + 0.01, relief_y, 4.69), (x + 0.10, relief_y, 4.48), (x + 0.04, relief_y, 4.29)],
        0.070,
        gold,
    )
    cone(f"HOME_PROP_banner_horse_ear_{name}", (x - 0.09, relief_y, 4.95), 0.045, 0.012, 0.18, gold, vertices=12)
    for idx, (mx, mz) in enumerate(((x + 0.01, 4.82), (x + 0.06, 4.68), (x + 0.09, 4.54))):
        cone(f"HOME_PROP_banner_horse_mane_{name}_{idx}", (mx, relief_y, mz), 0.040, 0.008, 0.12, gold, vertices=10)
    cube(f"HOME_PROP_banner_mark_v_{name}", (x, relief_y, 3.84), (0.035, 0.022, 0.18), gold, bevel=0.01)
    cube(f"HOME_PROP_banner_mark_h_{name}", (x, relief_y, 3.91), (0.12, 0.022, 0.035), gold, bevel=0.01)


def add_armor(materials):
    steel = materials["armor_steel"]
    brass = materials["brass"]
    stone = materials["stone"]
    dark = materials["dark"]
    x, y = 1.55, 5.28

    cube("HOME_PROP_armor_pedestal", (x, y, 0.24), (0.72, 0.54, 0.24), stone, bevel=0.05)

    # Humanoid stance: two distinct greaves instead of the old single pawn-like
    # cylinder, plus pelvis, tapered cuirass and articulated limbs.
    for side in (-1, 1):
        lx = x + side * 0.19
        cube(f"HOME_PROP_armor_boot_{side}", (lx, y - 0.05, 0.58), (0.16, 0.24, 0.12), steel, bevel=0.05)
        cone(f"HOME_PROP_armor_greave_{side}", (lx, y, 0.98), 0.15, 0.11, 0.70, steel, vertices=24)
        sphere(f"HOME_PROP_armor_knee_{side}", (lx, y - 0.01, 1.30), (0.135, 0.095, 0.090), steel)
        cone(f"HOME_PROP_armor_thigh_{side}", (lx, y, 1.55), 0.15, 0.19, 0.48, steel, vertices=24)

    cube("HOME_PROP_armor_pelvis", (x, y, 1.78), (0.35, 0.24, 0.18), steel, bevel=0.08)
    cone("HOME_PROP_armor_cuirass", (x, y, 2.14), 0.50, 0.37, 0.72, steel, vertices=28)
    cube("HOME_PROP_armor_belt", (x, y - 0.03, 1.84), (0.40, 0.25, 0.07), brass, bevel=0.03)

    sphere("HOME_PROP_armor_shoulder_l", (x - 0.50, y - 0.015, 2.34), (0.220, 0.120, 0.080), steel)
    sphere("HOME_PROP_armor_shoulder_r", (x + 0.50, y - 0.015, 2.34), (0.220, 0.120, 0.080), steel)
    curve_tube("HOME_PROP_armor_left_arm", [(x - 0.50, y, 2.27), (x - 0.66, y, 1.98), (x - 0.60, y - 0.02, 1.65)], 0.070, steel)
    curve_tube("HOME_PROP_armor_right_arm", [(x + 0.50, y, 2.27), (x + 0.66, y, 1.98), (x + 0.60, y - 0.02, 1.65)], 0.070, steel)
    sphere("HOME_PROP_armor_gauntlet_l", (x - 0.60, y - 0.02, 1.61), (0.090, 0.078, 0.092), steel)
    sphere("HOME_PROP_armor_gauntlet_r", (x + 0.60, y - 0.02, 1.61), (0.090, 0.078, 0.092), steel)

    # Helmet with neck gap and a face slit, much closer to the canonical suit
    # of armour silhouette than a round pawn head.
    cylinder("HOME_PROP_armor_neck", (x, y, 2.58), 0.15, 0.20, dark, vertices=20)
    sphere("HOME_PROP_armor_helmet", (x, y, 2.85), (0.27, 0.245, 0.34), steel)
    cube("HOME_PROP_armor_visor", (x, y - 0.265, 2.82), (0.205, 0.040, 0.042), dark, bevel=0.012)
    for slot, sx in enumerate((-0.11, -0.055, 0.0, 0.055, 0.11)):
        cube(f"HOME_PROP_armor_visor_slot_{slot}", (x + sx, y - 0.308, 2.82), (0.012, 0.008, 0.018), dark, bevel=0.004)
    cube("HOME_PROP_armor_brow", (x, y - 0.282, 2.94), (0.22, 0.032, 0.026), materials["brass_dark"], bevel=0.012)
    sphere("HOME_PROP_armor_helmet_crest", (x, y + 0.01, 3.12), (0.075, 0.060, 0.095), steel)
    # Layered Gothic plate details stop the focal suit reading as a silver robot.
    cylinder("HOME_PROP_armor_gorget", (x, y - 0.015, 2.56), 0.245, 0.105, brass, vertices=28)
    cube("HOME_PROP_armor_visor_edge", (x, y - 0.318, 2.845), (0.255, 0.012, 0.020), brass, bevel=0.006)
    for side in (-1, 1):
        cube(
            f"HOME_PROP_armor_pauldron_ridge_{side}",
            (x + side * 0.50, y - 0.055, 2.39),
            (0.215, 0.045, 0.042),
            brass,
            bevel=0.020,
        )
        cube(
            f"HOME_PROP_armor_tasset_{side}",
            (x + side * 0.245, y - 0.075, 1.73),
            (0.18, 0.11, 0.26),
            steel,
            bevel=0.055,
        )
        sphere(
            f"HOME_PROP_armor_tasset_rivet_{side}",
            (x + side * 0.245, y - 0.205, 1.78),
            (0.034, 0.016, 0.034),
            brass,
        )
    curve_tube(
        "HOME_PROP_armor_breastplate_ridge",
        [(x, y - 0.255, 1.93), (x, y - 0.315, 2.20), (x, y - 0.245, 2.47)],
        0.026,
        brass,
    )
    for side in (-1, 1):
        curve_tube(
            f"HOME_PROP_armor_breastplate_flute_{side}",
            [
                (x + side * 0.24, y - 0.245, 1.98),
                (x + side * 0.17, y - 0.300, 2.20),
                (x + side * 0.21, y - 0.235, 2.42),
            ],
            0.014,
            materials["brass_dark"],
        )
    sphere(
        "HOME_PROP_armor_breastplate_boss",
        (x, y - 0.340, 2.20),
        (0.070, 0.020, 0.070),
        brass,
    )

    # Weapon rack frames the armour without becoming part of its body.
    for idx, wx in enumerate((x - 0.88, x - 0.68, x + 0.68, x + 0.88)):
        curve_tube(
            f"HOME_PROP_armor_weapon_{idx}",
            [(wx, y + 0.10, 0.45), (wx, y + 0.08, 3.48)],
            0.030,
            dark,
        )
        cone(
            f"HOME_PROP_armor_weapon_tip_{idx}",
            (wx, y + 0.08, 3.63),
            0.075 if idx % 2 == 0 else 0.060,
            0.008,
            0.30 if idx % 2 == 0 else 0.24,
            steel if idx % 2 == 0 else brass,
            vertices=14,
        )
        cube(
            f"HOME_PROP_armor_weapon_guard_{idx}",
            (wx, y + 0.075, 3.39),
            (0.12 if idx % 2 == 0 else 0.09, 0.020, 0.020),
            brass if idx % 2 == 0 else steel,
            bevel=0.008,
        )


def add_trophy(materials):
    brass = materials["brass"]
    wood = materials["wood"]
    x, y = -3.45, 5.76
    cube("HOME_PROP_trophy_shelf", (x, y, 2.78), (0.56, 0.22, 0.08), wood, bevel=0.025)
    cylinder("HOME_PROP_trophy_stem", (x, y - 0.18, 3.05), 0.07, 0.34, brass)
    cylinder("HOME_PROP_trophy_foot", (x, y - 0.18, 2.90), 0.18, 0.08, materials["brass_dark"], vertices=20)
    cone("HOME_PROP_trophy_cup", (x, y - 0.18, 3.34), 0.18, 0.30, 0.30, brass, vertices=28)
    cylinder("HOME_PROP_trophy_rim", (x, y - 0.18, 3.50), 0.32, 0.045, materials["gold"], vertices=28)
    sphere("HOME_PROP_trophy_finial", (x, y - 0.18, 3.56), (0.055, 0.045, 0.045), materials["gold"])
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
    cube("HOME_PROP_left_sofa_base", (-6.72, -0.05, 0.42), (1.55, 1.05, 0.40), leather, bevel=0.14)
    cube("HOME_PROP_left_sofa_back", (-7.39, 0.58, 1.32), (0.22, 1.02, 0.92), leather, bevel=0.12)
    cube("HOME_PROP_left_sofa_arm", (-5.45, -0.02, 0.80), (0.22, 0.95, 0.48), leather, bevel=0.11)
    cube("HOME_PROP_left_sofa_arm_outer", (-7.39, -0.02, 0.80), (0.22, 0.95, 0.48), leather, bevel=0.11)
    for idx, sx in enumerate((-7.78, -5.70)):
        sphere(
            f"HOME_PROP_left_sofa_front_foot_{idx}",
            (sx, -1.115, 0.20),
            (0.105, 0.075, 0.155),
            wood,
        )
        sphere(
            f"HOME_PROP_left_sofa_front_foot_cap_{idx}",
            (sx, -1.125, 0.33),
            (0.075, 0.060, 0.050),
            materials["brass_dark"],
        )
    for idx, sx in enumerate((-7.82, -7.48, -7.14, -6.80, -6.46, -6.12, -5.78)):
        sphere(
            f"HOME_PROP_left_sofa_front_stud_{idx}",
            (sx, -1.085, 0.56),
            (0.032, 0.018, 0.032),
            materials["brass_dark"],
        )
    for idx, cy in enumerate((-0.52, 0.52)):
        cube(
            f"HOME_PROP_left_sofa_seat_cushion_{idx}",
            (-6.46, cy, 0.87),
            (0.79, 0.45, 0.105),
            leather,
            bevel=0.095,
        )
        cube(
            f"HOME_PROP_left_sofa_piping_{idx}",
            (-5.66, cy, 0.89),
            (0.018, 0.40, 0.022),
            materials["dark"],
            bevel=0.010,
        )
    cube(
        "HOME_PROP_left_sofa_center_seam",
        (-6.54, 0.0, 0.90),
        (0.70, 0.018, 0.018),
        materials["dark"],
        bevel=0.008,
    )
    for row, z in enumerate((0.95, 1.28, 1.58)):
        for col, y in enumerate((0.02, 0.44, 0.86)):
            sphere(
                f"HOME_PROP_left_sofa_tuft_{row}_{col}",
                (-7.175, y, z),
                (0.028, 0.014, 0.028),
                materials["gold"] if (row + col) % 2 == 0 else materials["dark"],
            )
    flat_panel(
        "HOME_PROP_left_sofa_throw",
        [(-7.30, 1.38), (-6.15, 1.38), (-6.08, 0.35), (-6.72, 0.20), (-7.20, 0.42)],
        0.18,
        0.05,
        materials["dark"],
        bevel=0.06,
    )
    cube("HOME_PROP_left_sideboard", (-7.55, 2.62, 0.62), (1.30, 0.48, 0.62), wood, bevel=0.06)
    cube("HOME_PROP_left_sideboard_top", (-7.55, 2.60, 1.27), (1.38, 0.50, 0.075), wood, bevel=0.035)
    for idx, drawer_z in enumerate((0.34, 0.65, 0.96)):
        cube(
            f"HOME_PROP_left_sideboard_drawer_{idx}",
            (-7.55, 2.125, drawer_z),
            (1.06, 0.018, 0.12),
            materials["dark"],
            bevel=0.025,
        )
        sphere(
            f"HOME_PROP_left_sideboard_handle_{idx}",
            (-7.55, 2.095, drawer_z),
            (0.050, 0.020, 0.050),
            brass,
        )
    cylinder("HOME_PROP_left_side_table_top", (-6.35, 2.35, 1.10), 0.56, 0.12, wood, vertices=28)
    cylinder("HOME_PROP_left_side_table_apron", (-6.35, 2.35, 1.01), 0.48, 0.10, materials["dark"], vertices=28)
    cylinder("HOME_PROP_left_side_table_pedestal", (-6.35, 2.35, 0.56), 0.16, 0.80, wood, vertices=24)
    cylinder("HOME_PROP_left_side_table_base", (-6.35, 2.35, 0.16), 0.42, 0.16, wood, vertices=28)
    cylinder("HOME_PROP_left_side_table_foot", (-6.35, 2.35, 0.06), 0.48, 0.08, materials["dark"], vertices=28)
    sphere("HOME_PROP_left_helmet", (-6.35, 2.35, 1.34), (0.30, 0.25, 0.25), steel)
    cylinder("HOME_PROP_left_helmet_brim", (-6.35, 2.35, 1.18), 0.31, 0.055, materials["brass_dark"], vertices=24)
    cube(
        "HOME_PROP_left_helmet_visor",
        (-6.35, 2.10, 1.35),
        (0.20, 0.028, 0.040),
        materials["dark"],
        bevel=0.012,
    )
    cone(
        "HOME_PROP_left_helmet_crest",
        (-6.35, 2.36, 1.62),
        0.060,
        0.010,
        0.17,
        materials["brass_dark"],
        vertices=14,
    )
    cube("HOME_PROP_left_candle", (-6.55, 2.33, 1.15), (0.055, 0.055, 0.27), paper, bevel=0.015)
    sphere("HOME_PROP_left_horse_body", (-6.45, 2.42, 1.58), (0.30, 0.16, 0.19), materials["gold"])
    curve_tube(
        "HOME_PROP_left_horse_neck",
        [(-6.58, 2.42, 1.62), (-6.74, 2.42, 1.82), (-6.86, 2.42, 1.96)],
        0.065,
        materials["gold"],
    )
    sphere("HOME_PROP_left_horse_head", (-6.94, 2.42, 1.99), (0.12, 0.07, 0.10), materials["gold"])
    for idx, (hx, hy, lean) in enumerate((
        (-6.62, 2.34, -0.04),
        (-6.35, 2.34, 0.03),
        (-6.61, 2.50, 0.04),
        (-6.34, 2.50, -0.03),
    )):
        curve_tube(
            f"HOME_PROP_left_horse_leg_{idx}",
            [(hx, hy, 1.47), (hx + lean, hy, 1.18)],
            0.029,
            materials["gold"],
        )
    curve_tube(
        "HOME_PROP_left_horse_tail",
        [(-6.18, 2.42, 1.62), (-6.07, 2.43, 1.51), (-6.12, 2.43, 1.34)],
        0.030,
        materials["gold"],
    )
    for idx, cx in enumerate((-6.90, -6.62, -6.34)):
        cylinder(f"HOME_PROP_left_candelabra_stem_{idx}", (cx, 2.70, 1.26), 0.035, 0.24, materials["brass_dark"], vertices=12)
        cube(f"HOME_PROP_left_candelabra_candle_{idx}", (cx, 2.70, 1.49), (0.035, 0.035, 0.15), materials["wax"], bevel=0.012)
        cone(f"HOME_PROP_left_candelabra_flame_{idx}", (cx, 2.70, 1.68), 0.035, 0.006, 0.10, materials["fire_hot"], vertices=10)
        add_point_light(f"HOME_LIGHT_left_candelabra_{idx}", (cx, 2.58, 1.72), 18, (1.0, 0.36, 0.08), radius=0.18)
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
    cube(
        "HOME_PROP_library_desk_apron",
        (-3.45, 3.48, 0.68),
        (1.08, 0.035, 0.12),
        wood,
        bevel=0.025,
    )
    cube(
        "HOME_PROP_library_desk_drawer",
        (-3.45, 3.435, 0.71),
        (0.54, 0.018, 0.11),
        materials["dark"],
        bevel=0.020,
    )
    sphere(
        "HOME_PROP_library_desk_drawer_pull",
        (-3.45, 3.405, 0.71),
        (0.042, 0.020, 0.042),
        brass,
    )
    cube("HOME_PROP_library_desk_leg_l", (-4.55, 4.05, 0.42), (0.10, 0.10, 0.42), wood, bevel=0.025)
    cube("HOME_PROP_library_desk_leg_r", (-2.35, 4.05, 0.42), (0.10, 0.10, 0.42), wood, bevel=0.025)
    cube("HOME_PROP_library_chair_seat", (-4.65, 3.25, 0.48), (0.44, 0.42, 0.12), leather, bevel=0.06)
    cube("HOME_PROP_library_chair_back", (-4.65, 3.60, 0.98), (0.42, 0.10, 0.55), leather, bevel=0.06)
    for idx, (cx, cy) in enumerate((
        (-4.98, 2.94),
        (-4.32, 2.94),
        (-4.98, 3.54),
        (-4.32, 3.54),
    )):
        cube(
            f"HOME_PROP_library_chair_leg_{idx}",
            (cx, cy, 0.22),
            (0.055, 0.055, 0.22),
            wood,
            bevel=0.018,
        )
    cube(
        "HOME_PROP_library_chair_stretcher",
        (-4.65, 3.54, 0.28),
        (0.34, 0.045, 0.040),
        wood,
        bevel=0.014,
    )
    cylinder("HOME_PROP_library_lamp_base", (-3.10, 3.92, 0.99), 0.13, 0.12, brass, vertices=20)
    cylinder("HOME_PROP_library_lamp_stem", (-3.10, 3.92, 1.13), 0.030, 0.20, materials["brass_dark"], vertices=16)
    cone(
        "HOME_PROP_library_lamp_shade",
        (-3.10, 3.92, 1.31),
        0.24,
        0.13,
        0.22,
        paper,
        vertices=24,
    )
    cylinder("HOME_PROP_library_lamp_cap", (-3.10, 3.92, 1.44), 0.055, 0.04, brass, vertices=16)

    # Turn the library desk from set dressing into a visibly used work surface.
    # These props sit behind the main board and do not alter Home hotspots.
    add_point_light("HOME_LIGHT_library_desk", (-3.10, 3.76, 1.42), 48, (1.0, 0.46, 0.18), radius=0.34)

    page_left = cube(
        "HOME_PROP_library_open_book_left",
        (-3.72, 3.72, 0.99),
        (0.30, 0.22, 0.018),
        materials["paper"],
        bevel=0.018,
    )
    page_left.rotation_euler[2] = math.radians(-7.0)
    page_right = cube(
        "HOME_PROP_library_open_book_right",
        (-3.16, 3.74, 1.00),
        (0.30, 0.22, 0.018),
        materials["paper"],
        bevel=0.018,
    )
    page_right.rotation_euler[2] = math.radians(6.0)
    cube(
        "HOME_PROP_library_open_book_spine",
        (-3.44, 3.76, 0.985),
        (0.035, 0.24, 0.028),
        materials["book_brown"],
        bevel=0.012,
    )

    cylinder(
        "HOME_PROP_library_inkwell",
        (-2.55, 3.70, 1.03),
        0.075,
        0.10,
        materials["dark"],
        vertices=18,
    )
    curve_tube(
        "HOME_PROP_library_quill",
        [(-2.57, 3.66, 1.10), (-2.43, 3.62, 1.30), (-2.27, 3.58, 1.48)],
        0.012,
        materials["brass_dark"],
    )
    for idx, (px, py, angle) in enumerate((
        (-4.05, 4.15, -8.0),
        (-3.66, 4.19, 5.0),
        (-2.70, 4.20, -4.0),
    )):
        note = cube(
            f"HOME_PROP_library_note_{idx}",
            (px, py, 0.985 + idx * 0.003),
            (0.20, 0.15, 0.010),
            materials["paper"],
            bevel=0.010,
        )
        note.rotation_euler[2] = math.radians(angle)

    # Right cabinet + globe, pulled slightly forward so the globe actually reads
    # beside the right fireplace at canonical camera distance.
    gx, gy = 5.58, 4.08
    cube("HOME_PROP_right_cabinet", (7.55, 5.02, 1.05), (1.15, 0.46, 1.05), wood, bevel=0.04)
    cube("HOME_PROP_right_cabinet_top", (7.55, 4.99, 2.14), (1.24, 0.49, 0.08), wood, bevel=0.035)
    for side in (-1, 1):
        door_x = 7.55 + side * 0.54
        cube(
            f"HOME_PROP_right_cabinet_door_{side}",
            (door_x, 4.545, 1.05),
            (0.47, 0.020, 0.76),
            materials["dark"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_right_cabinet_door_trim_{side}",
            (door_x, 4.520, 1.05),
            (0.39, 0.010, 0.66),
            wood,
            bevel=0.032,
        )
        sphere(
            f"HOME_PROP_right_cabinet_handle_{side}",
            (7.55 + side * 0.13, 4.485, 1.08),
            (0.045, 0.022, 0.045),
            brass,
        )
    cylinder("HOME_PROP_globe_stand", (gx, gy, 1.16), 0.11, 0.72, brass, vertices=24)
    cylinder("HOME_PROP_globe_base_upper", (gx, gy, 0.80), 0.28, 0.10, brass, vertices=28)
    cylinder("HOME_PROP_globe_base_lower", (gx, gy, 0.735), 0.38, 0.055, materials["brass_dark"], vertices=28)
    for idx, angle in enumerate((0.0, math.tau / 3.0, math.tau * 2.0 / 3.0)):
        fx = gx + 0.31 * math.cos(angle)
        fy = gy + 0.31 * math.sin(angle)
        sphere(
            f"HOME_PROP_globe_base_foot_{idx}",
            (fx, fy, 0.70),
            (0.085, 0.060, 0.050),
            materials["brass_dark"],
        )
    sphere("HOME_PROP_globe", (gx, gy, 1.86), (0.56, 0.56, 0.56), globe)
    curve_tube(
        "HOME_PROP_globe_meridian",
        [
            (gx + 0.64 * math.cos(i * math.pi / 16), gy, 1.86 + 0.64 * math.sin(i * math.pi / 16))
            for i in range(17)
        ],
        0.025,
        brass,
    )
    curve_tube(
        "HOME_PROP_globe_equator",
        [
            (gx + 0.60 * math.cos(i * math.tau / 24), gy + 0.60 * math.sin(i * math.tau / 24), 1.86)
            for i in range(25)
        ],
        0.018,
        materials["brass_dark"],
    )
    curve_tube(
        "HOME_PROP_globe_meridian_cross",
        [
            (gx, gy + 0.60 * math.cos(i * math.tau / 24), 1.86 + 0.60 * math.sin(i * math.tau / 24))
            for i in range(25)
        ],
        0.018,
        materials["brass_dark"],
    )

    # Plant and ceramic pot mark the stair edge in the master.
    cylinder("HOME_PROP_plant_pot", (5.10, 1.70, 0.52), 0.34, 0.48, ceramic, vertices=28)
    cylinder("HOME_PROP_plant_pot_rim", (5.10, 1.70, 0.775), 0.38, 0.085, ceramic, vertices=28)
    cylinder("HOME_PROP_plant_pot_soil", (5.10, 1.70, 0.818), 0.295, 0.018, materials["dark"], vertices=28)
    cylinder("HOME_PROP_plant_pot_foot", (5.10, 1.70, 0.275), 0.29, 0.055, materials["ceramic"], vertices=28)
    for idx, (dx, dy) in enumerate(((-0.25, 0.05), (0.22, 0.02), (-0.12, 0.18), (0.10, -0.10), (0.30, 0.15))):
        curve_tube(
            f"HOME_PROP_plant_leaf_{idx}",
            [(5.10, 1.70, 0.76), (5.10 + dx * 0.55, 1.70 + dy, 1.13), (5.10 + dx, 1.70 + dy * 1.7, 1.46)],
            0.040,
            plant,
        )
        blade = sphere(
            f"HOME_PROP_plant_leaf_blade_{idx}",
            (5.10 + dx * 0.78, 1.70 + dy * 1.30, 1.31),
            (0.105, 0.038, 0.265),
            plant,
        )
        blade.rotation_euler[0] = math.radians(dy * 55.0)
        blade.rotation_euler[1] = math.radians(-dx * 85.0)
    center_leaf = sphere(
        "HOME_PROP_plant_leaf_blade_center",
        (5.10, 1.70, 1.28),
        (0.095, 0.035, 0.30),
        plant,
    )
    center_leaf.rotation_euler[1] = math.radians(4.0)


def add_stairs(materials):
    stone = materials["stair_stone"]
    brass = materials["brass"]
    dark = materials["dark"]
    fire = materials["fire"]

    # Keep the Dungeon a strong lower-right destination without letting it
    # consume a third of the room. The canonical opening is mostly an arch,
    # balustrade and descending stair tucked against the right edge.
    bridge_x = 6.25
    arch_x = 6.52
    cube("HOME_ARCH_dungeon_bridge", (bridge_x, 2.48, 1.36), (1.70, 0.66, 0.12), stone, bevel=0.05)
    cube("HOME_ARCH_dungeon_bridge_lip", (bridge_x, 1.92, 1.54), (1.62, 0.11, 0.16), stone, bevel=0.04)

    cube("HOME_ARCH_dungeon_void", (arch_x, 1.78, -0.12), (1.42, 0.09, 1.42), dark, bevel=0.12)
    arch("HOME_ARCH_dungeon_arch", arch_x, 1.60, 2.95, 0.58, 1.42, -1.56, stone)
    arch("HOME_ARCH_dungeon_arch_inner", arch_x + 0.08, 1.48, 2.42, 0.44, 1.12, -1.46, materials["stone_dark"])

    for idx, x in enumerate((5.62, 5.93, 6.24, 6.55, 6.86, 7.17)):
        cube(f"HOME_PROP_dungeon_gate_{idx}", (x, 1.51, -0.30), (0.040, 0.040, 0.88), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_gate_cross", (6.40, 1.49, -0.25), (0.94, 0.045, 0.050), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_fire_left", (5.88, 1.36, -0.66), (0.15, 0.05, 0.30), fire, bevel=0.08)
    cube("HOME_PROP_dungeon_fire_right", (6.96, 1.36, -0.70), (0.15, 0.05, 0.34), fire, bevel=0.08)

    for idx, x in enumerate((4.98, 5.38, 5.78, 6.18, 6.58, 6.98, 7.38)):
        cylinder(f"HOME_ARCH_dungeon_baluster_{idx}", (x, 1.80, 1.86), 0.060, 0.52, stone, vertices=20)
    cube("HOME_ARCH_dungeon_balustrade_top", (6.18, 1.80, 2.14), (1.52, 0.085, 0.075), stone, bevel=0.022)

    cylinder("HOME_ARCH_dungeon_post", (4.72, 1.90, 1.33), 0.19, 1.78, stone, vertices=32)
    sphere("HOME_PROP_dungeon_finial", (4.72, 1.90, 2.30), (0.16, 0.16, 0.16), materials["stone_dark"])

    steps = 11
    for i in range(steps):
        t = i / (steps - 1)
        x = 5.28 + 2.45 * t
        y = 1.45 - 2.28 * t
        z = 0.68 - 1.58 * t
        cube(
            f"HOME_ARCH_dungeon_step_{i}",
            (x, y, z),
            (0.61, 0.33, 0.075),
            stone,
            bevel=0.025,
        )
        cube(
            f"HOME_PROP_dungeon_step_nosing_{i}",
            (x, y - 0.305, z + 0.080),
            (0.59, 0.028, 0.020),
            materials["stone_dark"],
            bevel=0.010,
        )

    stair_rail_points = [(4.66, 1.62, 2.03), (5.58, 0.84, 1.42), (6.62, -0.04, 0.74), (7.55, -0.82, 0.12)]
    curve_tube(
        "HOME_ARCH_dungeon_stone_rail",
        stair_rail_points,
        0.060,
        stone,
    )
    curve_tube(
        "HOME_PROP_dungeon_gold_rail",
        [(x, y - 0.02, z + 0.11) for x, y, z in stair_rail_points],
        0.024,
        materials["gold"],
    )
    curve_tube(
        "HOME_ARCH_dungeon_lower_stone_rail",
        [(4.66, 1.62, 1.72), (5.58, 0.84, 1.11), (6.62, -0.04, 0.43), (7.55, -0.82, -0.19)],
        0.038,
        stone,
    )
    for idx in range(6):
        t = idx / 5.0
        px = 4.78 + 2.55 * t
        py = 1.48 - 2.10 * t
        pz = 1.72 - 1.62 * t
        cylinder(f"HOME_PROP_dungeon_stair_baluster_{idx}", (px, py, pz), 0.040, 0.48, stone, vertices=16)
        sphere(f"HOME_PROP_dungeon_stair_baluster_cap_{idx}", (px, py, pz + 0.27), (0.065, 0.065, 0.065), materials["stone_dark"])
    for name, (px, py, pz) in {
        "top": (4.66, 1.62, 1.80),
        "bottom": (7.55, -0.82, -0.10),
    }.items():
        cube(f"HOME_ARCH_dungeon_newel_{name}", (px, py, pz), (0.13, 0.13, 0.48), stone, bevel=0.042)
        sphere(f"HOME_PROP_dungeon_newel_finial_{name}", (px, py, pz + 0.60), (0.14, 0.14, 0.14), materials["stone_dark"])
        sphere(f"HOME_PROP_dungeon_newel_gold_{name}", (px, py - 0.02, pz + 0.61), (0.065, 0.065, 0.065), materials["gold"])
    for idx, (px, py, pz) in enumerate(((5.35, 0.95, 1.18), (6.35, 0.10, 0.53), (7.25, -0.65, -0.06))):
        cylinder(f"HOME_PROP_dungeon_candle_{idx}", (px, py, pz), 0.038, 0.18, materials["wax"], vertices=12)
        cone(f"HOME_PROP_dungeon_candle_flame_{idx}", (px, py, pz + 0.18), 0.040, 0.008, 0.12, materials["fire_hot"], vertices=10)
        add_point_light(f"HOME_LIGHT_dungeon_candle_{idx}", (px, py - 0.04, pz + 0.22), 22, (1.0, 0.40, 0.12), radius=0.20)
    cube("HOME_ARCH_dungeon_lower_floor", (6.55, -0.52, -1.46), (1.64, 1.55, 0.09), dark, bevel=0.02)


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
    bg.inputs["Strength"].default_value = 0.024

    materials = {
        "stone": material("HOME_MAT_stone", (0.055, 0.049, 0.043, 1), roughness=0.91, bump_scale=5.8, bump_strength=0.31, variation=0.26, variation_scale=3.8),
        "arch_stone": material("HOME_MAT_arch_stone", (0.074, 0.065, 0.056, 1), roughness=0.89, bump_scale=5.4, bump_strength=0.29, variation=0.24, variation_scale=4.0),
        "stair_stone": material("HOME_MAT_stair_stone", (0.066, 0.059, 0.052, 1), roughness=0.90, bump_scale=5.2, bump_strength=0.25, variation=0.20, variation_scale=4.2),
        "stone_dark": material("HOME_MAT_stone_dark", (0.022, 0.017, 0.014, 1), roughness=0.95, bump_scale=7.2, bump_strength=0.19, variation=0.14, variation_scale=4.8),
        "floor_stone": material("HOME_MAT_floor_stone", (0.056, 0.047, 0.043, 1), roughness=0.91, bump_scale=8.2, bump_strength=0.18, variation=0.18, variation_scale=5.6),
        "wood": material("HOME_MAT_wood", (0.060, 0.018, 0.007, 1), roughness=0.64, bump_scale=5.0, bump_strength=0.13, variation=0.29, variation_scale=2.2, grain=True),
        "brass": material("HOME_MAT_brass", (0.36, 0.19, 0.050, 1), roughness=0.27, metallic=0.84),
        "gold": material(
            "HOME_MAT_gold",
            (0.82, 0.50, 0.14, 1),
            roughness=0.20,
            metallic=0.92,
            emission=(0.08, 0.028, 0.004, 1),
            emission_strength=0.22,
        ),
        "heraldry_gold": material(
            "HOME_MAT_heraldry_gold",
            (1.0, 0.66, 0.20, 1),
            roughness=0.18,
            metallic=0.95,
            emission=(0.20, 0.075, 0.010, 1),
            emission_strength=0.46,
        ),
        "brass_dark": material("HOME_MAT_brass_dark", (0.15, 0.075, 0.024, 1), roughness=0.38, metallic=0.74),
        "steel": material("HOME_MAT_steel", (0.16, 0.17, 0.18, 1), roughness=0.30, metallic=0.86),
        "armor_steel": material(
            "HOME_MAT_armor_steel",
            (0.072, 0.078, 0.086, 1),
            roughness=0.52,
            metallic=0.70,
            variation=0.09,
            variation_scale=6.2,
        ),
        "board_light": material("HOME_MAT_board_light", (0.50, 0.34, 0.20, 1), roughness=0.52),
        "board_dark": material("HOME_MAT_board_dark", (0.065, 0.028, 0.013, 1), roughness=0.58),
        "rug": material("HOME_MAT_rug", (0.095, 0.010, 0.008, 1), roughness=0.94, bump_scale=26.0, bump_strength=0.08, variation=0.12, variation_scale=9.0),
        "banner": material("HOME_MAT_banner", (0.22, 0.008, 0.012, 1), roughness=0.80, bump_scale=20.0, bump_strength=0.05, variation=0.10, variation_scale=8.0),
        "wall_banner": material(
            "HOME_MAT_wall_banner",
            (0.105, 0.006, 0.009, 1),
            roughness=0.88,
            bump_scale=22.0,
            bump_strength=0.055,
            variation=0.075,
            variation_scale=8.8,
        ),
        "bench_velvet": material(
            "HOME_MAT_bench_velvet",
            (0.125, 0.007, 0.010, 1),
            roughness=0.82,
            bump_scale=21.0,
            bump_strength=0.045,
            variation=0.075,
            variation_scale=8.5,
        ),
        "velvet_dark": material("HOME_MAT_velvet_dark", (0.070, 0.004, 0.007, 1), roughness=0.90, bump_scale=22.0, bump_strength=0.035, variation=0.06, variation_scale=9.0),
        "soot_stone": material("HOME_MAT_soot_stone", (0.040, 0.020, 0.012, 1), roughness=0.98, bump_scale=9.0, bump_strength=0.16, variation=0.18, variation_scale=5.5),
        "book_green": material("HOME_MAT_book_green", (0.040, 0.058, 0.038, 1), roughness=0.91),
        "book_brown": material("HOME_MAT_book_brown", (0.085, 0.030, 0.016, 1), roughness=0.91),
        "book_red": material("HOME_MAT_book_red", (0.095, 0.018, 0.018, 1), roughness=0.91),
        "book_olive": material("HOME_MAT_book_olive", (0.078, 0.068, 0.030, 1), roughness=0.91),
        "piece_light": material(
            "HOME_MAT_piece_light",
            (0.68, 0.56, 0.41, 1),
            roughness=0.34,
            metallic=0.018,
            variation=0.045,
            variation_scale=7.0,
        ),
        "piece_dark": material(
            "HOME_MAT_piece_dark",
            (0.035, 0.027, 0.021, 1),
            roughness=0.30,
            metallic=0.028,
            variation=0.055,
            variation_scale=6.4,
        ),
        "leather": material("HOME_MAT_leather", (0.19, 0.015, 0.014, 1), roughness=0.60, bump_scale=18.0, bump_strength=0.05, variation=0.09, variation_scale=6.0),
        "paper": material("HOME_MAT_paper", (0.70, 0.52, 0.32, 1), roughness=0.82),
        "wax": material("HOME_MAT_wax", (0.48, 0.34, 0.20, 1), roughness=0.86),
        "globe": material(
            "HOME_MAT_globe",
            (0.035, 0.105, 0.120, 1),
            roughness=0.60,
            variation=0.18,
            variation_scale=3.8,
            bump_scale=12.0,
            bump_strength=0.045,
        ),
        "plant": material("HOME_MAT_plant", (0.09, 0.20, 0.07, 1), roughness=0.84),
        "ceramic": material("HOME_MAT_ceramic", (0.50, 0.44, 0.34, 1), roughness=0.46),
        "dark": material("HOME_MAT_dark", (0.018, 0.012, 0.01, 1), roughness=0.9),
        "window": material(
            "HOME_MAT_window",
            (0.008, 0.026, 0.052, 1),
            roughness=0.32,
            emission=(0.018, 0.055, 0.12, 1),
            emission_strength=0.20,
        ),
        "moon": material(
            "HOME_MAT_moon",
            (0.68, 0.69, 0.64, 1),
            roughness=0.50,
            emission=(0.42, 0.43, 0.38, 1),
            emission_strength=0.30,
        ),
        "fire": material(
            "HOME_MAT_fire",
            (0.34, 0.065, 0.004, 1),
            roughness=0.38,
            emission=(1.0, 0.12, 0.006, 1),
            emission_strength=0.045,
        ),
        "fire_hot": material(
            "HOME_MAT_fire_hot",
            (0.88, 0.28, 0.025, 1),
            roughness=0.30,
            emission=(1.0, 0.22, 0.010, 1),
            emission_strength=0.065,
        ),
    }

    # Canonical Great Hall blockout v2: reproduce the asymmetric visual masses
    # from great-hall-dungeon.webp before adding any decorative detail.
    # Split the floor so the Dungeon can actually descend below the Great Hall
    # rather than sitting on top of a solid slab.
    cube("HOME_ARCH_floor_back", (0, 5.80, -0.18), (9.35, 3.60, 0.18), materials["floor_stone"])
    cube("HOME_ARCH_floor_front_left", (-2.10, -1.10, -0.18), (7.25, 3.30, 0.18), materials["floor_stone"])
    cube("HOME_ARCH_back_wall", (0, 7.0, 3.2), (9.35, 0.25, 3.4), materials["stone"])
    # Shallow mortar courses turn the rear wall from one smooth slab into
    # readable castle masonry without adding heavy displacement geometry.
    for row, z in enumerate((0.70, 1.52, 2.34, 3.16, 3.98, 4.80, 5.62)):
        cube(f"HOME_ARCH_back_mortar_h_{row}", (0, 6.72, z), (9.10, 0.014, 0.010), materials["stone_dark"])
        offset = 0.90 if row % 2 else -0.20
        for col, x in enumerate((-6.6, -2.2, 2.2, 6.6)):
            cube(
                f"HOME_ARCH_back_mortar_v_{row}_{col}",
                (x + offset, 6.715, z + 0.36),
                (0.012, 0.018, 0.31),
                materials["stone_dark"],
            )

    # Shallow individual ashlar faces add parallax and catch grazing light.
    # They remain low-relief so the approved focal architecture stays dominant.
    for row, z in enumerate((0.42, 1.20, 1.98, 2.76, 3.54, 4.32, 5.10, 5.88)):
        offset = 0.76 if row % 2 else 0.0
        for col in range(-6, 7):
            bx = col * 1.48 + offset
            if abs(bx) > 8.65:
                continue
            block_width = 0.66 + 0.045 * ((row + col) % 3)
            block_height = 0.31 + 0.018 * ((row * 2 + col) % 2)
            block_y = 6.710 - 0.006 * ((row * 3 + col) % 3)
            cube(
                f"HOME_ARCH_back_ashlar_{row}_{col}",
                (bx, block_y, z),
                (block_width, 0.016, block_height),
                materials["arch_stone"] if (row + col) % 5 == 0 else materials["stone"],
                bevel=0.018,
            )
    cube("HOME_ARCH_left_wall", (-9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
    cube("HOME_ARCH_right_wall", (9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
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
    for idx, tx in enumerate((-3.20, -2.70, -2.20, -1.70, -1.20, -0.70, -0.20, 0.30, 0.80, 1.30, 1.80, 2.30, 2.80, 3.20)):
        drift = 0.035 if idx % 2 == 0 else -0.035
        curve_tube(
            f"HOME_PROP_rug_front_tassel_{idx}",
            [(tx, -2.36, 0.056), (tx + drift, -2.52, 0.046)],
            0.010,
            materials["brass_dark"],
        )
    for idx, x in enumerate((-2.95, -2.25, -1.55, -0.85, 0.0, 0.85, 1.55, 2.25, 2.95)):
        motif = cube(f"HOME_PROP_rug_front_motif_{idx}", (x, -2.12, 0.066), (0.085, 0.085, 0.010), rug_border)
        motif.rotation_euler[2] = math.radians(45)
    for idx, x in enumerate((-2.70, -1.80, -0.90, 0.0, 0.90, 1.80, 2.70)):
        motif = cube(f"HOME_PROP_rug_inner_motif_{idx}", (x, -1.72, 0.062), (0.050, 0.050, 0.009), materials["stone_dark"])
        motif.rotation_euler[2] = math.radians(45)
    for row, y in enumerate((-1.18, -0.42, 0.34)):
        for col, x in enumerate((-2.55, -1.70, -0.85, 0.0, 0.85, 1.70, 2.55)):
            motif = cube(
                f"HOME_PROP_rug_medallion_{row}_{col}",
                (x, y, 0.060),
                (0.055 + 0.010 * ((row + col) % 2), 0.055 + 0.010 * ((row + col) % 2), 0.010),
                materials["gold"] if (row + col) % 3 == 0 else materials["stone_dark"],
            )
            motif.rotation_euler[2] = math.radians(45)
    cube("HOME_PROP_rug_inner_front", (0, -1.42, 0.064), (2.86, 0.022, 0.008), materials["gold"])
    cube("HOME_PROP_rug_inner_left", (-2.86, 1.20, 0.064), (0.022, 2.62, 0.008), materials["gold"])
    cube("HOME_PROP_rug_inner_right", (2.86, 1.20, 0.064), (0.022, 2.62, 0.008), materials["gold"])
    cube("HOME_PROP_rug_inner_front_2", (0, -1.78, 0.065), (2.45, 0.018, 0.008), materials["gold"])
    cube("HOME_PROP_rug_inner_left_2", (-2.45, 0.70, 0.065), (0.018, 2.48, 0.008), materials["gold"])
    cube("HOME_PROP_rug_inner_right_2", (2.45, 0.70, 0.065), (0.018, 2.48, 0.008), materials["gold"])
    rug_medallion_outer = cube(
        "HOME_PROP_rug_medallion_outer",
        (0.0, -0.72, 0.067),
        (0.46, 0.46, 0.009),
        materials["stone_dark"],
    )
    rug_medallion_outer.rotation_euler[2] = math.radians(45.0)
    rug_medallion_mid = cube(
        "HOME_PROP_rug_medallion_mid",
        (0.0, -0.72, 0.070),
        (0.28, 0.28, 0.008),
        materials["brass_dark"],
    )
    rug_medallion_mid.rotation_euler[2] = math.radians(45.0)
    rug_medallion_core = cube(
        "HOME_PROP_rug_medallion_core",
        (0.0, -0.72, 0.073),
        (0.11, 0.11, 0.007),
        materials["gold"],
    )
    rug_medallion_core.rotation_euler[2] = math.radians(45.0)

    # Large canonical masses, left-to-right: fireplace, library, armor portal,
    # second fireplace, window and dungeon stair.
    for x in (-7.6, -4.8, -0.65, 2.85, 5.95, 8.25):
        cube(f"HOME_ARCH_pilaster_back_{x}", (x, 6.78, 2.65), (0.42, 0.15, 2.55), materials["arch_stone"], bevel=0.045)
        cube(f"HOME_ARCH_pilaster_cap_{x}", (x, 6.62, 5.18), (0.56, 0.22, 0.16), materials["arch_stone"], bevel=0.045)
        cylinder(f"HOME_ARCH_column_{x}", (x, 6.55, 2.6), 0.25, 5.2, materials["stone"], vertices=40)
        cylinder(f"HOME_ARCH_column_base_{x}", (x, 6.55, 0.25), 0.4, 0.5, materials["stone_dark"], vertices=36)
        cylinder(f"HOME_ARCH_column_ring_low_{x}", (x, 6.55, 0.70), 0.31, 0.12, materials["stone_dark"], vertices=28)
        cylinder(f"HOME_ARCH_column_ring_high_{x}", (x, 6.55, 4.70), 0.31, 0.12, materials["stone_dark"], vertices=28)
    cube("HOME_ARCH_upper_cornice", (0, 6.72, 5.62), (8.95, 0.20, 0.12), materials["wood"], bevel=0.045)

    add_fireplace("fireplace_left", -6.15, materials)
    fireplace_left_origin = Vector((-6.15, 6.10, 0.35))
    for obj in list(bpy.data.objects):
        if ("fireplace_left" in obj.name) and obj.type != "LIGHT":
            obj.location = fireplace_left_origin + (obj.location - fireplace_left_origin) * 0.90
            obj.scale *= 0.90
            if "_flame_" in obj.name or "_flame_hot_" in obj.name:
                # Match the right hearth contract: legacy tongues are depth glow
                # only. The foreground organic lobe cluster owns the silhouette.
                obj.scale.x *= 0.14
                obj.scale.z *= 0.07
                obj.location.y += 0.40
    # The generic helper still contributes a domestic horizontal mantel that
    # cuts through the pointed canonical opening. Remove only those legacy
    # cross-pieces; the custom Gothic surround below owns the visible facade.
    for legacy_name in (
        "HOME_PROP_fireplace_left_mantel",
        "HOME_PROP_fireplace_left_corbel_-1",
        "HOME_PROP_fireplace_left_corbel_1",
    ):
        legacy = bpy.data.objects.get(legacy_name)
        if legacy is not None:
            bpy.data.objects.remove(legacy, do_unlink=True)

    left_log_a = cube("HOME_PROP_fireplace_left_log_a", (-6.38, 5.72, 0.55), (0.40, 0.09, 0.065), materials["wood"], bevel=0.032)
    left_log_a.rotation_euler[2] = math.radians(9)
    left_log_b = cube("HOME_PROP_fireplace_left_log_b", (-5.94, 5.73, 0.58), (0.38, 0.09, 0.065), materials["wood"], bevel=0.032)
    left_log_b.rotation_euler[2] = math.radians(-11)
    cube("HOME_PROP_fireplace_left_ember_bed", (-6.15, 5.72, 0.47), (0.66, 0.10, 0.050), materials["fire"], bevel=0.04)

    # Canonical left hearth: the approved reference reads as a deep Gothic
    # fireplace, not a black void with a flame strip. Build a nested stone
    # opening and keep the fire/grate close to camera for a readable silhouette.
    cube(
        "HOME_PROP_fireplace_left_canon_firebox",
        (-6.15, 6.03, 1.25),
        (0.86, 0.065, 0.96),
        materials["soot_stone"],
        bevel=0.045,
    )
    for row, z in enumerate((0.72, 1.02, 1.32, 1.62)):
        cube(
            f"HOME_PROP_fireplace_left_firebox_course_{row}",
            (-6.15, 5.955, z),
            (0.76, 0.018, 0.014),
            materials["dark"],
            bevel=0.006,
        )
    for col, x in enumerate((-6.48, -6.15, -5.82)):
        cube(
            f"HOME_PROP_fireplace_left_firebox_joint_{col}",
            (x, 5.950, 1.18 + 0.10 * (col % 2)),
            (0.012, 0.016, 0.42),
            materials["dark"],
            bevel=0.004,
        )
    flat_panel(
        "HOME_PROP_fireplace_left_lancet_shadow",
        [
            (-6.99, 0.42), (-6.99, 2.22),
            (-6.15, 3.73),
            (-5.31, 2.22), (-5.31, 0.42),
        ],
        5.88,
        0.030,
        materials["soot_stone"],
        bevel=0.025,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_left_lancet_trim",
        -6.15,
        5.47,
        1.86,
        2.10,
        3.78,
        0.40,
        materials["stone_dark"],
        bevel=0.055,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_left_inner",
        -6.15,
        5.56,
        2.28,
        2.34,
        4.18,
        0.30,
        materials["arch_stone"],
        bevel=0.105,
    )
    for side in (-1, 1):
        px = -6.15 + side * 1.02
        cube(
            f"HOME_PROP_fireplace_left_jamb_{side}",
            (px, 5.60, 1.33),
            (0.15, 0.18, 1.08),
            materials["arch_stone"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_fireplace_left_jamb_cap_{side}",
            (px, 5.52, 2.40),
            (0.23, 0.22, 0.11),
            materials["stone_dark"],
            bevel=0.035,
        )
    for idx, dx in enumerate((-0.38, -0.13, 0.14, 0.39)):
        sphere(
            f"HOME_PROP_fireplace_left_ember_{idx}",
            (-6.15 + dx, 5.39, 0.585 + 0.010 * (idx % 2)),
            (0.115, 0.020, 0.036),
            materials["fire_hot"] if idx % 2 else materials["fire"],
        )
    add_point_light(
        "HOME_LIGHT_fireplace_left_inner",
        (-6.15, 5.12, 0.94),
        68,
        (1.0, 0.31, 0.075),
        radius=0.58,
    )
    # One continuous irregular flame silhouette reads as a hearth fire at
    # Home distance; separate lobes collapse into a row of candle-like spikes.
    sphere(
        "HOME_PROP_fireplace_left_front_ember_glow",
        (-6.15, 5.400, 0.700),
        (0.62, 0.026, 0.070),
        materials["fire"],
    )
    # Rounded overlapping lobes keep the fire organic at Home distance.
    # The old single polygon mass read as a row of pink triangular teeth.
    for idx, (dx, flame_w, flame_h, tilt) in enumerate((
        (-0.36, 0.11, 0.18, -8.0),
        (-0.17, 0.12, 0.27, 7.0),
        (0.03, 0.13, 0.36, -4.0),
        (0.22, 0.11, 0.25, 8.0),
        (0.38, 0.10, 0.17, -6.0),
    )):
        lobe = sphere(
            f"HOME_PROP_fireplace_left_front_flame_{idx}",
            (-6.15 + dx, 5.378, 0.76 + flame_h * 0.56),
            (flame_w, 0.028, flame_h),
            materials["fire"],
        )
        lobe.rotation_euler[1] = math.radians(tilt)
        inner = sphere(
            f"HOME_PROP_fireplace_left_front_hot_{idx}",
            (-6.15 + dx * 0.94, 5.342, 0.74 + flame_h * 0.34),
            (flame_w * 0.44, 0.019, flame_h * 0.46),
            materials["fire_hot"],
        )
        inner.rotation_euler[1] = math.radians(tilt * 0.45)

    for idx, (dx, radius, tongue_h, tilt) in enumerate((
        (-0.22, 0.070, 0.52, -6.0),
        (0.02, 0.085, 0.70, 3.0),
        (0.25, 0.065, 0.48, 8.0),
    )):
        tongue = cone(
            f"HOME_PROP_fireplace_left_front_tongue_{idx}",
            (-6.15 + dx, 5.390, 0.72 + tongue_h * 0.50),
            radius,
            0.010,
            tongue_h,
            materials["fire"],
            vertices=16,
        )
        tongue.rotation_euler[1] = math.radians(tilt)

    for idx, gx in enumerate((-6.66, -6.40, -6.15, -5.90, -5.64)):
        curve_tube(
            f"HOME_PROP_fireplace_left_grate_bar_{idx}",
            [(gx, 5.30, 0.47), (gx, 5.30, 1.04)],
            0.018,
            materials["brass_dark"],
        )
    curve_tube(
        "HOME_PROP_fireplace_left_grate_top",
        [(-6.73, 5.30, 0.96), (-6.15, 5.28, 1.07), (-5.57, 5.30, 0.96)],
        0.024,
        materials["brass_dark"],
    )

    add_bookshelf(materials)
    # The canon's library is a deep architectural bay, not a flat shelf wall.
    # Add a restrained carved surround without moving the shelf contents.
    for side in (-1, 1):
        cube(
            f"HOME_PROP_library_pilaster_{side}",
            (-2.65 + side * 1.63, 5.72, 2.58),
            (0.105, 0.18, 2.24),
            materials["wood"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_library_pilaster_cap_{side}",
            (-2.65 + side * 1.63, 5.64, 4.78),
            (0.18, 0.22, 0.12),
            materials["brass_dark"],
            bevel=0.035,
        )
    cube(
        "HOME_PROP_library_crown",
        (-2.65, 5.68, 4.92),
        (1.78, 0.20, 0.12),
        materials["wood"],
        bevel=0.045,
    )
    cube("HOME_PROP_armor_recess", (1.35, 6.72, 2.46), (0.95, 0.08, 1.78), materials["dark"], bevel=0.08)
    gothic_arch("HOME_ARCH_armor_portal", 1.35, 6.18, 2.55, 2.55, 4.72, 0.15, materials["arch_stone"])
    gothic_arch(
        "HOME_ARCH_armor_inner_trim",
        1.35,
        6.03,
        2.04,
        2.62,
        4.43,
        0.36,
        materials["brass_dark"],
        bevel=0.045,
    )
    for side in (-1, 1):
        cube(
            f"HOME_PROP_armor_niche_jamb_{side}",
            (1.35 + side * 0.93, 6.08, 1.56),
            (0.075, 0.075, 1.18),
            materials["stone_dark"],
            bevel=0.025,
        )
    add_fireplace("fireplace_right", 4.45, materials)
    fireplace_origin = Vector((4.45, 6.10, 0.35))
    for obj in list(bpy.data.objects):
        if ("fireplace_right" in obj.name) and obj.type != "LIGHT":
            obj.location = fireplace_origin + (obj.location - fireplace_origin) * 1.20
            obj.scale *= 1.20
            if "_flame_" in obj.name or "_flame_hot_" in obj.name:
                # Keep legacy tongues buried as warm depth only; the canonical
                # foreground overlay owns the visible hearth silhouette.
                obj.scale.x *= 0.14
                obj.scale.z *= 0.07
                obj.location.y += 0.40
            if "_grate_" in obj.name:
                if obj.data and hasattr(obj.data, "materials"):
                    obj.data.materials.clear()
                    obj.data.materials.append(materials["brass_dark"])
                if "grate_cross" not in obj.name:
                    obj.scale.z *= 0.52
                    obj.location.z -= 0.15
    add_point_light("HOME_LIGHT_fireplace_right_boost", (4.55, 4.96, 1.18), 132, (1.0, 0.29, 0.060), radius=0.90)

    # The shared fireplace helper leaves a wide domestic mantel/corbel set.
    # Remove those foreground pieces so the authored Gothic surround owns the
    # silhouette while the helper still supplies the deep alcove and fire.
    for legacy_name in (
        "HOME_PROP_fireplace_right_mantel",
        "HOME_PROP_fireplace_right_corbel_-1",
        "HOME_PROP_fireplace_right_corbel_1",
        "HOME_PROP_fireplace_right_jamb_-1",
        "HOME_PROP_fireplace_right_jamb_1",
    ):
        legacy = bpy.data.objects.get(legacy_name)
        if legacy is not None:
            bpy.data.objects.remove(legacy, do_unlink=True)

    # Deep nested firebox: outer soot shadow, inner recess and stepped stone
    # surround. Narrower proportions match the canonical right-hand hearth.
    cube(
        "HOME_PROP_fireplace_right_canon_firebox",
        (4.45, 6.08, 1.22),
        (0.76, 0.075, 0.88),
        materials["soot_stone"],
        bevel=0.045,
    )
    cube(
        "HOME_PROP_fireplace_right_inner_firebox",
        (4.45, 5.91, 1.18),
        (0.61, 0.055, 0.68),
        materials["dark"],
        bevel=0.035,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_right_canon_hood",
        4.45,
        5.42,
        2.45,
        2.52,
        3.78,
        0.28,
        materials["arch_stone"],
        bevel=0.080,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_right_inner_hood",
        4.45,
        5.31,
        1.86,
        2.23,
        3.28,
        0.42,
        materials["stone_dark"],
        bevel=0.040,
    )
    cube(
        "HOME_PROP_fireplace_right_canon_mantel",
        (4.45, 5.18, 2.38),
        (1.17, 0.22, 0.13),
        materials["stone"],
        bevel=0.050,
    )
    for side in (-1, 1):
        px = 4.45 + side * 0.91
        cube(
            f"HOME_PROP_fireplace_right_canon_pilaster_{side}",
            (px, 5.37, 1.39),
            (0.15, 0.18, 1.14),
            materials["arch_stone"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_fireplace_right_inner_jamb_{side}",
            (4.45 + side * 0.69, 5.24, 1.28),
            (0.075, 0.105, 0.86),
            materials["stone_dark"],
            bevel=0.028,
        )
        cube(
            f"HOME_PROP_fireplace_right_canon_cap_{side}",
            (px, 5.22, 2.39),
            (0.23, 0.22, 0.12),
            materials["stone"],
            bevel=0.040,
        )
        cube(
            f"HOME_PROP_fireplace_right_corbel_{side}",
            (4.45 + side * 1.01, 5.17, 2.18),
            (0.20, 0.20, 0.18),
            materials["stone_dark"],
            bevel=0.045,
        )
        for flute in (-0.055, 0.055):
            cube(
                f"HOME_PROP_fireplace_right_flute_{side}_{flute}",
                (px + flute, 5.175, 1.40),
                (0.020, 0.025, 0.78),
                materials["stone_dark"],
                bevel=0.008,
            )
    cube(
        "HOME_PROP_fireplace_right_canon_crest",
        (4.45, 5.09, 3.07),
        (0.30, 0.07, 0.20),
        materials["stone_dark"],
        bevel=0.055,
    )
    sphere(
        "HOME_PROP_fireplace_right_canon_crest_emblem",
        (4.45, 5.005, 3.08),
        (0.085, 0.022, 0.085),
        materials["gold"],
    )
    shield_points = [
        (5.10, 3.56),
        (5.64, 3.56),
        (5.64, 3.31),
        (5.55, 3.08),
        (5.37, 2.93),
        (5.19, 3.08),
        (5.10, 3.31),
    ]
    flat_panel(
        "HOME_PROP_fireplace_right_shield",
        shield_points,
        5.08,
        0.10,
        materials["wood"],
        bevel=0.045,
    )
    curve_tube(
        "HOME_PROP_fireplace_right_shield_border",
        [(x, 5.015, z) for x, z in shield_points + [shield_points[0]]],
        0.018,
        materials["brass_dark"],
    )
    sphere(
        "HOME_PROP_fireplace_right_shield_emblem",
        (5.37, 5.000, 3.28),
        (0.070, 0.018, 0.070),
        materials["gold"],
    )
    cube(
        "HOME_PROP_fireplace_right_shield_mark_v",
        (5.37, 4.985, 3.23),
        (0.020, 0.012, 0.095),
        materials["gold"],
        bevel=0.007,
    )
    cube(
        "HOME_PROP_fireplace_right_shield_mark_h",
        (5.37, 4.985, 3.27),
        (0.070, 0.012, 0.020),
        materials["gold"],
        bevel=0.007,
    )
    log_a = cube("HOME_PROP_fireplace_right_log_a", (4.24, 5.72, 0.57), (0.46, 0.10, 0.07), materials["wood"], bevel=0.035)
    log_a.rotation_euler[2] = math.radians(10)
    log_b = cube("HOME_PROP_fireplace_right_log_b", (4.66, 5.74, 0.60), (0.42, 0.10, 0.07), materials["wood"], bevel=0.035)
    log_b.rotation_euler[2] = math.radians(-12)
    cube("HOME_PROP_fireplace_right_ember_bed", (4.45, 5.72, 0.48), (0.72, 0.12, 0.055), materials["fire"], bevel=0.04)
    mantel_candle_heights = (0.28, 0.36, 0.30)
    mantel_candle_base_z = 2.55
    for idx, (cx, candle_height) in enumerate(zip((3.72, 4.45, 5.18), mantel_candle_heights)):
        cylinder(
            f"HOME_PROP_fireplace_right_mantel_candle_{idx}",
            (cx, 4.98, mantel_candle_base_z + candle_height / 2.0),
            0.042,
            candle_height,
            materials["wax"],
            vertices=18,
        )
        cone(
            f"HOME_PROP_fireplace_right_mantel_flame_{idx}",
            (cx, 4.98, mantel_candle_base_z + candle_height + 0.055),
            0.030,
            0.006,
            0.090,
            materials["fire_hot"],
            vertices=12,
        )

    # The generic fireplace gets scaled for the canonical right-hand mass.
    # Reintroduce a camera-facing flame layer after that transform so the
    # hearth remains visibly alive instead of disappearing behind the grate.
    for idx, dx in enumerate((-0.44, -0.15, 0.15, 0.44)):
        sphere(
            f"HOME_PROP_fireplace_right_front_ember_{idx}",
            (4.45 + dx, 5.405, 0.690 + 0.010 * (idx % 2)),
            (0.125, 0.020, 0.038),
            materials["fire_hot"] if idx % 2 else materials["fire"],
        )
    for idx, (dx, flame_w, flame_h, tilt) in enumerate((
        (-0.32, 0.105, 0.13, -8.0),
        (-0.10, 0.115, 0.18, 6.0),
        (0.11, 0.110, 0.16, -4.0),
        (0.32, 0.100, 0.12, 8.0),
    )):
        base = sphere(
            f"HOME_PROP_fireplace_right_front_base_{idx}",
            (4.45 + dx, 5.390, 0.735),
            (flame_w * 1.10, 0.026, 0.060),
            materials["fire"],
        )
        base.rotation_euler[1] = math.radians(tilt * 0.18)
        lobe = sphere(
            f"HOME_PROP_fireplace_right_front_flame_{idx}",
            (4.45 + dx, 5.375, 0.72 + flame_h * 0.56),
            (flame_w, 0.026, flame_h),
            materials["fire"],
        )
        lobe.rotation_euler[1] = math.radians(tilt)
        inner = sphere(
            f"HOME_PROP_fireplace_right_front_hot_{idx}",
            (4.45 + dx * 0.96, 5.340, 0.70 + flame_h * 0.34),
            (flame_w * 0.43, 0.019, flame_h * 0.45),
            materials["fire_hot"],
        )
        inner.rotation_euler[1] = math.radians(tilt * 0.45)

    for idx, (dx, radius, tongue_h, tilt) in enumerate((
        (-0.17, 0.060, 0.43, -5.0),
        (0.06, 0.072, 0.56, 4.0),
        (0.27, 0.055, 0.38, 8.0),
    )):
        tongue = cone(
            f"HOME_PROP_fireplace_right_front_tongue_{idx}",
            (4.45 + dx, 5.390, 0.72 + tongue_h * 0.50),
            radius,
            0.010,
            tongue_h,
            materials["fire"],
            vertices=16,
        )
        tongue.rotation_euler[1] = math.radians(tilt)

    cube("HOME_ARCH_window_right", (7.82, 6.62, 3.72), (0.98, 0.07, 1.80), materials["window"], bevel=0.08)
    # Canonical right window: tall Gothic lancets with clean mullions and
    # restrained tracery. Avoid the old criss-cross lattice that read as
    # branches/wires at Home scale.
    gothic_arch("HOME_ARCH_window_right_frame", 7.82, 6.48, 2.12, 3.15, 5.20, 1.80, materials["arch_stone"], bevel=0.105)
    gothic_arch("HOME_ARCH_window_right_inner_frame", 7.82, 6.43, 1.82, 3.18, 5.03, 1.92, materials["stone_dark"], bevel=0.035)
    for idx, offset in enumerate((-0.34, 0.0, 0.34)):
        cube(
            f"HOME_PROP_window_mullion_v_{idx}",
            (7.82 + offset, 6.40, 3.47),
            (0.024 if offset else 0.030, 0.040, 1.42),
            materials["brass_dark"],
            bevel=0.009,
        )
    for idx, z in enumerate((2.78, 3.46, 4.10)):
        cube(
            f"HOME_PROP_window_transom_{idx}",
            (7.82, 6.40, z),
            (0.76, 0.040, 0.022),
            materials["brass_dark"],
            bevel=0.009,
        )
    # Twin upper lancets and a small rose keep the silhouette architectural
    # instead of turning the glass into a diagonal cage.
    for side in (-1, 1):
        gothic_arch(
            f"HOME_PROP_window_lancet_{side}",
            7.82 + side * 0.36,
            6.39,
            0.54,
            4.22,
            4.92,
            3.96,
            materials["brass_dark"],
            bevel=0.024,
        )
    rose_points = [
        (
            7.82 + 0.23 * math.cos(i * math.tau / 24),
            6.385,
            4.72 + 0.23 * math.sin(i * math.tau / 24),
        )
        for i in range(25)
    ]
    curve_tube("HOME_PROP_window_rose", rose_points, 0.020, materials["brass_dark"])
    for idx, angle in enumerate((0.0, math.pi / 2, math.pi, math.pi * 1.5)):
        curve_tube(
            f"HOME_PROP_window_rose_spoke_{idx}",
            [
                (7.82, 6.382, 4.72),
                (7.82 + 0.19 * math.cos(angle), 6.382, 4.72 + 0.19 * math.sin(angle)),
            ],
            0.010,
            materials["brass_dark"],
        )
    cube("HOME_PROP_window_sill", (7.82, 6.20, 1.84), (1.10, 0.26, 0.11), materials["stone"], bevel=0.04)
    sphere(
        "HOME_PROP_window_moon",
        (7.02, 6.50, 4.56),
        (0.27, 0.026, 0.27),
        materials["moon"],
    )

    for name, x in (("far_left", -8.05), ("left", -4.65), ("center", 0.0), ("right", 4.35), ("far_right", 8.0)):
        add_banner(name, x, materials)

    add_table_and_board(materials)
    add_armor(materials)
    # Match the canonical suit: tall, narrow and ceremonial rather than a
    # broad toy-robot silhouette. Scale about the pedestal so its footprint
    # stays fixed while the upper body gains Gothic verticality.
    armor_origin = Vector((1.55, 5.28, 0.24))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HOME_PROP_armor_"):
            delta = obj.location - armor_origin
            obj.location = Vector((
                armor_origin.x + delta.x * 0.78,
                armor_origin.y + delta.y * 0.92 + 0.55,
                armor_origin.z + delta.z * 1.14,
            ))
            obj.scale.x *= 0.78
            obj.scale.y *= 0.92
            obj.scale.z *= 1.14
    # Armour overlays are viewed from camera-side (-Y). flat_panel's default
    # polygon winding points the front-face normals toward +Y, which made the
    # focal metal render nearly black despite dedicated key/rim lights.
    def armor_panel(name, points_xz, y, depth, mat, *, bevel=0.03):
        return flat_panel(name, list(reversed(points_xz)), y, depth, mat, bevel=bevel)

    # Keep the dark drapery as a recess accent rather than a rectangular cape
    # behind the helmet. The canonical suit must read as articulated metal first.
    armor_panel(
        "HOME_PROP_armor_cape",
        [(1.17, 2.62), (1.93, 2.62), (1.86, 0.92), (1.55, 0.66), (1.24, 0.92)],
        5.82,
        0.040,
        materials["velvet_dark"],
        bevel=0.025,
    )
    flat_panel(
        "HOME_PROP_armor_chest_plate",
        [
            (1.24, 2.78), (1.86, 2.78),
            (1.82, 2.43), (1.70, 2.12),
            (1.55, 1.96),
            (1.40, 2.12), (1.28, 2.43),
        ],
        5.505,
        0.045,
        materials["armor_steel"],
        bevel=0.040,
    )
    # Two narrow fauld lames instead of the old bright three-bar robot belt.
    for idx, (z, half_w) in enumerate(((1.92, 0.30), (1.82, 0.325))):
        cube(
            f"HOME_PROP_armor_fauld_{idx}",
            (1.55, 5.47, z),
            (half_w, 0.022, 0.030),
            materials["armor_steel"],
            bevel=0.018,
        )

    for side in (-1, 1):
        # Sharp pauldron overlay masks the spherical construction underneath.
        px = 1.55 + side * 0.42
        if side < 0:
            pauldron_points = [
                (1.35, 2.46), (1.15, 2.45), (1.02, 2.35),
                (1.10, 2.25), (1.30, 2.27),
            ]
        else:
            pauldron_points = [
                (1.75, 2.46), (1.95, 2.45), (2.08, 2.35),
                (2.00, 2.25), (1.80, 2.27),
            ]
        armor_panel(
            f"HOME_PROP_armor_pauldron_front_{side}",
            pauldron_points,
            5.575,
            0.032,
            materials["armor_steel"],
            bevel=0.026,
        )

        # Separate upper-arm and forearm plates preserve the elbow break.
        if side < 0:
            upper_arm = [
                (1.18, 2.31), (1.07, 2.27), (0.99, 2.04),
                (1.03, 1.94), (1.12, 1.98), (1.25, 2.24),
            ]
            forearm = [
                (1.04, 1.91), (0.98, 1.84), (1.00, 1.64),
                (1.08, 1.57), (1.16, 1.67), (1.14, 1.86),
            ]
        else:
            upper_arm = [
                (1.92, 2.31), (2.03, 2.27), (2.11, 2.04),
                (2.07, 1.94), (1.98, 1.98), (1.85, 2.24),
            ]
            forearm = [
                (2.06, 1.91), (2.12, 1.84), (2.10, 1.64),
                (2.02, 1.57), (1.94, 1.67), (1.96, 1.86),
            ]
        armor_panel(
            f"HOME_PROP_armor_arm_plate_{side}",
            upper_arm,
            5.590,
            0.032,
            materials["armor_steel"],
            bevel=0.022,
        )
        armor_panel(
            f"HOME_PROP_armor_forearm_plate_{side}",
            forearm,
            5.600,
            0.030,
            materials["armor_steel"],
            bevel=0.020,
        )

        cx = 1.55 + side * 0.145
        armor_panel(
            f"HOME_PROP_armor_shin_plate_{side}",
            [
                (cx - 0.090, 0.54), (cx + 0.090, 0.54),
                (cx + 0.105, 1.13), (cx + 0.065, 1.30),
                (cx, 1.36),
                (cx - 0.065, 1.30), (cx - 0.105, 1.13),
            ],
            5.67,
            0.034,
            materials["armor_steel"],
            bevel=0.024,
        )
        armor_panel(
            f"HOME_PROP_armor_thigh_plate_{side}",
            [
                (cx - 0.105, 1.34), (cx + 0.105, 1.34),
                (cx + 0.120, 1.66), (cx + 0.080, 1.73),
                (cx - 0.080, 1.73), (cx - 0.120, 1.66),
            ],
            5.635,
            0.032,
            materials["armor_steel"],
            bevel=0.024,
        )

        tx = 1.55 + side * 0.205
        armor_panel(
            f"HOME_PROP_armor_tasset_front_{side}",
            [
                (tx - 0.125, 1.82), (tx + 0.125, 1.82),
                (tx + 0.105, 1.52), (tx, 1.42), (tx - 0.105, 1.52),
            ],
            5.585,
            0.032,
            materials["armor_steel"],
            bevel=0.025,
        )

        curve_tube(
            f"HOME_PROP_armor_greave_ridge_{side}",
            [(cx, 5.635, 0.63), (cx, 5.625, 1.18), (cx, 5.620, 1.30)],
            0.012,
            materials["brass_dark"],
        )

    curve_tube(
        "HOME_PROP_armor_chest_v_left",
        [(1.28, 5.445, 2.78), (1.43, 5.435, 2.45), (1.55, 5.430, 2.24)],
        0.012,
        materials["armor_steel"],
    )
    curve_tube(
        "HOME_PROP_armor_chest_v_right",
        [(1.82, 5.445, 2.78), (1.67, 5.435, 2.45), (1.55, 5.430, 2.24)],
        0.012,
        materials["armor_steel"],
    )
    add_trophy(materials)
    add_side_furnishings(materials)
    add_stairs(materials)

    # Chandelier: keep the same authored identity but lift and tighten it so it
    # frames the focal wall instead of masking the armour and central banner.
    cylinder("HOME_PROP_chandelier_drop", (0, 2.20, 5.68), 0.034, 0.64, materials["brass_dark"])
    ring_points = [
        (
            1.12 * math.cos(i * math.tau / 24),
            2.20 + 0.64 * math.sin(i * math.tau / 24),
            4.92 + 0.13 * math.sin(i * math.tau / 24),
        )
        for i in range(25)
    ]
    curve_tube("HOME_PROP_chandelier_ring", ring_points, 0.032, materials["brass_dark"])
    inner_ring = [
        (
            0.75 * math.cos(i * math.tau / 24),
            2.20 + 0.43 * math.sin(i * math.tau / 24),
            4.89 + 0.10 * math.sin(i * math.tau / 24),
        )
        for i in range(25)
    ]
    curve_tube("HOME_PROP_chandelier_inner_ring", inner_ring, 0.021, materials["brass"])
    lower_outer_ring = [
        (
            1.12 * math.cos(i * math.tau / 24),
            2.20 + 0.64 * math.sin(i * math.tau / 24),
            4.82 + 0.13 * math.sin(i * math.tau / 24),
        )
        for i in range(25)
    ]
    curve_tube("HOME_PROP_chandelier_lower_ring", lower_outer_ring, 0.021, materials["brass_dark"])
    for idx in range(8):
        angle = idx * math.tau / 8.0
        x = 1.12 * math.cos(angle)
        y = 2.20 + 0.64 * math.sin(angle)
        z_mid = 4.87 + 0.13 * math.sin(angle)
        curve_tube(
            f"HOME_PROP_chandelier_dropbar_{idx}",
            [(x, y, z_mid - 0.07), (x, y, z_mid + 0.07)],
            0.012,
            materials["brass_dark"],
        )
    for idx, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        curve_tube(
            f"HOME_PROP_chandelier_spoke_{idx}",
            [
                (0.0, 2.20, 4.88),
                (1.00 * math.cos(angle), 2.20 + 0.57 * math.sin(angle), 4.88),
            ],
            0.017,
            materials["brass_dark"],
        )
    for idx, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        rx = 0.88 * math.cos(angle)
        ry = 2.28 + 0.54 * math.sin(angle)
        curve_tube(
            f"HOME_PROP_chandelier_chain_{idx}",
            [(0.0, 2.20, 5.98), (rx, ry, 5.08)],
            0.020,
            materials["brass_dark"],
        )
    sphere("HOME_PROP_chandelier_hub", (0, 2.20, 4.89), (0.080, 0.080, 0.074), materials["brass_dark"])
    for idx in range(8):
        angle = idx * math.tau / 8.0
        cx = 1.04 * math.cos(angle)
        cy = 2.20 + 0.60 * math.sin(angle)
        cz = 4.96 + 0.12 * math.sin(angle)
        cylinder(
            f"HOME_PROP_chandelier_candle_{idx}",
            (cx, cy, cz + 0.15),
            0.035,
            0.24,
            materials["wax"],
            vertices=16,
        )
        cone(
            f"HOME_PROP_chandelier_flame_{idx}",
            (cx, cy, cz + 0.31),
            0.024,
            0.005,
            0.075,
            materials["fire_hot"],
            vertices=12,
        )
        cylinder(f"HOME_PROP_chandelier_cup_{idx}", (cx, cy, cz + 0.025), 0.060, 0.050, materials["brass_dark"], vertices=16)
        add_point_light(f"HOME_LIGHT_chandelier_{idx}", (cx, cy - 0.05, cz + 0.33), 18, (1.0, 0.34, 0.09), radius=0.24)

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

    for idx, x in enumerate((-8.0, -4.15, 2.45, 7.95)):
        cube(f"HOME_PROP_torch_{idx}", (x, 6.02, 2.45), (0.06, 0.08, 0.34), materials["brass_dark"], bevel=0.025)
        cube(f"HOME_PROP_torch_candle_{idx}", (x, 5.96, 2.78), (0.045, 0.045, 0.18), materials["paper"], bevel=0.012)
        cone(f"HOME_PROP_torch_flame_{idx}", (x, 5.94, 3.02), 0.045, 0.008, 0.14, materials["fire_hot"], vertices=12)
        add_point_light(f"HOME_LIGHT_torch_{idx}", (x, 5.62, 3.02), 54, (1.0, 0.34, 0.085), radius=0.38)

    # Global lights establish readable stone/wood while practicals keep the
    # warmth local. Cool right-side fill hints at the window/exterior.
    add_area_light("HOME_LIGHT_key", (-3.8, -2.0, 6.5), 36, (0.56, 0.50, 0.44), 4.2, target=(0, 2.4, 1.6))
    add_area_light("HOME_LIGHT_fill", (5.4, 0.6, 5.0), 24, (0.11, 0.24, 0.44), 3.8, target=(1.8, 3.0, 1.8))
    add_area_light("HOME_LIGHT_back", (0, 7.0, 5.8), 62, (0.62, 0.34, 0.22), 3.2, target=(0, 2.5, 2.2))
    add_area_light("HOME_LIGHT_floor_bounce", (0, -3.2, 2.6), 74, (0.36, 0.22, 0.15), 6.2, target=(0, 1.4, 0.15))
    add_area_light("HOME_LIGHT_moon", (8.4, 4.2, 5.6), 225, (0.14, 0.34, 0.68), 3.9, target=(3.2, 2.2, 1.8))
    add_area_light("HOME_LIGHT_table_read", (0.0, -3.0, 5.8), 236, (1.0, 0.68, 0.42), 2.75, target=(0, 1.0, 1.25))
    add_area_light("HOME_LIGHT_drape_read", (0.0, -5.0, 2.8), 188, (0.90, 0.49, 0.23), 2.0, target=(0, -0.72, 0.30))
    add_area_light("HOME_LIGHT_library_read", (-4.6, 2.8, 5.4), 90, (0.74, 0.40, 0.22), 2.2, target=(-2.65, 5.9, 2.6))
    add_area_light("HOME_LIGHT_fireplace_left_pool", (-6.15, 3.65, 3.4), 190, (1.0, 0.37, 0.11), 2.2, target=(-6.15, 5.65, 1.35))
    add_area_light("HOME_LIGHT_fireplace_right_pool", (4.45, 3.65, 3.5), 255, (1.0, 0.37, 0.11), 2.25, target=(4.45, 5.65, 1.45))
    add_area_light("HOME_LIGHT_armor_rim", (4.8, 3.4, 5.2), 150, (0.42, 0.52, 0.66), 2.3, target=(1.55, 5.28, 2.4))
    add_area_light("HOME_LIGHT_armor_warm", (-0.8, 2.6, 4.2), 96, (0.82, 0.52, 0.28), 2.1, target=(1.55, 5.28, 2.35))
    add_area_light("HOME_LIGHT_armor_front", (1.1, 1.2, 4.9), 68, (0.66, 0.72, 0.78), 1.65, target=(1.55, 5.28, 2.40))

    if engine == "eevee":
        configure_cinematic_compositor(scene)

    camera_data = bpy.data.cameras.new("HOME_CAMERA_CANONICAL")
    camera_data.lens = 50.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new("HOME_CAMERA_CANONICAL", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, -16.0, 4.85)
    target = (0.0, 2.30, 1.55)
    look_at(camera, target)
    scene.camera = camera

    try:
        scene.view_settings.exposure = -0.20
    except Exception:
        pass
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
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
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
    print(json.dumps({"contract": CONTRACT, "output": str(out_dir), "objects": metadata["object_count"]}))


if __name__ == "__main__":
    main()