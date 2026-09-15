#!/usr/bin/env python3
"""Author the Chronicles party as readable humanoid Blender characters."""
import argparse, math, os, sys
import bpy
from mathutils import Vector

COLORS={
 'skin':((0.55,0.32,0.20,1),.82,0),'skin2':((0.42,0.23,0.13,1),.82,0),'skin3':((0.66,0.43,0.29,1),.82,0),
 'navy':((0.035,0.07,0.11,1),.7,0),'steel':((.34,.38,.42,1),.25,.72),'dark':((.035,.04,.045,1),.5,.35),
 'green':((.035,.13,.095,1),.75,0),'ochre':((.43,.23,.055,1),.72,0),'brown':((.13,.075,.045,1),.78,0),
 'leather':((.19,.085,.035,1),.82,0),'brass':((.55,.34,.07,1),.3,.72),'red':((.42,.035,.025,1),.65,0),
 'ivory':((.62,.57,.46,1),.75,0),'black':((.006,.007,.008,1),.8,0),'white':((.75,.72,.64,1),.7,0),
}
def mat(name):
 c,r,m=COLORS[name]; x=bpy.data.materials.new('chron_'+name); x.diffuse_color=c; x.use_nodes=True
 bs=x.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=c; bs.inputs['Roughness'].default_value=r; bs.inputs['Metallic'].default_value=m; return x
M={k:mat(k) for k in COLORS}
def finish(o, material, bevel=.015, smooth=True):
 o.data.materials.append(M[material]);
 if hasattr(o.data,'polygons') and smooth:
  for p in o.data.polygons:p.use_smooth=True
 if bevel:
  b=o.modifiers.new('authored edge softness','BEVEL'); b.width=bevel; b.segments=2
 return o
def parent(o,r):o.parent=r;return o
def sphere(n,loc,scale,ma,r):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=loc);o=bpy.context.object;o.name=n;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return parent(finish(o,ma),r)
def box(n,loc,scale,ma,r,rot=(0,0,0),bevel=.02):
 bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot);o=bpy.context.object;o.name=n;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return parent(finish(o,ma,bevel,False),r)
def cyl(n,a,b,rad,ma,r):
 a,b=Vector(a),Vector(b);d=b-a;mid=(a+b)/2;bpy.ops.mesh.primitive_cylinder_add(vertices=28,radius=rad,depth=d.length,location=mid);o=bpy.context.object;o.name=n;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');o.rotation_mode='XYZ';return parent(finish(o,ma,.01),r)
def cone(n,loc,r1,r2,depth,ma,r):
 bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=r1,radius2=r2,depth=depth,location=loc);o=bpy.context.object;o.name=n;return parent(finish(o,ma),r)
def root(role,x):
 r=bpy.data.objects.new('ChroniclesParty__'+role,None);bpy.context.collection.objects.link(r);r.location.x=x;r['authored_humanoid']=True;return r
def limb(prefix,r,shoulder,elbow,wrist,ma):
 cyl(prefix+'_upper',shoulder,elbow,.085,ma,r);sphere(prefix+'_joint',elbow,(.095,.095,.095),ma,r);cyl(prefix+'_lower',elbow,wrist,.07,ma,r)
def face(r,z,skin='skin'):
 sphere(r.name+'__head',(r.location.x,-.03,z),(.22,.20,.27),skin,r);sphere(r.name+'__nose',(r.location.x,-.205,z-.02),(.055,.045,.075),skin,r)
 for dx in (-.075,.075): sphere(r.name+'__eye'+str(dx),(r.location.x+dx,-.205,z+.045),(.026,.018,.022),'black',r)
def boot(r,n,x,z):box(n,(x,-.015,z),(.14,.22,.075),'dark',r,bevel=.025)

def hildegard(x):
 r=root('rook',x); z=1.0
 # grounded armored woman: separate legs, pelvis, torso, neck and head
 for s,dx in (('l',-.15),('r',.15)):
  cyl('rook__thigh_'+s,(x+dx,0,.42),(x+dx*.9,0,.78),.105,'navy',r);cyl('rook__shin_'+s,(x+dx*.9,0,.42),(x+dx,0,.12),.09,'steel',r);boot(r,'rook__boot_'+s,x+dx,-.01)
 box('rook__pelvis',(x,0,.76),(.27,.20,.16),'navy',r,bevel=.06);cone('rook__torso',(x,0,1.12),.34,.25,.62,'navy',r);box('rook__breastplate',(x,-.18,1.16),(.25,.055,.25),'steel',r,bevel=.045)
 cyl('rook__neck',(x,0,1.39),(x,0,1.50),.095,'skin3',r);face(r,1.69,'skin3')
 box('rook__helm',(x,0,1.86),(.24,.21,.10),'dark',r,bevel=.07);box('rook__visor',(x,-.22,1.72),(.22,.035,.075),'steel',r,bevel=.015)
 limb('rook__arm_l',r,(x-.27,0,1.32),(x-.43,-.02,1.06),(x-.48,-.08,.82),'navy');limb('rook__arm_r',r,(x+.27,0,1.32),(x+.42,-.02,1.12),(x+.48,-.12,.96),'navy')
 sphere('rook__hand_l',(x-.48,-.08,.82),(.09,.08,.09),'skin3',r);sphere('rook__hand_r',(x+.48,-.12,.96),(.09,.08,.09),'skin3',r)
 box('rook__shield',(x+.54,-.15,.82),(.30,.07,.38),'steel',r,rot=(0,-.08,0),bevel=.05);cyl('rook__mace',(x-.50,-.08,.76),(x-.58,-.08,1.36),.035,'brass',r);sphere('rook__mace_head',(x-.59,-.08,1.42),(.13,.13,.13),'steel',r);return r

def aziz(x):
 r=root('bishop',x)
 for s,dx in (('l',-.13),('r',.13)):
  cyl('bishop__leg_'+s,(x+dx,0,.12),(x+dx*.8,0,.72),.09,'brown',r);boot(r,'bishop__boot_'+s,x+dx,-.01)
 box('bishop__pelvis',(x,0,.72),(.24,.18,.15),'green',r,bevel=.06);cone('bishop__robe',(x,0,1.05),.38,.23,.72,'green',r);box('bishop__sash',(x,-.205,1.03),(.08,.025,.31),'ochre',r,rot=(0,.38,0),bevel=.012)
 cyl('bishop__neck',(x,0,1.38),(x,0,1.49),.09,'skin2',r);face(r,1.68,'skin2');box('bishop__brow',(x,-.215,1.76),(.16,.018,.025),'black',r,rot=(0,0,.03),bevel=.006)
 # wrapped scholar hood/turban, not a chess bishop cone
 sphere('bishop__turban',(x,0,1.90),(.25,.22,.15),'ivory',r);box('bishop__turban_band',(x,-.19,1.89),(.22,.035,.055),'ochre',r,bevel=.02)
 limb('bishop__arm_l',r,(x-.25,0,1.28),(x-.40,-.02,1.05),(x-.44,-.08,.82),'green');limb('bishop__arm_r',r,(x+.25,0,1.28),(x+.36,-.05,1.10),(x+.32,-.14,.91),'green')
 sphere('bishop__hand_l',(x-.44,-.08,.82),(.085,.075,.09),'skin2',r);sphere('bishop__hand_r',(x+.32,-.14,.91),(.085,.075,.09),'skin2',r)
 cyl('bishop__staff',(x-.46,-.06,.15),(x-.50,-.06,1.52),.032,'brass',r);sphere('bishop__lantern',(x-.50,-.06,1.57),(.14,.14,.17),'brass',r);box('bishop__satchel',(x+.38,.08,.82),(.18,.10,.20),'leather',r,bevel=.035);return r

def faust(x):
 r=root('knight',x)
 for s,dx in (('l',-.14),('r',.14)):
  cyl('knight__thigh_'+s,(x+dx,0,.40),(x+dx*.85,0,.76),.10,'brown',r);cyl('knight__shin_'+s,(x+dx*.85,0,.40),(x+dx,0,.11),.085,'leather',r);boot(r,'knight__boot_'+s,x+dx,-.015)
 box('knight__pelvis',(x,0,.74),(.25,.19,.15),'brown',r,bevel=.055);cone('knight__torso',(x,0,1.08),.32,.23,.64,'brown',r);box('knight__harness_l',(x-.10,-.19,1.10),(.035,.025,.32),'leather',r,rot=(0,-.28,0),bevel=.01);box('knight__harness_r',(x+.10,-.19,1.10),(.035,.025,.32),'leather',r,rot=(0,.28,0),bevel=.01)
 cyl('knight__neck',(x,0,1.38),(x,0,1.49),.095,'skin',r);face(r,1.68,'skin');sphere('knight__hair',(x,.04,1.79),(.23,.19,.16),'black',r);box('knight__goggles',(x,-.215,1.72),(.19,.025,.045),'brass',r,bevel=.02)
 limb('knight__arm_l',r,(x-.26,0,1.29),(x-.39,-.02,1.04),(x-.34,-.14,.84),'brown');limb('knight__arm_r',r,(x+.26,0,1.29),(x+.39,-.03,1.05),(x+.35,-.14,.83),'brown')
 sphere('knight__hand_l',(x-.34,-.14,.84),(.085,.075,.09),'skin',r);sphere('knight__hand_r',(x+.35,-.14,.83),(.085,.075,.09),'skin',r)
 box('knight__pack',(x,.20,.92),(.28,.11,.32),'leather',r,bevel=.045);cyl('knight__vial',(x+.38,-.12,.70),(x+.38,-.12,.91),.045,'brass',r);cyl('knight__shortblade',(x-.38,-.10,.55),(x-.48,-.10,1.00),.025,'steel',r);return r

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--blend',required=True);ap.add_argument('--glb',required=True);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
 bpy.ops.wm.read_factory_settings(use_empty=True); global M; M={k:mat(k) for k in COLORS}
 hildegard(-1.65);aziz(0);faust(1.65);bpy.context.scene['chronicles_cast']='rook,bishop,knight';bpy.context.scene['chronicles_party_asset_version']='chronicles-humanoid-party-v4'
 for p in (args.blend,args.glb):os.makedirs(os.path.dirname(os.path.abspath(p)),exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=args.blend);bpy.ops.export_scene.gltf(filepath=args.glb,export_format='GLB',use_selection=False)
if __name__=='__main__':main()
