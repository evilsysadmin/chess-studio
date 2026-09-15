import math
import bpy


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
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = bone
    o.matrix_parent_inverse = rig.matrix_world.inverted()


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
    b('upper_arm.L', (-.32, 0, 1.50), (-.61, -.03, 1.30), 'spine')
    b('forearm.L', (-.61, -.03, 1.30), (-.82, -.12, 1.03), 'upper_arm.L')
    b('upper_arm.R', (.32, 0, 1.50), (.61, -.03, 1.30), 'spine')
    b('forearm.R', (.61, -.03, 1.30), (.82, -.12, 1.03), 'upper_arm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for p in r.pose.bones:
        p.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return r


def build_character():
    ivory = mat('warm ivory', (.70, .61, .47), .42)
    skin_hi = mat('ivory highlight', (.90, .79, .61), .38)
    cheek = mat('warm cheek', (.74, .52, .39), .55)
    navy = mat('midnight uniform', (.055, .082, .118), .48)
    cloth = mat('midnight cloth', (.075, .095, .125), .68)
    leather = mat('dark leather', (.09, .055, .032), .78)
    brass = mat('aged brass', (.50, .29, .075), .28, .82)
    steel = mat('gunmetal trim', (.16, .18, .19), .34, .62)
    hair = mat('iron grey', (.12, .13, .14), .84)
    white = mat('eye white', (.90, .86, .76), .42)
    iris = mat('cold iris', (.07, .20, .24), .30)
    black = mat('pupil', (.005, .007, .010), .48)
    red = mat('campaign red', (.31, .035, .035), .64)
    cream = mat('shirt cream', (.72, .66, .54), .66)

    rig = build_rig()
    rig['matthias_asset_version'] = 'home-blender-v2'
    root, spine, head = [], [], []

    # Pawn ancestry remains visible, but as a restrained plinth rather than two
    # giant graphic rings. The character must read as Matthias first, pawn second.
    root += [
        cyl('Pawn plinth', (0, 0, .14), .57, .22, navy, verts=72, bevel=.025),
        cyl('brass plinth trim', (0, 0, .245), .50, .032, brass, verts=72, bevel=.010),
        cone('Pawn lower body', (0, 0, .53), .51, .35, .58, cloth, bevel=.035),
        box('coat front skirt', (0, -.30, .56), (.30, .055, .26), navy, bevel=.025),
    ]

    # Tailored military coat with a readable V silhouette and surface detail.
    spine += [
        cone('uniform torso', (0, 0, 1.12), .39, .31, .68, navy, bevel=.028),
        sphere('Shoulder.L', (-.34, -.005, 1.44), (.22, .25, .18), navy, 40),
        sphere('Shoulder.R', (.34, -.005, 1.44), (.22, .25, .18), navy, 40),
        box('shirt bib', (0, -.337, 1.35), (.16, .026, .18), cream, bevel=.010),
        box('lapel.L', (-.12, -.365, 1.39), (.13, .022, .25), cloth, (math.radians(-7), math.radians(-2), math.radians(-25)), .012),
        box('lapel.R', (.12, -.365, 1.39), (.13, .022, .25), cloth, (math.radians(-7), math.radians(2), math.radians(25)), .012),
        cyl('high collar', (0, -.01, 1.57), .285, .12, navy, verts=64, bevel=.018),
        box('belt front', (0, -.355, .91), (.30, .035, .045), leather, bevel=.012),
        box('belt buckle', (0, -.397, .91), (.07, .018, .055), brass, bevel=.008),
        box('Epaulette.L', (-.36, -.02, 1.47), (.14, .18, .035), brass, (0, 0, math.radians(-8)), .012),
        box('Epaulette.R', (.36, -.02, 1.47), (.14, .18, .035), brass, (0, 0, math.radians(8)), .012),
        box('campaign ribbon', (-.15, -.394, 1.28), (.105, .012, .032), red, bevel=.006),
        box('service ribbon', (.09, -.394, 1.28), (.07, .012, .032), brass, bevel=.006),
    ]
    for z in (1.04, 1.17, 1.30):
        spine.append(sphere('button ' + str(z), (0, -.386, z), (.032, .018, .032), brass, 20))

    # Larger, character-led head. Facial features are deliberately exaggerated
    # enough to survive the ~100 px Home render without becoming cartoon noise.
    head += [
        sphere('Head', (0, -.04, 1.93), (.40, .36, .43), ivory, 64),
        sphere('Cheek.L', (-.19, -.322, 1.90), (.12, .055, .105), cheek, 32),
        sphere('Cheek.R', (.19, -.322, 1.90), (.12, .055, .105), cheek, 32),
        sphere('Nose', (0, -.405, 1.94), (.085, .105, .105), skin_hi, 36),
    ]
    for side, x in [('L', -.135), ('R', .135)]:
        head += [
            sphere('Eye.' + side, (x, -.363, 2.065), (.078, .032, .056), white, 32),
            sphere('Iris.' + side, (x, -.395, 2.063), (.037, .014, .035), iris, 24),
            sphere('Pupil.' + side, (x, -.408, 2.063), (.015, .008, .016), black, 18),
        ]
    head += [
        box('Brow.L', (-.14, -.397, 2.165), (.115, .022, .022), hair, (math.radians(-5), 0, math.radians(-13)), .008),
        box('Brow.R', (.14, -.397, 2.172), (.115, .022, .022), hair, (math.radians(-3), 0, math.radians(10)), .008),
        tube('Moustache.L', [(-.01, -.443, 1.91), (-.10, -.458, 1.895), (-.24, -.425, 1.925)], .024, hair, 5),
        tube('Moustache.R', [(.01, -.443, 1.91), (.10, -.458, 1.895), (.24, -.425, 1.925)], .024, hair, 5),
        tube('mouth', [(-.075, -.431, 1.842), (0, -.442, 1.83), (.075, -.431, 1.842)], .010, black, 3),
        sphere('beard mass', (0, -.265, 1.76), (.22, .12, .21), hair, 40),
        cone('beard point', (0, -.255, 1.63), .17, .045, .30, hair, bevel=.012),
        sphere('Ear.L', (-.39, -.045, 1.94), (.055, .045, .085), ivory, 28),
        sphere('Ear.R', (.39, -.045, 1.94), (.055, .045, .085), ivory, 28),
    ]

    # Cap is layered, not a single flattened blob: crown, band, visor, insignia.
    head += [
        sphere('field cap crown', (0, -.015, 2.265), (.315, .295, .115), navy, 48),
        cyl('field cap band', (0, -.02, 2.205), .305, .075, cloth, verts=64, bevel=.012),
        box('cap visor', (0, -.318, 2.205), (.22, .125, .026), leather, (math.radians(8), 0, 0), .012),
        sphere('cap insignia', (0, -.325, 2.255), (.050, .018, .058), brass, 24),
        box('cap insignia bar', (0, -.344, 2.255), (.075, .010, .012), brass, bevel=.005),
    ]

    # Compact arms keep the silhouette readable. Cuffs and gloves create a
    # premium break between coat and hands instead of featureless cylinders.
    al = cyl('Upper arm.L', (-.49, -.02, 1.34), .14, .46, navy, (0, math.radians(-50), math.radians(5)), bevel=.025)
    ar = cyl('Upper arm.R', (.49, -.02, 1.34), .14, .46, navy, (0, math.radians(50), math.radians(-5)), bevel=.025)
    fl = cyl('Forearm.L', (-.70, -.12, 1.11), .12, .42, cloth, (math.radians(8), math.radians(-34), math.radians(4)), bevel=.022)
    fr = cyl('Forearm.R', (.70, -.12, 1.11), .12, .42, cloth, (math.radians(8), math.radians(34), math.radians(-4)), bevel=.022)
    cuff_l = cyl('Cuff.L', (-.84, -.17, .98), .125, .095, brass, (math.radians(8), math.radians(-34), math.radians(4)), verts=40, bevel=.010)
    cuff_r = cyl('Cuff.R', (.84, -.17, .98), .125, .095, brass, (math.radians(8), math.radians(34), math.radians(-4)), verts=40, bevel=.010)
    hl = sphere('Hand.L', (-.89, -.20, .93), (.13, .11, .14), ivory, 32)
    hr = sphere('Hand.R', (.89, -.20, .93), (.13, .11, .14), ivory, 32)

    # Tiny shoulder braid / coat piping adds depth without turning him into RPG UI.
    spine += [
        tube('shoulder braid.L', [(-.35, -.22, 1.49), (-.44, -.25, 1.42), (-.46, -.24, 1.32)], .016, brass, 4),
        tube('shoulder braid.R', [(.35, -.22, 1.49), (.44, -.25, 1.42), (.46, -.24, 1.32)], .016, brass, 4),
        box('coat seam.L', (-.18, -.373, 1.08), (.012, .010, .24), steel, bevel=.004),
        box('coat seam.R', (.18, -.373, 1.08), (.012, .010, .24), steel, bevel=.004),
    ]

    for o in root:
        parent_bone(o, rig, 'root')
    for o in spine:
        parent_bone(o, rig, 'spine')
    for o in head:
        parent_bone(o, rig, 'head')
    parent_bone(al, rig, 'upper_arm.L')
    parent_bone(ar, rig, 'upper_arm.R')
    for o in (fl, cuff_l, hl):
        parent_bone(o, rig, 'forearm.L')
    for o in (fr, cuff_r, hr):
        parent_bone(o, rig, 'forearm.R')
    return rig
