import math
import bpy
from mathutils import Vector


def mat(name, rgb, rough=.6, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def finish(o, material, smooth=True, bevel=0.0):
    if smooth and hasattr(o.data, 'polygons'):
        for p in o.data.polygons:
            p.use_smooth = True
    if bevel > 0 and getattr(o, 'modifiers', None) is not None:
        mod = o.modifiers.new('edge softness', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    o.data.materials.append(material)
    return o


def sphere(name, loc, scale, material, seg=56):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(20, seg // 2), location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, material)


def cyl(name, loc, r, d, material, rot=(0, 0, 0), verts=64, bevel=.018):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, material, bevel=bevel)


def cone(name, loc, r1, r2, d, material, rot=(0, 0, 0), bevel=.025):
    bpy.ops.mesh.primitive_cone_add(vertices=72, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, material, bevel=bevel)


def box(name, loc, scale, material, rot=(0, 0, 0), bevel=.014):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, material, False, bevel=bevel)


def cyl_between(name, start, end, radius, material, verts=48, bevel=.018):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    midpoint = (a + b) * .5
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=direction.length, location=midpoint)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = direction.to_track_quat('Z', 'Y')
    o.rotation_mode = 'XYZ'
    return finish(o, material, bevel=bevel)


def parent_bone(obj, rig, bone):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_world = world


def build_rig():
    armature = bpy.data.armatures.new('MatthiasRig')
    rig = bpy.data.objects.new('MatthiasRig', armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        item = armature.edit_bones.new(name)
        item.head = head
        item.tail = tail
        item.parent = armature.edit_bones[parent] if parent else None

    bone('root', (0, 0, 0), (0, 0, .42))
    bone('spine', (0, 0, .68), (0, 0, 1.58), 'root')
    bone('head', (0, 0, 1.55), (0, 0, 2.28), 'spine')
    bone('upper_arm.L', (-.30, 0, 1.38), (-.43, -.02, 1.18), 'spine')
    bone('forearm.L', (-.43, -.02, 1.18), (-.38, -.13, .98), 'upper_arm.L')
    bone('upper_arm.R', (.30, 0, 1.38), (.43, -.02, 1.18), 'spine')
    bone('forearm.R', (.43, -.02, 1.18), (.38, -.13, .98), 'upper_arm.R')
    bone('prop_book', (-.12, -.30, 1.12), (-.12, -.30, 1.30), 'spine')
    bone('prop_cup', (.36, -.25, 1.03), (.36, -.25, 1.13), 'forearm.R')
    bone('prop_pen', (.37, -.29, .97), (.37, -.29, 1.08), 'forearm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_character():
    """Canonical Home Matthias restored to the classic pawn-first identity.

    The early avatar works because the pawn silhouette dominates and the military
    costume is merely painted onto it. This builder keeps the modern rig, props
    and clips while returning to that visual hierarchy: compact angry face,
    simple cap, integrated navy tunic and restrained limbs.
    """
    ivory = mat('classic warm ivory', (.72, .64, .50), .46, .01)
    ivory_hi = mat('classic ivory highlight', (.90, .81, .65), .38, .01)
    navy = mat('classic midnight navy', (.020, .032, .052), .62, .03)
    navy_soft = mat('classic navy cloth', (.030, .046, .070), .78)
    leather = mat('classic black leather', (.030, .022, .018), .72, .02)
    brass = mat('classic aged brass', (.47, .27, .065), .32, .82)
    black = mat('classic brow pupil mouth', (.004, .005, .006), .72)
    eye = mat('classic eye ivory', (.88, .84, .75), .52)
    iris = mat('classic cold iris', (.025, .075, .080), .42, .04)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-classic-v7b'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    root, spine, head = [], [], []

    root += [
        cyl('Classic ivory base', (0, 0, .095), .48, .19, ivory, verts=88, bevel=.034),
        cyl('Classic navy base band', (0, 0, .205), .445, .040, navy, verts=84, bevel=.010),
        cyl('Classic brass base hairline', (0, 0, .228), .435, .012, brass, verts=84, bevel=.004),
        cone('Classic lower pawn', (0, 0, .66), .42, .255, .84, ivory, bevel=.060),
    ]

    spine += [
        cone('Classic navy tunic', (0, -.006, 1.115), .315, .292, .60, navy, bevel=.040),
        cyl('Classic belt', (0, -.006, .855), .318, .050, leather, verts=72, bevel=.010),
        box('Classic buckle', (0, -.323, .855), (.050, .012, .036), brass, bevel=.007),
        cyl('Classic ivory collar ring', (0, 0, 1.455), .270, .095, ivory_hi, verts=76, bevel=.016),
        cyl('Classic navy collar', (0, -.004, 1.500), .272, .085, navy_soft, verts=76, bevel=.012),
        cyl('Classic brass collar line', (0, -.004, 1.545), .276, .014, brass, verts=76, bevel=.004),
        box('Classic piping.L', (-.165, -.292, 1.135), (.008, .008, .220), brass, (0, math.radians(-3), 0), .003),
        box('Classic piping.R', (.165, -.292, 1.135), (.008, .008, .220), brass, (0, math.radians(3), 0), .003),
        sphere('Classic chest button upper', (0, -.307, 1.235), (.020, .010, .020), brass, 20),
        sphere('Classic chest button lower', (0, -.307, 1.095), (.020, .010, .020), brass, 20),
    ]

    # Lower, slightly tighter head makes the old avatar read as one pawn rather
    # than a floating humanoid head above a chess-piece body.
    head += [
        sphere('Head', (0, -.012, 1.880), (.322, .294, .342), ivory, 72),
        sphere('Nose', (0, -.303, 1.855), (.026, .030, .030), ivory_hi, 28),
    ]
    for side, x in [('L', -.108), ('R', .108)]:
        head += [
            sphere('Eye.' + side, (x, -.297, 1.932), (.050, .018, .026), eye, 28),
            sphere('Iris.' + side, (x, -.313, 1.928), (.020, .008, .015), iris, 20),
            sphere('Pupil.' + side, (x, -.321, 1.926), (.009, .005, .009), black, 16),
        ]
    head += [
        box('Brow.L', (-.112, -.330, 2.010), (.114, .013, .021), black, (0, math.radians(30), 0), .006),
        box('Brow.R', (.112, -.330, 2.010), (.114, .013, .021), black, (0, math.radians(-30), 0), .006),
        box('Upper lid.L', (-.108, -.327, 1.950), (.058, .008, .013), ivory, (0, math.radians(13), 0), .006),
        box('Upper lid.R', (.108, -.327, 1.950), (.058, .008, .013), ivory, (0, math.radians(-13), 0), .006),
        box('Mouth', (0, -.316, 1.783), (.038, .006, .005), black, bevel=.003),
        sphere('Classic cap crown', (0, -.004, 2.198), (.286, .262, .078), navy, 64),
        cyl('Classic cap band', (0, -.006, 2.157), .276, .050, navy_soft, verts=76, bevel=.009),
        cyl('Classic cap brass line', (0, -.007, 2.132), .270, .013, brass, verts=76, bevel=.004),
        box('Classic cap visor', (0, -.246, 2.126), (.168, .078, .017), leather, (math.radians(7), 0, 0), .010),
        sphere('Classic cap badge', (0, -.272, 2.177), (.027, .010, .030), brass, 22),
    ]

    # Keep the animation bones, but make neutral limbs little more than hints at
    # the edge of the pawn. The props still have room to come forward in clips.
    shoulder_l = (-.275, .045, 1.335); elbow_l = (-.365, .060, 1.180); wrist_l = (-.315, .000, 1.020)
    shoulder_r = (.275, .045, 1.335); elbow_r = (.365, .060, 1.180); wrist_r = (.315, .000, 1.020)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .056, navy, 44, .014)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .056, navy, 44, .014)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .048, navy_soft, 44, .012)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .048, navy_soft, 44, .012)
    cuff_l = cyl('Cuff.L', wrist_l, .052, .024, brass, verts=36, bevel=.005)
    cuff_r = cyl('Cuff.R', wrist_r, .052, .024, brass, verts=36, bevel=.005)
    hand_l = sphere('Hand.L', (-.302, -.030, .995), (.043, .037, .045), ivory, 26)
    hand_r = sphere('Hand.R', (.302, -.030, .995), (.043, .037, .045), ivory, 26)

    book = box('RoutineBook', (0, -.40, 1.12), (.19, .025, .23), leather, (math.radians(7), 0, 0), .012)
    book_page = box('RoutineBookPages', (0, -.427, 1.12), (.165, .008, .205), paper, (math.radians(7), 0, 0), .004)
    book_badge = sphere('RoutineBookBadge', (0, -.442, 1.11), (.036, .008, .045), brass, 20)
    cup = cyl('RoutineCup', (.37, -.315, 1.05), .072, .10, ivory_hi, verts=48, bevel=.010)
    cup_band = cyl('RoutineCupBand', (.37, -.315, 1.095), .074, .012, brass, verts=48, bevel=.004)
    cup_handle = sphere('RoutineCupHandle', (.455, -.315, 1.055), (.038, .018, .052), brass, 24)
    pen = cyl('RoutinePen', (.37, -.345, 1.02), .010, .30, leather, (math.radians(65), 0, math.radians(-22)), verts=24, bevel=.004)
    pen_tip = cone('RoutinePenTip', (.315, -.39, .90), .016, .003, .07, brass, (math.radians(65), 0, math.radians(-22)), .003)

    for obj in root:
        parent_bone(obj, rig, 'root')
    for obj in spine:
        parent_bone(obj, rig, 'spine')
    for obj in head:
        parent_bone(obj, rig, 'head')
    parent_bone(upper_l, rig, 'upper_arm.L')
    parent_bone(upper_r, rig, 'upper_arm.R')
    for obj in (fore_l, cuff_l, hand_l):
        parent_bone(obj, rig, 'forearm.L')
    for obj in (fore_r, cuff_r, hand_r):
        parent_bone(obj, rig, 'forearm.R')
    for obj in (book, book_page, book_badge):
        parent_bone(obj, rig, 'prop_book')
    for obj in (cup, cup_band, cup_handle):
        parent_bone(obj, rig, 'prop_cup')
    for obj in (pen, pen_tip):
        parent_bone(obj, rig, 'prop_pen')
    return rig
