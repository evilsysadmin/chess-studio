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
    ivory=mat('classic warm ivory',(.58,.48,.34),.50,.02); ivory_hi=mat('classic ivory highlight',(.76,.64,.46),.40,.02)
    navy=mat('classic midnight pawn',(.0025,.0035,.0055),.20,.26); navy_soft=mat('classic navy cloth',(.006,.008,.012),.30,.14)
    leather=mat('classic black leather',(.006,.004,.003),.30,.18); brass=mat('classic aged brass',(.50,.27,.055),.20,.93); cap_red=mat('classic cap oxblood band',(.075,.012,.009),.38,.06); black=mat('classic brow eye mouth',(.0015,.002,.003),.48); paper=mat('aged dossier paper',(.42,.30,.16),.88); bread=mat('campaign bread',(.70,.52,.28),.82)
    rig=build_rig(); rig['matthias_asset_version']='home-blender-classic-v16'; rig['canonical_identity']='stern-no-moustache-pawn'; rig['canonical_reference']='classic-pawn-first-avatar'; rig['canonical_reference_sha256']='beb64c1dffd6b32a64847b8f768df43e823e858acf630516e27a2cc771e2d975'; rig['canonical_pose_language']='permanently-stern'
    root=[]; spine=[]; head=[]

    root += [
        cyl('Classic plinth lower',(0,0,.060),.620,.120,navy,verts=132,bevel=.023), cyl('Classic plinth brass edge',(0,0,.126),.604,.014,brass,verts=128,bevel=.003),
        cyl('Classic plinth upper',(0,0,.180),.570,.082,navy,verts=128,bevel=.016), cyl('Classic plinth upper brass edge',(0,0,.222),.552,.012,brass,verts=124,bevel=.003), cyl('Classic plinth shoulder',(0,0,.258),.520,.048,navy,verts=124,bevel=.012),
        revolve_profile('Classic lower pawn',[(.526,.250),(.516,.290),(.500,.332),(.476,.380),(.447,.430),(.418,.485),(.394,.542),(.378,.598),(.374,.650),(.383,.700),(.404,.750),(.435,.800),(.462,.845),(.472,.886),(.467,.925),(.452,.960),(.430,.995),(.402,1.025),(.372,1.048),(.344,1.064)],navy,136,.009),
        cyl('Classic lower brass line',(0,0,.350),.495,.014,brass,verts=116,bevel=.003), cyl('Classic service brass line',(0,0,.610),.395,.012,brass,verts=108,bevel=.003),
    ]

    cross_brass=front_prism('Classic chest cross brass',(0,-.469,.850),iron_cross_points(.151),.014,brass,.006); cross_inset=front_prism('Classic chest cross inset',(0,-.479,.850),iron_cross_points(.120),.010,leather,.004)
    spine += [
        revolve_profile('Classic navy tunic',[(.382,.655),(.390,.710),(.410,.765),(.440,.815),(.468,.858),(.478,.895),(.474,.930),(.462,.965),(.442,.998),(.416,1.026),(.386,1.048),(.352,1.064)],navy_soft,120,.006),
        cyl('Classic waist service ring',(0,0,.660),.395,.019,brass,verts=108,bevel=.004), cyl('Classic neck plinth',(0,0,1.082),.398,.066,navy,verts=116,bevel=.011), cyl('Classic brass collar line',(0,0,1.119),.403,.013,brass,verts=116,bevel=.003),
        box('Classic tunic piping.L',(-.298,-.376,.855),(.011,.006,.148),brass,(0,math.radians(-9),0),.004), box('Classic tunic piping.R',(.298,-.376,.855),(.011,.006,.148),brass,(0,math.radians(9),0),.004), cross_brass,cross_inset,
    ]

    cap_crown=loft_ellipse('Classic cap crown',[(.350,.268,1.615,0.000,.016),(.360,.274,1.670,.004,.010),(.374,.281,1.725,.014,.002),(.392,.288,1.780,.030,-.010),(.407,.292,1.830,.050,-.024),(.414,.294,1.875,.068,-.038)],navy,120,.008)
    cap_top=loft_ellipse('Classic cap top',[(.408,.292,1.866,.080,-.036),(.431,.300,1.891,.098,-.047),(.454,.309,1.916,.120,-.059),(.460,.312,1.940,.140,-.070),(.450,.306,1.960,.153,-.078),(.428,.294,1.974,.160,-.084)],navy,124,.008)
    visor=crescent_visor('Classic cap visor',(0,-.020,1.665),leather,.286,.450,.176,.235,.030,10,48)
    cap_badge=front_ellipse('Classic cap badge',(0,-.327,1.705),.050,.060,.010,brass,40,.003); cap_badge_inset=front_ellipse('Classic cap badge inset',(0,-.334,1.705),.027,.034,.008,leather,36,.002)
    mouth_l=box('Mouth.L',(-.047,-.342,1.252),(.059,.005,.007),black,(0,math.radians(-18),0),.002); mouth_r=box('Mouth.R',(.047,-.342,1.252),(.059,.005,.007),black,(0,math.radians(18),0),.002)
    head += [
        sphere('Head',(0,-.012,1.345),(.350,.330,.340),ivory,96),
        front_ellipse('Eye.L',(-.108,-.345,1.382),.024,.040,.010,black,40,.002), front_ellipse('Eye.R',(.108,-.345,1.382),.024,.040,.010,black,40,.002),
        box('Brow.L',(-.108,-.356,1.452),(.082,.009,.021),black,(0,math.radians(29),0),.004), box('Brow.R',(.108,-.356,1.452),(.082,.009,.021),black,(0,math.radians(-29),0),.004),
        cap_crown,cap_top, elliptic_cyl('Classic cap band',(0,-.004,1.615),.364,.082,.84,cap_red,(math.radians(-2),0,0),116,.010), elliptic_cyl('Classic cap brass line',(0,-.010,1.573),.360,.013,.84,brass,(math.radians(-2),0,0),116,.003), visor, cap_badge,cap_badge_inset,
        box('Classic cap badge wing.L',(-.078,-.326,1.712),(.052,.006,.014),brass,(0,math.radians(-12),math.radians(12)),.003), box('Classic cap badge wing.R',(.078,-.326,1.712),(.052,.006,.014),brass,(0,math.radians(12),math.radians(-12)),.003),
    ]

    shoulder_l=(-.294,.218,.902); elbow_l=(-.338,.228,.802); wrist_l=(-.292,.212,.710); shoulder_r=(.294,.218,.902); elbow_r=(.338,.228,.802); wrist_r=(.292,.212,.710)
    upper_l=cyl_between('Upper arm.L',shoulder_l,elbow_l,.032,navy,40,.008); upper_r=cyl_between('Upper arm.R',shoulder_r,elbow_r,.032,navy,40,.008); fore_l=cyl_between('Forearm.L',elbow_l,wrist_l,.027,navy_soft,40,.007); fore_r=cyl_between('Forearm.R',elbow_r,wrist_r,.027,navy_soft,40,.007); cuff_l=cyl('Cuff.L',wrist_l,.030,.016,brass,verts=32,bevel=.003); cuff_r=cyl('Cuff.R',wrist_r,.030,.016,brass,verts=32,bevel=.003); hand_l=sphere('Hand.L',(-.290,.202,.698),(.021,.020,.024),ivory,24); hand_r=sphere('Hand.R',(.290,.202,.698),(.021,.020,.024),ivory,24)

    book=box('RoutineBook',(0,-.485,.915),(.225,.025,.145),leather,(math.radians(5),0,0),.012); book_page=box('RoutineBookPages',(0,-.512,.915),(.166,.008,.096),paper,(math.radians(5),0,0),.004); book_badge=sphere('RoutineBookBadge',(0,-.526,.910),(.030,.008,.036),brass,20); book_hand_l=sphere('RoutineBookHand.L',(-.205,-.520,.835),(.036,.024,.041),ivory,24); book_hand_r=sphere('RoutineBookHand.R',(.205,-.520,.835),(.036,.024,.041),ivory,24); cup=cyl('RoutineCup',(.265,-.420,1.195),.090,.132,ivory_hi,verts=48,bevel=.010); cup_band=cyl('RoutineCupBand',(.265,-.420,1.253),.092,.013,brass,verts=48,bevel=.004); cup_handle=sphere('RoutineCupHandle',(.365,-.420,1.198),(.045,.021,.060),brass,24); cup_hand=sphere('RoutineCupHand',(.220,-.438,1.105),(.038,.028,.043),ivory,24); pen=cyl('RoutinePen',(.145,-.525,.935),.010,.24,leather,(0,math.radians(64),math.radians(-8)),verts=24,bevel=.004); pen_tip=cone('RoutinePenTip',(.255,-.525,.885),.016,.003,.060,brass,(0,math.radians(64),math.radians(-8)),.003)
    sandwich_bread=box('RoutineSandwichBread',(-.255,-.435,1.205),(.145,.038,.080),bread,(math.radians(4),math.radians(-7),math.radians(-6)),.018); sandwich_filling=box('RoutineSandwichFilling',(-.255,-.477,1.200),(.128,.013,.058),cap_red,(math.radians(4),math.radians(-7),math.radians(-6)),.008); sandwich_hand=sphere('RoutineSandwichHand',(-.205,-.448,1.105),(.038,.028,.043),ivory,24)

    for obj in root: parent_bone(obj,rig,'root')
    for obj in spine: parent_bone(obj,rig,'spine')
    for obj in head: parent_bone(obj,rig,'head')
    for obj in (mouth_l,mouth_r): parent_bone(obj,rig,'face_mouth')
    parent_bone(upper_l,rig,'upper_arm.L'); parent_bone(upper_r,rig,'upper_arm.R')
    for obj in (fore_l,cuff_l,hand_l): parent_bone(obj,rig,'forearm.L')
    for obj in (fore_r,cuff_r,hand_r): parent_bone(obj,rig,'forearm.R')
    for obj in (book,book_page,book_badge,book_hand_l,book_hand_r): parent_bone(obj,rig,'prop_book')
    for obj in (cup,cup_band,cup_handle,cup_hand): parent_bone(obj,rig,'prop_cup')
    for obj in (pen,pen_tip): parent_bone(obj,rig,'prop_pen')
    for obj in (sandwich_bread,sandwich_filling,sandwich_hand): parent_bone(obj,rig,'prop_bite')
    return rig
