#!/usr/bin/env python3
"""Sven V56: soften ORIGINAL skinned fabric geometry, not overlay more boxes.

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
MAX_SMOOTHED_TRIANGLES = 75000


def triangles(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


def weighted_fraction(obj):
    vertices = obj.data.vertices
    if not vertices:
        return 0.0
    return sum(bool(v.groups) for v in vertices) / len(vertices)


def refine_source_garments(candidate):
    """Bake one modest Catmull-Clark subdivision BEFORE armature deformation.

    Applying only the new subdivision is intentional: applying Armature
    would destroy genuine source animation. Original sole and helmet remain
    hard-edged so boots/optics do not melt.
    """
    rig = next((o for o in candidate["objects"] if o.type == "ARMATURE"), None)
    if rig is None:
        raise RuntimeError("v56-no-cc0-skeleton")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    outcome = []
    for name in GARMENTS:
        obj = next((o for o in candidate["objects"] if o.name == name), None)
        if obj is None or obj.type != "MESH":
            raise RuntimeError("v56-missing-original-garment:" + name)
        if obj.data.shape_keys:
            raise RuntimeError("v56-unexpected-source-morphs:" + name)
        if not obj.vertex_groups:
            raise RuntimeError("v56-original-not-skinned:" + name)
        armatures_before = [m.name for m in obj.modifiers if m.type == "ARMATURE"]
        if len(armatures_before) != 1:
            raise RuntimeError("v56-skin-modifier-missing:" + name)
        before = {"vertices": len(obj.data.vertices),
                  "triangles": triangles(obj),
                  "weighted_fraction": weighted_fraction(obj)}
        if before["weighted_fraction"] < .99:
            raise RuntimeError("v56-incomplete-source-weights:" + name)

        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        subd = obj.modifiers.new("V56_baked_cloth_surface", "SUBSURF")
        subd.subdivision_type = "CATMULL_CLARK"
        subd.levels = 1
        subd.render_levels = 1
        # Keep subdivision before the animated armature (not after it).
        while obj.modifiers.find(subd.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=subd.name)
        bpy.ops.object.modifier_apply(modifier=subd.name)
        if [m.name for m in obj.modifiers if m.type == "ARMATURE"] != armatures_before:
            raise RuntimeError("v56-armature-changed:" + name)

        for face in obj.data.polygons:
            face.use_smooth = True
        after = {"vertices": len(obj.data.vertices),
                 "triangles": triangles(obj),
                 "weighted_fraction": weighted_fraction(obj)}
        if after["vertices"] <= before["vertices"] * 2 or after["weighted_fraction"] < .99:
            raise RuntimeError("v56-subdivision-damaged-skinned-mesh:" + name)
        if after["triangles"] > MAX_SMOOTHED_TRIANGLES:
            raise RuntimeError("v56-garment-triangle-budget:" + name)
        obj["v56_refined_source_mesh"] = True
        outcome.append({"mesh": name, "before": before, "after": after})

    # The original four source meshes remain skinned. We have merely edited
    # the existing body's and legs' vertex topology, not forged a skin.
    all_originals = [o for o in candidate["objects"]
                     if o.name in {"Swat_Body","Swat_Legs","Swat_Head","Swat_Feet"}]
    if len(all_originals) != 4 or any(not o.vertex_groups for o in all_originals):
        raise RuntimeError("v56-lost-original-skinned-parts")
    return {
        "source_garments": outcome,
        "subdivision_level": 1,
        "total_refined_triangles": sum(o["after"]["triangles"] for o in outcome),
        "original_skinned_parts_preserved": [o.name for o in all_originals],
        "head_and_boots_unmodified": True,
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
    print("V56_REAL_SKINNED_GARMENTS_REVIEW_ONLY",
          art["v56"]["total_refined_triangles"], sha)


if __name__ == "__main__":
    main()
