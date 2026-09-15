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


def revolve_profile(name, profile, material, segments=96, bevel=.0):
    """Build a smooth pawn-like solid by revolving an (radius, z) profile."""
    verts = []
    rings = len(profile)
    for i in range(segments):
        angle = (math.tau * i) / segments
        ca, sa = math.cos(angle), math.sin(angle)
        for radius, z in profile:
            verts.append((radius * ca, radius * sa, z))

    faces = []
    for i in range(segments):
        nxt = (i + 1) % segments
        for j in range(rings - 1):
            a = i * rings + j
            b = nxt * rings + j
            c = nxt * rings + j + 1
            d = i * rings + j + 1
            faces.append((a, b, c, d))

    bottom_center = len(verts)
    verts.append((0, 0, profile[0][1]))
    top_center = len(verts)
    verts.append((0, 0, profile[-1][1]))
    for i in range(segments):
        nxt = (i + 1) % segments
        faces.append((bottom_center, nxt * rings, i * rings))
        faces.append((top_center, i * rings + rings - 1, nxt * rings + rings - 1))

    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, material, True, bevel)


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

    bone('root', (0, 0, 0), (0, 0, .38))
    bone('spine', (0, 0, .58), (0, 0, 1.36), 'root')
    bone('head', (0, 0, 1.20), (0, 0, 1.90), 'spine')
    bone('upper_arm.L', (-.27, .04, 1.08), (-.38, .05, .96), 'spine')
    bone('forearm.L', (-.38, .05, .96), (-.32, -.04, .84), 'upper_arm.L')
    bone('upper_arm.R', (.27, .04, 1.08), (.38, .05, .96), 'spine')
    bone('forearm.R', (.38, .05, .96), (.32, -.04, .84), 'upper_arm.R')
    bone('prop_book', (-.12, -.30, .91), (-.12, -.30, 1.08), 'spine')
    bone('prop_cup', (.34, -.23, .84), (.34, -.23, .94), 'forearm.R')
    bone('prop_pen', (.35, -.27, .79), (.35, -.27, .90), 'forearm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_character():
    """Approved Home Matthias: compact premium officer-pawn, always furious."""
    ivory = mat('classic warm ivory', (.72, .64, .50), .42, .02)
    ivory_hi = mat('classic ivory highlight', (.86, .78, .62), .34, .02)
    navy = mat('classic midnight pawn', (.005, .008, .014), .19, .30)
    navy_soft = mat('classic navy cloth', (.011, .017, .028), .30, .18)
    leather = mat('classic black leather', (.010, .008, .007), .30, .20)
    brass = mat('classic aged brass', (.50, .27, .055), .20, .93)
    cap_red = mat('classic cap oxblood band', (.075, .012, .009), .38, .06)
    black = mat('classic brow eye mouth', (.0015, .002, .003), .48)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-classic-v9c'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    rig['canonical_pose_language'] = 'permanently-stern'
    root, spine, head = [], [], []

    # Heavy, compact chess body based on the approved reference. Broad base,
    # pinched waist, shoulder flare, then a wide collar beneath the pawn head.
    root += [
        cyl('Classic plinth lower', (0, 0, .060), .600, .120, navy, verts=128, bevel=.022),
        cyl('Classic plinth brass edge', (0, 0, .126), .585, .014, brass, verts=124, bevel=.003),
        cyl('Classic plinth upper', (0, 0, .178), .550, .078, navy, verts=124, bevel=.015),
        cyl('Classic plinth upper brass edge', (0, 0, .218), .535, .012, brass, verts=120, bevel=.003),
        revolve_profile('Classic lower pawn', [
            (.520, .220), (.505, .270), (.482, .330), (.454, .400),
            (.425, .480), (.398, .565), (.375, .650), (.360, .730),
            (.362, .800), (.375, .865), (.394, .930), (.410, .995),
            (.407, 1.050), (.393, 1.100), (.372, 1.145), (.345, 1.180),
            (.318, 1.205),
        ], navy, 132, .009),
        cyl('Classic lower brass line', (0, 0, .335), .475, .014, brass, verts=112, bevel=.003),
        cyl('Classic service brass line', (0, 0, .650), .378, .012, brass, verts=104, bevel=.003),
    ]

    spine += [
        revolve_profile('Classic navy tunic', [
            (.368, .720), (.372, .800), (.386, .865), (.404, .930),
            (.420, .995), (.416, 1.050), (.402, 1.100), (.382, 1.145),
            (.356, 1.180), (.328, 1.207),
        ], navy_soft, 116, .006),
        cyl('Classic waist service ring', (0, 0, .724), .376, .019, brass, verts=104, bevel=.004),
        cyl('Classic neck plinth', (0, 0, 1.220), .385, .060, navy, verts=112, bevel=.011),
        cyl('Classic brass collar line', (0, 0, 1.253), .390, .013, brass, verts=112, bevel=.003),
        box('Classic tunic piping.L', (-.258, -.340, .965), (.011, .006, .180), brass, (0, math.radians(-8), 0), .004),
        box('Classic tunic piping.R', (.258, -.340, .965), (.011, .006, .180), brass, (0, math.radians(8), 0), .004),
        box('Classic chest crest field', (0, -.428, .955), (.116, .002, .124), navy, bevel=.004),
        box('Classic chest crest vertical', (0, -.438, .955), (.024, .004, .092), brass, bevel=.004),
        box('Classic chest crest horizontal', (0, -.438, .955), (.078, .004, .024), brass, bevel=.004),
        sphere('Classic chest badge', (0, -.445, .955), (.018, .005, .018), navy, 18),
    ]

    # Large ivory head, minimal features, permanent scowl.
    head += [
        sphere('Head', (0, -.010, 1.470), (.340, .315, .315), ivory, 92),
        sphere('Eye.L', (-.108, -.322, 1.525), (.026, .008, .029), black, 24),
        sphere('Eye.R', (.108, -.322, 1.525), (.026, .008, .029), black, 24),
        box('Brow.L', (-.110, -.340, 1.603), (.082, .009, .016), black, (0, math.radians(27), 0), .004),
        box('Brow.R', (.110, -.340, 1.603), (.082, .009, .016), black, (0, math.radians(-27), 0), .004),
        box('Mouth.L', (-.024, -.324, 1.383), (.030, .004, .004), black, (0, math.radians(-12), 0), .002),
        box('Mouth.R', (.024, -.324, 1.383), (.030, .004, .004), black, (0, math.radians(12), 0), .002),
        sphere('Classic cap crown', (0, -.006, 1.725), (.360, .300, .115), navy, 88),
        sphere('Classic cap top', (0, .006, 1.792), (.405, .320, .065), navy, 88),
        cyl('Classic cap band', (0, -.008, 1.665), .340, .074, cap_red, verts=108, bevel=.010),
        cyl('Classic cap brass line', (0, -.010, 1.626), .336, .013, brass, verts=108, bevel=.003),
        box('Classic cap visor', (0, -.294, 1.614), (.215, .095, .020), leather, (math.radians(10), 0, 0), .011),
        sphere('Classic cap badge', (0, -.332, 1.710), (.036, .010, .042), brass, 26),
        box('Classic cap badge wing.L', (-.054, -.329, 1.714), (.038, .006, .011), brass, (0, math.radians(-12), math.radians(12)), .003),
        box('Classic cap badge wing.R', (.054, -.329, 1.714), (.038, .006, .011), brass, (0, math.radians(12), math.radians(-12)), .003),
    ]

    # Hidden neutral limbs; routines may bring them forward, Idle never does.
    shoulder_l = (-.260, .185, 1.045); elbow_l = (-.305, .198, .930); wrist_l = (-.263, .182, .825)
    shoulder_r = (.260, .185, 1.045); elbow_r = (.305, .198, .930); wrist_r = (.263, .182, .825)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .034, navy, 40, .008)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .034, navy, 40, .008)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .029, navy_soft, 40, .007)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .029, navy_soft, 40, .007)
    cuff_l = cyl('Cuff.L', wrist_l, .032, .016, brass, verts=32, bevel=.003)
    cuff_r = cyl('Cuff.R', wrist_r, .032, .016, brass, verts=32, bevel=.003)
    hand_l = sphere('Hand.L', (-.261, .172, .812), (.022, .021, .025), ivory, 24)
    hand_r = sphere('Hand.R', (.261, .172, .812), (.022, .021, .025), ivory, 24)

    book = box('RoutineBook', (0, -.43, .92), (.19, .025, .22), leather, (math.radians(7), 0, 0), .012)
    book_page = box('RoutineBookPages', (0, -.457, .92), (.165, .008, .195), paper, (math.radians(7), 0, 0), .004)
    book_badge = sphere('RoutineBookBadge', (0, -.472, .91), (.036, .008, .045), brass, 20)
    cup = cyl('RoutineCup', (.37, -.335, .84), .070, .098, ivory_hi, verts=48, bevel=.010)
    cup_band = cyl('RoutineCupBand', (.37, -.335, .884), .072, .012, brass, verts=48, bevel=.004)
    cup_handle = sphere('RoutineCupHandle', (.452, -.335, .845), (.036, .018, .050), brass, 24)
    pen = cyl('RoutinePen', (.37, -.365, .81), .010, .29, leather, (math.radians(65), 0, math.radians(-22)), verts=24, bevel=.004)
    pen_tip = cone('RoutinePenTip', (.318, -.408, .695), .016, .003, .068, brass, (math.radians(65), 0, math.radians(-22)), .003)

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
