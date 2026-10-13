#!/usr/bin/env python3
"""CHESSCOM V53: source-verified Blender art-direction proof on a real CC0 rig.

All detail is authorable Blender mesh/curve geometry with real bone parenting.
Not a canonical Sven, not a Babylon primitive replacement, not for release.
"""
from __future__ import annotations
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chesscom_oss_turntable_v52 import (arguments, import_and_normalize,
                                         export_candidate, make_studio, look_at, DIRECTIONS)

NAVY = (0.028, 0.048, 0.077, 1)
ARMOR = (0.024, 0.035, 0.050, 1)
POLYMER = (0.019, 0.025, 0.035, 1)
FABRIC = (0.029, 0.036, 0.043, 1)
COYOTE = (0.115, 0.091, 0.070, 1)
BLUE = (0.055, 0.25, 0.44, 1)
WHITE = (0.48, 0.55, 0.58, 1)
GLASS = (0.015, 0.067, 0.11, 1)


def material(name, color, metal=0.0, rough=0.74, emission=None):
    m = bpy.data.materials.new("V53_" + name)
    m.diffuse_color = color
    m.use_nodes = True
    pbr = m.node_tree.nodes.get("Principled BSDF")
    pbr.inputs["Base Color"].default_value = color
    pbr.inputs["Metallic"].default_value = metal
    pbr.inputs["Roughness"].default_value = rough
    if emission is not None:
        pbr.inputs["Emission Color"].default_value = (*emission, 1)
        pbr.inputs["Emission Strength"].default_value = 0.12
    return m


def tune_existing_materials():
    overrides = {"Swat": (NAVY, .13, .85), "Swat_Black": (POLYMER, .08, .75),
                 "Skin": (POLYMER, .0, .95), "Visor": (GLASS, .18, .23)}
    updated = []
    for m in bpy.data.materials:
        for prefix, (color, metal, rough) in overrides.items():
            if m.name == prefix or m.name.startswith(prefix + "."):
                m.diffuse_color = color
                m.use_nodes = True
                shader = m.node_tree.nodes.get("Principled BSDF")
                if shader:
                    shader.inputs["Base Color"].default_value = color
                    shader.inputs["Metallic"].default_value = metal
                    shader.inputs["Roughness"].default_value = rough
                updated.append(m.name)
                break
    if len(updated) < 4:
        raise RuntimeError("source-materials-changed:" + ",".join(updated))
    return updated


def solid(candidate, label, position, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = "V53_" + label
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("soft-machined-corners", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        obj.modifiers.new("weighted-shaded-normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    candidate["objects"].append(obj)
    return obj


def optics(candidate, label, position, radius, length, mat, lens_mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=length, location=position)
    obj = bpy.context.object
    obj.name = "V53_" + label
    obj.rotation_euler[0] = math.pi / 2
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("milled-cylinder-edges", "BEVEL")
    bevel.width = .007
    bevel.segments = 2
    obj.modifiers.new("smooth-normals", "WEIGHTED_NORMAL")
    candidate["objects"].append(obj)
    lens = solid(candidate, label + "_objective", (position[0], position[1] - length / 2 - .003,
                                                    position[2]), (radius * 1.72, .008, radius * 1.72),
                 lens_mat, bevel=.003)
    return obj, lens


def bone_mount(rig, obj, bone):
    if bone not in rig.pose.bones:
        raise RuntimeError("missing-rig-bone:" + bone)
    # Preserve authored world-space fitting while parenting to the moving bone.
    desired_world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = desired_world
    obj["v53_bone_mount"] = bone
    return obj


def add_design(candidate):
    rig = next((o for o in candidate["objects"] if o.type == "ARMATURE"), None)
    if rig is None:
        raise RuntimeError("missing-cc0-armature")
    # Most of the source figure fits within 1.78m after the V52 normalization.
    # Names/positions deliberately authored for this exact immutable GLB only.
    helmet = material("ceramic_helmet", ARMOR, .22, .63)
    ballistic = material("ballistic_panels", NAVY, .04, .92)
    rubber = material("dark_polymer", POLYMER, .05, .81)
    nylon = material("nylon_webbing", FABRIC, 0, .99)
    contrast = material("dusty_coyote", COYOTE, .0, .95)
    flag_blue = material("flag_blue", BLUE, 0, .91)
    flag_white = material("flag_white", WHITE, 0, .91)
    glass = material("nvg_glass", GLASS, .31, .13, emission=(.035,.16,.25))
    mounts = {}

    def mount(obj, bone):
        bone_mount(rig, obj, bone)
        mounts[obj.name] = bone
        return obj

    # Helmet shroud: two milled NVG tubes, a genuine distinct silhouette
    # rather than re-coloring the source SWAT helmet.
    mount(solid(candidate, "helmet_nv_bridge", (0, -.121, 1.742),
                (.118, .031, .028), helmet, .014), "Head")
    for side, direction in (("L", -1), ("R", 1)):
        x = direction * .045
        tube, front = optics(candidate, "nvg_tube_" + side, (x, -.157, 1.765),
                             .025, .070, rubber, glass)
        mount(tube, "Head")
        mount(front, "Head")
        mount(solid(candidate, "nvg_mount_" + side,
                    (direction * .044, -.110, 1.786), (.033, .044, .016),
                    helmet, .006), "Head")
    mount(solid(candidate, "helmet_top_rail", (0, -.024, 1.792),
                (.056, .086, .013), helmet, .009), "Head")
    for side, d in (("L",-1), ("R",1)):
        mount(solid(candidate, "helmet_side_rail_" + side,
                    (d * .103, -.007, 1.691), (.019,.078,.014),
                    helmet, .006), "Head")

    # Chest protection, equipment carrier and physically distinct MOLLE rows.
    mount(solid(candidate, "armor_upper_plate", (0, -.127, 1.402),
                (.219, .026, .136), ballistic, .018), "Chest")
    mount(solid(candidate, "armor_lower_plate", (0, -.139, 1.287),
                (.205, .020, .060), ballistic, .014), "Torso")
    for j in range(2):
        mount(solid(candidate, "carrier_row_" + str(j), (0, -.150, 1.390 - j*.045),
                    (.210,.007,.009), nylon, .003), "Chest")
    for i, x in enumerate((-.068,0,.068)):
        mount(solid(candidate, "magazine_" + str(i), (x, -.167, 1.247),
                    (.050,.044,.070), contrast if i==1 else nylon, .012), "Torso")
        mount(solid(candidate, "magazine_flap_" + str(i), (x, -.191, 1.270),
                    (.048,.008,.019), rubber, .003), "Torso")
    for side, direction in (("L", -1), ("R", 1)):
        mount(solid(candidate, "shoulder_strap_" + side,
                    (direction * .101, -.070, 1.443), (.035,.044,.115),
                    nylon, .009), "Chest")
        mount(solid(candidate, "waist_pouch_" + side,
                    (direction*.134, -.011, 1.203), (.068,.069,.075),
                    nylon, .012), "Hips")

    # Backpack with stepped textile silhouette and contrasting straps.
    mount(solid(candidate, "backpack_main", (0, .140, 1.36),
                (.205,.086,.245), nylon, .035), "Chest")
    mount(solid(candidate, "backpack_flap", (0, .192, 1.435),
                (.185,.015,.065), ballistic, .013), "Chest")
    for side, d in (("L",-1), ("R",1)):
        mount(solid(candidate, "pack_webbing_" + side,
                    (d*.056, .193, 1.350), (.014,.009,.160),
                    contrast, .004), "Chest")
    mount(solid(candidate, "pack_lower_pouch", (0, .192, 1.263),
                (.156,.029,.045), ballistic, .011), "Chest")

    # Finnish-coloured identification patch — material layers, not UI badge.
    # Bone-anchored to shoulders so it follows arms; keep subtle at zoom.
    for side, d, bone in (("L",-1,"Shoulder.L"), ("R",1,"Shoulder.R")):
        x = d * .153
        patch = solid(candidate, "flag_back_" + side, (x, .006, 1.489),
                      (.008,.047,.033), flag_white, .002)
        mount(patch, bone)
        mount(solid(candidate, "flag_cross_v_" + side, (x + d*.006,.006,1.489),
                    (.005,.009,.033), flag_blue), bone)
        mount(solid(candidate, "flag_cross_h_" + side, (x + d*.008,.006,1.489),
                    (.005,.047,.008), flag_blue), bone)

    if len(mounts) < 30 or any(b not in rig.pose.bones for b in mounts.values()):
        raise RuntimeError("insufficient-authored-kit-or-broken-mounts")
    return {"pieces": len(mounts), "bone_mounts": mounts, "source_materials": tune_existing_materials(),
            "distinct_bones": sorted(set(mounts.values()))}


def main():
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidate = import_and_normalize(args.source_glb)
    directions = add_design(candidate)
    output = args.output_dir / "quaternius-cc0-preview.glb"
    digest = export_candidate(candidate, output)
    scene, camera = make_studio()
    scene.frame_set(1)
    images = {}
    for i, direction in enumerate(DIRECTIONS):
        angle = i * math.pi / 4
        camera.location = (3.1 * math.sin(angle), -3.1 * math.cos(angle), 2.3)
        look_at(camera, (0,0,1.17))
        path = args.output_dir / ("view-%02d-%s.png" % (i, direction))
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        blob = path.read_bytes()
        if len(blob) < 1024:
            raise RuntimeError("missing-render:" + direction)
        images[direction] = {"path": path.name, "sha256": hashlib.sha256(blob).hexdigest(),
                             "bytes": len(blob)}
    if len({x["sha256"] for x in images.values()}) != 8:
        raise RuntimeError("duplicate-views")
    report = {
        "identity": "chesscom-sven-cc0-art-direction-v53",
        "review_only": True, "is_canonical_sven": False,
        "approved_for_runtime": False, "has_combat_animation_contract": False,
        "art_direction": directions,
        "model": candidate["technical_geometry"],
        "exported_glb": {"file": output.name, "sha256": digest, "bytes": output.stat().st_size},
        "blender_version": bpy.app.version_string, "views": images,
    }
    (args.output_dir / "blender-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("CHESSCOM_V53_ART_DIRECTION_REVIEW_ONLY", directions["pieces"], digest)


if __name__ == "__main__":
    main()
