#!/usr/bin/env python3
"""Deterministically build the editable .blend and runtime .glb for the premium Chronicles Tactics party.

Matthias already owns a canonical Home GLB. This producer covers the remaining
party silhouettes: Hildegard (rook), Aziz (bishop), and Faust (knight).
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import math
import os
import sys
from typing import Any


@dataclass(frozen=True)
class MaterialSpec:
    color: tuple[float, float, float]
    roughness: float = 0.6
    metallic: float = 0.0
    emission: tuple[float, float, float] | None = None
    emission_strength: float = 0.0


@dataclass(frozen=True)
class PartSpec:
    name: str
    primitive: str
    material: str
    location: tuple[float, float, float]
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0)
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)
    params: tuple[tuple[str, Any], ...] = ()

    def options(self) -> dict[str, Any]:
        return dict(self.params)


MATERIALS = {
    "stone": MaterialSpec((0.36, 0.39, 0.40), 0.52, 0.18),
    "steel": MaterialSpec((0.63, 0.67, 0.69), 0.25, 0.78),
    "black_steel": MaterialSpec((0.075, 0.085, 0.095), 0.34, 0.68),
    "blue_cloth": MaterialSpec((0.075, 0.11, 0.14), 0.78, 0.02),
    "ember": MaterialSpec((0.52, 0.20, 0.07), 0.44, 0.28),
    "sandstone": MaterialSpec((0.58, 0.48, 0.33), 0.75, 0.03),
    "brass": MaterialSpec((0.58, 0.37, 0.09), 0.28, 0.82),
    "green_robe": MaterialSpec((0.055, 0.16, 0.13), 0.73, 0.02),
    "green_trim": MaterialSpec((0.12, 0.28, 0.23), 0.61, 0.05),
    "ochre": MaterialSpec((0.49, 0.29, 0.09), 0.7, 0.03),
    "lantern": MaterialSpec((0.95, 0.54, 0.10), 0.25, 0.12, (1.0, 0.24, 0.025), 3.2),
    "bone": MaterialSpec((0.55, 0.49, 0.39), 0.72, 0.03),
    "iron": MaterialSpec((0.24, 0.27, 0.29), 0.38, 0.64),
    "leather": MaterialSpec((0.28, 0.14, 0.065), 0.84, 0.02),
    "dark_leather": MaterialSpec((0.12, 0.065, 0.035), 0.88, 0.01),
    "brown_cloth": MaterialSpec((0.17, 0.12, 0.105), 0.8, 0.01),
    "copper": MaterialSpec((0.50, 0.24, 0.08), 0.34, 0.62),
    "skin_warm": MaterialSpec((0.63, 0.40, 0.27), 0.88, 0.0),
    "ink": MaterialSpec((0.008, 0.009, 0.01), 0.9, 0.0),
}


def part(name: str, primitive: str, material: str, location, *, scale=(1, 1, 1), rotation=(0, 0, 0), **params) -> PartSpec:
    return PartSpec(name, primitive, material, tuple(location), tuple(scale), tuple(rotation), tuple(params.items()))


def plinth(prefix: str, body: str, ring: str) -> list[PartSpec]:
    return [
        part(f"{prefix}__plinth", "cylinder", body, (0, 0, 0.14), scale=(0.68, 0.68, 0.14), vertices=48),
        part(f"{prefix}__plinth_bevel", "cylinder", body, (0, 0, 0.29), scale=(0.58, 0.58, 0.08), vertices=48),
        part(f"{prefix}__plinth_ring", "torus", ring, (0, 0, 0.30), scale=(0.52, 0.52, 0.035), major_segments=48, minor_segments=12),
    ]


def hildegard() -> list[PartSpec]:
    p = plinth("rook", "stone", "steel")
    p += [
        part("rook__body", "cone", "blue_cloth", (0, 0, 0.78), scale=(0.43, 0.43, 0.70), radius_top=0.78, vertices=48),
        part("rook__gorget", "torus", "steel", (0, 0, 1.09), scale=(0.32, 0.32, 0.042), major_segments=44, minor_segments=12),
        part("rook__helm", "cylinder", "black_steel", (0, 0, 1.27), scale=(0.43, 0.43, 0.18), vertices=48),
        part("rook__visor", "box", "black_steel", (0, -0.405, 1.28), scale=(0.33, 0.065, 0.10), bevel=0.025),
        part("rook__face_slit", "box", "skin_warm", (0, -0.474, 1.28), scale=(0.245, 0.012, 0.038), bevel=0.008),
        part("rook__eye_l", "sphere", "ember", (-0.075, -0.495, 1.285), scale=(0.018, 0.010, 0.018), segments=16),
        part("rook__eye_r", "sphere", "ember", (0.075, -0.495, 1.285), scale=(0.018, 0.010, 0.018), segments=16),
        part("rook__pauldron_l", "sphere", "steel", (-0.36, 0, 1.05), scale=(0.24, 0.16, 0.16), segments=28),
        part("rook__pauldron_r", "sphere", "steel", (0.36, 0, 1.05), scale=(0.24, 0.16, 0.16), segments=28),
        part("rook__shield", "box", "steel", (0.47, -0.03, 0.79), scale=(0.34, 0.09, 0.44), rotation=(0.0, -0.20, 0.02), bevel=0.045),
        part("rook__shield_mark", "box", "ember", (0.47, -0.126, 0.80), scale=(0.22, 0.018, 0.055), rotation=(0.0, -0.20, 0.0), bevel=0.015),
        part("rook__mace_haft", "cylinder", "steel", (-0.43, 0.03, 0.79), scale=(0.055, 0.055, 0.40), rotation=(0.0, 0.22, 0.0), vertices=20),
        part("rook__mace_head", "ico", "steel", (-0.51, 0.03, 1.18), scale=(0.18, 0.18, 0.18), subdivisions=1),
    ]
    for i, angle in enumerate((0, 60, 120, 180, 240, 300)):
        a = math.radians(angle)
        p.append(part(f"rook__crenel_{i}", "box", "steel", (0.31 * math.cos(a), 0.31 * math.sin(a), 1.48), scale=(0.11, 0.11, 0.16), rotation=(0, 0, -a), bevel=0.018))
    return p


def aziz() -> list[PartSpec]:
    p = plinth("bishop", "sandstone", "brass")
    p += [
        part("bishop__robe", "cone", "green_robe", (0, 0, 0.79), scale=(0.43, 0.43, 0.73), radius_top=0.64, vertices=52),
        part("bishop__collar", "torus", "green_trim", (0, 0, 1.10), scale=(0.31, 0.31, 0.04), major_segments=44, minor_segments=12),
        part("bishop__head", "sphere", "skin_warm", (0, -0.01, 1.39), scale=(0.23, 0.22, 0.25), segments=36),
        part("bishop__eye_l", "sphere", "ink", (-0.07, -0.215, 1.41), scale=(0.018, 0.010, 0.018), segments=14),
        part("bishop__eye_r", "sphere", "ink", (0.07, -0.215, 1.41), scale=(0.018, 0.010, 0.018), segments=14),
        part("bishop__scarf", "box", "ochre", (0.09, -0.235, 0.91), scale=(0.055, 0.018, 0.27), rotation=(0, 0, 0.48), bevel=0.018),
        part("bishop__scarf_clasp", "sphere", "brass", (0.18, -0.25, 1.04), scale=(0.07, 0.025, 0.07), segments=20),
        part("bishop__mitre", "cone", "green_robe", (0, 0, 1.73), scale=(0.29, 0.29, 0.28), radius_top=0.05, vertices=48),
        part("bishop__mitre_split", "box", "sandstone", (0, -0.235, 1.74), scale=(0.025, 0.014, 0.18), rotation=(0, 0, 0.35), bevel=0.006),
        part("bishop__staff", "cylinder", "brass", (-0.43, 0.03, 0.82), scale=(0.035, 0.035, 0.45), rotation=(0, 0.14, 0), vertices=18),
        part("bishop__lantern", "ico", "lantern", (-0.49, 0.03, 1.28), scale=(0.19, 0.19, 0.19), subdivisions=1),
        part("bishop__lantern_ring", "torus", "brass", (-0.49, 0.03, 1.28), scale=(0.23, 0.23, 0.025), rotation=(1.5708, 0, 0), major_segments=32, minor_segments=8),
    ]
    return p


def faust() -> list[PartSpec]:
    p = plinth("knight", "bone", "iron")
    p += [
        part("knight__body", "cone", "brown_cloth", (0, 0, 0.77), scale=(0.40, 0.40, 0.68), radius_top=0.70, vertices=48),
        part("knight__neck", "cylinder", "bone", (0, -0.04, 1.25), scale=(0.20, 0.20, 0.31), rotation=(0.25, 0, 0), vertices=40),
        part("knight__head", "sphere", "bone", (0, -0.12, 1.59), scale=(0.25, 0.34, 0.25), segments=38),
        part("knight__muzzle", "sphere", "bone", (0, -0.39, 1.52), scale=(0.18, 0.16, 0.14), segments=30),
        part("knight__ear_l", "cone", "bone", (-0.14, -0.05, 1.87), scale=(0.07, 0.07, 0.17), rotation=(0.10, 0, 0.12), radius_top=0.02, vertices=18),
        part("knight__ear_r", "cone", "bone", (0.14, -0.05, 1.87), scale=(0.07, 0.07, 0.17), rotation=(0.10, 0, -0.12), radius_top=0.02, vertices=18),
        part("knight__eye_l", "sphere", "ink", (-0.085, -0.405, 1.64), scale=(0.022, 0.012, 0.022), segments=14),
        part("knight__eye_r", "sphere", "ink", (0.085, -0.405, 1.64), scale=(0.022, 0.012, 0.022), segments=14),
        part("knight__brow_plate", "box", "iron", (0, -0.36, 1.69), scale=(0.19, 0.045, 0.08), rotation=(0.10, 0, 0), bevel=0.02),
        part("knight__bridle", "torus", "dark_leather", (0, -0.18, 1.58), scale=(0.24, 0.28, 0.025), rotation=(1.5708, 0, 0), major_segments=34, minor_segments=8),
        part("knight__pack_l", "box", "leather", (-0.36, 0.03, 0.79), scale=(0.18, 0.16, 0.23), rotation=(0, 0.10, 0), bevel=0.035),
        part("knight__pack_r", "box", "leather", (0.36, 0.03, 0.79), scale=(0.18, 0.16, 0.23), rotation=(0, -0.10, 0), bevel=0.035),
        part("knight__pack_strap_l", "box", "dark_leather", (-0.19, -0.19, 0.83), scale=(0.024, 0.018, 0.39), rotation=(0, 0, 0.17), bevel=0.008),
        part("knight__pack_strap_r", "box", "dark_leather", (0.19, -0.19, 0.83), scale=(0.024, 0.018, 0.39), rotation=(0, 0, -0.17), bevel=0.008),
        part("knight__tool_roll", "cylinder", "copper", (0.43, 0.02, 0.93), scale=(0.05, 0.05, 0.32), rotation=(0, -0.12, 0), vertices=18),
    ]
    return p


CAST = {
    "rook": tuple(hildegard()),
    "bishop": tuple(aziz()),
    "knight": tuple(faust()),
}
ASSET_VERSION = "chronicles-tactics-party-v1"


import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--glb", required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def ensure_parent(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def material(name, spec):
    mat = bpy.data.materials.new(f"chronicles_{name}")
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*spec.color, 1.0)
    node.inputs["Roughness"].default_value = spec.roughness
    node.inputs["Metallic"].default_value = spec.metallic
    if spec.emission:
        emission_input = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        strength_input = node.inputs.get("Emission Strength")
        if emission_input:
            emission_input.default_value = (*spec.emission, 1.0)
        if strength_input:
            strength_input.default_value = spec.emission_strength
    return mat


def finish(obj, mat, *, smooth=True, bevel=0.0):
    if getattr(obj.data, "polygons", None) and smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.data.materials.append(mat)
    if bevel > 0:
        modifier = obj.modifiers.new("premium edge softness", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def build_part(spec, mats):
    options = spec.options()
    primitive = spec.primitive
    if primitive == "box":
        bpy.ops.mesh.primitive_cube_add(location=spec.location, rotation=spec.rotation)
        obj = bpy.context.object
        obj.scale = spec.scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(obj, mats[spec.material], smooth=False, bevel=float(options.get("bevel", 0.0)))
    elif primitive == "sphere":
        segments = int(options.get("segments", 32))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(12, segments // 2), location=spec.location, rotation=spec.rotation)
        obj = bpy.context.object
        obj.scale = spec.scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(obj, mats[spec.material])
    elif primitive == "cylinder":
        vertices = int(options.get("vertices", 36))
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=1.0, depth=2.0, location=spec.location, rotation=spec.rotation)
        obj = bpy.context.object
        obj.scale = spec.scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(obj, mats[spec.material], bevel=min(0.018, min(spec.scale[:2]) * 0.12))
    elif primitive == "cone":
        vertices = int(options.get("vertices", 40))
        top = float(options.get("radius_top", 0.5))
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=1.0, radius2=top, depth=2.0, location=spec.location, rotation=spec.rotation)
        obj = bpy.context.object
        obj.scale = spec.scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(obj, mats[spec.material], bevel=min(0.018, min(spec.scale[:2]) * 0.1))
    elif primitive == "torus":
        major_segments = int(options.get("major_segments", 40))
        minor_segments = int(options.get("minor_segments", 10))
        bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.11, major_segments=major_segments, minor_segments=minor_segments, location=spec.location, rotation=spec.rotation)
        obj = bpy.context.object
        obj.scale = spec.scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(obj, mats[spec.material])
    elif primitive == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=int(options.get("subdivisions", 1)), radius=1.0, location=spec.location, rotation=spec.rotation)
        obj = bpy.context.object
        obj.scale = spec.scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(obj, mats[spec.material], smooth=False)
    else:
        raise ValueError(f"unsupported primitive: {primitive}")
    obj.name = spec.name
    return obj


def add_idle_action(root, member_id):
    action = bpy.data.actions.new(f"Idle.{member_id}")
    root.animation_data_create()
    root.animation_data.action = action
    root.rotation_mode = "XYZ"
    keys = ((1, 0.0, 0.0), (24, 0.016, 0.012), (48, 0.0, 0.0), (72, -0.012, -0.010), (96, 0.0, 0.0))
    for frame, z, yaw in keys:
        root.location.z = z
        root.rotation_euler.z = yaw
        root.keyframe_insert(data_path="location", index=2, frame=frame, group="Idle")
        root.keyframe_insert(data_path="rotation_euler", index=2, frame=frame, group="Idle")
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
    return action


def build_member(member_id, specs, mats):
    root = bpy.data.objects.new(f"ChroniclesParty__{member_id}", None)
    root["chronicles_member_id"] = member_id
    root["chronicles_asset_version"] = ASSET_VERSION
    bpy.context.collection.objects.link(root)
    for spec in specs:
        obj = build_part(spec, mats)
        obj.parent = root
    add_idle_action(root, member_id)
    return root


def main():
    args = parse_args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 96
    mats = {name: material(name, spec) for name, spec in MATERIALS.items()}
    for member_id, specs in CAST.items():
        build_member(member_id, specs, mats)

    scene["chronicles_asset_version"] = ASSET_VERSION
    scene["chronicles_cast"] = ",".join(CAST.keys())
    ensure_parent(args.blend)
    ensure_parent(args.glb)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend), compress=True)

    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {
        "filepath": os.path.abspath(args.glb),
        "export_format": "GLB",
        "export_yup": True,
        "export_animations": True,
        "export_extras": True,
        "export_materials": "EXPORT",
    }
    if "export_apply" in props:
        kwargs["export_apply"] = True
    if "export_animation_mode" in props:
        kwargs["export_animation_mode"] = "ACTIONS"
    elif "export_nla_strips" in props:
        kwargs["export_nla_strips"] = True
    if "export_optimize_animation_size" in props:
        kwargs["export_optimize_animation_size"] = True
    bpy.ops.export_scene.gltf(**kwargs)
    print("Chronicles Tactics premium party:", args.blend, args.glb)


if __name__ == "__main__":
    main()
