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
    leaf = front_ellipse(name, (x, y, z), .010, .021, .008, brass, 28, .002)
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

    sclera = mat("canonical warm eye white", (.93, .87, .75), .24, .01)
    iris = mat("canonical dark hazel iris", (.090, .038, .012), .20, .04)
    pupil = mat("canonical pupil black", (.0008, .0010, .0014), .18, .04)
    shine = mat("canonical eye catchlight", (1.0, .91, .72), .12, .01)
    ink = mat("canonical stern facial ink", (.0010, .0012, .0018), .31, .02)

    parts = []
    for side, x in (("L", -.110), ("R", .110)):
        parts.extend([
            sphere(f"Canonical eye white.{side}", (x, -.350, 1.382), (.086, .026, .069), sclera, 56),
            sphere(f"Canonical iris.{side}", (x, -.374, 1.379), (.035, .008, .037), iris, 44),
            sphere(f"Eye.{side}", (x, -.381, 1.378), (.020, .0045, .024), pupil, 36),
            sphere(f"Canonical eye shine.{side}", (x-.009, -.385, 1.392), (.006, .0022, .0075), shine, 24),
        ])

    parts.extend([
        box("Brow.L", (-.110, -.378, 1.463), (.112, .010, .027), ink, (0, math.radians(26), 0), .008),
        box("Brow.R", (.110, -.378, 1.463), (.112, .010, .027), ink, (0, math.radians(-26), 0), .008),
        box("Mouth.L", (-.053, -.368, 1.252), (.060, .005, .006), ink, (0, math.radians(-10), 0), .003),
        box("Canonical mouth center", (0, -.369, 1.243), (.020, .005, .006), ink, (0, 0, 0), .003),
        box("Mouth.R", (.053, -.368, 1.252), (.060, .005, .006), ink, (0, math.radians(10), 0), .003),
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
            (.354, .270, 1.582, -.004),
            (.370, .278, 1.625, .000),
            (.392, .286, 1.672, .012),
            (.415, .292, 1.716, .030),
            (.428, .294, 1.748, .050),
        ],
        navy, 132, .010,
    )
    top = loft_ellipse(
        "Classic cap top",
        [
            (.424, .294, 1.742, .048),
            (.444, .302, 1.772, .064),
            (.462, .307, 1.802, .082),
            (.470, .305, 1.829, .098),
            (.462, .296, 1.851, .111),
            (.440, .282, 1.866, .118),
        ],
        navy, 136, .010,
    )
    band = elliptic_cyl("Classic cap band", (0, -.015, 1.579), .375, .086, .84, red, (math.radians(-2), 0, 0), 124, .010)
    brass_line = elliptic_cyl("Classic cap brass line", (0, -.020, 1.537), .371, .014, .84, brass, (math.radians(-2), 0, 0), 124, .003)
    visor = crescent_visor("Classic cap visor", (0, -.060, 1.616), leather, .335, .540, .174, .226, .039, 16, 64)
    visor_lip = crescent_visor("Canonical cap visor brass lip", (0, -.066, 1.621), brass, .340, .547, .178, .231, .012, 16, 64)

    parts = [crown, top, band, brass_line, visor, visor_lip]
    parts.extend([
        front_ellipse("Classic cap badge", (0, -.401, 1.697), .064, .071, .013, brass, 60, .004),
        front_ellipse("Classic cap badge inset", (0, -.412, 1.697), .046, .052, .010, dark, 52, .003),
        front_ellipse("Canonical cap badge pawn head", (0, -.422, 1.720), .014, .016, .008, brass, 32, .002),
        box("Canonical cap badge pawn stem", (0, -.422, 1.696), (.0085, .004, .021), brass, (0, 0, 0), .002),
        box("Canonical cap badge pawn base", (0, -.422, 1.671), (.025, .004, .007), brass, (0, 0, 0), .002),
    ])
    leaf_specs = [
        (-.061, 1.665, -34), (-.074, 1.687, -23), (-.075, 1.710, -10), (-.064, 1.732, 7),
        (.061, 1.665, 34), (.074, 1.687, 23), (.075, 1.710, 10), (.064, 1.732, -7),
    ]
    for index, (x, z, angle) in enumerate(leaf_specs):
        parts.append(_leaf(f"Canonical cap laurel {index+1:02d}", x, -.418, z, angle, brass))

    for obj in parts:
        parent_bone(obj, rig, "head")


def _refine_body(rig):
    _scale_xy("Classic navy tunic", .73)
    _scale_xy("Classic neck plinth", .84)
    _scale_xy("Classic brass collar line", .84)

    waist = bpy.data.objects.get("Classic waist service ring")
    if waist is not None:
        waist.location.z = .704
        waist.scale.x *= .88
        waist.scale.y *= .88

    service = bpy.data.objects.get("Classic service brass line")
    if service is not None:
        service.location.z = .635
        service.scale.x *= .92
        service.scale.y *= .92

    for name, x in (("Classic tunic piping.L", -.218), ("Classic tunic piping.R", .218)):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.location.x = x
            obj.location.y = -.414
            obj.scale.z *= .82


def _add_uniform_detail(rig):
    # The approved canon is deliberately restrained. The authored body rings
    # provide the single service-cord read; extra segmented braid looked like UI.
    _remove_prefix("Canonical service braid")
    _remove_prefix("Canonical service button")


def _refine_cross(rig):
    _remove("Classic chest cross brass", "Classic chest cross inset")
    brass = bpy.data.materials.get("canonical warm service gold") or mat("canonical warm service gold", (.64, .325, .060), .16, .93)
    dark = mat("canonical cross inset", (.002, .002, .003), .20, .25)
    brass_cross = front_prism("Classic chest cross brass", (0, -.448, .870), iron_cross_points(.116), .017, brass, .006)
    inset_cross = front_prism("Classic chest cross inset", (0, -.461, .870), iron_cross_points(.090), .011, dark, .004)
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
