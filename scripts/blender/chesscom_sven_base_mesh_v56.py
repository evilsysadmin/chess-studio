#!/usr/bin/env python3
"""Sven V56: UV-safe custom normals on real skinned fabric, no extra boxes.

Review-only Blender CPU experiment. Keep Quaternius source, bones and 24
authentic actions. V55 kit is preserved; never invent a rifle or IK claim.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chesscom_oss_turntable_v52 import (
    arguments, import_and_normalize, export_candidate,
    make_studio, look_at, DIRECTIONS,
)
from chesscom_sven_organic_v55 import add_design_v55

GARMENTS = ("Swat_Body", "Swat_Legs")


def triangles(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


def weighted_fraction(obj):
    vertices = obj.data.vertices
    if not vertices:
        return 0.0
    return sum(bool(v.groups) for v in vertices) / len(vertices)


def refine_source_garments(candidate):
    """Create continuous-looking textile NORMALS across duplicated triangles.

    The CC0 SWAT source intentionally duplicates almost every corner vertex.
    Catmull-Clark breaks disconnected shell pieces, while edge-bevel has no
    manifold edges to bevel. Reconstruct smoothed split normals by *position*
    and material instead. Vertex POSITION/UV/weights stay byte-for-byte stable
    in Blender, avoiding gaps, broken gear and corrupted skeletons.
    """
    from collections import defaultdict
    from mathutils import Vector

    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    report = []
    cutoff_cos = math.cos(math.radians(50))
    for name in GARMENTS:
        obj = next((o for o in candidate["objects"] if o.name == name), None)
        if obj is None or obj.type != "MESH" or not obj.vertex_groups:
            raise RuntimeError("v56-original-garment-missing:" + name)
        mesh = obj.data
        if mesh.shape_keys:
            raise RuntimeError("v56-morph-source-unexpected:" + name)
        before_armature = [m.name for m in obj.modifiers if m.type == "ARMATURE"]
        if len(before_armature) != 1:
            raise RuntimeError("v56-original-armature-missing:" + name)
        positions = [tuple(v.co) for v in mesh.vertices]
        before = {"vertices": len(mesh.vertices), "triangles": triangles(obj),
                  "weighted_fraction": weighted_fraction(obj)}
        if before["weighted_fraction"] < .99:
            raise RuntimeError("v56-weights-incomplete:" + name)

        group = defaultdict(list)
        normals = [(0.0, 0.0, 1.0)] * len(mesh.loops)
        for polygon in mesh.polygons:
            normal = Vector(polygon.normal)
            for index in polygon.loop_indices:
                vertex_index = mesh.loops[index].vertex_index
                normals[index] = tuple(normal)
                if polygon.material_index == 0:  # SWAT jacket/pants textile
                    pos = positions[vertex_index]
                    key = tuple(round(x, 5) for x in pos)
                    group[key].append((index, normal))

        paired = 0
        changed = 0
        displacement = 0.0
        for corners in group.values():
            if len(corners) < 2:
                continue
            paired += len(corners)
            for index, normal in corners:
                neighbors = [other for _, other in corners
                             if normal.dot(other) >= cutoff_cos]
                if len(neighbors) < 2:
                    continue
                averaged = sum(neighbors, Vector((0,0,0))).normalized()
                shift_deg = math.degrees(normal.angle(averaged))
                if shift_deg > 0.15:
                    normals[index] = tuple(averaged)
                    changed += 1
                    displacement = max(displacement, shift_deg)

        if paired < 100 or changed < 100 or displacement > 40:
            raise RuntimeError(
                f"v56-normal-rebuild-not-meaningful:{name}:{paired}:{changed}:{displacement:.2f}"
            )
        for polygon in mesh.polygons:
            if polygon.material_index == 0:
                polygon.use_smooth = True
        # Blender 4.0 supports custom split normals (not material-specific
        # baked procedural textures that glTF would silently drop).
        mesh.use_auto_smooth = True
        mesh.normals_split_custom_set(normals)
        mesh.update()

        after = {"vertices": len(mesh.vertices), "triangles": triangles(obj),
                 "weighted_fraction": weighted_fraction(obj)}
        if (before != after or positions != [tuple(v.co) for v in mesh.vertices]
                or [m.name for m in obj.modifiers if m.type == "ARMATURE"] != before_armature):
            raise RuntimeError("v56-garment-geometry-or-skin-modified:" + name)
        obj["v56_refined_source_mesh"] = "custom-split-normals"
        report.append({
            "mesh": name, "before": before, "after": after,
            "matching_textile_corners": paired,
            "adjusted_split_normals": changed,
            "maximum_shading_change_degrees": round(displacement, 3),
        })

    originals = [o for o in candidate["objects"]
                 if o.name in {"Swat_Body","Swat_Legs","Swat_Head","Swat_Feet"}]
    if len(originals) != 4 or any(not o.vertex_groups for o in originals):
        raise RuntimeError("v56-skinned-originals-lost")

    # Distinguish soft cloth from harder polymer without adding surface
    # objects, textures that fail glTF baking, or intrusive bright patches.
    tuned = []
    for mat in bpy.data.materials:
        if mat.name != "Swat":
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
        if bsdf:
            bsdf.inputs["Roughness"].default_value = 0.92
            tuned.append(mat.name)
    return {
        "source_garments": report,
        "refinement_method": "uv-safe-custom-split-normals",
        "unchanged_original_geometry": True,
        "unchanged_source_skinning": True,
        "original_skinned_parts_preserved": [o.name for o in originals],
        "head_and_boots_unmodified": True,
        "matte_textile_materials": tuned,
    }


def add_design_v56(candidate):
    design = add_design_v55(candidate)
    refined = refine_source_garments(candidate)
    return {**design, "v56": refined}


def main():
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidate = import_and_normalize(args.source_glb)
    art = add_design_v56(candidate)
    output = args.output_dir / "quaternius-cc0-preview.glb"
    sha = export_candidate(candidate, output)

    scene, camera = make_studio()
    scene.frame_set(1)
    views = {}
    for i, direction in enumerate(DIRECTIONS):
        a = i * math.pi / 4
        camera.location = (3.1 * math.sin(a), -3.1 * math.cos(a), 2.3)
        look_at(camera, (0, 0, 1.17))
        file = args.output_dir / f"view-{i:02d}-{direction}.png"
        scene.render.filepath = str(file)
        bpy.ops.render.render(write_still=True)
        data = file.read_bytes()
        if len(data) < 1024:
            raise RuntimeError("v56-missing-render:" + direction)
        views[direction] = {"path": file.name, "sha256": hashlib.sha256(data).hexdigest(),
                            "bytes": len(data)}
    if len({v["sha256"] for v in views.values()}) != 8:
        raise RuntimeError("v56-duplicate-cameras")

    # Extra *actual render* of the cloth/head region. Not an image-gen
    # concept or fictional improved model.
    camera.data.ortho_scale = 1.13
    camera.location = (1.8, -2.3, 2.01)
    look_at(camera, (0, 0, 1.42))
    scene.render.filepath = str(args.output_dir / "cloth-detail.png")
    bpy.ops.render.render(write_still=True)
    if (args.output_dir / "cloth-detail.png").stat().st_size < 1024:
        raise RuntimeError("v56-detail-render-missing")

    report = {
        "identity": "chesscom-sven-v56-source-garment-smoothing",
        "review_only": True, "approved_for_runtime": False,
        "is_canonical_sven": False, "two_hand_rifle_contact_verified": False,
        "has_combat_animation_contract": False,
        "art_direction": art, "model": candidate["technical_geometry"],
        "exported_glb": {"file": output.name, "sha256": sha,
                         "bytes": output.stat().st_size},
        "blender_version": bpy.app.version_string, "views": views,
    }
    (args.output_dir / "blender-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("V56_UV_SAFE_NORMALS_REVIEW_ONLY",
          [x["adjusted_split_normals"] for x in art["v56"]["source_garments"]], sha)


if __name__ == "__main__":
    main()
