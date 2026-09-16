#!/usr/bin/env python3
"""Author the Chronicles party as readable, distinct humanoid Blender characters."""
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
M={}
def finish(o, material, bevel=.015, smooth=True):
 o.data.materials.append(M[material])
 if hasattr(o.data,'polygons') and smooth:
  for p in o.data.polygons:p.use_smooth=True
 if bevel:
  b=o.modifiers.new('authored edge softness','BEVEL'); b.width=bevel; b.segments=2
 return o
def parent(o,r):o.parent=r;return o
def sphere(n,loc,scale,ma,r):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=20, location=loc);o=bpy.context.object;o.name=n;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return parent(finish(o,ma),r)
def box(n,loc,scale,ma,r,rot=(0,0,0),bevel=.02):
 bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot);o=bpy.context.object;o.name=n;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return parent(finish(o,ma,bevel,False),r)
def cyl(n,a,b,rad,ma,r):
 a,b=Vector(a),Vector(b);d=b-a;mid=(a+b)/2;bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=rad,depth=d.length,location=mid);o=bpy.context.object;o.name=n;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');o.rotation_mode='XYZ';return parent(finish(o,ma,.01),r)
def cone(n,loc,r1,r2,depth,ma,r):
 bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=r1,radius2=r2,depth=depth,location=loc);o=bpy.context.object;o.name=n;return parent(finish(o,ma),r)
def root(role,x):
 r=bpy.data.objects.new('ChroniclesParty__'+role,None);bpy.context.collection.objects.link(r);r.location.x=x;r['authored_humanoid']=True;r['party_art']='authored-v5';return r
def limb(prefix,r,shoulder,elbow,wrist,ma):
 cyl(prefix+'_upper',shoulder,elbow,.082,ma,r);sphere(prefix+'_joint',elbow,(.092,.092,.092),ma,r);cyl(prefix+'_lower',elbow,wrist,.066,ma,r)
def face(r,z,skin='skin',mood='neutral'):
 x=r.location.x
 sphere(r.name+'__head',(x,-.03,z),(.205,.19,.265),skin,r)
 sphere(r.name+'__jaw',(x,-.055,z-.115),(.16,.16,.12),skin,r)
 sphere(r.name+'__nose',(x,-.205,z-.015),(.05,.042,.07),skin,r)
 for i,dx in enumerate((-.072,.072)):
  sphere(r.name+'__eye'+str(i),(x+dx,-.205,z+.045),(.034,.018,.026),'white',r)
  sphere(r.name+'__pupil'+str(i),(x+dx,-.222,z+.043),(.014,.009,.015),'black',r)
  angle=(-.12 if i==0 else .12) if mood=='stern' else (-.04 if i==0 else .04)
  box(r.name+'__brow'+str(i),(x+dx,-.225,z+.105),(.065,.012,.012),'black',r,rot=(0,angle,0),bevel=.004)
 box(r.name+'__mouth',(x,-.226,z-.105),(.07,.010,.009),'black',r,rot=(0,.02 if mood=='stern' else 0,0),bevel=.003)
def boot(r,n,x,z,flip=1):
 box(n,(x-.018*flip,-.04,z),(.115,.205,.07),'dark',r,rot=(0,0,.035*flip),bevel=.025)
 box(n+'__toe',(x-.025*flip,-.17,z+.015),(.12,.105,.06),'dark',r,bevel=.035)

def hildegard(x):
 r=root('rook',x)
 for s,dx,flip in (('l',-.17,-1),('r',.17,1)):
  cyl('rook__thigh_'+s,(x+dx,0,.76),(x+dx*1.05,-.01,.43),.10,'navy',r);sphere('rook__knee_'+s,(x+dx*1.05,-.01,.41),(.105,.10,.10),'steel',r);cyl('rook__shin_'+s,(x+dx*1.05,-.01,.38),(x+dx*1.18,-.03,.12),.082,'steel',r);boot(r,'rook__boot_'+s,x+dx*1.20,-.01,flip)
 box('rook__pelvis',(x,0,.76),(.25,.19,.145),'navy',r,bevel=.055);cone('rook__torso',(x,0,1.12),.31,.235,.60,'navy',r);box('rook__breastplate',(x,-.18,1.16),(.245,.052,.245),'steel',r,bevel=.05)
 box('rook__belt',(x,-.205,.88),(.27,.035,.045),'leather',r,bevel=.015);sphere('rook__belt_buckle',(x,-.245,.88),(.055,.018,.055),'brass',r)
 cyl('rook__neck',(x,0,1.39),(x,0,1.49),.088,'skin3',r);face(r,1.68,'skin3','stern')
 sphere('rook__helm_dome',(x,.015,1.86),(.225,.205,.135),'dark',r);box('rook__helm_brow',(x,-.19,1.79),(.215,.04,.055),'steel',r,bevel=.025);box('rook__nose_guard',(x,-.225,1.69),(.028,.025,.10),'steel',r,bevel=.01)
 for dx in (-.29,.29): sphere('rook__pauldron'+str(dx),(x+dx,0,1.32),(.14,.18,.105),'steel',r)
 limb('rook__arm_l',r,(x-.28,0,1.30),(x-.43,-.03,1.05),(x-.48,-.10,.82),'navy');limb('rook__arm_r',r,(x+.28,0,1.30),(x+.42,-.03,1.10),(x+.48,-.13,.95),'navy')
 sphere('rook__hand_l',(x-.48,-.10,.82),(.085,.075,.085),'skin3',r);sphere('rook__hand_r',(x+.48,-.13,.95),(.085,.075,.085),'skin3',r)
 box('rook__shield',(x+.56,-.14,.82),(.285,.065,.37),'steel',r,rot=(0,-.08,0),bevel=.055);box('rook__shield_cross_v',(x+.56,-.215,.82),(.035,.018,.27),'brass',r,bevel=.01);box('rook__shield_cross_h',(x+.56,-.215,.84),(.18,.018,.035),'brass',r,bevel=.01)
 cyl('rook__mace',(x-.50,-.09,.76),(x-.58,-.09,1.35),.03,'brass',r);sphere('rook__mace_head',(x-.59,-.09,1.42),(.125,.125,.125),'steel',r);return r

def aziz(x):
 r=root('bishop',x)
 for s,dx,flip in (('l',-.145,-1),('r',.145,1)):
  cyl('bishop__leg_'+s,(x+dx,0,.70),(x+dx*1.05,-.01,.12),.082,'brown',r);boot(r,'bishop__boot_'+s,x+dx*1.10,-.01,flip)
 box('bishop__pelvis',(x,0,.72),(.23,.18,.14),'green',r,bevel=.055);cone('bishop__robe',(x,0,1.05),.35,.215,.70,'green',r);box('bishop__sash',(x,-.205,1.03),(.07,.025,.30),'ochre',r,rot=(0,.38,0),bevel=.012);box('bishop__belt',(x,-.20,.84),(.25,.03,.04),'leather',r,bevel=.012)
 cyl('bishop__neck',(x,0,1.38),(x,0,1.49),.085,'skin2',r);face(r,1.68,'skin2','neutral')
 sphere('bishop__turban_core',(x,0,1.89),(.225,.205,.145),'ivory',r)
 for dz,scale in ((-.04,.22),(0,.235),(.04,.215)): box('bishop__turban_wrap'+str(dz),(x,-.17,1.89+dz),(scale,.035,.025),'ivory',r,rot=(0,.08 if dz<0 else -.08,0),bevel=.012)
 box('bishop__turban_band',(x,-.195,1.87),(.215,.028,.05),'ochre',r,bevel=.018)
 limb('bishop__arm_l',r,(x-.245,0,1.28),(x-.39,-.03,1.05),(x-.44,-.10,.82),'green');limb('bishop__arm_r',r,(x+.245,0,1.28),(x+.36,-.05,1.10),(x+.32,-.14,.91),'green')
 sphere('bishop__hand_l',(x-.44,-.10,.82),(.08,.07,.085),'skin2',r);sphere('bishop__hand_r',(x+.32,-.14,.91),(.08,.07,.085),'skin2',r)
 cyl('bishop__staff',(x-.46,-.06,.15),(x-.50,-.06,1.50),.028,'brass',r);sphere('bishop__lantern',(x-.50,-.06,1.57),(.13,.13,.16),'brass',r);sphere('bishop__lantern_glass',(x-.50,-.13,1.57),(.075,.055,.095),'ivory',r);box('bishop__satchel',(x+.38,.08,.82),(.17,.095,.19),'leather',r,bevel=.035);return r

def faust(x):
 r=root('knight',x)
 for s,dx,flip in (('l',-.16,-1),('r',.16,1)):
  cyl('knight__thigh_'+s,(x+dx,0,.74),(x+dx*1.12,-.02,.41),.092,'brown',r);sphere('knight__knee_'+s,(x+dx*1.12,-.02,.40),(.095,.09,.09),'leather',r);cyl('knight__shin_'+s,(x+dx*1.12,-.02,.37),(x+dx*1.25,-.04,.11),.076,'leather',r);boot(r,'knight__boot_'+s,x+dx*1.28,-.015,flip)
 box('knight__pelvis',(x,0,.74),(.24,.18,.14),'brown',r,bevel=.05);cone('knight__torso',(x,0,1.08),.30,.215,.62,'brown',r);box('knight__harness_l',(x-.10,-.19,1.10),(.03,.025,.31),'leather',r,rot=(0,-.28,0),bevel=.01);box('knight__harness_r',(x+.10,-.19,1.10),(.03,.025,.31),'leather',r,rot=(0,.28,0),bevel=.01);box('knight__belt',(x,-.205,.86),(.255,.03,.04),'leather',r,bevel=.012)
 cyl('knight__neck',(x,0,1.38),(x,0,1.49),.088,'skin',r);face(r,1.68,'skin','stern')
 sphere('knight__hair_back',(x,.055,1.79),(.215,.185,.15),'black',r);sphere('knight__hair_lock_l',(x-.12,-.14,1.80),(.07,.055,.11),'black',r);sphere('knight__hair_lock_r',(x+.11,-.14,1.81),(.065,.05,.10),'black',r)
 for dx in (-.075,.075): sphere('knight__goggle_'+str(dx),(x+dx,-.225,1.72),(.06,.022,.05),'brass',r);sphere('knight__lens_'+str(dx),(x+dx,-.247,1.72),(.043,.012,.035),'dark',r)
 box('knight__goggle_bridge',(x,-.225,1.72),(.04,.018,.012),'brass',r,bevel=.005)
 limb('knight__arm_l',r,(x-.25,0,1.29),(x-.39,-.03,1.04),(x-.34,-.14,.84),'brown');limb('knight__arm_r',r,(x+.25,0,1.29),(x+.39,-.03,1.05),(x+.35,-.14,.83),'brown')
 sphere('knight__hand_l',(x-.34,-.14,.84),(.08,.07,.085),'skin',r);sphere('knight__hand_r',(x+.35,-.14,.83),(.08,.07,.085),'skin',r)
 box('knight__pack',(x,.20,.92),(.26,.105,.30),'leather',r,bevel=.045);cyl('knight__vial',(x+.38,-.12,.70),(x+.38,-.12,.91),.04,'brass',r);sphere('knight__vial_stop',(x+.38,-.12,.94),(.05,.05,.04),'red',r);cyl('knight__shortblade',(x-.38,-.10,.55),(x-.48,-.10,1.00),.022,'steel',r);return r

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--blend',required=True);ap.add_argument('--glb',required=True);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
 bpy.ops.wm.read_factory_settings(use_empty=True); global M; M={k:mat(k) for k in COLORS}
 hildegard(-1.65);aziz(0);faust(1.65);bpy.context.scene['chronicles_cast']='rook,bishop,knight';bpy.context.scene['chronicles_party_asset_version']='chronicles-humanoid-party-v5';bpy.context.scene['chronicles_party_visual_contract']='authored-humanoid-distinct-silhouettes-v2'
 for p in (args.blend,args.glb):os.makedirs(os.path.dirname(os.path.abspath(p)),exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=args.blend);bpy.ops.export_scene.gltf(filepath=args.glb,export_format='GLB',use_selection=False)
if __name__=='__main__':main()
