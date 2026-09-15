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
    """Canonical Home Matthias: a permanently angry anthropomorphic pawn.

    The pawn silhouette is primary. No moustache, beard, hair, human cheeks or
    ears. His costume and props are integrated Blender geometry, and every Home
    routine is driven by the exported armature clips.
    """
    ivory = mat('aged ivory pawn', (.74, .67, .54), .42, .02)
    ivory_hi = mat('ivory highlight', (.93, .84, .68), .34, .01)
    navy = mat('midnight navy', (.018, .032, .052), .58, .04)
    cloth = mat('midnight cloth', (.030, .050, .075), .75)
    leather = mat('black leather', (.045, .028, .022), .66, .03)
    brass = mat('aged brass', (.50, .28, .055), .28, .86)
    black = mat('brow and pupil', (.006, .007, .008), .68)
    white = mat('eye white', (.90, .87, .78), .48)
    iris = mat('cold iris', (.035, .11, .12), .36, .08)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-pawn-v6'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    root, spine, head = [], [], []

    root += [
        cyl('Ivory base', (0, 0, .09), .49, .18, ivory, verts=80, bevel=.030),
        cyl('Brass base trim', (0, 0, .19), .455, .025, brass, verts=80, bevel=.007),
        cone('Ivory lower pawn', (0, 0, .65), .43, .27, .86, ivory, bevel=.055),
    ]

    spine += [
        cone('Uniform coat', (0, -.005, 1.08), .335, .345, .69, navy, bevel=.045),
        cyl('Ivory neck ring', (0, 0, 1.48), .285, .10, ivory_hi, verts=72, bevel=.018),
        cyl('High collar', (0, -.002, 1.50), .285, .115, cloth, verts=72, bevel=.012),
        cyl('Collar brass', (0, -.002, 1.565), .29, .022, brass, verts=72, bevel=.006),
        box('Chest strap', (.12, -.328, 1.19), (.026, .012, .31), leather, (0, math.radians(-18), math.radians(-12)), .008),
        sphere('Chest clasp', (.12, -.348, 1.31), (.038, .014, .038), brass, 28),
        box('Epaulette.L', (-.31, -.02, 1.38), (.12, .12, .028), brass, (0, 0, math.radians(-7)), .010),
        box('Epaulette.R', (.31, -.02, 1.38), (.12, .12, .028), brass, (0, 0, math.radians(7)), .010),
        box('Coat piping.L', (-.245, -.319, 1.13), (.010, .010, .265), brass, (0, math.radians(-4), 0), .004),
        box('Coat piping.R', (.245, -.319, 1.13), (.010, .010, .265), brass, (0, math.radians(4), 0), .004),
    ]

    # Matthias is angry in neutral state. Screen-plane slopes use Y rotation;
    # rotating these bars around Z was the old bug that read as flat eyebrows.
    head += [
        sphere('Head', (0, -.015, 1.92), (.345, .315, .365), ivory, 64),
        sphere('Nose', (0, -.327, 1.905), (.034, .039, .043), ivory_hi, 30),
    ]
    for side, x in [('L', -.12), ('R', .12)]:
        head += [
            sphere('Eye.' + side, (x, -.313, 1.972), (.068, .022, .033), white, 32),
            sphere('Iris.' + side, (x, -.334, 1.968), (.028, .010, .020), iris, 22),
            sphere('Pupil.' + side, (x, -.344, 1.966), (.011, .006, .010), black, 18),
        ]
    head += [
        # Inner ends dive toward the nose: permanent severe scowl.
        box('Brow.L', (-.12, -.347, 2.045), (.110, .014, .020), black, (0, math.radians(25), 0), .006),
        box('Brow.R', (.12, -.347, 2.045), (.110, .014, .020), black, (0, math.radians(-25), 0), .006),
        # Ivory lids partly occlude the upper eye and kill the wide-eyed toy stare.
        box('Upper lid.L', (-.12, -.350, 1.997), (.078, .010, .020), ivory, (0, math.radians(18), 0), .008),
        box('Upper lid.R', (.12, -.350, 1.997), (.078, .010, .020), ivory, (0, math.radians(-18), 0), .008),
        box('Mouth', (0, -.344, 1.815), (.056, .007, .007), black, bevel=.004),
        sphere('Cap crown', (0, -.005, 2.255), (.31, .285, .095), navy, 56),
        cyl('Cap band', (0, -.008, 2.205), .292, .060, cloth, verts=72, bevel=.010),
        box('Cap visor', (0, -.270, 2.18), (.19, .095, .022), leather, (math.radians(8), 0, 0), .012),
        sphere('Cap badge', (0, -.294, 2.24), (.038, .014, .042), brass, 24),
    ]

    shoulder_l = (-.30, -.005, 1.36); elbow_l = (-.43, -.025, 1.16); wrist_l = (-.38, -.13, .98)
    shoulder_r = (.30, -.005, 1.36); elbow_r = (.43, -.025, 1.16); wrist_r = (.38, -.13, .98)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .095, navy, 48, .022)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .095, navy, 48, .022)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .085, cloth, 48, .020)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .085, cloth, 48, .020)
    cuff_l = sphere('Cuff.L', (-.385, -.125, 1.00), (.092, .072, .060), brass, 28)
    cuff_r = sphere('Cuff.R', (.385, -.125, 1.00), (.092, .072, .060), brass, 28)
    hand_l = sphere('Hand.L', (-.35, -.19, .94), (.075, .060, .075), ivory, 30)
    hand_r = sphere('Hand.R', (.35, -.19, .94), (.075, .060, .075), ivory, 30)

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
    parent_bone(upper_l, rig, 'upper_arm.L'); parent_bone(upper_r, rig, 'upper_arm.R')
    for obj in (fore_l, cuff_l, hand_l): parent_bone(obj, rig, 'forearm.L')
    for obj in (fore_r, cuff_r, hand_r): parent_bone(obj, rig, 'forearm.R')
    for obj in (book, book_page, book_badge): parent_bone(obj, rig, 'prop_book')
    for obj in (cup, cup_band, cup_handle): parent_bone(obj, rig, 'prop_cup')
    for obj in (pen, pen_tip): parent_bone(obj, rig, 'prop_pen')
    return rig
