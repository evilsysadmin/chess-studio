"""Premium visual pass for the canonical Home Matthias asset.

Keeps the existing pawn rig and routines, but makes the authored Home render the
visual source of truth: dimensional angry eyes, restrained frown, broad peaked
service cap, compact glossy torso, visible black/gold chest cross and quiet
service trim. All additions remain bone-parented so the existing animation clips
continue to drive the same character.
"""
import math
import bpy

from home_matthias_parts import (
    box,
    crescent_visor,
    elliptic_cyl,
    front_ellipse,
    front_prism,
    iron_cross_points,
    loft_ellipse,
    mat,
    parent_bone,
    sphere,
)

CANONICAL_REFERENCE = "war-room-stern-pawn-2026-09-16"
CANONICAL_REFERENCE_SHA256 = "24ce1e4da043ce32ded8cd2b7ee8a901494c15806f9489cd5625d7b6c2ce9650"
ASSET_VERSION = "home-blender-canonical-v16"


def _remove(*names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


def _remove_prefix(prefix):
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefix):
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


def _scale_xy(name, factor):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return
    obj.scale.x *= factor
    obj.scale.y *= factor


def _leaf(name, x, y, z, angle_deg, brass):
    leaf = front_ellipse(name, (x, y, z), .018, .034, .009, brass, 30, .002)
    leaf.rotation_euler.y = math.radians(angle_deg)
    return leaf


def _add_face(rig):
    _remove(
        "Eye.L", "Eye.R", "Brow.L", "Brow.R", "Mouth.L", "Mouth.R",
        "Canonical eye socket.L", "Canonical eye socket.R",
        "Canonical eye white.L", "Canonical eye white.R",
        "Canonical iris.L", "Canonical iris.R",
        "Canonical eye shine.L", "Canonical eye shine.R",
        "Canonical mouth center",
    )

    sclera = mat("canonical warm eye white", (.90, .82, .67), .24, .01)
    iris = mat("canonical dark hazel iris", (.085, .038, .012), .20, .04)
    pupil = mat("canonical pupil black", (.0008, .0010, .0014), .18, .04)
    shine = mat("canonical eye catchlight", (1.0, .88, .63), .12, .01)
    ink = mat("canonical stern facial ink", (.0010, .0012, .0018), .31, .02)

    parts = []
    for side, x in (("L", -.112), ("R", .112)):
        parts.extend([
            sphere(f"Canonical eye socket.{side}", (x, -.340, 1.382), (.078, .020, .061), ink, 48),
            sphere(f"Canonical eye white.{side}", (x, -.356, 1.382), (.066, .015, .052), sclera, 48),
            sphere(f"Canonical iris.{side}", (x, -.369, 1.378), (.030, .008, .033), iris, 40),
            sphere(f"Eye.{side}", (x, -.376, 1.377), (.021, .005, .027), pupil, 36),
            sphere(f"Canonical eye shine.{side}", (x-.008, -.381, 1.390), (.006, .0025, .008), shine, 24),
        ])

    parts.extend([
        box("Brow.L", (-.112, -.373, 1.467), (.105, .009, .026), ink, (0, math.radians(27), 0), .007),
        box("Brow.R", (.112, -.373, 1.467), (.105, .009, .026), ink, (0, math.radians(-27), 0), .007),
        box("Mouth.L", (-.052, -.365, 1.257), (.045, .005, .0055), ink, (0, math.radians(-8.5), 0), .003),
        box("Canonical mouth center", (0, -.366, 1.249), (.025, .005, .0055), ink, (0, 0, 0), .003),
        box("Mouth.R", (.052, -.365, 1.257), (.045, .005, .0055), ink, (0, math.radians(8.5), 0), .003),
    ])

    for obj in parts:
        parent_bone(obj, rig, "head")


def _rebuild_cap(rig):
    _remove(
        "Classic cap crown", "Classic cap top", "Classic cap band", "Classic cap brass line",
        "Classic cap visor", "Classic cap badge", "Classic cap badge inset",
        "Classic cap badge wing.L", "Classic cap badge wing.R",
        "Canonical cap visor brass lip", "Canonical cap badge pawn head",
        "Canonical cap badge pawn stem", "Canonical cap badge pawn base",
    )
    _remove_prefix("Canonical cap laurel")

    navy = bpy.data.materials.get("classic midnight pawn")
    leather = bpy.data.materials.get("classic black leather")
    red = bpy.data.materials.get("classic cap oxblood band")
    brass = mat("canonical warm service gold", (.64, .325, .060), .16, .93)
    dark = mat("canonical cap badge dark", (.003, .003, .004), .22, .32)

    crown = loft_ellipse(
        "Classic cap crown",
        [
            (.356, .272, 1.592, -.002),
            (.374, .282, 1.630, .000),
            (.404, .296, 1.667, .014),
            (.438, .307, 1.700, .036),
            (.454, .314, 1.724, .060),
        ],
        navy, 128, .009,
    )
    top = loft_ellipse(
        "Classic cap top",
        [
            (.448, .314, 1.714, .055),
            (.474, .324, 1.737, .080),
            (.497, .330, 1.757, .108),
            (.506, .328, 1.775, .132),
            (.492, .316, 1.790, .150),
            (.458, .298, 1.800, .160),
        ],
        navy, 132, .009,
    )
    band = elliptic_cyl("Classic cap band", (0, -.012, 1.587), .379, .079, .84, red, (math.radians(-2), 0, 0), 120, .010)
    brass_line = elliptic_cyl("Classic cap brass line", (0, -.018, 1.548), .375, .013, .84, brass, (math.radians(-2), 0, 0), 120, .003)
    visor = crescent_visor("Classic cap visor", (0, -.038, 1.625), leather, .315, .505, .174, .230, .035, 13, 60)
    visor_lip = crescent_visor("Canonical cap visor brass lip", (0, -.045, 1.630), brass, .320, .512, .177, .234, .012, 13, 60)

    parts = [crown, top, band, brass_line, visor, visor_lip]
    parts.extend([
        front_ellipse("Classic cap badge", (0, -.399, 1.684), .081, .088, .013, brass, 60, .004),
        front_ellipse("Classic cap badge inset", (0, -.410, 1.684), .059, .065, .010, dark, 52, .003),
        front_ellipse("Canonical cap badge pawn head", (0, -.420, 1.713), .017, .019, .008, brass, 32, .002),
        box("Canonical cap badge pawn stem", (0, -.420, 1.686), (.010, .004, .025), brass, (0, 0, 0), .002),
        box("Canonical cap badge pawn base", (0, -.420, 1.658), (.031, .004, .008), brass, (0, 0, 0), .002),
    ])
    leaf_specs = [
        (-.088, 1.645, -37), (-.106, 1.674, -27), (-.108, 1.705, -13), (-.095, 1.735, 7),
        (.088, 1.645, 37), (.106, 1.674, 27), (.108, 1.705, 13), (.095, 1.735, -7),
    ]
    for index, (x, z, angle) in enumerate(leaf_specs):
        parts.append(_leaf(f"Canonical cap laurel {index+1:02d}", x, -.416, z, angle, brass))

    for obj in parts:
        parent_bone(obj, rig, "head")


def _refine_body(rig):
    _scale_xy("Classic navy tunic", .84)
    _scale_xy("Classic neck plinth", .88)
    _scale_xy("Classic brass collar line", .88)

    for name, x in (("Classic tunic piping.L", -.246), ("Classic tunic piping.R", .246)):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.location.x = x
            obj.location.y = -.425


def _add_uniform_detail(rig):
    _remove_prefix("Canonical service braid")
    _remove_prefix("Canonical service button")

    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.64, .325, .060), .16, .93)
    parts = []
    xs = (-.210, -.150, -.090, -.030, .030, .090, .150, .210)
    for index, x in enumerate(xs):
        parts.append(box(
            f"Canonical service braid {index+1:02d}",
            (x, -.428, .690),
            (.034, .006, .008),
            brass,
            (0, 0, 0),
            .004,
        ))
    parts.extend([
        front_ellipse("Canonical service button.L", (-.268, -.430, .690), .020, .022, .009, brass, 28, .002),
        front_ellipse("Canonical service button.R", (.268, -.430, .690), .020, .022, .009, brass, 28, .002),
    ])
    for obj in parts:
        parent_bone(obj, rig, "spine")


def _refine_cross(rig):
    _remove("Classic chest cross brass", "Classic chest cross inset")
    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.64, .325, .060), .16, .93)
    dark = mat("canonical cross inset", (.002, .002, .003), .20, .25)
    brass_cross = front_prism("Classic chest cross brass", (0, -.455, .865), iron_cross_points(.168), .018, brass, .006)
    inset_cross = front_prism("Classic chest cross inset", (0, -.468, .865), iron_cross_points(.133), .012, dark, .004)
    parent_bone(brass_cross, rig, "spine")
    parent_bone(inset_cross, rig, "spine")


def apply_premium_canonical_pass(rig):
    """Bring the generated Blender character onto the approved Home identity."""
    rig["matthias_asset_version"] = ASSET_VERSION
    rig["canonical_reference"] = CANONICAL_REFERENCE
    rig["canonical_reference_sha256"] = CANONICAL_REFERENCE_SHA256
    rig["canonical_visual_language"] = "stern-focused-premium-pawn"

    _tune_material("classic warm ivory", (.74, .65, .51), .27, .02)
    _tune_material("classic ivory highlight", (.86, .78, .64), .22, .02)
    _tune_material("classic midnight pawn", (.0018, .0028, .0052), .16, .32)
    _tune_material("classic navy cloth", (.0032, .0048, .0080), .22, .22)
    _tune_material("classic black leather", (.0025, .0022, .0022), .22, .22)
    _tune_material("classic aged brass", (.64, .325, .060), .16, .93)
    _tune_material("classic cap oxblood band", (.115, .015, .010), .28, .08)

    _refine_body(rig)
    _add_face(rig)
    _rebuild_cap(rig)
    _add_uniform_detail(rig)
    _refine_cross(rig)
    return rig
