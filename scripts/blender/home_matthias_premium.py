"""Premium visual pass for the canonical Home Matthias asset.

Keeps the existing pawn rig and routines, but makes the authored Home render the
visual source of truth: focused dimensional eyes, restrained frown, broad peaked
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
    leaf = front_ellipse(name, (x, y, z), .011, .023, .008, brass, 28, .002)
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

    sclera = mat("canonical warm eye white", (.92, .85, .72), .23, .01)
    iris = mat("canonical dark hazel iris", (.080, .033, .010), .20, .04)
    pupil = mat("canonical pupil black", (.0008, .0010, .0014), .18, .04)
    shine = mat("canonical eye catchlight", (1.0, .90, .69), .12, .01)
    ink = mat("canonical stern facial ink", (.0010, .0012, .0018), .31, .02)

    parts = []
    for side, x in (("L", -.108), ("R", .108)):
        parts.extend([
            sphere(f"Canonical eye white.{side}", (x, -.353, 1.383), (.070, .018, .057), sclera, 52),
            sphere(f"Canonical iris.{side}", (x, -.370, 1.379), (.029, .007, .031), iris, 40),
            sphere(f"Eye.{side}", (x, -.376, 1.378), (.016, .004, .021), pupil, 36),
            sphere(f"Canonical eye shine.{side}", (x-.007, -.380, 1.389), (.0055, .0022, .0065), shine, 24),
        ])

    parts.extend([
        box("Brow.L", (-.108, -.374, 1.462), (.108, .009, .025), ink, (0, math.radians(25), 0), .007),
        box("Brow.R", (.108, -.374, 1.462), (.108, .009, .025), ink, (0, math.radians(-25), 0), .007),
        box("Mouth.L", (-.052, -.365, 1.251), (.058, .005, .006), ink, (0, math.radians(-11), 0), .003),
        box("Mouth.R", (.052, -.365, 1.251), (.058, .005, .006), ink, (0, math.radians(11), 0), .003),
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
            (.358, .274, 1.585, -.004),
            (.382, .287, 1.626, .000),
            (.417, .303, 1.667, .014),
            (.455, .318, 1.704, .038),
            (.474, .326, 1.733, .066),
        ],
        navy, 132, .009,
    )
    top = loft_ellipse(
        "Classic cap top",
        [
            (.466, .324, 1.724, .062),
            (.500, .338, 1.752, .090),
            (.525, .345, 1.779, .121),
            (.535, .341, 1.803, .148),
            (.520, .327, 1.824, .168),
            (.480, .305, 1.838, .180),
        ],
        navy, 136, .010,
    )
    band = elliptic_cyl("Classic cap band", (0, -.015, 1.582), .386, .084, .84, red, (math.radians(-2), 0, 0), 124, .010)
    brass_line = elliptic_cyl("Classic cap brass line", (0, -.020, 1.541), .382, .014, .84, brass, (math.radians(-2), 0, 0), 124, .003)
    visor = crescent_visor("Classic cap visor", (0, -.055, 1.620), leather, .340, .548, .174, .228, .038, 15, 64)
    visor_lip = crescent_visor("Canonical cap visor brass lip", (0, -.061, 1.625), brass, .345, .555, .178, .233, .012, 15, 64)

    parts = [crown, top, band, brass_line, visor, visor_lip]
    parts.extend([
        front_ellipse("Classic cap badge", (0, -.409, 1.693), .069, .076, .013, brass, 60, .004),
        front_ellipse("Classic cap badge inset", (0, -.420, 1.693), .050, .056, .010, dark, 52, .003),
        front_ellipse("Canonical cap badge pawn head", (0, -.430, 1.718), .015, .017, .008, brass, 32, .002),
        box("Canonical cap badge pawn stem", (0, -.430, 1.693), (.009, .004, .022), brass, (0, 0, 0), .002),
        box("Canonical cap badge pawn base", (0, -.430, 1.667), (.027, .004, .007), brass, (0, 0, 0), .002),
    ])
    leaf_specs = [
        (-.067, 1.661, -35), (-.082, 1.686, -24), (-.082, 1.711, -10), (-.069, 1.735, 8),
        (.067, 1.661, 35), (.082, 1.686, 24), (.082, 1.711, 10), (.069, 1.735, -8),
    ]
    for index, (x, z, angle) in enumerate(leaf_specs):
        parts.append(_leaf(f"Canonical cap laurel {index+1:02d}", x, -.426, z, angle, brass))

    for obj in parts:
        parent_bone(obj, rig, "head")


def _refine_body(rig):
    _scale_xy("Classic navy tunic", .77)
    _scale_xy("Classic neck plinth", .85)
    _scale_xy("Classic brass collar line", .85)

    for name, x in (("Classic tunic piping.L", -.230), ("Classic tunic piping.R", .230)):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.location.x = x
            obj.location.y = -.421
            obj.scale.z *= .88


def _add_uniform_detail(rig):
    _remove_prefix("Canonical service braid")
    _remove_prefix("Canonical service button")

    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.64, .325, .060), .16, .93)
    parts = []
    xs = (-.175, -.125, -.075, -.025, .025, .075, .125, .175)
    for index, x in enumerate(xs):
        parts.append(box(
            f"Canonical service braid {index+1:02d}",
            (x, -.431, .716),
            (.025, .005, .006),
            brass,
            (0, 0, 0),
            .003,
        ))
    parts.extend([
        front_ellipse("Canonical service button.L", (-.220, -.433, .716), .013, .015, .008, brass, 28, .002),
        front_ellipse("Canonical service button.R", (.220, -.433, .716), .013, .015, .008, brass, 28, .002),
    ])
    for obj in parts:
        parent_bone(obj, rig, "spine")


def _refine_cross(rig):
    _remove("Classic chest cross brass", "Classic chest cross inset")
    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.64, .325, .060), .16, .93)
    dark = mat("canonical cross inset", (.002, .002, .003), .20, .25)
    brass_cross = front_prism("Classic chest cross brass", (0, -.452, .866), iron_cross_points(.128), .017, brass, .006)
    inset_cross = front_prism("Classic chest cross inset", (0, -.465, .866), iron_cross_points(.100), .011, dark, .004)
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
