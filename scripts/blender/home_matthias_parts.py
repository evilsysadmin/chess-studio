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


def sphere(name, loc, scale, material, seg=56, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=seg,
        ring_count=max(20, seg // 2),
        location=loc,
        rotation=rot,
    )
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


def elliptic_cyl(name, loc, r, d, y_scale, material, rot=(0, 0, 0), verts=96, bevel=.018):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (1.0, y_scale, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
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


def front_prism(name, loc, points, depth, material, bevel=.004):
    """Extrude a front-facing X/Z polygon along Y for diegetic insignia."""
    n = len(points)
    front_y = -depth * .5
    back_y = depth * .5
    verts = [(x, front_y, z) for x, z in points] + [(x, back_y, z) for x, z in points]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return finish(obj, material, False, bevel)


def iron_cross_points(size):
    """Compact flared-arm cross like the approved Matthias chest insignia."""
    s = size
    return [
        (-.26*s, 1.00*s), (.26*s, 1.00*s), (.36*s, .40*s),
        (1.00*s, .26*s), (1.00*s, -.26*s), (.36*s, -.40*s),
        (.26*s, -1.00*s), (-.26*s, -1.00*s), (-.36*s, -.40*s),
        (-1.00*s, -.26*s), (-1.00*s, .26*s), (-.36*s, .40*s),
    ]


def revolve_profile(name, profile, material, segments=96, bevel=.0):
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

    bone('root', (0, 0, 0), (0, 0, .34))
    bone('spine', (0, 0, .50), (0, 0, 1.16), 'root')
    bone('head', (0, 0, 1.04), (0, 0, 1.90), 'spine')
    bone('upper_arm.L', (-.28, .05, .92), (-.39, .06, .82), 'spine')
    bone('forearm.L', (-.39, .06, .82), (-.33, -.03, .72), 'upper_arm.L')
    bone('upper_arm.R', (.28, .05, .92), (.39, .06, .82), 'spine')
    bone('forearm.R', (.39, .06, .82), (.33, -.03, .72), 'upper_arm.R')
    bone('prop_book', (-.12, -.30, .78), (-.12, -.30, .96), 'spine')
    bone('prop_cup', (.35, -.23, .73), (.35, -.23, .83), 'forearm.R')
    bone('prop_pen', (.36, -.27, .68), (.36, -.27, .79), 'forearm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_character():
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
    rig['matthias_asset_version'] = 'home-blender-classic-v11'
    rig['canonical_identity'] = 'stern-no-moustache-pawn'
    rig['canonical_reference'] = 'classic-pawn-first-avatar'
    rig['canonical_reference_sha256'] = 'beb64c1dffd6b32a64847b8f768df43e823e858acf630516e27a2cc771e2d975'
    rig['canonical_pose_language'] = 'permanently-stern'
    root, spine, head = [], [], []

    root += [
        cyl('Classic plinth lower', (0, 0, .060), .620, .120, navy, verts=132, bevel=.023),
        cyl('Classic plinth brass edge', (0, 0, .126), .604, .014, brass, verts=128, bevel=.003),
        cyl('Classic plinth upper', (0, 0, .180), .570, .082, navy, verts=128, bevel=.016),
        cyl('Classic plinth upper brass edge', (0, 0, .222), .552, .012, brass, verts=124, bevel=.003),
        cyl('Classic plinth shoulder', (0, 0, .258), .520, .048, navy, verts=124, bevel=.012),
        revolve_profile('Classic lower pawn', [
            (.526, .250), (.516, .290), (.500, .332), (.476, .380),
            (.447, .430), (.418, .485), (.394, .542), (.378, .598),
            (.374, .650), (.383, .700), (.404, .750), (.435, .800),
            (.462, .845), (.472, .886), (.467, .925), (.452, .960),
            (.430, .995), (.402, 1.025), (.372, 1.048), (.344, 1.064),
        ], navy, 136, .009),
        cyl('Classic lower brass line', (0, 0, .350), .495, .014, brass, verts=116, bevel=.003),
        cyl('Classic service brass line', (0, 0, .610), .395, .012, brass, verts=108, bevel=.003),
    ]

    cross_brass = front_prism('Classic chest cross brass', (0, -.469, .850), iron_cross_points(.170), .014, brass, .006)
    cross_inset = front_prism('Classic chest cross inset', (0, -.479, .850), iron_cross_points(.137), .010, leather, .004)

    spine += [
        revolve_profile('Classic navy tunic', [
            (.382, .655), (.390, .710), (.410, .765), (.440, .815),
            (.468, .858), (.478, .895), (.474, .930), (.462, .965),
            (.442, .998), (.416, 1.026), (.386, 1.048), (.352, 1.064),
        ], navy_soft, 120, .006),
        cyl('Classic waist service ring', (0, 0, .660), .395, .019, brass, verts=108, bevel=.004),
        cyl('Classic neck plinth', (0, 0, 1.082), .398, .066, navy, verts=116, bevel=.011),
        cyl('Classic brass collar line', (0, 0, 1.119), .403, .013, brass, verts=116, bevel=.003),
        box('Classic tunic piping.L', (-.298, -.376, .855), (.011, .006, .148), brass, (0, math.radians(-9), 0), .004),
        box('Classic tunic piping.R', (.298, -.376, .855), (.011, .006, .148), brass, (0, math.radians(9), 0), .004),
        cross_brass,
        cross_inset,
        sphere('Classic chest badge', (0, -.490, .850), (.016, .005, .016), brass, 18),
    ]

    head += [
        sphere('Head', (0, -.012, 1.345), (.350, .330, .340), ivory, 96),
        sphere('Eye.L', (-.112, -.338, 1.390), (.022, .005, .035), black, 28),
        sphere('Eye.R', (.112, -.338, 1.390), (.022, .005, .035), black, 28),
        box('Brow.L', (-.112, -.355, 1.475), (.096, .008, .021), black, (0, math.radians(31), 0), .004),
        box('Brow.R', (.112, -.355, 1.475), (.096, .008, .021), black, (0, math.radians(-31), 0), .004),
        box('Mouth.L', (-.045, -.340, 1.252), (.055, .004, .005), black, (0, math.radians(-18), 0), .002),
        box('Mouth.R', (.045, -.340, 1.252), (.055, .004, .005), black, (0, math.radians(18), 0), .002),
        # Curved cap volumes overlap into one broad, tilted peaked cap. The
        # visor is an ellipse, so the front edge reads curved rather than boxed.
        sphere('Classic cap crown', (0, .035, 1.655), (.420, .300, .130), navy, 96, (math.radians(-6), 0, 0)),
        sphere('Classic cap top', (0, .095, 1.780), (.470, .350, .095), navy, 104, (math.radians(-9), 0, 0)),
        elliptic_cyl('Classic cap band', (0, -.004, 1.548), .360, .086, .84, cap_red, (math.radians(-2), 0, 0), 116, .010),
        elliptic_cyl('Classic cap brass line', (0, -.010, 1.503), .356, .013, .84, brass, (math.radians(-2), 0, 0), 116, .003),
        elliptic_cyl('Classic cap visor', (0, -.335, 1.520), .270, .027, .47, leather, (math.radians(11), 0, 0), 112, .008),
        sphere('Classic cap badge', (0, -.350, 1.663), (.044, .010, .055), brass, 30),
        box('Classic cap badge wing.L', (-.074, -.345, 1.670), (.055, .006, .015), brass, (0, math.radians(-12), math.radians(12)), .003),
        box('Classic cap badge wing.R', (.074, -.345, 1.670), (.055, .006, .015), brass, (0, math.radians(12), math.radians(-12)), .003),
    ]

    shoulder_l = (-.294, .218, .902); elbow_l = (-.338, .228, .802); wrist_l = (-.292, .212, .710)
    shoulder_r = (.294, .218, .902); elbow_r = (.338, .228, .802); wrist_r = (.292, .212, .710)
    upper_l = cyl_between('Upper arm.L', shoulder_l, elbow_l, .032, navy, 40, .008)
    upper_r = cyl_between('Upper arm.R', shoulder_r, elbow_r, .032, navy, 40, .008)
    fore_l = cyl_between('Forearm.L', elbow_l, wrist_l, .027, navy_soft, 40, .007)
    fore_r = cyl_between('Forearm.R', elbow_r, wrist_r, .027, navy_soft, 40, .007)
    cuff_l = cyl('Cuff.L', wrist_l, .030, .016, brass, verts=32, bevel=.003)
    cuff_r = cyl('Cuff.R', wrist_r, .030, .016, brass, verts=32, bevel=.003)
    hand_l = sphere('Hand.L', (-.290, .202, .698), (.021, .020, .024), ivory, 24)
    hand_r = sphere('Hand.R', (.290, .202, .698), (.021, .020, .024), ivory, 24)

    book = box('RoutineBook', (0, -.45, .79), (.19, .025, .21), leather, (math.radians(7), 0, 0), .012)
    book_page = box('RoutineBookPages', (0, -.477, .79), (.165, .008, .185), paper, (math.radians(7), 0, 0), .004)
    book_badge = sphere('RoutineBookBadge', (0, -.492, .78), (.036, .008, .045), brass, 20)
    cup = cyl('RoutineCup', (.39, -.355, .73), .070, .098, ivory_hi, verts=48, bevel=.010)
    cup_band = cyl('RoutineCupBand', (.39, -.355, .774), .072, .012, brass, verts=48, bevel=.004)
    cup_handle = sphere('RoutineCupHandle', (.472, -.355, .735), (.036, .018, .050), brass, 24)
    pen = cyl('RoutinePen', (.39, -.385, .70), .010, .29, leather, (math.radians(65), 0, math.radians(-22)), verts=24, bevel=.004)
    pen_tip = cone('RoutinePenTip', (.338, -.428, .585), .016, .003, .068, brass, (math.radians(65), 0, math.radians(-22)), .003)

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
