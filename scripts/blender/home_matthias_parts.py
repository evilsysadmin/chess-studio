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
    """Canonical Home Matthias: the old angry pawn rebuilt as premium 3D.

    Pawn first, character second. The body is a dark continuous chess-piece
    profile with restrained brass lines; the only pale mass is the head. Arms
    remain available to the animation rig, but neutral poses hide them behind
    the silhouette so Matthias never reads as a humanoid in a pawn costume.
    """
    ivory = mat('classic warm ivory', (.70, .63, .52), .48, .01)
    ivory_hi = mat('classic ivory highlight', (.86, .79, .67), .40, .01)
    navy = mat('classic midnight pawn', (.010, .016, .027), .34, .10)
    navy_soft = mat('classic navy cloth', (.018, .028, .044), .50, .05)
    leather = mat('classic black leather', (.018, .014, .012), .48, .08)
    brass = mat('classic aged brass', (.48, .28, .070), .28, .86)
    black = mat('classic brow eye mouth', (.002, .003, .004), .55)
    paper = mat('paper', (.67, .58, .43), .88)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-classic-v8'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    root, spine, head = [], [], []

    # A true chess-piece profile replaces the old ivory cone + cylindrical
    # officer torso. The overlap at the waist is deliberate and hidden by the
    # brass service ring, so the spine bone can still animate independently.
    root += [
        revolve_profile('Classic lower pawn', [
            (.465, .018), (.500, .055), (.505, .105), (.482, .160),
            (.445, .215), (.438, .285), (.405, .365), (.390, .470),
            (.366, .600), (.344, .735), (.326, .855), (.316, .955),
        ], navy, 112, .010),
        cyl('Classic lower brass line', (0, 0, .205), .447, .018, brass, verts=96, bevel=.004),
        cyl('Classic foot brass line', (0, 0, .105), .493, .015, brass, verts=96, bevel=.004),
    ]

    spine += [
        revolve_profile('Classic navy tunic', [
            (.318, .900), (.338, .965), (.350, 1.070), (.346, 1.155),
            (.330, 1.255), (.312, 1.355), (.290, 1.445), (.270, 1.515),
        ], navy_soft, 104, .008),
        cyl('Classic waist service ring', (0, 0, .930), .325, .028, brass, verts=88, bevel=.006),
        cyl('Classic ivory collar ring', (0, 0, 1.515), .274, .070, ivory_hi, verts=88, bevel=.012),
        cyl('Classic navy collar', (0, 0, 1.555), .270, .055, navy, verts=88, bevel=.010),
        cyl('Classic brass collar line', (0, 0, 1.586), .274, .012, brass, verts=88, bevel=.003),
        sphere('Classic chest badge', (0, -.344, 1.205), (.034, .010, .042), brass, 24),
    ]

    # Minimal old-school face: no whites/irises and no comic cheeks. The eyes
    # are dark slits under heavy brows, which keeps the default expression angry.
    head += [
        sphere('Head', (0, -.010, 1.865), (.315, .292, .315), ivory, 80),
        sphere('Nose', (0, -.298, 1.842), (.019, .023, .021), ivory_hi, 24),
        sphere('Eye.L', (-.102, -.299, 1.916), (.024, .010, .017), black, 22),
        sphere('Eye.R', (.102, -.299, 1.916), (.024, .010, .017), black, 22),
        box('Brow.L', (-.102, -.316, 1.985), (.086, .011, .017), black, (0, math.radians(28), 0), .005),
        box('Brow.R', (.102, -.316, 1.985), (.086, .011, .017), black, (0, math.radians(-28), 0), .005),
        box('Mouth.L', (-.017, -.306, 1.783), (.022, .005, .004), black, (0, math.radians(-12), 0), .002),
        box('Mouth.R', (.017, -.306, 1.783), (.022, .005, .004), black, (0, math.radians(12), 0), .002),
        sphere('Classic cap crown', (0, -.006, 2.145), (.286, .260, .092), navy, 72),
        cyl('Classic cap band', (0, -.008, 2.105), .278, .057, navy_soft, verts=88, bevel=.010),
        cyl('Classic cap brass line', (0, -.010, 2.075), .274, .012, brass, verts=88, bevel=.003),
        box('Classic cap visor', (0, -.243, 2.064), (.166, .074, .018), leather, (math.radians(8), 0, 0), .010),
        sphere('Classic cap badge', (0, -.276, 2.125), (.025, .010, .029), brass, 22),
    ]

    # Arms are rigging infrastructure, not part of the neutral silhouette.
    # Keeping them just behind the pawn lets Read/Write/Sip/Bite still animate
    # without leaving permanent Playmobil hands hanging off the body.
    shoulder_l = (-.278, .075, 1.335); elbow_l = (-.345, .105, 1.190); wrist_l = (-.292, .105, 1.045)
    shoulder_r = (.278, .075, 1.335); elbow_r = (.345, .105, 1.190); wrist_r = (.292, .105, 1.045)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .044, navy, 40, .010)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .044, navy, 40, .010)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .038, navy_soft, 40, .009)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .038, navy_soft, 40, .009)
    cuff_l = cyl('Cuff.L', wrist_l, .042, .020, brass, verts=32, bevel=.004)
    cuff_r = cyl('Cuff.R', wrist_r, .042, .020, brass, verts=32, bevel=.004)
    hand_l = sphere('Hand.L', (-.286, .090, 1.025), (.032, .029, .034), ivory, 24)
    hand_r = sphere('Hand.R', (.286, .090, 1.025), (.032, .029, .034), ivory, 24)

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
