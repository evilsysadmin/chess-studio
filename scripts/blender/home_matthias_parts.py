import math
import bpy


def mat(name, rgb, rough=.6, metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*rgb,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    return m

def finish(o,m,smooth=True):
    if smooth:
        for p in o.data.polygons: p.use_smooth=True
    o.data.materials.append(m); return o

def sphere(name,loc,scale,m,seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(12,seg//2), location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,m)

def cyl(name,loc,r,d,m,rot=(0,0,0),verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=loc,rotation=rot)
    o=bpy.context.object; o.name=name; mod=o.modifiers.new('edge softness','BEVEL'); mod.width=min(.035,r*.12); mod.segments=3
    return finish(o,m)

def cone(name,loc,r1,r2,d,m):
    bpy.ops.mesh.primitive_cone_add(vertices=56,radius1=r1,radius2=r2,depth=d,location=loc)
    o=bpy.context.object; o.name=name; mod=o.modifiers.new('edge softness','BEVEL'); mod.width=min(.04,r1*.08); mod.segments=3
    return finish(o,m)

def torus(name,loc,major,minor,m):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=56,minor_segments=14,location=loc)
    o=bpy.context.object; o.name=name; return finish(o,m)

def box(name,loc,scale,m,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot); o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); mod=o.modifiers.new('edge softness','BEVEL'); mod.width=.012; mod.segments=3
    return finish(o,m,False)

def tube(name,pts,r,m):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.bevel_depth=r; c.bevel_resolution=3; c.resolution_u=8
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(pts)-1)
    for p,co in zip(s.bezier_points,pts): p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o

def parent_bone(o,rig,bone): o.parent=rig; o.parent_type='BONE'; o.parent_bone=bone; o.matrix_parent_inverse=rig.matrix_world.inverted()

def build_rig():
    a=bpy.data.armatures.new('MatthiasRig'); r=bpy.data.objects.new('MatthiasRig',a); bpy.context.collection.objects.link(r)
    bpy.context.view_layer.objects.active=r; r.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    def b(n,h,t,p=None):
        x=a.edit_bones.new(n); x.head=h; x.tail=t; x.parent=a.edit_bones[p] if p else None
    b('root',(0,0,0),(0,0,.4)); b('spine',(0,0,.7),(0,0,1.65),'root'); b('head',(0,0,1.55),(0,0,2.2),'spine')
    b('upper_arm.L',(-.35,0,1.55),(-.78,0,1.27),'spine'); b('forearm.L',(-.78,0,1.27),(-1,-.04,.96),'upper_arm.L')
    b('upper_arm.R',(.35,0,1.55),(.78,0,1.27),'spine'); b('forearm.R',(.78,0,1.27),(1,-.04,.96),'upper_arm.R')
    bpy.ops.object.mode_set(mode='POSE')
    for p in r.pose.bones: p.rotation_mode='XYZ'
    bpy.ops.object.mode_set(mode='OBJECT'); return r

def build_character():
    ivory=mat('warm ivory',(.72,.64,.50),.44); hi=mat('ivory highlight',(.92,.83,.66),.4); navy=mat('midnight uniform',(.028,.046,.064),.58)
    cloth=mat('midnight cloth',(.05,.07,.09),.72); brass=mat('aged brass',(.5,.29,.075),.3,.8); hair=mat('iron grey',(.14,.15,.15),.82)
    white=mat('eye white',(.88,.84,.75),.48); iris=mat('cold iris',(.10,.22,.26),.35); black=mat('pupil',(.006,.008,.01),.5); red=mat('campaign red',(.28,.03,.03),.68)
    rig=build_rig(); root=[]; spine=[]; head=[]
    root += [cyl('Pawn plinth',(0,0,.18),.82,.26,navy,verts=64),torus('brass plinth ring',(0,0,.31),.66,.028,brass),cone('Pawn lower body',(0,0,.64),.64,.42,.7,cloth),torus('belt',(0,0,.92),.43,.034,navy)]
    spine += [cone('uniform torso',(0,0,1.27),.43,.35,.72,navy),torus('ivory collar',(0,0,1.62),.34,.055,hi)]
    h=sphere('Head',(0,-.02,1.96),(.36,.33,.41),ivory,56); head += [h,sphere('Nose',(0,-.33,1.94),(.075,.09,.09),hi,28)]
    for side,x in [('L',-.125),('R',.125)]:
        head += [sphere('Eye.'+side,(x,-.304,2.055),(.07,.035,.05),white,28),sphere('Iris.'+side,(x,-.337,2.055),(.032,.012,.03),iris,20),sphere('Pupil.'+side,(x,-.348,2.055),(.014,.008,.014),black,16)]
    head += [box('Brow.L',(-.13,-.35,2.145),(.105,.02,.018),hair,(math.radians(-5),0,math.radians(-10))),box('Brow.R',(.13,-.35,2.158),(.105,.02,.018),hair,(math.radians(-3),0,math.radians(8)))]
    head += [tube('Moustache.L',[(-.015,-.378,1.91),(-.10,-.39,1.90),(-.21,-.372,1.925)],.018,hair),tube('Moustache.R',[(.015,-.378,1.91),(.10,-.39,1.90),(.21,-.372,1.925)],.018,hair),cone('short beard',(0,-.245,1.79),.17,.08,.30,hair)]
    head += [sphere('field cap',(0,-.015,2.245),(.30,.29,.105),navy,40),box('cap visor',(0,-.275,2.205),(.20,.12,.025),navy,(math.radians(7),0,0)),sphere('cap insignia',(0,-.305,2.236),(.045,.018,.05),brass,20)]
    spine += [box('Epaulette.L',(-.39,-.01,1.53),(.15,.20,.035),brass,(0,0,math.radians(-8))),box('Epaulette.R',(.39,-.01,1.53),(.15,.20,.035),brass,(0,0,math.radians(8))),box('campaign ribbon',(-.15,-.407,1.38),(.115,.014,.035),red)]
    for z in (1.08,1.25,1.42): spine.append(sphere('button '+str(z),(0,-.39,z),(.035,.02,.035),brass,16))
    al=cyl('Upper arm.L',(-.53,-.02,1.37),.13,.50,navy,(0,math.radians(-55),math.radians(4))); ar=cyl('Upper arm.R',(.53,-.02,1.37),.13,.50,navy,(0,math.radians(55),math.radians(-4)))
    fl=cyl('Forearm.L',(-.80,-.10,1.10),.115,.48,cloth,(math.radians(8),math.radians(-38),math.radians(4))); fr=cyl('Forearm.R',(.80,-.10,1.10),.115,.48,cloth,(math.radians(8),math.radians(38),math.radians(-4)))
    hl=sphere('Hand.L',(-.95,-.18,.91),(.12,.10,.13),ivory,28); hr=sphere('Hand.R',(.95,-.18,.91),(.12,.10,.13),ivory,28)
    for o in root: parent_bone(o,rig,'root')
    for o in spine: parent_bone(o,rig,'spine')
    for o in head: parent_bone(o,rig,'head')
    parent_bone(al,rig,'upper_arm.L'); parent_bone(ar,rig,'upper_arm.R')
    for o in (fl,hl): parent_bone(o,rig,'forearm.L')
    for o in (fr,hr): parent_bone(o,rig,'forearm.R')
    return rig
