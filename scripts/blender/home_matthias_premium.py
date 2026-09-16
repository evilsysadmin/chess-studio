"""Premium visual pass for the canonical Home Matthias asset.

This layer deliberately keeps the pawn-first silhouette and existing animation rig,
while matching the approved 2026-09-16 Home reference more closely: glossy
midnight body, warm ivory face, readable angry eyes, serious frown, richer cap
trim and a more authored service insignia. It is additive and deterministic so
Blender CI can keep materializing the same GLB from source.
"""
import math
import bpy

from home_matthias_parts import (
    box,
    crescent_visor,
    front_ellipse,
    front_prism,
    iron_cross_points,
    mat,
    parent_bone,
    sphere,
)

CANONICAL_REFERENCE = "war-room-stern-pawn-2026-09-16"
CANONICAL_REFERENCE_SHA256 = "80e451f1670b6b8f05123a4f013e526f926b4dec1532ba5e45f7ad24de80e06a"
ASSET_VERSION = "home-blender-canonical-v16"


def _remove(*names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


def _tune_material(name, rgb, roughness, metallic):
    material = bpy.data.materials.get(name)
    if material is None or not material.use_nodes:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic


def _leaf(name, x, z, angle_deg, brass):
    leaf = front_ellipse(name, (x, -.371, z), .015, .030, .008, brass, 28, .002)
    leaf.rotation_euler.y = math.radians(angle_deg)
    return leaf


def _add_face(rig):
    _remove(
        "Eye.L", "Eye.R", "Brow.L", "Brow.R", "Mouth.L", "Mouth.R",
        "Canonical eye white.L", "Canonical eye white.R",
        "Canonical iris.L", "Canonical iris.R",
        "Canonical eye shine.L", "Canonical eye shine.R",
        "Canonical mouth center",
    )

    eye_white = mat("canonical warm eye white", (.78, .70, .56), .26, .01)
    iris = mat("canonical dark hazel iris", (.105, .052, .020), .23, .03)
    pupil = mat("canonical pupil black", (.0012, .0015, .0022), .20, .05)
    shine = mat("canonical eye catchlight", (.95, .90, .76), .16, .02)
    ink = mat("canonical stern facial ink", (.0013, .0015, .0020), .34, .02)

    parts = []
    for side, x in (("L", -.112), ("R", .112)):
        parts.extend([
            sphere(f"Canonical eye white.{side}", (x, -.336, 1.381), (.071, .019, .058), eye_white, 48),
            sphere(f"Canonical iris.{side}", (x, -.355, 1.378), (.031, .010, .034), iris, 40),
            sphere(f"Eye.{side}", (x, -.364, 1.377), (.021, .006, .027), pupil, 36),
            sphere(f"Canonical eye shine.{side}", (x-.007, -.370, 1.388), (.006, .003, .008), shine, 24),
        ])

    parts.extend([
        box("Brow.L", (-.112, -.360, 1.466), (.101, .009, .026), ink, (0, math.radians(27), 0), .007),
        box("Brow.R", (.112, -.360, 1.466), (.101, .009, .026), ink, (0, math.radians(-27), 0), .007),
        box("Mouth.L", (-.052, -.352, 1.257), (.054, .005, .006), ink, (0, math.radians(-10), 0), .003),
        box("Canonical mouth center", (0, -.354, 1.248), (.028, .005, .006), ink, (0, 0, 0), .003),
        box("Mouth.R", (.052, -.352, 1.257), (.054, .005, .006), ink, (0, math.radians(10), 0), .003),
    ])

    for obj in parts:
        parent_bone(obj, rig, "head")


def _add_cap_detail(rig):
    _remove(
        "Classic cap badge", "Classic cap badge inset",
        "Classic cap badge wing.L", "Classic cap badge wing.R",
        "Canonical cap visor brass lip",
        "Canonical cap badge pawn head", "Canonical cap badge pawn stem",
        "Canonical cap badge pawn base",
    )
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Canonical cap laurel"):
            bpy.data.objects.remove(obj, do_unlink=True)

    brass = mat("canonical warm service gold", (.62, .31, .055), .17, .92)
    leather = bpy.data.materials.get("classic black leather") or mat("canonical visor leather", (.004, .003, .002), .25, .16)
    dark = mat("canonical cap badge dark", (.004, .004, .005), .24, .30)

    parts = [
        crescent_visor("Canonical cap visor brass lip", (0, -.024, 1.661), brass, .300, .468, .169, .228, .016, 10, 56),
        front_ellipse("Classic cap badge", (0, -.368, 1.716), .079, .086, .012, brass, 56, .004),
        front_ellipse("Classic cap badge inset", (0, -.377, 1.716), .058, .064, .010, dark, 48, .003),
        front_ellipse("Canonical cap badge pawn head", (0, -.386, 1.742), .017, .019, .008, brass, 30, .002),
        box("Canonical cap badge pawn stem", (0, -.386, 1.716), (.010, .004, .024), brass, (0, 0, 0), .002),
        box("Canonical cap badge pawn base", (0, -.386, 1.690), (.030, .004, .008), brass, (0, 0, 0), .002),
    ]

    leaf_specs = [
        (-.085, 1.677, -35), (-.099, 1.704, -25), (-.101, 1.733, -12), (-.091, 1.760, 6),
        (.085, 1.677, 35), (.099, 1.704, 25), (.101, 1.733, 12), (.091, 1.760, -6),
    ]
    for index, (x, z, angle) in enumerate(leaf_specs):
        parts.append(_leaf(f"Canonical cap laurel {index+1:02d}", x, z, angle, brass))

    for obj in parts:
        parent_bone(obj, rig, "head")


def _add_uniform_detail(rig):
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Canonical service braid") or obj.name.startswith("Canonical service button"):
            bpy.data.objects.remove(obj, do_unlink=True)

    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.62, .31, .055), .17, .92)
    navy = bpy.data.materials.get("classic midnight pawn")
    if navy is None:
        navy = mat("canonical midnight enamel", (.0025, .0035, .0055), .17, .30)

    parts = []
    xs = (-.270, -.220, -.170, -.120, -.070, -.020, .030, .080, .130, .180, .230, .280)
    for index, x in enumerate(xs):
        segment = box(
            f"Canonical service braid {index+1:02d}",
            (x, -.410, .676),
            (.027, .007, .010),
            brass,
            (0, math.radians(16 if index % 2 == 0 else -16), 0),
            .004,
        )
        parts.append(segment)
    parts.extend([
        front_ellipse("Canonical service button.L", (-.322, -.407, .677), .026, .030, .010, brass, 32, .003),
        front_ellipse("Canonical service button.R", (.322, -.407, .677), .026, .030, .010, brass, 32, .003),
    ])
    for obj in parts:
        parent_bone(obj, rig, "spine")


def _refine_cross(rig):
    _remove("Classic chest cross brass", "Classic chest cross inset")
    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.62, .31, .055), .17, .92)
    dark = mat("canonical cross inset", (.003, .003, .004), .21, .22)
    brass_cross = front_prism("Classic chest cross brass", (0, -.474, .866), iron_cross_points(.158), .015, brass, .006)
    inset_cross = front_prism("Classic chest cross inset", (0, -.485, .866), iron_cross_points(.126), .010, dark, .004)
    parent_bone(brass_cross, rig, "spine")
    parent_bone(inset_cross, rig, "spine")


def apply_premium_canonical_pass(rig):
    """Bring the generated Blender character onto the approved Home identity."""
    rig["matthias_asset_version"] = ASSET_VERSION
    rig["canonical_reference"] = CANONICAL_REFERENCE
    rig["canonical_reference_sha256"] = CANONICAL_REFERENCE_SHA256
    rig["canonical_visual_language"] = "stern-focused-premium-pawn"

    _tune_material("classic warm ivory", (.72, .63, .49), .29, .02)
    _tune_material("classic ivory highlight", (.84, .76, .61), .24, .02)
    _tune_material("classic midnight pawn", (.0020, .0030, .0055), .17, .31)
    _tune_material("classic navy cloth", (.0040, .0055, .0090), .23, .21)
    _tune_material("classic black leather", (.0030, .0025, .0025), .24, .20)
    _tune_material("classic aged brass", (.62, .31, .055), .17, .92)
    _tune_material("classic cap oxblood band", (.105, .014, .010), .30, .07)

    _add_face(rig)
    _add_cap_detail(rig)
    _add_uniform_detail(rig)
    _refine_cross(rig)
    return rig
