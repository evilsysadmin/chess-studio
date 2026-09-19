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
    cyl_between,
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
    leaf = front_ellipse(name, (x, y, z), .010, .021, .008, brass, 28, .002)
    leaf.rotation_euler.y = math.radians(angle_deg)
    return leaf


def _add_face(rig):
    _remove(
        "Eye.L", "Eye.R", "Brow.L", "Brow.R", "Mouth.L", "Mouth.R",
        "Canonical brow crease",
        "Canonical eye socket.L", "Canonical eye socket.R",
        "Canonical eye white.L", "Canonical eye white.R",
        "Canonical iris.L", "Canonical iris.R",
        "Canonical eye shine.L", "Canonical eye shine.R",
        "Canonical mouth center",
    )

    socket = mat("canonical eye socket shadow", (.020, .014, .010), .38, .01)
    sclera = mat("canonical warm eye white", (.98, .92, .82), .28, .01)
    iris = mat("canonical dark hazel iris", (.082, .031, .009), .22, .04)
    pupil = mat("canonical pupil black", (.0008, .0010, .0014), .18, .04)
    shine = mat("canonical eye catchlight", (1.0, .93, .77), .12, .01)
    ink = mat("canonical stern facial ink", (.0010, .0012, .0018), .31, .02)

    parts = []
    for side, x in (("L", -.112), ("R", .112)):
        parts.extend([
            sphere(f"Canonical eye socket.{side}", (x, -.347, 1.380), (.105, .024, .086), socket, 56),
            sphere(f"Canonical eye white.{side}", (x, -.355, 1.380), (.094, .025, .075), sclera, 56),
            sphere(f"Canonical iris.{side}", (x, -.378, 1.377), (.041, .0085, .043), iris, 44),
            sphere(f"Eye.{side}", (x, -.385, 1.376), (.024, .0048, .028), pupil, 36),
            sphere(f"Canonical eye shine.{side}", (x-.010, -.389, 1.392), (.007, .0022, .008), shine, 24),
        ])

    parts.extend([
        box("Brow.L", (-.112, -.380, 1.449), (.120, .011, .032), ink, (0, math.radians(28), 0), .009),
        box("Brow.R", (.112, -.380, 1.449), (.120, .011, .032), ink, (0, math.radians(-28), 0), .009),
        box("Canonical brow crease", (0, -.371, 1.435), (.006, .004, .022), ink, (0, 0, 0), .002),
        box("Mouth.L", (-.056, -.370, 1.247), (.069, .005, .007), ink, (0, math.radians(-8), 0), .003),
        box("Mouth.R", (.056, -.370, 1.247), (.069, .005, .007), ink, (0, math.radians(8), 0), .003),
        box("Canonical mouth center", (0, -.371, 1.253), (.020, .005, .006), ink, (0, 0, 0), .003),
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
        "Canonical cap top piping",
    )
    _remove_prefix("Canonical cap laurel")

    navy = bpy.data.materials.get("classic midnight pawn")
    leather = bpy.data.materials.get("classic black leather")
    red = bpy.data.materials.get("classic cap oxblood band")
    brass = mat("canonical warm service gold", (.59, .285, .055), .18, .92)
    dark = mat("canonical cap badge dark", (.003, .003, .004), .22, .32)

    crown = loft_ellipse(
        "Classic cap crown",
        [
            (.365, .274, 1.578, -.004),
            (.383, .284, 1.624, .001),
            (.405, .294, 1.674, .016),
            (.430, .301, 1.720, .038),
            (.440, .303, 1.754, .062),
        ],
        navy, 132, .011,
    )
    top = loft_ellipse(
        "Classic cap top",
        [
            (.438, .300, 1.748, .060),
            (.466, .314, 1.780, .082),
            (.492, .326, 1.812, .106),
            (.505, .330, 1.843, .130),
            (.498, .324, 1.868, .149),
            (.480, .312, 1.886, .160),
        ],
        navy, 136, .011,
    )
    top_piping = elliptic_cyl("Canonical cap top piping", (0, .044, 1.865), .484, .011, .68, brass, (math.radians(-1), 0, 0), 124, .003)
    band = elliptic_cyl("Classic cap band", (0, -.017, 1.579), .382, .090, .84, red, (math.radians(-2), 0, 0), 124, .011)
    brass_line = elliptic_cyl("Classic cap brass line", (0, -.023, 1.535), .378, .014, .84, brass, (math.radians(-2), 0, 0), 124, .003)
    visor = crescent_visor("Classic cap visor", (0, -.082, 1.613), leather, .330, .580, .160, .230, .044, 20, 64)
    visor_lip = crescent_visor("Canonical cap visor brass lip", (0, -.088, 1.619), brass, .332, .588, .164, .236, .012, 20, 64)

    parts = [crown, top, top_piping, band, brass_line, visor, visor_lip]
    parts.extend([
        front_ellipse("Classic cap badge", (0, -.407, 1.704), .070, .078, .013, brass, 60, .004),
        front_ellipse("Classic cap badge inset", (0, -.418, 1.704), .050, .057, .010, dark, 52, .003),
        front_ellipse("Canonical cap badge pawn head", (0, -.428, 1.729), .016, .018, .008, brass, 32, .002),
        box("Canonical cap badge pawn stem", (0, -.428, 1.702), (.009, .004, .023), brass, (0, 0, 0), .002),
        box("Canonical cap badge pawn base", (0, -.428, 1.675), (.028, .004, .007), brass, (0, 0, 0), .002),
    ])
    leaf_specs = [
        (-.066, 1.670, -34), (-.081, 1.693, -23), (-.082, 1.718, -10), (-.069, 1.742, 7),
        (.066, 1.670, 34), (.081, 1.693, 23), (.082, 1.718, 10), (.069, 1.742, -7),
    ]
    for index, (x, z, angle) in enumerate(leaf_specs):
        parts.append(_leaf(f"Canonical cap laurel {index+1:02d}", x, -.424, z, angle, brass))

    for obj in parts:
        parent_bone(obj, rig, "head")


def _refine_body(rig):
    _scale_xy("Classic lower pawn", .88)
    _scale_xy("Classic navy tunic", .76)
    _scale_xy("Classic neck plinth", .82)
    _scale_xy("Classic brass collar line", .82)
    _remove("Classic waist service ring", "Classic service brass line")

    for name, x in (("Classic tunic piping.L", -.225), ("Classic tunic piping.R", .225)):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.location.x = x
            obj.location.y = -.405
            obj.scale.z *= .74


def _add_uniform_detail(rig):
    _remove_prefix("Canonical service braid")
    _remove_prefix("Canonical service button")
    _remove("Canonical service cord")

    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.59, .285, .055), .18, .92)
    parts = []
    braid_points = []
    for index in range(13):
        x = -.185 + (.370 * index / 12)
        normalized = x / .185
        z = .724 + (.022 * (1.0 - normalized * normalized))
        braid_points.append((x, -.420, z))
    for index, (start, end) in enumerate(zip(braid_points, braid_points[1:]), start=1):
        parts.append(cyl_between(f"Canonical service braid {index:02d}", start, end, .0075, brass, 24, .002))
    parts.extend([
        front_ellipse("Canonical service button.L", (-.208, -.422, .724), .014, .017, .009, brass, 30, .002),
        front_ellipse("Canonical service button.R", (.208, -.422, .724), .014, .017, .009, brass, 30, .002),
    ])
    for obj in parts:
        parent_bone(obj, rig, "spine")


def _refine_cross(rig):
    _remove("Classic chest cross brass", "Classic chest cross inset")
    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.59, .285, .055), .18, .92)
    dark = mat("canonical cross inset", (.002, .002, .003), .20, .25)
    brass_cross = front_prism("Classic chest cross brass", (0, -.432, .884), iron_cross_points(.135), .018, brass, .006)
    inset_cross = front_prism("Classic chest cross inset", (0, -.446, .884), iron_cross_points(.095), .011, dark, .004)
    parent_bone(brass_cross, rig, "spine")
    parent_bone(inset_cross, rig, "spine")


def apply_premium_canonical_pass(rig):
    """Bring the generated Blender character onto the approved Home identity."""
    rig["matthias_asset_version"] = ASSET_VERSION
    rig["canonical_reference"] = CANONICAL_REFERENCE
    rig["canonical_reference_sha256"] = CANONICAL_REFERENCE_SHA256
    rig["canonical_visual_language"] = "stern-focused-premium-pawn"

    _tune_material("classic warm ivory", (.66, .57, .45), .31, .02)
    _tune_material("classic ivory highlight", (.82, .73, .58), .26, .02)
    _tune_material("classic midnight pawn", (.0018, .0028, .0052), .20, .30)
    _tune_material("classic navy cloth", (.0032, .0048, .0080), .24, .20)
    _tune_material("classic black leather", (.0025, .0022, .0022), .24, .20)
    _tune_material("classic aged brass", (.59, .285, .055), .18, .92)
    _tune_material("classic cap oxblood band", (.074, .009, .007), .31, .06)

    _refine_body(rig)
    _add_face(rig)
    _rebuild_cap(rig)
    _add_uniform_detail(rig)
    _refine_cross(rig)
    return rig
