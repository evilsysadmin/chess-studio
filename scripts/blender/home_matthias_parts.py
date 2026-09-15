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

    bone('root', (0, 0, 0), (0, 0, .42))
    bone('spine', (0, 0, .68), (0, 0, 1.58), 'root')
    bone('head', (0, 0, 1.45), (0, 0, 2.12), 'spine')
    bone('upper_arm.L', (-.27, .04, 1.24), (-.38, .05, 1.11), 'spine')
    bone('forearm.L', (-.38, .05, 1.11), (-.32, -.04, .99), 'upper_arm.L')
    bone('upper_arm.R', (.27, .04, 1.24), (.38, .05, 1.11), 'spine')
    bone('forearm.R', (.38, .05, 1.11), (.32, -.04, .99), 'upper_arm.R')
    bone('prop_book', (-.12, -.30, 1.08), (-.12, -.30, 1.26), 'spine')
    bone('prop_cup', (.34, -.23, 1.00), (.34, -.23, 1.10), 'forearm.R')
    bone('prop_pen', (.35, -.27, .94), (.35, -.27, 1.05), 'forearm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_character():
    """Approved Home Matthias: premium pawn first, permanently furious."""
    ivory = mat('classic warm ivory', (.72, .64, .50), .42, .02)
    ivory_hi = mat('classic ivory highlight', (.86, .78, .62), .34, .02)
    navy = mat('classic midnight pawn', (.005, .008, .014), .23, .22)
    navy_soft = mat('classic navy cloth', (.011, .017, .028), .34, .13)
    leather = mat('classic black leather', (.010, .008, .007), .33, .16)
    brass = mat('classic aged brass', (.50, .27, .055), .22, .92)
    cap_red = mat('classic cap oxblood band', (.075, .012, .009), .38, .06)
    black = mat('classic brow eye mouth', (.0015, .002, .003), .48)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-classic-v9'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    rig['canonical_pose_language'] = 'permanently-stern'
    root, spine, head = [], [], []

    # One heavy chess-piece silhouette. The base is broad, the waist pulls in,
    # and the shoulder flare grows back out before the neck: pawn, never torso.
    root += [
        cyl('Classic plinth lower', (0, 0, .060), .550, .120, navy, verts=120, bevel=.020),
        cyl('Classic plinth brass edge', (0, 0, .126), .535, .014, brass, verts=116, bevel=.003),
        cyl('Classic plinth upper', (0, 0, .178), .505, .078, navy, verts=116, bevel=.014),
        cyl('Classic plinth upper brass edge', (0, 0, .218), .490, .012, brass, verts=112, bevel=.003),
        revolve_profile('Classic lower pawn', [
            (.482, .220), (.468, .275), (.445, .340), (.418, .415),
            (.390, .505), (.364, .600), (.344, .700), (.334, .795),
            (.338, .870), (.350, .940), (.366, 1.010), (.378, 1.075),
            (.374, 1.135), (.360, 1.195), (.340, 1.250), (.317, 1.300),
            (.298, 1.338),
        ], navy, 128, .009),
        cyl('Classic lower brass line', (0, 0, .335), .438, .014, brass, verts=108, bevel=.003),
        cyl('Classic service brass line', (0, 0, .720), .346, .012, brass, verts=100, bevel=.003),
    ]

    # A shallow animated uniform skin follows the pawn volume. It adds readable
    # officer detail without creating shoulders, a shirt bib or a human chest.
    spine += [
        revolve_profile('Classic navy tunic', [
            (.343, .795), (.349, .870), (.360, .940), (.377, 1.010),
            (.389, 1.075), (.385, 1.135), (.370, 1.195), (.349, 1.250),
            (.323, 1.302), (.302, 1.340),
        ], navy_soft, 112, .006),
        cyl('Classic waist service ring', (0, 0, .805), .350, .019, brass, verts=100, bevel=.004),
        cyl('Classic neck plinth', (0, 0, 1.356), .300, .058, navy, verts=104, bevel=.010),
        cyl('Classic brass collar line', (0, 0, 1.389), .304, .013, brass, verts=104, bevel=.003),
        box('Classic tunic piping.L', (-.235, -.304, 1.060), (.010, .006, .205), brass, (0, math.radians(-8), 0), .004),
        box('Classic tunic piping.R', (.235, -.304, 1.060), (.010, .006, .205), brass, (0, math.radians(8), 0), .004),
        box('Classic chest crest field', (0, -.388, 1.070), (.082, .006, .094), leather, bevel=.008),
        box('Classic chest crest vertical', (0, -.398, 1.070), (.017, .004, .066), brass, bevel=.004),
        box('Classic chest crest horizontal', (0, -.398, 1.070), (.054, .004, .017), brass, bevel=.004),
        sphere('Classic chest badge', (0, -.405, 1.070), (.014, .005, .014), navy, 18),
    ]

    # Minimal angry face. No cute eyes, no cheeks, no facial hair: Matthias looks
    # like a furious chess pawn with just enough expression to judge the player.
    head += [
        sphere('Head', (0, -.010, 1.602), (.290, .275, .288), ivory, 88),
        sphere('Eye.L', (-.093, -.282, 1.650), (.024, .008, .025), black, 24),
        sphere('Eye.R', (.093, -.282, 1.650), (.024, .008, .025), black, 24),
        box('Brow.L', (-.096, -.302, 1.724), (.074, .009, .015), black, (0, math.radians(27), 0), .004),
        box('Brow.R', (.096, -.302, 1.724), (.074, .009, .015), black, (0, math.radians(-27), 0), .004),
        box('Mouth.L', (-.020, -.286, 1.526), (.025, .004, .004), black, (0, math.radians(-12), 0), .002),
        box('Mouth.R', (.020, -.286, 1.526), (.025, .004, .004), black, (0, math.radians(12), 0), .002),
        sphere('Classic cap crown', (0, -.004, 1.872), (.330, .282, .105), navy, 84),
        cyl('Classic cap band', (0, -.008, 1.818), .292, .068, cap_red, verts=100, bevel=.009),
        cyl('Classic cap brass line', (0, -.010, 1.783), .289, .012, brass, verts=100, bevel=.003),
        box('Classic cap visor', (0, -.254, 1.772), (.182, .082, .019), leather, (math.radians(10), 0, 0), .010),
        sphere('Classic cap badge', (0, -.292, 1.858), (.030, .010, .035), brass, 24),
        box('Classic cap badge wing.L', (-.042, -.289, 1.862), (.030, .006, .009), brass, (0, math.radians(-12), math.radians(12)), .003),
        box('Classic cap badge wing.R', (.042, -.289, 1.862), (.030, .006, .009), brass, (0, math.radians(12), math.radians(-12)), .003),
    ]

    # Neutral limbs disappear behind the pawn. They exist only so authored
    # routines can bring a compact gesture into view; Idle must have no doll arms.
    shoulder_l = (-.245, .170, 1.210); elbow_l = (-.290, .184, 1.095); wrist_l = (-.248, .168, .990)
    shoulder_r = (.245, .170, 1.210); elbow_r = (.290, .184, 1.095); wrist_r = (.248, .168, .990)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .034, navy, 40, .008)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .034, navy, 40, .008)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .029, navy_soft, 40, .007)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .029, navy_soft, 40, .007)
    cuff_l = cyl('Cuff.L', wrist_l, .032, .016, brass, verts=32, bevel=.003)
    cuff_r = cyl('Cuff.R', wrist_r, .032, .016, brass, verts=32, bevel=.003)
    hand_l = sphere('Hand.L', (-.246, .158, .977), (.022, .021, .025), ivory, 24)
    hand_r = sphere('Hand.R', (.246, .158, .977), (.022, .021, .025), ivory, 24)

    book = box('RoutineBook', (0, -.40, 1.08), (.19, .025, .23), leather, (math.radians(7), 0, 0), .012)
    book_page = box('RoutineBookPages', (0, -.427, 1.08), (.165, .008, .205), paper, (math.radians(7), 0, 0), .004)
    book_badge = sphere('RoutineBookBadge', (0, -.442, 1.07), (.036, .008, .045), brass, 20)
    cup = cyl('RoutineCup', (.35, -.305, 1.00), .070, .098, ivory_hi, verts=48, bevel=.010)
    cup_band = cyl('RoutineCupBand', (.35, -.305, 1.044), .072, .012, brass, verts=48, bevel=.004)
    cup_handle = sphere('RoutineCupHandle', (.432, -.305, 1.005), (.036, .018, .050), brass, 24)
    pen = cyl('RoutinePen', (.35, -.335, .97), .010, .29, leather, (math.radians(65), 0, math.radians(-22)), verts=24, bevel=.004)
    pen_tip = cone('RoutinePenTip', (.298, -.378, .855), .016, .003, .068, brass, (math.radians(65), 0, math.radians(-22)), .003)

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
