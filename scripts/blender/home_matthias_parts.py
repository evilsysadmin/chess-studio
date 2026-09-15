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


def finish(o, m, smooth=True, bevel=0.0):
    if smooth and hasattr(o.data, 'polygons'):
        for p in o.data.polygons:
            p.use_smooth = True
    if bevel > 0 and getattr(o, 'modifiers', None) is not None:
        mod = o.modifiers.new('edge softness', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    o.data.materials.append(m)
    return o


def sphere(name, loc, scale, m, seg=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(16, seg // 2), location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, m)


def cyl(name, loc, r, d, m, rot=(0, 0, 0), verts=56, bevel=.018):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, m, bevel=bevel)


def cone(name, loc, r1, r2, d, m, rot=(0, 0, 0), bevel=.025):
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, m, bevel=bevel)


def box(name, loc, scale, m, rot=(0, 0, 0), bevel=.016):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, m, False, bevel=bevel)


def cyl_between(name, start, end, radius, m, verts=48, bevel=.018):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    length = direction.length
    midpoint = (a + b) * .5
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length, location=midpoint)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = direction.to_track_quat('Z', 'Y')
    o.rotation_mode = 'XYZ'
    return finish(o, m, bevel=bevel)


def tube(name, pts, r, m, resolution=4):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth = r
    c.bevel_resolution = resolution
    c.resolution_u = 12
    s = c.splines.new('BEZIER')
    s.bezier_points.add(len(pts) - 1)
    for p, co in zip(s.bezier_points, pts):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def parent_bone(o, rig, bone):
    # Bone parenting changes the object's basis. Preserve the authored world-space
    # placement so attaching a mesh to the rig does not teleport it by the bone's
    # rest transform. Animation can then move the assembled character as intended.
    world = o.matrix_world.copy()
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = bone
    o.matrix_world = world


def build_rig():
    a = bpy.data.armatures.new('MatthiasRig')
    r = bpy.data.objects.new('MatthiasRig', a)
    bpy.context.collection.objects.link(r)
    bpy.context.view_layer.objects.active = r
    r.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def b(n, h, t, p=None):
        x = a.edit_bones.new(n)
        x.head = h
        x.tail = t
        x.parent = a.edit_bones[p] if p else None

    b('root', (0, 0, 0), (0, 0, .42))
    b('spine', (0, 0, .72), (0, 0, 1.60), 'root')
    b('head', (0, 0, 1.54), (0, 0, 2.24), 'spine')
    b('upper_arm.L', (-.31, 0, 1.46), (-.46, -.045, 1.22), 'spine')
    b('forearm.L', (-.46, -.045, 1.22), (-.38, -.18, 1.00), 'upper_arm.L')
    b('upper_arm.R', (.31, 0, 1.46), (.46, -.045, 1.22), 'spine')
    b('forearm.R', (.46, -.045, 1.22), (.38, -.18, 1.00), 'upper_arm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for p in r.pose.bones:
        p.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return r


def build_character():
    # Stylised premium figurine: Matthias must read as a grizzled pawn-sage at
    # Home scale, not as a stack of geometry primitives. Materials deliberately
    # separate warm skin/brass from a deep blue-black uniform.
    ivory = mat('warm ivory', (.62, .48, .34), .48)
    skin_hi = mat('ivory highlight', (.82, .64, .45), .42)
    cheek = mat('warm cheek', (.55, .32, .24), .58)
    navy = mat('midnight uniform', (.018, .032, .052), .44)
    cloth = mat('midnight cloth', (.028, .043, .064), .70)
    leather = mat('dark leather', (.055, .030, .018), .78)
    brass = mat('aged brass', (.52, .30, .075), .26, .86)
    steel = mat('gunmetal trim', (.12, .14, .16), .38, .62)
    hair = mat('iron grey', (.075, .080, .085), .88)
    white = mat('eye white', (.82, .78, .68), .48)
    iris = mat('cold iris', (.055, .15, .17), .34)
    black = mat('pupil', (.003, .004, .006), .52)
    red = mat('campaign red', (.27, .025, .022), .68)
    cream = mat('shirt cream', (.62, .55, .43), .72)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-v4'
    root, spine, head = [], [], []

    # Pawn ancestry: low, restrained and integrated into the coat silhouette.
    root += [
        cyl('Pawn plinth', (0, 0, .12), .48, .18, navy, verts=80, bevel=.030),
        cyl('brass plinth trim', (0, 0, .205), .42, .024, brass, verts=80, bevel=.008),
        cone('Pawn lower body', (0, 0, .56), .43, .30, .76, cloth, bevel=.050),
    ]

    # Organic coat mass. The chest is an ellipsoid rather than a visible cone,
    # with thin lapels/details layered onto it.
    spine += [
        sphere('uniform chest', (0, -.005, 1.18), (.37, .285, .405), navy, 56),
        sphere('Shoulder.L', (-.32, -.005, 1.43), (.19, .22, .15), navy, 44),
        sphere('Shoulder.R', (.32, -.005, 1.43), (.19, .22, .15), navy, 44),
        box('shirt bib', (0, -.294, 1.37), (.095, .018, .135), cream, bevel=.018),
        box('lapel.L', (-.095, -.314, 1.39), (.095, .018, .19), cloth, (math.radians(-4), 0, math.radians(-29)), .016),
        box('lapel.R', (.095, -.314, 1.39), (.095, .018, .19), cloth, (math.radians(-4), 0, math.radians(29)), .016),
        cyl('high collar', (0, -.005, 1.54), .255, .095, cloth, verts=64, bevel=.016),
        box('belt front', (0, -.300, .91), (.255, .025, .038), leather, bevel=.012),
        box('belt buckle', (0, -.333, .91), (.055, .016, .048), brass, bevel=.008),
        box('Epaulette.L', (-.325, -.035, 1.49), (.115, .145, .026), brass, (0, 0, math.radians(-7)), .012),
        box('Epaulette.R', (.325, -.035, 1.49), (.115, .145, .026), brass, (0, 0, math.radians(7)), .012),
        box('campaign ribbon', (-.115, -.309, 1.285), (.075, .010, .024), red, bevel=.005),
        box('service ribbon', (.055, -.309, 1.285), (.052, .010, .024), brass, bevel=.005),
        tube('coat piping.L', [(-.16, -.296, 1.35), (-.18, -.304, 1.16), (-.17, -.288, .99)], .009, steel, 3),
        tube('coat piping.R', [(.16, -.296, 1.35), (.18, -.304, 1.16), (.17, -.288, .99)], .009, steel, 3),
    ]
    for z in (1.06, 1.17):
        spine.append(sphere('button ' + str(z), (0, -.307, z), (.026, .014, .026), brass, 20))

    # Matthias' face: smaller eyes, heavier brows, longer moustache and a compact
    # beard. The expression should be stern/sardonic rather than toy-like.
    head += [
        sphere('Head', (0, -.035, 1.94), (.365, .315, .40), ivory, 64),
        sphere('Cheek.L', (-.175, -.295, 1.90), (.095, .045, .082), cheek, 32),
        sphere('Cheek.R', (.175, -.295, 1.90), (.095, .045, .082), cheek, 32),
        sphere('Nose', (0, -.355, 1.94), (.072, .090, .095), skin_hi, 36),
    ]
    for side, x in [('L', -.125), ('R', .125)]:
        head += [
            sphere('Eye.' + side, (x, -.325, 2.055), (.056, .025, .038), white, 30),
            sphere('Iris.' + side, (x, -.349, 2.053), (.026, .010, .025), iris, 22),
            sphere('Pupil.' + side, (x, -.358, 2.053), (.011, .006, .012), black, 16),
        ]
    head += [
        box('Brow.L', (-.125, -.357, 2.132), (.105, .017, .018), hair, (0, 0, math.radians(-18)), .007),
        box('Brow.R', (.125, -.357, 2.132), (.105, .017, .018), hair, (0, 0, math.radians(18)), .007),
        tube('Moustache.L', [(-.008, -.395, 1.915), (-.095, -.412, 1.90), (-.235, -.382, 1.925)], .027, hair, 5),
        tube('Moustache.R', [(.008, -.395, 1.915), (.095, -.412, 1.90), (.235, -.382, 1.925)], .027, hair, 5),
        tube('mouth', [(-.062, -.386, 1.845), (0, -.397, 1.836), (.062, -.386, 1.845)], .008, black, 3),
        sphere('beard mass', (0, -.245, 1.765), (.195, .105, .185), hair, 42),
        cone('beard point', (0, -.238, 1.64), .145, .035, .255, hair, bevel=.012),
        sphere('Ear.L', (-.355, -.035, 1.94), (.050, .040, .075), ivory, 28),
        sphere('Ear.R', (.355, -.035, 1.94), (.050, .040, .075), ivory, 28),
    ]

    # Field cap: compact crown and pronounced visor, closer to a battered officer
    # cap than a flat toy saucer.
    head += [
        sphere('field cap crown', (0, -.005, 2.255), (.305, .275, .095), navy, 52),
        cyl('field cap band', (0, -.012, 2.205), .286, .062, cloth, verts=72, bevel=.010),
        box('cap visor', (0, -.294, 2.185), (.185, .095, .020), leather, (math.radians(10), 0, 0), .014),
        sphere('cap insignia', (0, -.306, 2.236), (.038, .014, .045), brass, 22),
    ]

    # Arms follow the actual rest-bone lines so the silhouette remains connected.
    shoulder_l = (-.31, -.005, 1.43)
    elbow_l = (-.46, -.045, 1.22)
    wrist_l = (-.38, -.18, 1.00)
    shoulder_r = (.31, -.005, 1.43)
    elbow_r = (.46, -.045, 1.22)
    wrist_r = (.38, -.18, 1.00)
    al = cyl_between('Upper arm.L', shoulder_l, elbow_l, .105, navy, 48, .024)
    ar = cyl_between('Upper arm.R', shoulder_r, elbow_r, .105, navy, 48, .024)
    fl = cyl_between('Forearm.L', elbow_l, wrist_l, .095, cloth, 48, .022)
    fr = cyl_between('Forearm.R', elbow_r, wrist_r, .095, cloth, 48, .022)
    cuff_l = sphere('Cuff.L', wrist_l, (.095, .075, .075), brass, 30)
    cuff_r = sphere('Cuff.R', wrist_r, (.095, .075, .075), brass, 30)
    hl = sphere('Hand.L', (-.34, -.245, .965), (.090, .072, .100), ivory, 32)
    hr = sphere('Hand.R', (.34, -.245, .965), (.090, .072, .100), ivory, 32)
    thumb_l = sphere('Thumb.L', (-.29, -.292, .975), (.038, .034, .044), skin_hi, 22)
    thumb_r = sphere('Thumb.R', (.29, -.292, .975), (.038, .034, .044), skin_hi, 22)

    for o in root:
        parent_bone(o, rig, 'root')
    for o in spine:
        parent_bone(o, rig, 'spine')
    for o in head:
        parent_bone(o, rig, 'head')
    parent_bone(al, rig, 'upper_arm.L')
    parent_bone(ar, rig, 'upper_arm.R')
    for o in (fl, cuff_l, hl, thumb_l):
        parent_bone(o, rig, 'forearm.L')
    for o in (fr, cuff_r, hr, thumb_r):
        parent_bone(o, rig, 'forearm.R')
    return rig
