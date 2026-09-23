#!/usr/bin/env python3
"""Build the independent War Room v3 "Cartographer's Chamber" shell.

V3 deliberately keeps the live-board anchor and runtime contracts compatible
with the existing renderer while giving the room a separate visual identity:
one ceremonial hearth, an asymmetric map archive, richer natural materials and
smoother hero curves. The v1 and v2 assets remain untouched and publish to
their own channels.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_war_room_premium as base  # noqa: E402


CONTRACT = "war-room-cartographers-v3"
V3_WEATHER_MATERIALS = frozenset({
    "WR3_MAT_limestone_plaster",
    "WR3_MAT_floor_slate",
    "WR3_MAT_honed_limestone",
    "WR3_MAT_honed_limestone_light",
})


def material_slots_named(name):
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        for index, material in enumerate(obj.data.materials):
            if material and material.name == name:
                yield obj, index


def replace_static_material(old_name, replacement):
    replaced = 0
    for obj, index in list(material_slots_named(old_name)):
        obj.data.materials[index] = replacement
        replaced += 1
    if replaced == 0:
        raise RuntimeError(f"War Room v3 material source missing: {old_name}")
    return replaced


def build_v3_palette():
    """Install a warmer, more separated natural palette on the static shell."""
    palette = {
        "plaster": base.material(
            "WR3_MAT_limestone_plaster", (0.285, 0.210, 0.130, 1),
            rough=0.86, coat=0.008, texture="stone", scale=4.7, bump=0.060, weather=True,
        ),
        "floor": base.material(
            "WR3_MAT_floor_slate", (0.055, 0.066, 0.070, 1),
            rough=0.76, coat=0.015, texture="stone", scale=5.2, bump=0.052, weather=True,
        ),
        "stone": base.material(
            "WR3_MAT_honed_limestone", (0.205, 0.142, 0.080, 1),
            rough=0.78, coat=0.012, texture="stone", scale=4.6, bump=0.078, weather=True,
        ),
        "stone_light": base.material(
            "WR3_MAT_honed_limestone_light", (0.335, 0.245, 0.145, 1),
            rough=0.73, coat=0.015, texture="stone", scale=4.5, bump=0.064, weather=True,
        ),
        "stone_shadow": base.material(
            "WR3_MAT_limestone_shadow", (0.072, 0.048, 0.031, 1),
            rough=0.84, texture="stone", scale=4.8, bump=0.050,
        ),
        "wall_walnut": base.material(
            "WR3_MAT_wall_walnut", (0.050, 0.021, 0.010, 1),
            rough=0.56, coat=0.08, texture="wood", scale=3.2, bump=0.036,
        ),
        "walnut": base.material(
            "WR3_MAT_rich_walnut", (0.085, 0.030, 0.010, 1),
            rough=0.44, coat=0.20, texture="wood", scale=3.8, bump=0.040,
        ),
        "walnut_dark": base.material(
            "WR3_MAT_dark_walnut", (0.035, 0.012, 0.006, 1),
            rough=0.51, coat=0.13, texture="wood", scale=3.4, bump=0.034,
        ),
        "brass": base.material(
            "WR3_MAT_antique_brass", (0.48, 0.205, 0.040, 1),
            metal=0.90, rough=0.31, coat=0.15, texture="metal", scale=24, bump=0.026,
        ),
        "brass_dark": base.material(
            "WR3_MAT_antique_brass_dark", (0.17, 0.065, 0.014, 1),
            metal=0.88, rough=0.39, coat=0.10, texture="metal", scale=28, bump=0.022,
        ),
        "oxblood": base.material(
            "WR3_MAT_oxblood_leather", (0.155, 0.022, 0.014, 1),
            rough=0.50, coat=0.16, sheen=0.10, texture="leather", scale=46, bump=0.082,
        ),
        "oxblood_dark": base.material(
            "WR3_MAT_oxblood_leather_dark", (0.060, 0.012, 0.009, 1),
            rough=0.58, coat=0.10, sheen=0.08, texture="leather", scale=50, bump=0.066,
        ),
        "green_leather": base.material(
            "WR3_MAT_bottle_green_leather", (0.010, 0.078, 0.038, 1),
            rough=0.49, coat=0.16, sheen=0.08, texture="leather", scale=48, bump=0.062,
        ),
        "wine_velvet": base.material(
            "WR3_MAT_wine_velvet", (0.255, 0.012, 0.030, 1),
            rough=0.88, coat=0.02, sheen=0.40, texture="fabric", scale=38, bump=0.066,
        ),
        "wine_rug": base.material(
            "WR3_MAT_wine_rug", (0.125, 0.009, 0.022, 1),
            rough=0.93, sheen=0.22, texture="fabric", scale=54, bump=0.095,
        ),
    }

    replacements = {
        "WR_MAT_wall_plaster": palette["plaster"],
        "WR_MAT_floor_underlay": palette["floor"],
        "WR_MAT_stone": palette["stone"],
        "WR_MAT_stone_light": palette["stone_light"],
        "WR_MAT_stone_shadow": palette["stone_shadow"],
        "WR_MAT_wall_walnut": palette["wall_walnut"],
        "WR_MAT_wall_recess": palette["walnut_dark"],
        "WR_MAT_walnut_dark": palette["walnut_dark"],
        "WR_MAT_trim_walnut": palette["walnut"],
        "WR_MAT_table_walnut": palette["walnut"],
        "WR_MAT_frame_walnut": palette["walnut_dark"],
        "WR_MAT_brass": palette["brass"],
        "WR_MAT_brass_dark": palette["brass_dark"],
        "WR_MAT_leather": palette["oxblood"],
        "WR_MAT_leather_dark": palette["oxblood_dark"],
        "WR_MAT_desk_leather": palette["green_leather"],
        "WR_MAT_table_leather": palette["green_leather"],
        "WR_MAT_rug": palette["wine_rug"],
        "WR_MAT_canon_burgundy": palette["wine_velvet"],
        "WR_MAT_canon_burgundy_dark": palette["oxblood_dark"],
    }
    for old_name, replacement in replacements.items():
        replace_static_material(old_name, replacement)
    return palette


def remove_objects(*prefixes):
    removed = 0
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    return removed


def cubic_point(points, t):
    p0, p1, p2, p3 = points
    omt = 1.0 - t
    return (
        p0 * (omt ** 3)
        + p1 * (3.0 * omt * omt * t)
        + p2 * (3.0 * omt * t * t)
        + p3 * (t ** 3)
    )


def cubic_tangent(points, t):
    p0, p1, p2, p3 = points
    omt = 1.0 - t
    return (
        (p1 - p0) * (3.0 * omt * omt)
        + (p2 - p1) * (6.0 * omt * t)
        + (p3 - p2) * (3.0 * t * t)
    ).normalized()


def add_smooth_lancet_half(name, points, material, owner, *, width=0.31, depth=0.22, segments=18):
    """Create an extruded smooth stone band instead of a chain of rotated cubes."""
    vertices = []
    for index in range(segments + 1):
        t = index / segments
        center = cubic_point(points, t)
        tangent = cubic_tangent(points, t)
        normal = Vector((-tangent.z, 0.0, tangent.x)).normalized()
        outer = center + normal * (width / 2.0)
        inner = center - normal * (width / 2.0)
        for y in (-depth / 2.0, depth / 2.0):
            vertices.extend(((outer.x, center.y + y, outer.z), (inner.x, center.y + y, inner.z)))

    faces = []
    for index in range(segments):
        a = index * 4
        b = (index + 1) * 4
        faces.extend((
            (a, b, b + 1, a + 1),
            (a + 2, a + 3, b + 3, b + 2),
            (a, a + 2, b + 2, b),
            (a + 1, b + 1, b + 3, a + 3),
        ))
    faces.extend(((0, 1, 3, 2), (segments * 4, segments * 4 + 2, segments * 4 + 3, segments * 4 + 1)))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    base.tag(obj)
    owner.objects.link(obj)
    bevel = obj.modifiers.new("premium-bevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 4
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def rebuild_lancet(static, palette):
    remove_objects("WR_CANON_arch_left_curve_", "WR_CANON_arch_left_keystone")
    cx, y = -4.55, 6.36
    shoulder, peak, span = 5.04, 6.48, 1.48
    left = (
        Vector((cx - span, y, shoulder)),
        Vector((cx - span, y, shoulder + 0.64)),
        Vector((cx - span * 0.50, y, peak - 0.18)),
        Vector((cx, y, peak)),
    )
    right = (
        Vector((cx + span, y, shoulder)),
        Vector((cx + span, y, shoulder + 0.64)),
        Vector((cx + span * 0.50, y, peak - 0.18)),
        Vector((cx, y, peak)),
    )
    left_arch = add_smooth_lancet_half("WR3_ARCH_lancet_left", left, palette["stone"], static)
    right_arch = add_smooth_lancet_half("WR3_ARCH_lancet_right", right, palette["stone"], static)
    base.cube("WR3_ARCH_lancet_keystone", (cx, 6.22, peak - 0.12),
              (0.19, 0.075, 0.24), palette["stone_light"], static, bevel=0.075)
    # These meshes are created after the inherited weather pass. Bake their
    # neutral vertex-colour layer explicitly; without it the material's
    # multiply node correctly evaluates missing colour data as black.
    base.WEATHER_MATERIALS = V3_WEATHER_MATERIALS
    base._bake_weather_colors(left_arch)
    base._bake_weather_colors(right_arch)


def add_cartography_archive(static, palette):
    """Replace v2's secondary hearth with a purpose-built campaign map archive."""
    cx, cy = 4.85, 6.16
    base.cube("WR3_MAP_ARCHIVE_shadow", (cx, 6.52, 1.48), (1.54, 0.10, 0.92),
              palette["walnut_dark"], static, bevel=0.08)
    base.cube("WR3_MAP_ARCHIVE_body", (cx, cy, 1.45), (1.38, 0.45, 0.74),
              palette["walnut"], static, bevel=0.11)
    base.cube("WR3_MAP_ARCHIVE_plinth", (cx, cy - 0.01, 0.66), (1.52, 0.51, 0.10),
              palette["walnut_dark"], static, bevel=0.065)
    base.cube("WR3_MAP_ARCHIVE_top", (cx, cy - 0.04, 2.24), (1.52, 0.53, 0.105),
              palette["walnut_dark"], static, bevel=0.095)
    base.cube("WR3_MAP_ARCHIVE_blotter", (cx, cy - 0.58, 2.34), (1.13, 0.34, 0.025),
              palette["green_leather"], static, bevel=0.022)

    # A restrained brass front frame makes the cabinetry read as campaign
    # furniture rather than a generic chest of drawers at gameplay distance.
    for side in (-1, 1):
        base.cube(f"WR3_MAP_ARCHIVE_front_stile_{side}", (cx + side * 1.25, cy - 0.535, 1.45),
                  (0.026, 0.016, 0.62), palette["brass_dark"], static, bevel=0.014)
    for z in (0.78, 2.11):
        base.cube(f"WR3_MAP_ARCHIVE_front_rail_{z}", (cx, cy - 0.535, z),
                  (1.26, 0.016, 0.026), palette["brass_dark"], static, bevel=0.014)

    for column, x in enumerate((cx - 0.67, cx + 0.67)):
        for row, z in enumerate((0.96, 1.43, 1.90)):
            base.cube(f"WR3_MAP_ARCHIVE_drawer_{column}_{row}", (x, cy - 0.49, z),
                      (0.58, 0.040, 0.175), palette["walnut_dark"], static, bevel=0.035)
            base.cube(f"WR3_MAP_ARCHIVE_label_{column}_{row}", (x, cy - 0.545, z + 0.045),
                      (0.16, 0.014, 0.055), palette["brass_dark"], static, bevel=0.014)
            base.cylinder(f"WR3_MAP_ARCHIVE_pull_{column}_{row}", (x, cy - 0.585, z - 0.055),
                          0.050, 0.035, palette["brass"], static, vertices=32)
            bpy.context.object.rotation_euler.x = math.pi / 2

    # Two broad map rolls and one oxblood dispatch folio provide lived-in use
    # without rebuilding the visual clutter removed from the approved v2 shell.
    for index, (x, z, angle) in enumerate(((cx - 0.72, 2.47, -0.07), (cx - 0.18, 2.45, 0.10))):
        roll = base.cylinder(f"WR3_MAP_ARCHIVE_roll_{index}", (x, cy - 0.60, z),
                             0.075, 0.72, bpy.data.materials["WR_MAT_ivory"], static, vertices=40)
        roll.rotation_euler = (0, math.pi / 2 + angle, 0)
    folio = base.cube("WR3_MAP_ARCHIVE_folio", (cx + 0.68, cy - 0.60, 2.43),
                      (0.34, 0.25, 0.045), palette["oxblood"], static, bevel=0.045)
    folio.rotation_euler.z = -0.11
    base.cube("WR3_MAP_ARCHIVE_folio_band", (cx + 0.68, cy - 0.645, 2.48),
              (0.040, 0.26, 0.018), palette["brass_dark"], static, bevel=0.012)


def smooth_globe(static):
    sphere = bpy.data.objects.get("WR_CANON_globe_sphere")
    ring = bpy.data.objects.get("WR_CANON_globe_ring")
    equator = bpy.data.objects.get("WR_CANON_globe_equator")
    meridian = bpy.data.objects.get("WR_CANON_globe_meridian")
    if not all((sphere, ring, equator, meridian)):
        raise RuntimeError("War Room v3 globe source missing")
    sphere_mat = sphere.data.materials[0]
    ring_mat = ring.data.materials[0]
    line_mat = equator.data.materials[0]
    for obj in (sphere, ring, equator, meridian):
        bpy.data.objects.remove(obj, do_unlink=True)

    gx, gy, gz = 7.12, 4.54, 1.53
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.54, location=(gx, gy, gz))
    globe = bpy.context.object
    globe.name = "WR3_GLOBE_sphere"
    globe.data.materials.append(sphere_mat)
    base.tag(globe)
    base.relink(globe, static)
    for polygon in globe.data.polygons:
        polygon.use_smooth = True

    for name, major, minor, rotation, material in (
        ("WR3_GLOBE_ring", 0.66, 0.035, (math.pi / 2, 0, 0), ring_mat),
        ("WR3_GLOBE_equator", 0.545, 0.014, (0, 0, 0), line_mat),
        ("WR3_GLOBE_meridian", 0.545, 0.012, (math.pi / 2, 0, 0), line_mat),
    ):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=major, minor_radius=minor, major_segments=72, minor_segments=20,
            location=(gx, gy, gz), rotation=rotation,
        )
        obj = bpy.context.object
        obj.name = name
        obj.data.materials.append(material)
        base.tag(obj)
        base.relink(obj, static)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def tune_v3_lighting():
    scene = bpy.context.scene
    scene["war_room_variant"] = "v3-cartographers-chamber"
    scene["war_room_visual_canon"] = "cartographers-chamber-2026-09-22-v1"
    scene.view_settings.exposure = -0.10
    light_specs = {
        "WR_LIGHT_key": (500.0, (1.0, 0.72, 0.45)),
        "WR_LIGHT_fill": (210.0, (0.46, 0.60, 0.82)),
        "WR_LIGHT_top": (205.0, (1.0, 0.58, 0.30)),
        "WR_LIGHT_rear_wash_left": (320.0, (1.0, 0.56, 0.27)),
        "WR_LIGHT_rear_wash_right": (190.0, (0.54, 0.68, 0.92)),
    }
    for name, (energy, color) in light_specs.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "LIGHT":
            raise RuntimeError(f"War Room v3 light source missing: {name}")
        obj.data.energy = energy
        obj.data.color = color


def apply_v3_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("War Room v3 static shell missing")
    palette = build_v3_palette()
    removed = remove_objects(
        "WR_CANON_right_fireplace_",
        "WR_CANON_right_fire_light",
        "WR_ANCHOR_right_fireplace_practical",
        "WR_CANON_fireplace_block_right_",
    )
    if removed < 15:
        raise RuntimeError(f"War Room v3 removed too little secondary-hearth geometry: {removed}")
    rebuild_lancet(static, palette)
    add_cartography_archive(static, palette)
    smooth_globe(static)
    tune_v3_lighting()
    for obj in bpy.context.scene.objects:
        if obj.get("war_room_role"):
            obj["war_room_contract"] = CONTRACT
    bpy.context.scene["war_room_contract"] = CONTRACT


def validate_v3():
    names = {obj.name for obj in bpy.context.scene.objects}
    required = {
        "WR_ANCHOR_board_origin",
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
        "WR3_ARCH_lancet_left",
        "WR3_ARCH_lancet_right",
        "WR3_MAP_ARCHIVE_body",
        "WR3_MAP_ARCHIVE_blotter",
        "WR3_GLOBE_sphere",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"War Room v3 contract objects missing: {missing}")
    forbidden = sorted(
        name for name in names
        if name.startswith((
            "WR_CANON_right_fireplace_",
            "WR_CANON_right_fire_light",
            "WR_ANCHOR_right_fireplace_practical",
            "WR_CANON_fireplace_block_right_",
        ))
    )
    if forbidden:
        raise RuntimeError(f"War Room v3 secondary hearth returned: {forbidden}")
    if sum(1 for name in names if name == "WR_ANCHOR_fireplace_practical") != 1:
        raise RuntimeError("War Room v3 must contain exactly one fireplace practical")


def validate_runtime_glb_v3(path, expected_factors):
    data = base.read_glb_json(path)
    extensions_used = set(data.get("extensionsUsed", []))
    if base.MESH_COMPRESSION_EXTENSION not in extensions_used:
        raise RuntimeError(
            f"War Room v3 runtime GLB missing {base.MESH_COMPRESSION_EXTENSION}: {sorted(extensions_used)}"
        )
    compressed_views = sum(
        1 for row in data.get("bufferViews", [])
        if base.MESH_COMPRESSION_EXTENSION in row.get("extensions", {})
    )
    if compressed_views < 12:
        raise RuntimeError(f"War Room v3 meshopt coverage suspiciously small: {compressed_views}")
    node_names = {row.get("name") for row in data.get("nodes", [])}
    required_nodes = {
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
    }
    missing = sorted(required_nodes - node_names)
    if missing:
        raise RuntimeError(f"War Room v3 runtime nodes missing: {missing}")
    if "WR_ANCHOR_right_fireplace_practical" in node_names:
        raise RuntimeError("War Room v3 runtime contains the retired secondary-hearth anchor")

    materials = {row.get("name"): row for row in data.get("materials", [])}
    required_materials = {
        "WR3_MAT_limestone_plaster",
        "WR3_MAT_honed_limestone",
        "WR3_MAT_rich_walnut",
        "WR3_MAT_antique_brass",
        "WR3_MAT_oxblood_leather",
        "WR3_MAT_bottle_green_leather",
    }
    missing_materials = sorted(required_materials - set(materials))
    if missing_materials:
        raise RuntimeError(f"War Room v3 runtime materials missing: {missing_materials}")
    for name in required_materials:
        factor = materials[name].get("pbrMetallicRoughness", {}).get("baseColorFactor")
        expected = expected_factors.get(name)
        if not isinstance(factor, list) or len(factor) < 3 or min(factor[:3]) >= 0.95:
            raise RuntimeError(f"War Room v3 material lost authored colour: {name}={factor}")
        if expected is not None and any(abs(float(factor[i]) - float(expected[i])) > 0.012 for i in range(3)):
            raise RuntimeError(f"War Room v3 material factor drift: {name}={factor} expected={expected}")


def export_shell_v3(path):
    sanitized_links, runtime_textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = sanitized_links
    scene["war_room_runtime_texture_count"] = runtime_textures
    source_meshes, batched_meshes, merged_away = base.collapse_runtime_static_shell()
    base.WEATHER_MATERIALS = V3_WEATHER_MATERIALS
    base.strip_unused_weather_layers()
    print(f"War Room v3 runtime batching: {source_meshes} -> {batched_meshes} meshes ({merged_away} merged)")

    bpy.ops.object.select_all(action="DESELECT")
    runtime_anchors = {
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
    }
    selected = 0
    for obj in scene.objects:
        is_static_mesh = obj.type == "MESH" and obj.get("war_room_role") == base.ROLE_STATIC
        is_runtime_anchor = obj.type == "EMPTY" and obj.name in runtime_anchors
        if is_static_mesh or is_runtime_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 70:
        raise RuntimeError(f"War Room v3 runtime shell selection too small: {selected}")
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False,
        **base.meshopt_export_kwargs(),
    )
    patched = base.patch_runtime_glb_base_color_factors(path, factors)
    scene["war_room_runtime_base_color_factor_count"] = patched
    scene["war_room_runtime_mesh_compression"] = base.MESH_COMPRESSION_EXTENSION
    validate_runtime_glb_v3(path, factors)
    bpy.ops.object.select_all(action="DESELECT")


def main():
    options = base.args()
    base.CONTRACT = CONTRACT
    base.wipe()
    base.build()
    # Prove the inherited board/camera foundation before applying the distinct
    # v3 room identity. V3 then owns its own visual validation and export gate.
    base.validate()
    apply_v3_identity()
    validate_v3()

    blend = Path(options.blend)
    glb = Path(options.glb)
    preview = Path(options.preview)
    manifest = Path(options.manifest)
    for path in (blend, glb, preview, manifest):
        path.parent.mkdir(parents=True, exist_ok=True)
    base.manifest(manifest)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    base.render(preview)
    export_shell_v3(glb)
    print(f"War Room v3 OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
