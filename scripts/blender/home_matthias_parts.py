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
    bone('head', (0, 0, 1.48), (0, 0, 2.18), 'spine')
    bone('upper_arm.L', (-.28, .02, 1.28), (-.39, .04, 1.13), 'spine')
    bone('forearm.L', (-.39, .04, 1.13), (-.33, -.05, 1.00), 'upper_arm.L')
    bone('upper_arm.R', (.28, .02, 1.28), (.39, .04, 1.13), 'spine')
    bone('forearm.R', (.39, .04, 1.13), (.33, -.05, 1.00), 'upper_arm.R')
    bone('prop_book', (-.12, -.30, 1.10), (-.12, -.30, 1.28), 'spine')
    bone('prop_cup', (.34, -.23, 1.02), (.34, -.23, 1.12), 'forearm.R')
    bone('prop_pen', (.35, -.27, .96), (.35, -.27, 1.07), 'forearm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_character():
    """Canonical Home Matthias: compact, angry and unmistakably a pawn."""
    ivory = mat('classic warm ivory', (.70, .63, .52), .47, .01)
    ivory_hi = mat('classic ivory highlight', (.86, .79, .67), .39, .01)
    navy = mat('classic midnight pawn', (.008, .013, .022), .30, .13)
    navy_soft = mat('classic navy cloth', (.015, .024, .038), .42, .07)
    leather = mat('classic black leather', (.015, .011, .009), .44, .10)
    brass = mat('classic aged brass', (.50, .29, .074), .26, .88)
    black = mat('classic brow eye mouth', (.002, .003, .004), .54)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-classic-v8c'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    root, spine, head = [], [], []

    # Stepped chess plinth plus a compact continuous core. The shoulder swell is
    # part of the pawn profile, not a human torso placed on top of a base.
    root += [
        cyl('Classic plinth lower', (0, 0, .060), .525, .120, navy, verts=112, bevel=.020),
        cyl('Classic plinth brass edge', (0, 0, .124), .510, .014, brass, verts=108, bevel=.003),
        cyl('Classic plinth upper', (0, 0, .170), .485, .070, navy, verts=108, bevel=.014),
        revolve_profile('Classic lower pawn', [
            (.465, .185), (.448, .240), (.422, .315), (.395, .405),
            (.370, .505), (.350, .610), (.337, .715), (.334, .820),
            (.342, .915), (.356, 1.000), (.366, 1.075), (.358, 1.145),
            (.342, 1.215), (.320, 1.275), (.298, 1.330), (.286, 1.365),
        ], navy, 120, .009),
        cyl('Classic lower brass line', (0, 0, .325), .420, .014, brass, verts=100, bevel=.003),
        cyl('Classic service brass line', (0, 0, .715), .340, .012, brass, verts=96, bevel=.003),
    ]

    # The animated coat is a shallow skin that follows the pawn's own shoulder
    # bulge. It carries only a few diegetic details from the original avatar.
    spine += [
        revolve_profile('Classic navy tunic', [
            (.341, .800), (.350, .895), (.362, .985), (.373, 1.060),
            (.368, 1.125), (.354, 1.195), (.333, 1.260), (.306, 1.325),
            (.292, 1.365),
        ], navy_soft, 104, .006),
        cyl('Classic waist service ring', (0, 0, .820), .346, .020, brass, verts=94, bevel=.004),
        cyl('Classic neck plinth', (0, 0, 1.377), .292, .058, navy, verts=94, bevel=.010),
        cyl('Classic brass collar line', (0, 0, 1.408), .297, .013, brass, verts=94, bevel=.003),
        box('Classic chest crest field', (0, -.374, 1.085), (.090, .008, .112), leather, bevel=.008),
        box('Classic chest crest vertical', (0, -.385, 1.085), (.020, .006, .074), brass, bevel=.004),
        box('Classic chest crest horizontal', (0, -.385, 1.085), (.060, .006, .020), brass, bevel=.004),
        sphere('Classic chest badge', (0, -.394, 1.085), (.018, .006, .018), navy, 18),
    ]

    # Angry pawn face: sparse features, permanently displeased expression.
    head += [
        sphere('Head', (0, -.010, 1.625), (.305, .290, .302), ivory, 80),
        sphere('Nose', (0, -.296, 1.606), (.018, .022, .020), ivory_hi, 24),
        sphere('Eye.L', (-.098, -.298, 1.670), (.023, .009, .017), black, 22),
        sphere('Eye.R', (.098, -.298, 1.670), (.023, .009, .017), black, 22),
        box('Brow.L', (-.098, -.313, 1.738), (.080, .010, .015), black, (0, math.radians(28), 0), .004),
        box('Brow.R', (.098, -.313, 1.738), (.080, .010, .015), black, (0, math.radians(-28), 0), .004),
        box('Mouth.L', (-.016, -.304, 1.550), (.020, .005, .004), black, (0, math.radians(-11), 0), .002),
        box('Mouth.R', (.016, -.304, 1.550), (.020, .005, .004), black, (0, math.radians(11), 0), .002),
        sphere('Classic cap crown', (0, -.006, 1.892), (.288, .258, .108), navy, 76),
        cyl('Classic cap band', (0, -.009, 1.844), .278, .064, navy_soft, verts=92, bevel=.010),
        cyl('Classic cap brass line', (0, -.011, 1.811), .274, .013, brass, verts=92, bevel=.003),
        box('Classic cap visor', (0, -.244, 1.799), (.166, .076, .020), leather, (math.radians(9), 0, 0), .010),
        sphere('Classic cap badge', (0, -.278, 1.875), (.025, .010, .030), brass, 22),
    ]

    # Neutral arms sit entirely behind the body. Animation clips can rotate them
    # into view for Read/Write/Dossier/Sip/Bite without Playmobil hands in Idle.
    shoulder_l = (-.245, .165, 1.235); elbow_l = (-.292, .180, 1.115); wrist_l = (-.250, .165, 1.010)
    shoulder_r = (.245, .165, 1.235); elbow_r = (.292, .180, 1.115); wrist_r = (.250, .165, 1.010)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .037, navy, 38, .008)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .037, navy, 38, .008)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .032, navy_soft, 38, .007)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .032, navy_soft, 38, .007)
    cuff_l = cyl('Cuff.L', wrist_l, .035, .017, brass, verts=30, bevel=.003)
    cuff_r = cyl('Cuff.R', wrist_r, .035, .017, brass, verts=30, bevel=.003)
    hand_l = sphere('Hand.L', (-.247, .155, .995), (.025, .023, .027), ivory, 22)
    hand_r = sphere('Hand.R', (.247, .155, .995), (.025, .023, .027), ivory, 22)

    book = box('RoutineBook', (0, -.40, 1.10), (.19, .025, .23), leather, (math.radians(7), 0, 0), .012)
    book_page = box('RoutineBookPages', (0, -.427, 1.10), (.165, .008, .205), paper, (math.radians(7), 0, 0), .004)
    book_badge = sphere('RoutineBookBadge', (0, -.442, 1.09), (.036, .008, .045), brass, 20)
    cup = cyl('RoutineCup', (.35, -.305, 1.02), .070, .098, ivory_hi, verts=48, bevel=.010)
    cup_band = cyl('RoutineCupBand', (.35, -.305, 1.064), .072, .012, brass, verts=48, bevel=.004)
    cup_handle = sphere('RoutineCupHandle', (.432, -.305, 1.025), (.036, .018, .050), brass, 24)
    pen = cyl('RoutinePen', (.35, -.335, .99), .010, .29, leather, (math.radians(65), 0, math.radians(-22)), verts=24, bevel=.004)
    pen_tip = cone('RoutinePenTip', (.298, -.378, .875), .016, .003, .068, brass, (math.radians(65), 0, math.radians(-22)), .003)

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
