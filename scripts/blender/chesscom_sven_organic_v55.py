#!/usr/bin/env python3
"""CHESSCOM Sven V55: fabric-shaped, asymmetric authored detail on the CC0 rig.

The source skeleton and all genuine animations remain unchanged. This is an
offline Blender visual candidate, never an approved in-game Sven or rifle.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chesscom_oss_turntable_v52 import (
    arguments, import_and_normalize, export_candidate,
    make_studio, look_at, DIRECTIONS,
)
from chesscom_sven_art_direction_v53 import (
    add_design, bone_mount, material, NAVY, POLYMER, FABRIC, COYOTE,
)

# Use the exact pinned CC0 model. The coordinates here are fitted to its
# actual V53 exported geometry; none are gameplay collision primitives.
RIBS = 16


def softly_sculpt_existing(obj, rings):
    """Replace a cuboid mesh with a gently tapered multi-ring closed textile.

    Rings: (height_fraction, width_fraction, depth_fraction, xshift_fraction).
    The old object and its bone parent are preserved, so animation continues
    to move the same character with non-box-shaped equipment.
    """
    if obj.type != "MESH" or len(rings) < 4:
        raise ValueError("invalid-textile-target")
    original = [v.co.copy() for v in obj.data.vertices]
    mins = [min(v[k] for v in original) for k in range(3)]
    maxs = [max(v[k] for v in original) for k in range(3)]
    span = [maxs[k] - mins[k] for k in range(3)]
    if min(span) <= .0001:
        raise ValueError("degenerate-textile-source:" + obj.name)
    center = [(mins[k] + maxs[k]) / 2 for k in range(3)]
    verts = []
    for z, width, depth, shift in rings:
        for i in range(RIBS):
            a = (2 * math.pi * i) / RIBS
            # Slight fabric flattening and offset folds make it clearly
            # different from another rounded Lego cuboid.
            x = center[0] + (.5 * span[0] * width * math.cos(a))
            x += .5 * span[0] * shift
            y = center[1] + (.5 * span[1] * depth * math.sin(a))
            y += span[1] * .028 * math.sin(3 * a + z * math.pi)
            verts.append((x, y, mins[2] + span[2] * z))
    faces = []
    faces.append(tuple(reversed(tuple(range(RIBS)))))
    for j in range(len(rings) - 1):
        for k in range(RIBS):
            nxt = (k + 1) % RIBS
            a = j * RIBS
            b = (j + 1) * RIBS
            faces.append((a + k, a + nxt, b + nxt, b + k))
    offset = (len(rings) - 1) * RIBS
    faces.append(tuple(offset + k for k in range(RIBS)))
    replacement = bpy.data.meshes.new(obj.name + "_tailored_mesh")
    replacement.from_pydata(verts, [], faces)
    replacement.update()
    for m in obj.data.materials:
        replacement.materials.append(m)
    old_mesh = obj.data
    obj.data = replacement
    for mod in list(obj.modifiers):
        if mod.type in {"BEVEL", "WEIGHTED_NORMAL"}:
            obj.modifiers.remove(mod)
    for polygon in obj.data.polygons:
        if len(polygon.vertices) == 4:
            polygon.use_smooth = True
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    obj["v55_authored_textile"] = True
    return {"name": obj.name, "rings": len(rings), "radial_sides": RIBS}


def soft_object(candidate, name, xyz, halfsize, mat, bone, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=xyz)
    obj = bpy.context.object
    obj.name = "V55_" + name
    obj.scale = halfsize
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    candidate["objects"].append(obj)
    rig = next(o for o in candidate["objects"] if o.type == "ARMATURE")
    bone_mount(rig, obj, bone)
    return obj


def curved_detail(candidate, name, coordinates, radius, mat, bone):
    if len(coordinates) < 3:
        raise ValueError("insufficient-bezier-control-points")
    curve = bpy.data.curves.new("V55_" + name + "_geometry", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = 16
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(coordinates) - 1)
    for point, xyz in zip(spline.bezier_points, coordinates):
        point.co = xyz
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new("V55_" + name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    candidate["objects"].append(obj)
    rig = next(o for o in candidate["objects"] if o.type == "ARMATURE")
    bone_mount(rig, obj, bone)
    return obj


def add_organic_detail(candidate):
    by_name = {o.name: o for o in candidate["objects"]}
    # An organic silhouette comes from reshaping existing geometry instead
    # of piling still more rigid boxes on top.
    patterns = {
        "backpack_main": [
            (.00, .57, .54, .00), (.08, .82, .80, .00),
            (.24, 1.02, .98, -.03), (.46, .95, 1.03, -.02),
            (.70, .99, .98, .015), (.89, .80, .88, .03), (1, .48, .56, .03),
        ],
        "backpack_flap": [
            (.00, .64, .45, 0), (.20, .86, .8, 0),
            (.52, 1.0, 1.0, 0), (.81, .92, .74, 0), (1, .65, .38, 0),
        ],
        "armor_upper_plate": [
            (.00, .66, .66, 0), (.14, .83, 1.0, 0),
            (.40, .97, 1.0, 0), (.71, 1.03, .93, 0),
            (.89, .88, .78, 0), (1, .62, .50, 0),
        ],
        "armor_lower_plate": [
            (.00, .61, .53, 0), (.22, .87, .95, 0),
            (.50, 1.02, 1.02, 0), (.78, .93, .92, 0), (1, .67, .55, 0),
        ],
        "waist_pouch_L": [
            (.0,.55,.48,0), (.18,.86,.85,-.06), (.46,1.04,1.02,-.04),
            (.78,.91,.91,.02), (1,.59,.44,.02),
        ],
        "waist_pouch_R": [
            (.0,.59,.50,0), (.17,.87,.90,.05), (.49,.98,1.00,.04),
            (.81,.87,.84,-.02), (1,.55,.49,-.02),
        ],
        "pack_lower_pouch": [
            (0,.55,.6,0), (.20,.82,.94,0), (.46,1,1,0),
            (.76,.92,.85,0), (1,.53,.47,0),
        ],
    }
    sculpted = []
    for label, rings in patterns.items():
        obj = by_name.get("V53_" + label)
        if obj is None or not obj.parent or obj.parent_type != "BONE":
            raise RuntimeError("v55-original-rig-mount-lost:" + label)
        sculpted.append(softly_sculpt_existing(obj, rings))

    # Materials are deliberately separated by physical surface, not random
    # color: textile matte, rubber, worn nylon stitching and dark electronics.
    nylon = material("V55_matte_woven_nylon", (.043,.058,.068,1), rough=.97)
    charcoal = material("V55_earcup_rubber", (.024,.031,.038,1), rough=.81)
    webbing = material("V55_flat_webbing", (.095,.106,.109,1), rough=.92)
    muted_orange = material("V55_radio_switch", (.33,.19,.085,1), metal=.22, rough=.53)
    details = []

    # One-sided ear protection, radio and low-profile cabling: actual
    # asymmetric equipment rather than an arbitrary mirrored pair.
    details.append(soft_object(candidate, "left_earcup", (-.125,-.002,1.657),
                               (.023,.039,.043), charcoal, "Head"))
    details.append(soft_object(candidate, "earcup_cushion", (-.146,-.008,1.653),
                               (.008,.033,.034), nylon, "Head"))
    details.append(curved_detail(candidate, "headset_band",
                                [(-.118,.016,1.673),(-.100,.072,1.762),
                                 (-.028,.090,1.792),(.037,.085,1.789)],
                                .004, charcoal, "Head"))
    # Short flex cord follows the *head*, with no rigid line connecting
    # different bones during head turns.
    details.append(curved_detail(candidate, "headset_flex",
                                [(-.139,.002,1.618),(-.144,.054,1.609),
                                 (-.122,.083,1.636),(-.100,.086,1.650)],
                                .0029, charcoal, "Head"))
    details.append(soft_object(candidate, "radio_body", (.145,.127,1.373),
                               (.029,.024,.067), nylon, "Chest"))
    details.append(soft_object(candidate, "radio_knob", (.151,.127,1.446),
                               (.010,.010,.011), muted_orange, "Chest"))
    details.append(curved_detail(candidate, "radio_whip",
                                [(.147,.137,1.439),(.157,.162,1.48),
                                 (.165,.169,1.535),(.160,.153,1.581)],
                                .0027, charcoal, "Chest"))

    # Softer uneven pouch outlines + seam curves on the front, all same
    # torso bone (no cross-bone rubber tubes that tear during animations).
    details.append(soft_object(candidate, "offset_admin_pouch",
                               (-.085,-.145,1.330), (.051,.016,.035),
                               nylon, "Chest"))
    details.append(curved_detail(candidate, "admin_seam",
                                [(-.12,-.16,1.345),(-.087,-.164,1.358),
                                 (-.05,-.16,1.345)],
                                .0028, webbing, "Chest"))
    details.append(curved_detail(candidate, "backpack_seam_L",
                                [(-.069,.188,1.267),(-.081,.197,1.338),
                                 (-.069,.191,1.430)],
                                .0027, webbing, "Chest"))
    details.append(curved_detail(candidate, "backpack_seam_R",
                                [(.061,.186,1.27),(.071,.195,1.335),
                                 (.064,.187,1.427)],
                                .0027, webbing, "Chest"))
    # Gentle knee pad surface variation, moving with the lower leg bones.
    for side, direction in (("L",-1),("R",1)):
        details.append(soft_object(candidate,"kneepad_"+side,
                     (direction*.103,-.09,.655),
                     (.051,.026,.068),nylon,"LowerLeg."+side))

    if len(sculpted) != 7 or len(details) != 13:
        raise RuntimeError("v55-detail-inventory-changed")
    if not all(obj.parent_type=="BONE" for obj in details):
        raise RuntimeError("v55-floating-piece")
    return {
        "sculpted_parts": sculpted,
        "extra_rigged_details": [obj.name for obj in details],
        "new_distinct_bones": sorted({obj.parent_bone for obj in details}),
        "low_poly_source_preserved": True,
        "no_rifle_claim": True,
    }


def add_design_v55(candidate):
    v53 = add_design(candidate)
    v55 = add_organic_detail(candidate)
    return {**v53, "v55": v55}


def main():
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidate = import_and_normalize(args.source_glb)
    design = add_design_v55(candidate)
    exported = args.output_dir / "quaternius-cc0-preview.glb"
    digest = export_candidate(candidate, exported)
    scene, camera = make_studio()
    scene.frame_set(1)
    views = {}
    for index, direction in enumerate(DIRECTIONS):
        angle = index * math.pi / 4
        camera.location = (3.1 * math.sin(angle), -3.1 * math.cos(angle), 2.3)
        look_at(camera, (0,0,1.17))
        path = args.output_dir / f"view-{index:02d}-{direction}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        raw = path.read_bytes()
        if len(raw) < 1024:
            raise RuntimeError("missing-v55-render:" + direction)
        views[direction] = {"path": path.name, "sha256": hashlib.sha256(raw).hexdigest(),
                            "bytes": len(raw)}
    if len({v["sha256"] for v in views.values()}) != 8:
        raise RuntimeError("repeated-v55-view")
    report = {
        "identity": "chesscom-sven-v55-organic-authoring-experiment",
        "review_only": True, "approved_for_runtime": False,
        "is_canonical_sven": False, "two_hand_rifle_contact_verified": False,
        "has_combat_animation_contract": False,
        "art_direction": design,
        "model": candidate["technical_geometry"],
        "exported_glb": {"file": exported.name, "sha256": digest,
                         "bytes": exported.stat().st_size},
        "blender_version": bpy.app.version_string,
        "views": views,
    }
    (args.output_dir / "blender-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("CHESSCOM_V55_ORGANIC_KIT_REVIEW_ONLY", digest, len(views))


if __name__ == "__main__":
    main()
