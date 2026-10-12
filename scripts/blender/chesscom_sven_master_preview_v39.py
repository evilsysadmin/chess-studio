#!/usr/bin/env python3
"""Render eight QA-only views of an existing, hash-pinned SWAT model.

These are views of one immutable source, not animation or a sprite bank.
"""
from __future__ import annotations
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector

DIRECTIONS = ('N','NE','E','SE','S','SW','W','NW')
GIT_BLOB = '280b2776eee2af7e131db22dd7a32b1e99764a12'

def parse():
    p=argparse.ArgumentParser()
    p.add_argument('--source-glb',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,required=True)
    return p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

def verify(path):
    data=path.read_bytes()
    if data[:4]!=b'glTF': raise RuntimeError('invalid-GLB-header')
    actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if actual!=GIT_BLOB: raise RuntimeError('source-Git-blob-mismatch: '+actual)
    return {'git_blob':actual,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}

def face(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def light(name,location,energy,color,size,target):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy; data.color=color; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.location=location; face(obj,target)

def normalize_master(path):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    if not meshes: raise RuntimeError('missing-master-meshes')
    roots=[o for o in bpy.context.scene.objects if o.parent is None]
    root=bpy.data.objects.new('Sven_candidate_root',None)
    bpy.context.collection.objects.link(root)
    for obj in roots:
        if obj.type in ('CAMERA','LIGHT'): continue
        transform=obj.matrix_world.copy(); obj.parent=root; obj.matrix_world=transform
    for obj in list(bpy.context.scene.objects):
        if obj.type in ('CAMERA','LIGHT'): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.view_layer.update()
    points=[o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
    low=[min(p[i] for p in points) for i in range(3)]
    high=[max(p[i] for p in points) for i in range(3)]
    size=[high[i]-low[i] for i in range(3)]
    if not(.1<size[2]<100 and max(size[:2])>.05): raise RuntimeError('invalid-master-bounds:'+str(size))
    scale=1.78/size[2]
    root.scale=(scale,)*3
    root.location=(-scale*(low[0]+high[0])/2,-scale*(low[1]+high[1])/2,-scale*low[2])
    return root,{'mesh_count':len(meshes),'source_bounds':[low,high],'scale':scale}

def setup():
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.render.resolution_x=256; scene.render.resolution_y=384
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.film_transparent=True
    scene.view_settings.view_transform='Standard'
    if scene.world is None: scene.world=bpy.data.worlds.new('Sven_candidate_world')
    scene.world.use_nodes=True
    background=scene.world.node_tree.nodes.get('Background')
    if background:
        background.inputs['Color'].default_value=(.08,.12,.18,1)
        background.inputs['Strength'].default_value=.5
    target=(0.,0.,.9)
    data=bpy.data.cameras.new('Sven_candidate_camera'); data.type='ORTHO';data.ortho_scale=2.36
    obj=bpy.data.objects.new('Sven_candidate_camera',data)
    bpy.context.collection.objects.link(obj);obj.location=(3.,-5.3,3.0);face(obj,target)
    scene.camera=obj
    light('blue-key',(2.,1.,3.),400,(.4,.6,1.),3.,target)
    light('amber-fill',(-2.,-2.8,3.),550,(1.,.7,.4),2.5,target)
    light('rim',(1.,3.,2.5),280,(.65,.78,1.),2.,target)
    return scene

def main():
    args=parse();source=verify(args.source_glb)
    root,info=normalize_master(args.source_glb); scene=setup()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    previews={}
    for i,d in enumerate(DIRECTIONS):
        root.rotation_euler.z=i*math.pi/4
        bpy.context.view_layer.update()
        path=args.output_dir/f'sven-model-{d}.png'
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        data=path.read_bytes()
        if len(data)<1024:raise RuntimeError('empty-render:'+d)
        previews[d]={'file':path.name,'sha256':hashlib.sha256(data).hexdigest()}
    manifest={'identity':'chesscom-sven-model-candidate-v39','review_only':True,
              'NOT_a_production_sprite_bank':True,'source':source,'model':info,
              'size':[256,384],'blender':bpy.app.version_string,'directions':previews}
    (args.output_dir/'candidate-manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
    print('CHESSCOM_V39_CANDIDATE_ONLY',len(previews),source['sha256'])
if __name__=='__main__':main()
