#!/usr/bin/env python3
"""Export the canonical Blender Home scene as a browser-runtime GLB.

This deliberately reuses build_home_v2_blockout.py as the single scene source
of truth. Review renders stay owned by the Blender preview workflow; this
export only prepares a compact Three.js-consumable scene for R2.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
from pathlib import Path

import bpy
import bmesh

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_home_v2_blockout as home


LOGICAL_ID = "home.scene.runtime"
RUNTIME_CONTRACT = "home-blender-runtime-v1"


def argv_after_double_dash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=home.DEFAULT_REFERENCE)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--max-width", type=int, default=1000)
    return parser.parse_args(argv_after_double_dash())


def _gltf_safe_image_socket(socket, *, normal=False) -> bool:
    """Return True when a Principled input is driven by a glTF-safe image chain."""
    if socket is None or not socket.is_linked or len(socket.links) != 1:
        return False
    source = socket.links[0].from_node
    if not normal:
        return source is not None and source.type == "TEX_IMAGE"
    if source is None or source.type != "NORMAL_MAP":
        return False
    color = source.inputs.get("Color")
    if color is None or not color.is_linked or len(color.links) != 1:
        return False
    image_node = color.links[0].from_node
    return image_node is not None and image_node.type == "TEX_IMAGE"


def flatten_runtime_materials() -> None:
    """Strip Blender-only procedural links while preserving glTF image maps.

    Review materials may use Noise/Bump nodes that glTF cannot serialize.
    Runtime export falls back to authored scalar/base values for those chains,
    but keeps direct Image Texture inputs (and Image Texture -> Normal Map)
    intact so packed PBR textures survive into the GLB.
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            continue

        for input_name in ("Base Color", "Roughness", "Metallic"):
            socket = bsdf.inputs.get(input_name)
            if socket is None or _gltf_safe_image_socket(socket):
                continue
            for link in list(socket.links):
                mat.node_tree.links.remove(link)

        normal = bsdf.inputs.get("Normal")
        if normal is not None and not _gltf_safe_image_socket(normal, normal=True):
            for link in list(normal.links):
                mat.node_tree.links.remove(link)

        base = bsdf.inputs.get("Base Color")
        if base is not None and not base.is_linked:
            base.default_value = tuple(mat.diffuse_color)


def convert_curves_to_meshes() -> int:
    curves = [obj for obj in list(bpy.data.objects) if obj.type == "CURVE"]
    if not curves:
        return 0
    bpy.ops.object.select_all(action="DESELECT")
    for obj in curves:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.select_all(action="DESELECT")
    return len(curves)


# Props the runtime drives by node name (see homeBlenderFireKind / the moon in
# HomeBlenderScene3D.jsx): fire, candle flames, coffee steam and the moon must keep
# their own node, mesh and pivot. Everything else is static set dressing.
ANIMATED_PROP_NAME = re.compile(r"(flame|tongue|front_base|ember|_hot|steam|moon)", re.IGNORECASE)


# Klaus the cat breathes, glances up and flicks his ears at runtime
# (prepareHomeBlenderKlausRig): his parts must not dissolve into the room-wide
# material batches. They are joined into one multi-material node of their own,
# HOME_PROP_cat_body, except three small landmarks the runtime reads to place
# the head and ear pivots. His cushion and tassels stay static set dressing.
KLAUS_PART_NAME = re.compile(r"^HOME_PROP_cat_(?!cushion|tassel)", re.IGNORECASE)
KLAUS_BODY_NAME = "HOME_PROP_cat_body"
KLAUS_LANDMARK_NAMES = frozenset({
    "HOME_PROP_cat_nose",
    "HOME_PROP_cat_ear_inner_l",
    "HOME_PROP_cat_ear_inner_r",
})


def _is_static_batchable(name: str) -> bool:
    if name.startswith("HOME_ARCH_"):
        return True
    if KLAUS_PART_NAME.match(name):
        return False
    return name.startswith("HOME_PROP_") and not ANIMATED_PROP_NAME.search(name)


def consolidate_klaus() -> int:
    """Join Klaus into one node (plus the landmarks); returns the parts joined."""
    parts = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and KLAUS_PART_NAME.match(obj.name) and obj.name not in KLAUS_LANDMARK_NAMES
    ]
    body = bpy.context.scene.objects.get(KLAUS_BODY_NAME)
    if body is None or body.type != "MESH":
        raise SystemExit(f"Klaus body mesh {KLAUS_BODY_NAME} missing from the Home scene")
    missing = sorted(name for name in KLAUS_LANDMARK_NAMES if bpy.context.scene.objects.get(name) is None)
    if missing:
        raise SystemExit(f"Klaus landmarks missing from the Home scene: {missing}")
    with_modifiers = [obj for obj in parts if obj.modifiers]
    if with_modifiers:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in with_modifiers:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = with_modifiers[0]
        bpy.ops.object.convert(target="MESH")
    parts = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and KLAUS_PART_NAME.match(obj.name) and obj.name not in KLAUS_LANDMARK_NAMES
    ]
    body = bpy.context.scene.objects[KLAUS_BODY_NAME]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    if len(parts) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = KLAUS_BODY_NAME
    body.select_set(False)
    return len(parts)


# Only sub-pixel stars and small moon surface markings; the visible
# moon disc, dynamic hearth flames and every other protected prop keep their
# authored geometry, transforms, pivots and materials.
TINY_MOON_DETAIL_NAME = re.compile(r"^HOME_PROP_window_moon_(?:star|mare)_\d+$")
TINY_MOON_SEGMENTS = 16
TINY_MOON_RINGS = 10


def simplify_tiny_moon_details() -> dict:
    """Runtime-only LOD for the 40x20 UV spheres used by tiny moon details.

    These were given the full 1,520-triangle animated-moon budget merely
    because their names contain "moon". The original authored Blender review
    render remains unchanged. Rebuild only the small meshes, retaining
    object identity, local bounds, material and pivot for Three.js.
    """
    targets = sorted(
        (
            obj for obj in bpy.context.scene.objects
            if obj.type == "MESH" and TINY_MOON_DETAIL_NAME.fullmatch(obj.name)
        ),
        key=lambda obj: obj.name,
    )
    if len(targets) < 10:
        raise SystemExit(f"Moon detail LOD found only {len(targets)} targets; refusing unsafe export")

    before = after = 0
    for obj in targets:
        original = obj.data
        if obj.modifiers or len(original.materials) != 1:
            raise SystemExit(f"Moon detail {obj.name} has modifiers or unexpected materials")
        material = original.materials[0]
        if material is None:
            raise SystemExit(f"Moon detail {obj.name} lacks a material")
        if material.use_nodes and material.node_tree and any(
            node.type == "TEX_IMAGE" for node in material.node_tree.nodes
        ):
            raise SystemExit(f"Moon detail {obj.name} has a texture requiring original UVs")

        mins = [min(vertex.co[axis] for vertex in original.vertices) for axis in range(3)]
        maxs = [max(vertex.co[axis] for vertex in original.vertices) for axis in range(3)]
        if any(maxs[axis] - mins[axis] <= 0 for axis in range(3)):
            raise SystemExit(f"Moon detail {obj.name} has degenerate bounds")
        # The largest mare is only ~0.13 scene units across. Do not ever
        # silently simplify the main moon or an accidentally renamed prop.
        if max(maxs[axis] - mins[axis] for axis in range(3)) > 0.16:
            raise SystemExit(f"Moon detail {obj.name} is unexpectedly large")

        before += sum(len(face.vertices) - 2 for face in original.polygons)
        bm = bmesh.new()
        replacement = bpy.data.meshes.new(f"{obj.name}_runtime_lod")
        try:
            bmesh.ops.create_uvsphere(
                bm, u_segments=TINY_MOON_SEGMENTS, v_segments=TINY_MOON_RINGS, radius=1.0
            )
            bm.to_mesh(replacement)
        finally:
            bm.free()
        # The canonical helper bakes object scale into each mesh. Preserve
        # the original LOCAL bounds; object location/rotation are untouched.
        for vertex in replacement.vertices:
            for axis in range(3):
                vertex.co[axis] = (mins[axis] + maxs[axis]) * 0.5 + (
                    maxs[axis] - mins[axis]
                ) * 0.5 * vertex.co[axis]
        replacement.materials.append(material)
        for face in replacement.polygons:
            face.use_smooth = True
        replacement.update()
        after += sum(len(face.vertices) - 2 for face in replacement.polygons)
        obj.data = replacement
        if original.users == 0:
            bpy.data.meshes.remove(original)

    if after >= before // 2:
        raise SystemExit(f"Moon detail LOD not effective: {before} -> {after} triangles")
    return {"objects": len(targets), "triangles_before": before, "triangles_after": after}


# Three distant trees, each with three low-contrast silhouette panels and one
# hairline moonlit rim. The 2-4 mm edge bevels cost thousands of triangles
# even though the trees are tiny behind the window. Preserve the silhouette,
# image UVs and Blender review scene; remove *only* these live modifiers when
# exporting the browser runtime.
DISTANT_GARDEN_CROWN_NAME = re.compile(
    r"^HOME_PROP_window_garden_crown_(?:[0-2]_[0-2]|rim_[0-2])$"
)


def simplify_distant_garden_crowns() -> dict:
    targets = sorted(
        (
            obj for obj in bpy.context.scene.objects
            if obj.type == "MESH" and DISTANT_GARDEN_CROWN_NAME.fullmatch(obj.name)
        ),
        key=lambda obj: obj.name,
    )
    if len(targets) != 12:
        raise SystemExit(
            f"Garden crown LOD expected 12 silhouette panels, got {len(targets)}"
        )
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def triangle_count(obj):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if mesh is None:
            raise SystemExit(f"Garden crown {obj.name} cannot evaluate its mesh")
        try:
            return sum(len(face.vertices) - 2 for face in mesh.polygons)
        finally:
            evaluated.to_mesh_clear()

    before = sum(triangle_count(obj) for obj in targets)
    for obj in targets:
        mods = list(obj.modifiers)
        if len(mods) != 1 or mods[0].type != "BEVEL" or not (0 < mods[0].width <= 0.0041):
            raise SystemExit(
                f"Unexpected garden crown modifiers on {obj.name}: "
                f"{[(mod.name, mod.type) for mod in mods]}"
            )
        obj.modifiers.remove(mods[0])

    bpy.context.view_layer.update()
    after = sum(triangle_count(obj) for obj in targets)
    if not 1000 <= before - after <= before:
        raise SystemExit(
            f"Garden crown LOD failed triangle saving contract: {before} -> {after}"
        )
    return {
        "objects": len(targets),
        "triangles_before": before,
        "triangles_after": after,
    }


# Other strictly background-only shapes behind the moonlit window. These
# tiny bevels give no readable contour at the Home camera distance, unlike
# the scene's foreground architectural edges. The silhouettes and material
# assignments are kept identical to the authored review scene.
DISTANT_GARDEN_PANEL_NAME = re.compile(
    r"^HOME_PROP_window_garden_(?:hills|tower|tower_roof|"
    r"conifer_[01]|lawn|path|stepstone_[0-2]|hedge_[01])$"
)


def simplify_distant_garden_panels() -> dict:
    targets = sorted(
        (
            obj for obj in bpy.context.scene.objects
            if obj.type == "MESH" and DISTANT_GARDEN_PANEL_NAME.fullmatch(obj.name)
        ),
        key=lambda obj: obj.name,
    )
    if len(targets) != 12:
        raise SystemExit(
            f"Distant garden panel LOD expected 12 silhouette panels, got {len(targets)}"
        )
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def triangle_count(obj):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if mesh is None:
            raise SystemExit(f"Garden panel {obj.name} cannot evaluate its mesh")
        try:
            return sum(len(face.vertices) - 2 for face in mesh.polygons)
        finally:
            evaluated.to_mesh_clear()

    before = sum(triangle_count(obj) for obj in targets)
    for obj in targets:
        mods = list(obj.modifiers)
        if (
            len(mods) != 1
            or mods[0].type != "BEVEL"
            or not (0 < mods[0].width <= 0.0041)
            or len(obj.data.materials) != 1
        ):
            raise SystemExit(
                f"Unexpected garden panel modifiers/material slots on {obj.name}"
            )
        obj.modifiers.remove(mods[0])

    bpy.context.view_layer.update()
    after = sum(triangle_count(obj) for obj in targets)
    if not 1000 <= before - after <= before:
        raise SystemExit(
            f"Distant garden panel LOD failed triangle saving contract: {before} -> {after}"
        )
    return {
        "objects": len(targets),
        "triangles_before": before,
        "triangles_after": after,
    }


# The two ceremonial banners each have an inner/outer gilded outline.
# Their 40-point circular paths are worth retaining, but the thin tubing
# uses an unnecessarily dense 3-step bevel cross-section. Lower ONLY the
# radial section in the browser GLB, leaving its centreline, thickness,
# materials and the authored Blender review scene untouched.
BANNER_MEDALLION_CURVES = frozenset({
    "HOME_PROP_banner_medallion_left",
    "HOME_PROP_banner_medallion_right",
    "HOME_PROP_banner_medallion_inner_left",
    "HOME_PROP_banner_medallion_inner_right",
})


def simplify_banner_medallion_tubes() -> dict:
    objects = sorted(
        (obj for obj in bpy.context.scene.objects if obj.name in BANNER_MEDALLION_CURVES),
        key=lambda obj: obj.name,
    )
    if {obj.name for obj in objects} != BANNER_MEDALLION_CURVES:
        raise SystemExit(
            f"Banner medallion LOD found {len(objects)} instead of four exact curves"
        )
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def evaluated_triangles(obj) -> int:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if mesh is None:
            raise SystemExit(f"Banner medallion {obj.name} did not evaluate")
        try:
            return sum(len(face.vertices) - 2 for face in mesh.polygons)
        finally:
            evaluated.to_mesh_clear()

    before = sum(evaluated_triangles(obj) for obj in objects)
    for obj in objects:
        curve = obj.data
        if (
            obj.type != "CURVE"
            or curve.dimensions != "3D"
            or curve.bevel_resolution != 3
            or not (0 < curve.bevel_depth <= 0.0121)
            or len(curve.splines) != 1
            or curve.splines[0].type != "POLY"
            or len(curve.splines[0].points) != 41
        ):
            raise SystemExit(f"Unexpected banner medallion geometry on {obj.name}")
        # One level gives a smooth, low-cost cross-section at the normal
        # Home view distance. All forty path segments remain unchanged.
        curve.bevel_resolution = 1

    bpy.context.view_layer.update()
    after = sum(evaluated_triangles(obj) for obj in objects)
    if not 300 <= before - after <= before:
        raise SystemExit(
            f"Banner medallion LOD has insufficient savings: {before} -> {after}"
        )
    return {
        "objects": len(objects),
        "triangles_before": before,
        "triangles_after": after,
    }


# Runtime-only tubing LOD for the small stationary chandelier framing the
# far wall. Keep centreline, thickness, material and original Blender scene.
CHANDELIER_THIN_TUBES = frozenset({
    "HOME_PROP_chandelier_inner_ring",
    "HOME_PROP_chandelier_lower_ring",
    *(f"HOME_PROP_chandelier_dropbar_{i}" for i in range(8)),
    *(f"HOME_PROP_chandelier_spoke_{i}" for i in range(4)),
})


def simplify_chandelier_thin_tubes() -> dict:
    objects = sorted(
        (obj for obj in bpy.context.scene.objects if obj.name in CHANDELIER_THIN_TUBES),
        key=lambda obj: obj.name,
    )
    if {obj.name for obj in objects} != CHANDELIER_THIN_TUBES:
        raise SystemExit(f"Chandelier LOD expected {len(CHANDELIER_THIN_TUBES)} tubes, found {len(objects)}")
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def tris(obj):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if mesh is None:
            raise SystemExit(f"Cannot evaluate chandelier tube {obj.name}")
        try:
            return sum(len(poly.vertices) - 2 for poly in mesh.polygons)
        finally:
            evaluated.to_mesh_clear()

    before = sum(tris(obj) for obj in objects)
    for obj in objects:
        curve = obj.data
        if (
            obj.type != "CURVE"
            or curve.dimensions != "3D"
            or curve.bevel_resolution != 3
            or not 0 < curve.bevel_depth <= 0.0211
            or len(curve.splines) != 1
            or curve.splines[0].type != "POLY"
        ):
            raise SystemExit(f"Unexpected chandelier tube structure: {obj.name}")
        curve.bevel_resolution = 1
    bpy.context.view_layer.update()
    after = sum(tris(obj) for obj in objects)
    if before - after < 250:
        raise SystemExit(f"Chandelier tube LOD did not save enough triangles: {before} -> {after}")
    return {"objects": len(objects), "triangles_before": before, "triangles_after": after}


def consolidate_static_architecture() -> tuple[int, int, int, int, int]:
    """Batch static HOME_ARCH_ and HOME_PROP_ meshes by material for draw-call efficiency.

    The scene ships ~2000 individual props (books, chairs, armour, board...). Each
    one is a draw call, which is what made the Home slow to become ready on
    software-rendered browsers. Runtime interaction is owned by DOM/UI overlays and
    only the animated nodes (ANIMATED_PROP_NAME) are looked up by name, so static
    meshes are merged per material and the animated ones are left untouched.

    Architecture and static set dressing can share a material signature. Keeping
    separate ARCH/PROP buckets caused redundant GLB primitives / draw calls.
    Joining across those two *static* families preserves geometry and materials,
    while animated props and Klaus's rig remain excluded by _is_static_batchable.
    """
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and _is_static_batchable(obj.name)
    ]
    arch_before = sum(1 for obj in candidates if obj.name.startswith("HOME_ARCH_"))
    prop_before = len(candidates) - arch_before
    protected_before = {
        obj.name for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not _is_static_batchable(obj.name)
    }
    # Joining would otherwise discard non-active modifiers. Bake every static
    # modifier stack in one Blender operator instead of paying select/context
    # invalidation once per ~2k object.
    modifier_candidates = [obj for obj in candidates if obj.modifiers]
    if modifier_candidates:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in modifier_candidates:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = modifier_candidates[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.select_all(action="DESELECT")

    # Re-resolve after conversion so grouping never depends on stale object/data
    # references if Blender replaces a datablock while applying modifiers.
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and _is_static_batchable(obj.name)
    ]
    groups: dict[tuple[str, ...], list] = {}
    for obj in candidates:
        signature = tuple(mat.name if mat else "" for mat in obj.data.materials)
        # A material slot has the same rendering cost regardless of whether
        # the original static object was an arch or a prop.
        groups.setdefault(signature, []).append(obj)

    batch_index = 0
    mixed_batches = 0
    bpy.ops.object.select_all(action="DESELECT")
    for signature, group in groups.items():
        live = [obj for obj in group if obj.name in bpy.context.scene.objects]
        if len(live) < 2:
            continue
        kinds = {"ARCH" if obj.name.startswith("HOME_ARCH_") else "PROP" for obj in live}
        if len(kinds) > 1:
            mixed_batches += 1
        for obj in live:
            obj.select_set(True)
        active = live[0]
        # Preserve an original-family prefix for the existing after-counts.
        kind = "ARCH" if active.name.startswith("HOME_ARCH_") else "PROP"
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        material_label = signature[0].replace("HOME_MAT_", "").lower() if signature else "mixed"
        active.name = f"HOME_{kind}_BATCH_{batch_index}_{material_label}"
        active.select_set(False)
        batch_index += 1

    arch_after = sum(
        1 for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("HOME_ARCH_")
    )
    prop_after = sum(
        1 for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("HOME_PROP_")
    )
    protected_after = {
        obj.name for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not _is_static_batchable(obj.name)
    }
    missing = protected_before - protected_after
    if missing:
        raise SystemExit(
            f"Static batching destroyed {len(missing)} protected animated/rig nodes: "
            f"{sorted(missing)[:12]}"
        )
    if arch_after + prop_after > arch_before + prop_before:
        raise SystemExit("Static batching increased the number of static meshes")
    return arch_before, arch_after, prop_before, prop_after, mixed_batches


def select_runtime_geometry() -> int:
    bpy.ops.object.select_all(action="DESELECT")
    count = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.select_set(True)
        count += 1
    return count


MESH_COMPRESSION_EXTENSION = "EXT_meshopt_compression"


def meshopt_export_kwargs() -> dict:
    """Ask the glTF exporter for Meshopt compression when this Blender supports it.

    The Home runtime GLB is dominated by vertex data, and Meshopt shrinks that to
    roughly a third (the War Room shell goes 9.8 -> 3.4 MB). The runtime loader
    decodes it with MeshoptDecoder and still reads uncompressed files, so a Blender
    without the library (a distro build) simply exports the uncompressed GLB.
    """
    properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    required = {"export_meshopt_compression_enable", "export_meshopt_extension"}
    if not required <= properties:
        return {}
    return {
        "export_meshopt_compression_enable": True,
        "export_meshopt_extension": MESH_COMPRESSION_EXTENSION,
    }


def glb_json_document(path: Path) -> dict:
    raw = Path(path).read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise SystemExit(f"invalid GLB header: {path}")
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise SystemExit(f"GLB JSON chunk missing: {path}")
    document = json.loads(raw[20:20 + chunk_length].decode("utf-8").rstrip("\x00 \t\r\n"))
    return document


def glb_extensions_used(path: Path) -> set:
    return set(glb_json_document(path).get("extensionsUsed", []))


def main() -> None:
    args = parse_args()
    root = Path.cwd()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    reference_source = (root / args.reference).resolve()
    if not reference_source.is_file():
        raise SystemExit(f"Canonical Home reference not found: {reference_source}")
    reference = home.materialize_reference(reference_source, out_dir)

    home.reset_scene()
    scene, camera, target, width, height, render_width, render_height = home.build_scene(
        reference,
        args.samples,
        args.max_width,
        "eevee",
    )

    flatten_runtime_materials()
    banner_medallion_lod = simplify_banner_medallion_tubes()
    chandelier_tube_lod = simplify_chandelier_thin_tubes()
    converted_curves = convert_curves_to_meshes()
    moon_detail_lod = simplify_tiny_moon_details()
    garden_crown_lod = simplify_distant_garden_crowns()
    garden_panel_lod = simplify_distant_garden_panels()
    (
        architecture_meshes_before,
        architecture_meshes_after,
        prop_meshes_before,
        prop_meshes_after,
        mixed_static_batches,
    ) = consolidate_static_architecture()
    klaus_parts = consolidate_klaus()
    mesh_count = select_runtime_geometry()
    if mesh_count < 80:
        raise SystemExit(f"Refusing suspicious Home runtime export with only {mesh_count} meshes")

    glb_path = out_dir / "home-v2-runtime.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_materials="EXPORT",
        # HOME_PROP_* keep their soft-edge bevel as a live modifier (only HOME_ARCH_*
        # is baked by consolidation), and the exporter ignores modifiers by default,
        # so every prop (table, sofa, benches, armour, shelves) shipped razor-edged.
        export_apply=True,
        **meshopt_export_kwargs(),
    )
    if not glb_path.is_file() or glb_path.stat().st_size < 100_000:
        raise SystemExit(f"Home runtime GLB missing or unexpectedly small: {glb_path}")

    glb_document = glb_json_document(glb_path)
    meshopt = MESH_COMPRESSION_EXTENSION in glb_document.get("extensionsUsed", [])
    # A glTF mesh can contain several material primitives; a single Blender
    # mesh is therefore not necessarily one WebGL draw call. Count the actual
    # exported primitives for future before/after measurements.
    primitive_count = sum(
        len(mesh.get("primitives", [])) for mesh in glb_document.get("meshes", [])
    )
    if primitive_count == 0:
        raise SystemExit("Suspicious GLB: no drawable mesh primitives")
    # Mesh data may be referenced by multiple glTF nodes. Count those
    # references separately: this is a pre-culling draw-call estimate, not
    # a measurement of actual frame rendering (recorded by Three.js).
    primitives_per_mesh = [
        len(mesh.get("primitives", [])) for mesh in glb_document.get("meshes", [])
    ]
    primitive_instances = sum(
        primitives_per_mesh[node["mesh"]]
        for node in glb_document.get("nodes", [])
        if isinstance(node.get("mesh"), int)
        and 0 <= node["mesh"] < len(primitives_per_mesh)
    )
    if os.environ.get("HOME_RUNTIME_REQUIRE_MESHOPT") == "1" and not meshopt:
        raise SystemExit(
            f"Home runtime GLB was exported without {MESH_COMPRESSION_EXTENSION}; "
            "the CI Blender must support Meshopt"
        )

    metadata = {
        "contract": RUNTIME_CONTRACT,
        "source_contract": home.CONTRACT,
        "logical_id": LOGICAL_ID,
        "reference_contract": "user-approved-home-canon-2026-09-18",
        "reference_size": [width, height],
        "review_render_size": [render_width, render_height],
        "camera": {
            "position": [round(v, 6) for v in camera.location],
            "rotation_euler": [round(v, 6) for v in camera.rotation_euler],
            "target": list(target),
        },
        "mesh_count": mesh_count,
        "converted_curves": converted_curves,
        "klaus_parts": klaus_parts,
        "moon_detail_lod": moon_detail_lod,
        "garden_crown_lod": garden_crown_lod,
        "garden_panel_lod": garden_panel_lod,
        "banner_medallion_lod": banner_medallion_lod,
        "chandelier_tube_lod": chandelier_tube_lod,
        "architecture_meshes_before": architecture_meshes_before,
        "architecture_meshes_after": architecture_meshes_after,
        "static_prop_meshes_before": prop_meshes_before,
        "prop_meshes_after": prop_meshes_after,
        "mixed_static_batches": mixed_static_batches,
        "glb_meshes": len(glb_document.get("meshes", [])),
        "glb_primitives": primitive_count,
        "glb_primitive_instances": primitive_instances,
        "materials": len(bpy.data.materials),
        "bytes": glb_path.stat().st_size,
        "meshopt": meshopt,
    }
    (out_dir / "home-v2-runtime.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()