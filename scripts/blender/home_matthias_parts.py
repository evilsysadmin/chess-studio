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
    navy = mat('classic midnight pawn', (.005, .008, .014), .20, .28)
    navy_soft = mat('classic navy cloth', (.011, .017, .028), .31, .16)
    leather = mat('classic black leather', (.010, .008, .007), .31, .18)
    brass = mat('classic aged brass', (.50, .27, .055), .21, .92)
    cap_red = mat('classic cap oxblood band', (.075, .012, .009), .38, .06)
    black = mat('classic brow eye mouth', (.0015, .002, .003), .48)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-classic-v9b'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    rig['canonical_pose_language'] = 'permanently-stern'
    root, spine, head = [], [], []

    # Canonical reference: squat and heavy. The base is deliberately broad so
    # the whole figure reads as a chess pawn before the uniform is noticed.
    root += [
        cyl('Classic plinth lower', (0, 0, .060), .600, .120, navy, verts=128, bevel=.022),
        cyl('Classic plinth brass edge', (0, 0, .126), .585, .014, brass, verts=124, bevel=.003),
        cyl('Classic plinth upper', (0, 0, .178), .550, .078, navy, verts=124, bevel=.015),
        cyl('Classic plinth upper brass edge', (0, 0, .218), .535, .012, brass, verts=120, bevel=.003),
        revolve_profile('Classic lower pawn', [
            (.520, .220), (.503, .275), (.480, .340), (.450, .415),
            (.420, .505), (.390, .600), (.365, .700), (.350, .795),
            (.352, .870), (.365, .940), (.382, 1.010), (.397, 1.075),
            (.392, 1.135), (.378, 1.195), (.358, 1.250), (.334, 1.300),
            (.312, 1.338),
        ], navy, 132, .009),
        cyl('Classic lower brass line', (0, 0, .335), .475, .014, brass, verts=112, bevel=.003),
        cyl('Classic service brass line', (0, 0, .720), .365, .012, brass, verts=104, bevel=.003),
    ]

    # The uniform is only a thin skin over the pawn. It may decorate the piece,
    # never replace the piece with a human chest.
    spine += [
        revolve_profile('Classic navy tunic', [
            (.360, .795), (.366, .870), (.378, .940), (.395, 1.010),
            (.408, 1.075), (.403, 1.135), (.389, 1.195), (.368, 1.250),
            (.342, 1.302), (.320, 1.340),
        ], navy_soft, 116, .006),
        cyl('Classic waist service ring', (0, 0, .805), .370, .019, brass, verts=104, bevel=.004),
        cyl('Classic neck plinth', (0, 0, 1.356), .325, .058, navy, verts=108, bevel=.010),
        cyl('Classic brass collar line', (0, 0, 1.389), .330, .013, brass, verts=108, bevel=.003),
        box('Classic tunic piping.L', (-.250, -.325, 1.060), (.011, .006, .215), brass, (0, math.radians(-8), 0), .004),
        box('Classic tunic piping.R', (.250, -.325, 1.060), (.011, .006, .215), brass, (0, math.radians(8), 0), .004),
        box('Classic chest crest field', (0, -.414, 1.065), (.112, .005, .126), navy_soft, bevel=.008),
        box('Classic chest crest vertical', (0, -.424, 1.065), (.022, .004, .090), brass, bevel=.004),
        box('Classic chest crest horizontal', (0, -.424, 1.065), (.075, .004, .022), brass, bevel=.004),
        sphere('Classic chest badge', (0, -.431, 1.065), (.017, .005, .017), navy, 18),
    ]

    # Large clean ivory pawn head and simple permanently angry face.
    head += [
        sphere('Head', (0, -.010, 1.590), (.350, .325, .320), ivory, 92),
        sphere('Eye.L', (-.110, -.332, 1.646), (.026, .008, .029), black, 24),
        sphere('Eye.R', (.110, -.332, 1.646), (.026, .008, .029), black, 24),
        box('Brow.L', (-.112, -.350, 1.724), (.082, .009, .016), black, (0, math.radians(27), 0), .004),
        box('Brow.R', (.112, -.350, 1.724), (.082, .009, .016), black, (0, math.radians(-27), 0), .004),
        box('Mouth.L', (-.024, -.334, 1.503), (.030, .004, .004), black, (0, math.radians(-12), 0), .002),
        box('Mouth.R', (.024, -.334, 1.503), (.030, .004, .004), black, (0, math.radians(12), 0), .002),
        sphere('Classic cap crown', (0, -.004, 1.880), (.410, .330, .120), navy, 92),
        cyl('Classic cap band', (0, -.008, 1.816), .350, .072, cap_red, verts=108, bevel=.010),
        cyl('Classic cap brass line', (0, -.010, 1.779), .346, .013, brass, verts=108, bevel=.003),
        box('Classic cap visor', (0, -.300, 1.766), (.220, .096, .020), leather, (math.radians(10), 0, 0), .011),
        sphere('Classic cap badge', (0, -.340, 1.862), (.034, .010, .040), brass, 26),
        box('Classic cap badge wing.L', (-.050, -.337, 1.866), (.034, .006, .010), brass, (0, math.radians(-12), math.radians(12)), .003),
        box('Classic cap badge wing.R', (.050, -.337, 1.866), (.034, .006, .010), brass, (0, math.radians(12), math.radians(-12)), .003),
    ]

    # Neutral limbs disappear behind the pawn. They only enter frame during an
    # authored routine; Idle is a clean chess silhouette.
    shoulder_l = (-.255, .180, 1.210); elbow_l = (-.300, .194, 1.095); wrist_l = (-.258, .178, .990)
    shoulder_r = (.255, .180, 1.210); elbow_r = (.300, .194, 1.095); wrist_r = (.258, .178, .990)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .034, navy, 40, .008)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .034, navy, 40, .008)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .029, navy_soft, 40, .007)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .029, navy_soft, 40, .007)
    cuff_l = cyl('Cuff.L', wrist_l, .032, .016, brass, verts=32, bevel=.003)
    cuff_r = cyl('Cuff.R', wrist_r, .032, .016, brass, verts=32, bevel=.003)
    hand_l = sphere('Hand.L', (-.256, .168, .977), (.022, .021, .025), ivory, 24)
    hand_r = sphere('Hand.R', (.256, .168, .977), (.022, .021, .025), ivory, 24)

    book = box('RoutineBook', (0, -.42, 1.08), (.19, .025, .23), leather, (math.radians(7), 0, 0), .012)
    book_page = box('RoutineBookPages', (0, -.447, 1.08), (.165, .008, .205), paper, (math.radians(7), 0, 0), .004)
    book_badge = sphere('RoutineBookBadge', (0, -.462, 1.07), (.036, .008, .045), brass, 20)
    cup = cyl('RoutineCup', (.37, -.325, 1.00), .070, .098, ivory_hi, verts=48, bevel=.010)
    cup_band = cyl('RoutineCupBand', (.37, -.325, 1.044), .072, .012, brass, verts=48, bevel=.004)
    cup_handle = sphere('RoutineCupHandle', (.452, -.325, 1.005), (.036, .018, .050), brass, 24)
    pen = cyl('RoutinePen', (.37, -.355, .97), .010, .29, leather, (math.radians(65), 0, math.radians(-22)), verts=24, bevel=.004)
    pen_tip = cone('RoutinePenTip', (.318, -.398, .855), .016, .003, .068, brass, (math.radians(65), 0, math.radians(-22)), .003)

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
