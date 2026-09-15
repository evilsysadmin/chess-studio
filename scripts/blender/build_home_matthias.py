#!/usr/bin/env python3
"""Deterministically build the editable .blend and runtime .glb for Home Matthias."""
import argparse, os, sys
import bpy
from home_matthias_parts import build_character
from home_matthias_animations import build_actions

def args():
    p=argparse.ArgumentParser(); p.add_argument('--blend',required=True); p.add_argument('--glb',required=True)
    tail=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    return p.parse_args(tail)

def parent(path): os.makedirs(os.path.dirname(os.path.abspath(path)),exist_ok=True)

def main():
    a=args(); bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.context.scene.render.fps=24; rig=build_character(); build_actions(rig)
    parent(a.blend); parent(a.glb); bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.blend),compress=True)
    props=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw=dict(filepath=os.path.abspath(a.glb),export_format='GLB',export_animations=True,export_yup=True)
    if 'export_apply' in props: kw['export_apply']=True
    if 'export_animation_mode' in props: kw['export_animation_mode']='NLA_TRACKS'
    elif 'export_nla_strips' in props: kw['export_nla_strips']=True
    if 'export_optimize_animation_size' in props: kw['export_optimize_animation_size']=True
    bpy.ops.export_scene.gltf(**kw)
    print('canonical Blender Matthias:',a.blend,a.glb)
if __name__=='__main__': main()
