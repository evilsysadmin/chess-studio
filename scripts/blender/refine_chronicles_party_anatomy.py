#!/usr/bin/env python3
"""Add authored anatomical forms and character-specific silhouette detail to Chronicles party."""
import argparse, os, sys
import bpy


def material(name):
    return bpy.data.materials.get('chron_' + name)


def mesh_object(name, root, verts, faces, mat_name, bevel=.014):
    mesh = bpy.data.meshes.new(name + '__mesh'); mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj); obj.parent = root
    if material(mat_name): obj.data.materials.append(material(mat_name))
    edge = obj.modifiers.new('authored anatomy edge softness', 'BEVEL'); edge.width = bevel; edge.segments = 2
    obj['authored_anatomy_mesh'] = True
    return obj


def tapered_form(name, root, center, widths, depths, zs, mat_name):
    x,y=center; verts=[]
    for w,d,z in zip(widths,depths,zs): verts += [(x-w,y-d,z),(x+w,y-d,z),(x+w,y+d,z),(x-w,y+d,z)]
    faces=[]; rings=len(zs); faces += [(0,1,2,3),(4*(rings-1)+3,4*(rings-1)+2,4*(rings-1)+1,4*(rings-1))]
    for r in range(rings-1):
        a=4*r; b=a+4; faces += [(a,b,b+1,a+1),(a+1,b+1,b+2,a+2),(a+2,b+2,b+3,a+3),(a+3,b+3,b,a)]
    return mesh_object(name,root,verts,faces,mat_name)


def face_planes(role, root, skin, jaw_w, cheek_w, brow_w):
    x=root.location.x
    verts=[(x-cheek_w,-.218,1.77),(x+cheek_w,-.218,1.77),(x+brow_w,-.232,1.72),(x+jaw_w,-.226,1.57),(x,-.238,1.53),(x-jaw_w,-.226,1.57),(x-brow_w,-.232,1.72),(x-cheek_w*.82,-.174,1.76),(x+cheek_w*.82,-.174,1.76),(x+jaw_w*.82,-.181,1.58),(x,-.188,1.55),(x-jaw_w*.82,-.181,1.58)]
    faces=[(0,1,2,3,4,5,6),(7,11,10,9,8),(0,7,8,1),(1,8,9,3,2),(3,9,10,4),(4,10,11,5),(5,11,7,0)]
    mesh_object(role+'__authored_face_planes',root,verts,faces,skin,.009)


def limb(name,root,x0,y0,z0,x1,y1,z1,w0,w1,mat):
    dx=x1-x0; dy=y1-y0
    # Authored faceted limb segment with distinct proximal/distal widths.
    verts=[(x0-w0,y0-.055,z0),(x0+w0,y0-.055,z0),(x0+w0,y0+.055,z0),(x0-w0,y0+.055,z0),(x1-w1,y1-.045,z1),(x1+w1,y1-.045,z1),(x1+w1,y1+.045,z1),(x1-w1,y1+.045,z1)]
    return mesh_object(name,root,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,.012)


def hildegard(root):
    x=root.location.x
    tapered_form('rook__authored_armored_torso',root,(x,0),(.225,.285,.245),(.145,.18,.145),(.91,1.18,1.39),'steel')
    tapered_form('rook__authored_left_greave',root,(x-.19,-.015),(.075,.095,.105),(.075,.085,.09),(.12,.31,.47),'steel'); tapered_form('rook__authored_right_greave',root,(x+.19,-.015),(.075,.095,.105),(.075,.085,.09),(.12,.31,.47),'steel')
    limb('rook__authored_sword_arm',root,x-.27,0,1.30,x-.39,-.02,.88,.09,.065,'steel'); limb('rook__authored_shield_arm',root,x+.27,0,1.29,x+.42,.03,.99,.09,.07,'steel')
    face_planes('rook',root,'skin3',.115,.175,.145)
    verts=[(x-.035,.02,1.93),(x+.035,.02,1.93),(x+.025,.03,2.18),(x-.025,.03,2.18),(x-.035,.12,1.93),(x+.035,.12,1.93),(x+.025,.11,2.18),(x-.025,.11,2.18)]
    mesh_object('rook__authored_helmet_crest',root,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2),(0,3,7,4)],'red')


def aziz(root):
    x=root.location.x
    tapered_form('bishop__authored_scholar_torso',root,(x,0),(.22,.29,.205),(.14,.17,.13),(.86,1.12,1.38),'green')
    limb('bishop__authored_lantern_arm',root,x-.25,0,1.28,x-.36,-.03,.91,.075,.055,'ochre'); limb('bishop__authored_scroll_arm',root,x+.25,0,1.28,x+.33,-.08,1.02,.075,.055,'green')
    face_planes('bishop',root,'skin2',.105,.165,.135)
    verts=[(x-.35,-.12,1.36),(x+.31,-.12,1.34),(x+.25,-.20,1.19),(x+.04,-.23,1.12),(x-.22,-.20,1.18),(x-.31,.10,1.34),(x+.28,.10,1.32),(x+.22,.08,1.18),(x+.02,.07,1.13),(x-.20,.08,1.18)]
    mesh_object('bishop__authored_layered_mantle',root,verts,[(0,1,2,3,4),(5,9,8,7,6),(0,5,6,1),(1,6,7,2),(2,7,8,3),(3,8,9,4),(4,9,5,0)],'ochre')


def faust(root):
    x=root.location.x
    tapered_form('knight__authored_lean_torso',root,(x,0),(.205,.255,.20),(.13,.155,.12),(.87,1.13,1.38),'brown')
    limb('knight__authored_vial_arm',root,x-.24,0,1.27,x-.34,-.10,.93,.07,.05,'brown'); limb('knight__authored_dagger_arm',root,x+.24,0,1.27,x+.39,.04,1.04,.07,.05,'dark')
    face_planes('knight',root,'skin',.10,.16,.14)
    verts=[(x-.31,-.14,1.34),(x+.20,-.16,1.31),(x+.15,-.22,1.18),(x-.04,-.24,1.13),(x-.34,-.18,1.22),(x-.28,.08,1.32),(x+.18,.07,1.29),(x+.13,.05,1.18),(x-.05,.04,1.14),(x-.30,.05,1.21)]
    mesh_object('knight__authored_asymmetric_cape',root,verts,[(0,1,2,3,4),(5,9,8,7,6),(0,5,6,1),(1,6,7,2),(2,7,8,3),(3,8,9,4),(4,9,5,0)],'dark')


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--blend',required=True); ap.add_argument('--glb',required=True); args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.open_mainfile(filepath=args.blend); roots={r:bpy.data.objects.get('ChroniclesParty__'+r) for r in ('rook','bishop','knight')}; assert all(roots.values()), roots
    hildegard(roots['rook']); aziz(roots['bishop']); faust(roots['knight'])
    for root in roots.values(): root['party_art']='authored-v8'
    bpy.context.scene['chronicles_party_asset_version']='chronicles-humanoid-party-v8'; bpy.context.scene['chronicles_party_visual_contract']='authored-humanoid-anatomy-v5'
    os.makedirs(os.path.dirname(os.path.abspath(args.glb)),exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=args.blend); bpy.ops.export_scene.gltf(filepath=args.glb,export_format='GLB',export_apply=True)

if __name__=='__main__': main()
