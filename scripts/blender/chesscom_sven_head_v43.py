#!/usr/bin/env python3
"""Sven: FIRST-PARTY head study from approved Dust Veil art, NOT a character.
Eight honest Blender views, editable blend, GLB; never promotes to runtime.
"""
from __future__ import annotations
import argparse,hashlib,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector
DIRECTIONS=('N','NE','E','SE','S','SW','W','NW')

def mat(name,color,metal=0,rough=.8,cloth=False):
    m=bpy.data.materials.new('SvenHead_'+name);m.use_nodes=True
    node=m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*color,1)
    node.inputs['Metallic'].default_value=metal
    node.inputs['Roughness'].default_value=rough
    if cloth:
        noise=m.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value=160
        bump=m.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value=.13
        bump.inputs['Distance'].default_value=.002
        m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs['Normal'],node.inputs['Normal'])
    return m

def contour(name,rows,material):
    n=32;vertices=[];faces=[]
    for z,cx,cy,rx,ry in rows:
        for i in range(n):
            a=math.tau*i/n
            vertices.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z))
    for row in range(len(rows)-1):
        for i in range(n):
            j=(i+1)%n
            faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i))
    faces.extend((tuple(reversed(range(n))),tuple((len(rows)-1)*n+i for i in range(n))))
    data=bpy.data.meshes.new(name+'_mesh')
    data.from_pydata(vertices,[],faces);data.update()
    ob=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    for f in data.polygons:f.use_smooth=True
    return ob

def ellipsoid(name,xyz,scale,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=14,location=xyz)
    ob=bpy.context.object;ob.name=name;ob.scale=scale
    ob.data.materials.append(material)
    for face in ob.data.polygons:face.use_smooth=True
    return ob

def box(name,xyz,dims,material,bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz)
    ob=bpy.context.object;ob.name=name;ob.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=ob.modifiers.new('edge-softening','BEVEL')
    mod.width=bevel;mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.materials.append(material)
    return ob

def line(name,points,material,radius=.005):
    data=bpy.data.curves.new(name,'CURVE')
    data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=2
    spline=data.splines.new('POLY');spline.points.add(len(points)-1)
    for point,xyz in zip(spline.points,points):
        point.co=(*xyz,1)
    ob=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    return ob

def sculpt():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    P={
      'balaclava':mat('matte-balaclava',(.027,.039,.044),cloth=True,rough=.90),
      'cloth':mat('blue-black-fabric',(.055,.104,.123),cloth=True,rough=.91),
      'helmet':mat('helmet-ceramic',(.10,.145,.151),metal=.12,rough=.60),
      'edge':mat('helmet-edge',(.21,.29,.31),metal=.26,rough=.55),
      'skin':mat('exposed-eyes',(.48,.35,.24),rough=.82),
      'eye':mat('eye-white',(.58,.54,.46),rough=.74),
      'iris':mat('hazel',(.105,.076,.048),rough=.51),
      'metal':mat('steel-comm',(.071,.092,.097),metal=.58,rough=.48),
      'strap':mat('worn-webbing',(.105,.13,.132),cloth=True,rough=.9),
      'plate':mat('armor',(.088,.131,.148),metal=.12,rough=.65),
    }
    # Anatomical cheek/jaw/forehead silhouettes, explicitly lofted; not pills.
    contour('Sven43_neck',[(1.42,0,0,.094,.098),(1.48,0,0,.112,.104),
        (1.54,0,0,.129,.115)],P['balaclava'])
    contour('Sven43_anatomical-balaclava',[
        (1.513,0,-.006,.077,.090),(1.543,0,-.009,.105,.106),
        (1.585,0,-.008,.125,.122),(1.637,0,-.004,.140,.133),
        (1.701,0,0,.146,.138),(1.748,0,.005,.137,.120),
        (1.797,0,.008,.119,.109),(1.841,0,.009,.081,.080),
        (1.859,0,.010,.019,.025)],P['balaclava'])
    # Distinct exposed eye slit, individual eyelids/irises, covered nose.
    ellipsoid('Sven43_skin-bridge',(0,-.135,1.701),(.118,.020,.037),P['skin'])
    for sign in (-1,1):
        x=sign*.06
        ellipsoid('Sven43_eye_'+str(sign),(x,-.151,1.703),(.041,.016,.018),P['eye'])
        ellipsoid('Sven43_iris_'+str(sign),(x,-.165,1.702),(.011,.006,.013),P['iris'])
        line('Sven43_lid_'+str(sign),[(x-.040,-.158,1.714),
           (x-.016,-.172,1.722),(x+.02,-.170,1.721),
           (x+.040,-.156,1.713)],P['balaclava'],.0038)
        line('Sven43_mask-wrinkle_'+str(sign),[(sign*.026,-.142,1.630),
           (sign*.08,-.120,1.618),(sign*.119,-.074,1.630)],P['strap'],.0022)
        ellipsoid('Sven43_earcup_'+str(sign),(sign*.167,.014,1.649),
                  (.047,.065,.074),P['metal'])
        box('Sven43_helmet-rail_'+str(sign),(sign*.170,-.025,1.793),
            (.017,.138,.030),P['metal'],.006)
        line('Sven43_chin-webbing_'+str(sign),[
            (sign*.143,.019,1.746),(sign*.138,-.079,1.615),
            (sign*.074,-.096,1.550)],P['strap'],.008)
        for i in range(3):
            box(f'Sven43_rail-vent_{sign}_{i}',
                (sign*.182,-.063+i*.044,1.800),(.009,.015,.006),P['edge'],.002)
    contour('Sven43_mask-with-nose-profile',[
        (1.544,0,-.012,.101,.112),(1.593,0,-.012,.127,.128),
        (1.634,0,-.008,.133,.129),(1.660,0,0,.128,.126)],P['cloth'])
    ellipsoid('Sven43_nose-shaping',(0,-.135,1.649),(.031,.019,.035),P['cloth'])
    # Helmet dome has bespoke eight anatomical latitude rings, shell lip/NVG.
    contour('Sven43_molded-helmet',[
        (1.736,0,.004,.163,.151),(1.757,0,.010,.181,.167),
        (1.789,0,.019,.180,.164),(1.823,0,.023,.162,.154),
        (1.853,0,.027,.138,.139),(1.878,0,.03,.108,.109),
        (1.897,0,.030,.060,.063),(1.904,0,.030,.015,.021)],P['helmet'])
    line('Sven43_molded-brow',[
        (.178*math.cos(math.pi+i*math.pi/16),
         .012+.164*math.sin(math.pi+i*math.pi/16),1.761)
        for i in range(17)],P['edge'],.011)
    box('Sven43_folded-nvg-mount',(0,-.173,1.808),
        (.076,.032,.061),P['metal'],.006)
    box('Sven43_folded-nvg-bracket',(0,-.189,1.845),
        (.046,.028,.042),P['edge'],.005)
    line('Sven43_mic-boom',[(.173,-.012,1.651),(.166,-.117,1.632),
        (.128,-.170,1.605),(.070,-.183,1.602)],P['metal'],.008)
    ellipsoid('Sven43_mic-end',(.068,-.182,1.602),(.015,.012,.012),P['balaclava'])
    # Cowl only: this is a study, NOT an entire fake rigged operative.
    contour('Sven43_scout-cowl',[
        (1.36,0,.016,.246,.169),(1.397,0,.009,.260,.191),
        (1.449,0,0,.221,.170),(1.489,0,0,.149,.130)],P['cloth'])
    for sign in (-1,1):
        box('Sven43_collar-plate_'+str(sign),(sign*.175,-.135,1.400),
            (.142,.039,.066),P['plate'],.012)
    return P

def orient(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def render(output):
    palette=sculpt();output.mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=512;scene.render.resolution_y=512
    scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='Standard'
    scene.world=bpy.data.worlds.new('Sven43-world')
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value=(.09,.13,.15,1)
    bg.inputs['Strength'].default_value=.8
    target=(0,0,1.662)
    for name,xyz,energy,col in [
        ('blue-key',(1.2,-1.5,2.3),100,(.65,.82,1)),
        ('amber-fill',(-1.4,-1.2,1.9),80,(1,.77,.5)),
        ('blue-rim',(0,1.2,2.1),115,(.52,.75,1))]:
        light=bpy.data.lights.new(name,'AREA')
        light.size=1.6;light.energy=energy;light.color=col
        ob=bpy.data.objects.new(name,light)
        bpy.context.collection.objects.link(ob);ob.location=xyz;orient(ob,target)
    camdata=bpy.data.cameras.new('Sven43-review-camera')
    camdata.type='ORTHO';camdata.ortho_scale=.74
    cam=bpy.data.objects.new('Sven43-review-camera',camdata)
    bpy.context.collection.objects.link(cam);scene.camera=cam
    views={}
    for idx,direction in enumerate(DIRECTIONS):
        angle=idx*math.tau/8
        cam.location=(2.9*math.sin(angle),-2.9*math.cos(angle),1.88)
        orient(cam,target)
        file=output/f'sven-head-{direction}.png'
        scene.render.filepath=str(file)
        bpy.ops.render.render(write_still=True)
        data=file.read_bytes()
        if len(data)<1500:raise RuntimeError('empty-review-image:'+direction)
        views[direction]={'file':file.name,'sha256':hashlib.sha256(data).hexdigest()}
    if len(set(v['sha256'] for v in views.values()))!=8:raise RuntimeError('duplicate-views')
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'sven-head-v43.blend'))
    bpy.ops.export_scene.gltf(filepath=str(output/'sven-head-v43.glb'),
          export_format='GLB',export_animations=False,export_cameras=False,export_lights=False)
    glb=(output/'sven-head-v43.glb').read_bytes()
    record={'identity':'chesscom-sven-head-study-v43',
       'source':'original authored Blender geometry','reference':'chesscom-golden-art-v41',
       'head_only':True,'full_character':False,'animation_bank':False,
       'approved':False,'review_only':True,'materials':len(palette),
       'mesh_count':len([o for o in bpy.data.objects if o.type=='MESH']),
       'glb_sha256':hashlib.sha256(glb).hexdigest(),'directions':views}
    (output/'review.json').write_text(json.dumps(record,indent=2,sort_keys=True)+'\n')
    print('SVEN43_HEAD_ONLY_NOT_A_PRODUCTION_CHARACTER',record['mesh_count'])

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--output-dir',type=Path,required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    render(args.output_dir)
