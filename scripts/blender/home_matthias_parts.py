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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(20, seg // 2), location=loc, rotation=rot)
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
    n = len(points)
    verts = [(x, -depth*.5, z) for x, z in points] + [(x, depth*.5, z) for x, z in points]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2*n)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n+j, n+i))
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return finish(obj, material, False, bevel)


def front_ellipse(name, loc, rx, rz, depth, material, segments=40, bevel=.002):
    points = [(rx*math.cos(math.tau*i/segments), rz*math.sin(math.tau*i/segments)) for i in range(segments)]
    return front_prism(name, loc, points, depth, material, bevel)


def front_curve(name, loc, width, drop, radius, material):
    """Build the canonical thin frown as real curved Blender geometry."""
    curve = bpy.data.curves.new(name + 'Curve', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 18
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(2)
    for point, co in zip(
        spline.bezier_points,
        ((-width * .5, 0, -drop), (0, 0, 0), (width * .5, 0, -drop)),
    ):
        point.co = co
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    curve.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return obj


def iron_cross_points(size):
    s = size
    return [
        (-.38*s, 1.00*s), (.38*s, 1.00*s), (.22*s, .22*s),
        (1.00*s, .38*s), (1.00*s, -.38*s), (.22*s, -.22*s),
        (.38*s, -1.00*s), (-.38*s, -1.00*s), (-.22*s, -.22*s),
        (-1.00*s, -.38*s), (-1.00*s, .38*s), (-.22*s, .22*s),
    ]


def loft_ellipse(name, rings, material, segments=112, bevel=.0):
    verts = []
    ring_count = len(rings)
    for ring in rings:
        rx, ry, z, yoff = ring[:4]
        xoff = ring[4] if len(ring) > 4 else 0.0
        for i in range(segments):
            a = math.tau*i/segments
            verts.append((xoff + rx*math.cos(a), yoff + ry*math.sin(a), z))
    faces = []
    for ring in range(ring_count - 1):
        a0 = ring*segments; b0 = (ring+1)*segments
        for i in range(segments):
            j = (i+1) % segments
            faces.append((a0+i, a0+j, b0+j, b0+i))
    faces.append(tuple(reversed(range(segments))))
    top0 = (ring_count-1)*segments
    faces.append(tuple(top0+i for i in range(segments)))
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, material, True, bevel)


def crescent_visor(name, loc, material, outer_rx=.28, outer_ry=.43, inner_rx=.17, inner_ry=.22, thickness=.026, tilt_deg=12, segments=44):
    start = math.radians(210); end = math.radians(330)
    angles = [start + (end-start)*i/(segments-1) for i in range(segments)]
    verts = []
    for zz in (-thickness*.5, thickness*.5):
        for a in angles:
            verts.append((outer_rx*math.cos(a), outer_ry*math.sin(a), zz))
        for a in reversed(angles):
            verts.append((inner_rx*math.cos(a), inner_ry*math.sin(a), zz))
    ring = segments*2
    faces = [tuple(range(ring)), tuple(reversed(range(ring, ring*2)))]
    for i in range(ring):
        j = (i+1) % ring
        faces.append((i, j, ring+j, ring+i))
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler.x = math.radians(tilt_deg)
    return finish(obj, material, False, .006)


def revolve_profile(name, profile, material, segments=96, bevel=.0):
    verts=[]; rings=len(profile)
    for i in range(segments):
        a=math.tau*i/segments; ca,sa=math.cos(a),math.sin(a)
        for radius,z in profile: verts.append((radius*ca,radius*sa,z))
    faces=[]
    for i in range(segments):
        nxt=(i+1)%segments
        for j in range(rings-1):
            a=i*rings+j; b=nxt*rings+j; c=nxt*rings+j+1; d=i*rings+j+1
            faces.append((a,b,c,d))
    bottom=len(verts); verts.append((0,0,profile[0][1])); top=len(verts); verts.append((0,0,profile[-1][1]))
    for i in range(segments):
        nxt=(i+1)%segments; faces.append((bottom,nxt*rings,i*rings)); faces.append((top,i*rings+rings-1,nxt*rings+rings-1))
    mesh=bpy.data.meshes.new(name+'Mesh'); mesh.from_pydata(verts,[],faces); mesh.update(); obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    return finish(obj,material,True,bevel)


def cyl_between(name,start,end,radius,material,verts=48,bevel=.018):
    a=Vector(start); b=Vector(end); direction=b-a; midpoint=(a+b)*.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=direction.length,location=midpoint)
    o=bpy.context.object; o.name=name; o.rotation_mode='QUATERNION'; o.rotation_quaternion=direction.to_track_quat('Z','Y'); o.rotation_mode='XYZ'
    return finish(o,material,bevel=bevel)


def parent_bone(obj,rig,bone):
    world=obj.matrix_world.copy(); obj.parent=rig; obj.parent_type='BONE'; obj.parent_bone=bone; obj.matrix_world=world


def build_rig():
    armature=bpy.data.armatures.new('MatthiasRig'); rig=bpy.data.objects.new('MatthiasRig',armature); bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,head,tail,parent=None):
        item=armature.edit_bones.new(name); item.head=head; item.tail=tail; item.parent=armature.edit_bones[parent] if parent else None
    bone('root',(0,0,0),(0,0,.34)); bone('spine',(0,0,.50),(0,0,1.16),'root'); bone('head',(0,0,1.04),(0,0,1.90),'spine')
    bone('face_mouth',(0,-.30,1.252),(0,-.30,1.330),'head')
    bone('upper_arm.L',(-.28,.05,.92),(-.39,.06,.82),'spine'); bone('forearm.L',(-.39,.06,.82),(-.33,-.03,.72),'upper_arm.L')
    bone('upper_arm.R',(.28,.05,.92),(.39,.06,.82),'spine'); bone('forearm.R',(.39,.06,.82),(.33,-.03,.72),'upper_arm.R')
    bone('prop_book',(0,-.30,.82),(0,-.30,1.00),'spine'); bone('prop_cup',(.27,-.28,1.12),(.27,-.28,1.24),'spine'); bone('prop_pen',(.14,-.31,.84),(.14,-.31,.97),'spine'); bone('prop_bite',(-.25,-.29,1.12),(-.25,-.29,1.24),'spine')
    bpy.ops.object.mode_set(mode='POSE')
    for item in rig.pose.bones: item.rotation_mode='XYZ'
    bpy.ops.object.mode_set(mode='OBJECT'); return rig


def build_character():
    ivory=mat('classic warm ivory',(.52,.40,.24),.55,.02); ivory_hi=mat('classic ivory highlight',(.66,.52,.33),.45,.02)
    navy=mat('classic midnight pawn',(.0025,.0035,.0055),.20,.26); navy_soft=mat('classic navy cloth',(.006,.008,.012),.30,.14)
    leather=mat('classic black leather',(.006,.004,.003),.30,.18); brass=mat('classic aged brass',(.50,.27,.055),.20,.93); cap_red=mat('classic cap oxblood band',(.075,.012,.009),.38,.06); black=mat('classic brow eye mouth',(.0015,.002,.003),.48); paper=mat('aged dossier paper',(.42,.30,.16),.88); collar_steel=mat('classic pale steel collar',(.30,.29,.26),.32,.55); bread=mat('campaign bread',(.70,.52,.28),.82)
    rig=build_rig(); rig['matthias_asset_version']='home-blender-classic-v24'; rig['canonical_identity']='stern-no-moustache-pawn'; rig['canonical_reference']='home-3d-pawn-approved-2026-09-23'; rig['canonical_reference_sha256']='0b5c32eaae136c1e4e6d85a253b606437599b06dd7a4d4d4d0d637a39ead5707'; rig['canonical_pose_language']='permanently-stern'
    root=[]; spine=[]; head=[]

    root += [
        cyl('Classic plinth lower',(0,0,.060),.620,.120,navy,verts=132,bevel=.023), cyl('Classic plinth brass edge',(0,0,.126),.604,.014,brass,verts=128,bevel=.003),
        cyl('Classic plinth upper',(0,0,.180),.570,.082,navy,verts=128,bevel=.016), cyl('Classic plinth upper brass edge',(0,0,.222),.552,.012,brass,verts=124,bevel=.003), cyl('Classic plinth shoulder',(0,0,.258),.520,.048,navy,verts=124,bevel=.012),
        revolve_profile('Classic lower pawn',[(.440,.250),(.430,.290),(.415,.332),(.400,.380),(.385,.430),(.372,.485),(.360,.542),(.352,.598),(.346,.650),(.340,.700),(.334,.750),(.328,.800),(.322,.845),(.316,.886),(.310,.925),(.306,.960),(.303,.995),(.301,1.025),(.300,1.048),(.300,1.064)],navy,136,.009),
        cyl('Classic lower brass line',(0,0,.350),.495,.014,brass,verts=116,bevel=.003), cyl('Classic service brass line',(0,0,.610),.395,.012,brass,verts=108,bevel=.003),
    ]

    cross_brass=front_prism('Classic chest cross brass',(0,-.345,.850),iron_cross_points(.150),.014,brass,.006); cross_inset=front_prism('Classic chest cross inset',(0,-.354,.850),iron_cross_points(.118),.010,leather,.004)
    spine += [
        revolve_profile('Classic navy tunic',[(.370,.655),(.369,.710),(.368,.765),(.366,.815),(.362,.858),(.357,.895),(.351,.930),(.344,.965),(.338,.998),(.332,1.026),(.326,1.048),(.320,1.064)],navy_soft,120,.006),
        cyl('Classic waist service ring',(0,0,.660),.390,.019,brass,verts=108,bevel=.004), cyl('Classic neck plinth',(0,0,1.082),.330,.046,navy,verts=116,bevel=.009), cyl('Classic brass collar line',(0,0,1.108),.336,.011,brass,verts=116,bevel=.003),
        cross_brass,cross_inset,
    ]

    # One continuous domed officer cap. cap_top is fully contained inside
    # the crown as semantic geometry; it must never read as a second stacked disc.
    cap_crown=sphere('Classic cap crown',(-.030,.028,1.600),(.455,.320,.145),navy,104,(math.radians(-3),math.radians(-10),0))
    cap_top=sphere('Classic cap top',(-.040,.050,1.612),(.430,.295,.125),navy,96,(math.radians(-3),math.radians(-10),0))
    visor=crescent_visor('Classic cap visor',(0,-.036,1.515),leather,.310,.285,.205,.190,.019,10,52)
    cap_badge=front_ellipse('Classic cap badge',(-.018,-.383,1.566),.046,.054,.009,brass,42,.003); cap_badge_inset=front_ellipse('Classic cap badge inset',(-.018,-.390,1.566),.024,.030,.007,leather,38,.002)
    cap_badge.rotation_euler.y = math.radians(-9)
    cap_badge_inset.rotation_euler.y = math.radians(-9)
    mouth=front_curve('Mouth',(0,-.418,1.165),.190,.018,.008,black)
    head += [
        sphere('Head',(0,-.012,1.260),(.410,.385,.440),ivory,112),
        front_ellipse('Eye.L',(-.122,-.420,1.300),.023,.040,.010,black,40,.002), front_ellipse('Eye.R',(.122,-.420,1.300),.023,.040,.010,black,40,.002),
        box('Brow.L',(-.124,-.431,1.374),(.086,.008,.014),black,(0,math.radians(23),0),.003), box('Brow.R',(.124,-.431,1.374),(.086,.008,.014),black,(0,math.radians(-23),0),.003),
        cap_crown,cap_top, elliptic_cyl('Classic cap band',(-.010,-.002,1.525),.410,.062,.82,cap_red,(math.radians(-3),math.radians(-9),0),124,.008), elliptic_cyl('Classic cap brass line',(-.012,-.008,1.488),.404,.011,.82,brass,(math.radians(-3),math.radians(-9),0),124,.003), visor, cap_badge,cap_badge_inset,
    ]

    shoulder_l=(-.218,.250,.902); elbow_l=(-.238,.260,.802); wrist_l=(-.204,.245,.710); shoulder_r=(.218,.250,.902); elbow_r=(.238,.260,.802); wrist_r=(.204,.245,.710)
    upper_l=cyl_between('Upper arm.L',shoulder_l,elbow_l,.024,navy,40,.006); upper_r=cyl_between('Upper arm.R',shoulder_r,elbow_r,.024,navy,40,.006); fore_l=cyl_between('Forearm.L',elbow_l,wrist_l,.021,navy_soft,40,.006); fore_r=cyl_between('Forearm.R',elbow_r,wrist_r,.021,navy_soft,40,.006); cuff_l=cyl('Cuff.L',wrist_l,.024,.014,brass,verts=32,bevel=.003); cuff_r=cyl('Cuff.R',wrist_r,.024,.014,brass,verts=32,bevel=.003); hand_l=sphere('Hand.L',(-.204,.238,.698),(.018,.017,.021),ivory,24); hand_r=sphere('Hand.R',(.204,.238,.698),(.018,.017,.021),ivory,24)

    book=box('RoutineBook',(0,-.485,.915),(.225,.025,.145),leather,(math.radians(5),0,0),.012); book_page=box('RoutineBookPages',(0,-.512,.915),(.166,.008,.096),paper,(math.radians(5),0,0),.004); book_badge=sphere('RoutineBookBadge',(0,-.526,.910),(.030,.008,.036),brass,20); book_hand_l=sphere('RoutineBookHand.L',(-.205,-.520,.835),(.036,.024,.041),ivory,24); book_hand_r=sphere('RoutineBookHand.R',(.205,-.520,.835),(.036,.024,.041),ivory,24); cup=cyl('RoutineCup',(.265,-.420,1.195),.090,.132,ivory_hi,verts=48,bevel=.010); cup_band=cyl('RoutineCupBand',(.265,-.420,1.253),.092,.013,brass,verts=48,bevel=.004); cup_handle=sphere('RoutineCupHandle',(.365,-.420,1.198),(.045,.021,.060),brass,24); cup_hand=sphere('RoutineCupHand',(.220,-.438,1.105),(.038,.028,.043),ivory,24); pen=cyl('RoutinePen',(.145,-.525,.935),.010,.24,leather,(0,math.radians(64),math.radians(-8)),verts=24,bevel=.004); pen_tip=cone('RoutinePenTip',(.255,-.525,.885),.016,.003,.060,brass,(0,math.radians(64),math.radians(-8)),.003)
    # Keep the campaign bite below the stern mouth. At Home scale, a prop that
    # crosses the mouth reads as a replacement face instead of a short routine.
    sandwich_bread=box('RoutineSandwichBread',(-.255,-.435,1.150),(.145,.038,.055),bread,(math.radians(4),math.radians(-7),math.radians(-6)),.018); sandwich_filling=box('RoutineSandwichFilling',(-.255,-.477,1.145),(.128,.013,.043),cap_red,(math.radians(4),math.radians(-7),math.radians(-6)),.008); sandwich_hand=sphere('RoutineSandwichHand',(-.205,-.448,1.075),(.038,.028,.043),ivory,24)

    for obj in root: parent_bone(obj,rig,'root')
    for obj in spine: parent_bone(obj,rig,'spine')
    for obj in head: parent_bone(obj,rig,'head')
    parent_bone(mouth,rig,'face_mouth')
    parent_bone(upper_l,rig,'upper_arm.L'); parent_bone(upper_r,rig,'upper_arm.R')
    for obj in (fore_l,cuff_l,hand_l): parent_bone(obj,rig,'forearm.L')
    for obj in (fore_r,cuff_r,hand_r): parent_bone(obj,rig,'forearm.R')
    for obj in (book,book_page,book_badge,book_hand_l,book_hand_r): parent_bone(obj,rig,'prop_book')
    for obj in (cup,cup_band,cup_handle,cup_hand): parent_bone(obj,rig,'prop_cup')
    for obj in (pen,pen_tip): parent_bone(obj,rig,'prop_pen')
    for obj in (sandwich_bread,sandwich_filling,sandwich_hand): parent_bone(obj,rig,'prop_bite')
    return rig
