#!/usr/bin/env python3
"""Build an ORIGINAL, review-only Sven tactical sculpt + real deform rig.

Design authority: user-approved 'Operación Dust Veil: Chesscom.png' V41.
NO generic SWAT pack, no AI faux frames, no default runtime replacement.
"""
from __future__ import annotations
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

PALETTE = {
    "cloth": "#233e4a", "dark_cloth": "#162833", "armour": "#293943",
    "armor_edge": "#47727d", "webbing": "#283a3c", "metal": "#1d292f",
    "metal_edge": "#526770", "gloves": "#162326", "boots": "#172125",
    "visor": "#0e1a20", "skin": "#a28469", "amber": "#986d4a",
}
BONES = [
    ("Pelvis", None, (0,0,.86), (0,0,1.04)),
    ("Spine", "Pelvis", (0,0,1.04), (0,-.01,1.23)),
    ("Chest", "Spine", (0,-.01,1.23), (0,-.04,1.45)),
    ("Neck", "Chest", (0,-.04,1.45), (0,-.04,1.57)),
    ("Head", "Neck", (0,-.04,1.57), (0,-.04,1.80)),
    ("LeftUpperArm", "Chest", (-.27,-.04,1.39), (-.35,-.22,1.25)),
    ("LeftForeArm", "LeftUpperArm", (-.35,-.22,1.25), (-.26,-.42,1.20)),
    ("LeftHand", "LeftForeArm", (-.26,-.42,1.20), (-.22,-.51,1.20)),
    ("RightUpperArm", "Chest", (.27,-.04,1.39), (.37,-.19,1.24)),
    ("RightForeArm", "RightUpperArm", (.37,-.19,1.24), (.21,-.37,1.18)),
    ("RightHand", "RightForeArm", (.21,-.37,1.18), (.15,-.47,1.18)),
    ("LeftUpperLeg", "Pelvis", (-.18,.015,.91), (-.30,-.12,.56)),
    ("LeftLowerLeg", "LeftUpperLeg", (-.30,-.12,.56), (-.29,-.17,.16)),
    ("LeftFoot", "LeftLowerLeg", (-.29,-.17,.16), (-.29,-.30,.06)),
    ("RightUpperLeg", "Pelvis", (.18,.015,.91), (.26,.12,.56)),
    ("RightLowerLeg", "RightUpperLeg", (.26,.12,.56), (.32,-.015,.16)),
    ("RightFoot", "RightLowerLeg", (.32,-.015,.16), (.32,-.18,.06)),
]


def material(name, color, metallic=0.0, roughness=.84):
    rgb = tuple(int(color[i:i+2],16)/255 for i in (1,3,5))
    mat = bpy.data.materials.new("SvenOwn_" + name)
    mat.diffuse_color = (*rgb, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def make_armature():
    arm_data = bpy.data.armatures.new("Sven_Original_Armature")
    arm = bpy.data.objects.new("SvenOriginalRig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, _, start, end in BONES:
        bone = arm_data.edit_bones.new(name)
        bone.head, bone.tail = start, end
        bone.use_deform = True
    for name, parent, _, _ in BONES:
        if parent:
            arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.select_set(False)
    return arm


def bind(obj, bone, rig, mat):
    obj.name = obj.name.replace("Sphere", "Sven")
    obj.data.materials.append(mat)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1., "REPLACE")
    mod = obj.modifiers.new("SvenDeformRig", "ARMATURE")
    mod.object = rig
    obj.parent = rig
    return obj


def blob(name, location, radius, bone, rig, mat, *, ends=None, segments=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = radius
    if ends is not None:
        vector = Vector(ends[1]) - Vector(ends[0])
        # Tapered sleeve/pant fabric should be continuous, not inflated pills.
        # Swap the temporary sphere for a soft-bevel 20-sided tapered limb.
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=radius[0]*.80,
                                        radius2=radius[0]*1.02,
                                        depth=vector.length+.10,
                                        location=(Vector(ends[1])+Vector(ends[0]))/2)
        obj=bpy.context.object
        obj.name=name
        obj.scale.y = radius[1]/radius[0]
        obj.rotation_mode="QUATERNION"
        obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(vector)
        soft=obj.modifiers.new("fabric-rounded-seams","BEVEL")
        soft.width=.03
        soft.segments=2
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=soft.name)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    return bind(obj,bone,rig,mat)


def bevel_box(name, location, scale, bone, rig, mat, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier=obj.modifiers.new("soft-profiles","BEVEL")
    modifier.width=bevel
    modifier.segments=2
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.shade_smooth()
    return bind(obj,bone,rig,mat)


def tailored_torso(name, rig, mat, *, armor=False):
    """One continuous, proportioned garment shell; avoid stacked-sphere toy chest."""
    profile = (
        (1.01,.277,.180),
        (1.075,.301,.190),
        (1.215,.345,.215),
        (1.36,.356,.211),
        (1.425,.289,.172),
    )
    segments=20
    vertices=[]
    for height,radius_x,radius_y in profile:
        for i in range(segments):
            angle=i*2*math.pi/segments
            vertices.append((radius_x*math.cos(angle),
                             -.017+radius_y*math.sin(angle),height))
    faces=[]
    faces.append(tuple(reversed(range(segments))))
    for ring in range(len(profile)-1):
        for i in range(segments):
            a=ring*segments+i
            b=ring*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
    data=bpy.data.meshes.new(name+"_mesh")
    data.from_pydata(vertices,[],faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    for polygon in data.polygons:
        polygon.use_smooth=True
    return bind(obj,"Spine",rig,mat)


def metal_rod(name, start, end, radius, rig, mat, bone="RightHand", vertices=12):
    vector=Vector(end)-Vector(start)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=vector.length,
                                         location=(Vector(start)+Vector(end))/2)
    obj=bpy.context.object
    obj.name=name
    obj.rotation_mode="QUATERNION"
    obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(vector)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return bind(obj,bone,rig,mat)


def build(out_dir):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in tuple(bpy.data.materials):
        bpy.data.materials.remove(mat)
    mats={name:material(name,value,.36 if name in ("metal","metal_edge") else 0.,
                        .58 if name in ("metal","metal_edge") else .87)
          for name,value in PALETTE.items()}
    rig=make_armature()
    # Human anatomy. All pieces have actual bone weights, no dead decorative rig.
    blob("SvenPelvis",(0,0,.93),(.295,.20,.19),"Pelvis",rig,mats["dark_cloth"])
    tailored_torso("SvenJacketTailored",rig,mats["cloth"])
    blob("SvenNeck",(0,-.04,1.50),(.117,.11,.095),"Neck",rig,mats["dark_cloth"])
    blob("SvenBalaclava",(0,-.044,1.668),(.154,.132,.194),"Head",rig,mats["gloves"])
    # Helmet sits over the balaclava. Matte rather than toy-like plastic.
    blob("SvenHelmetDome",(0,-.022,1.788),(.18,.157,.102),"Head",rig,mats["armour"])
    bevel_box("SvenHelmetLip",(0,-.145,1.733),(.26,.095,.036),"Head",rig,mats["armor_edge"],.013)
    # Eye slot and brows give a recognisable, human face beneath the helmet.
    bevel_box("SvenEyesSkin",(0,-.169,1.688),(.205,.025,.050),"Head",rig,mats["skin"],.012)
    for x in (-.060,.060):
        blob("SvenEye"+str(x),(x,-.183,1.695),(.018,.012,.014),"Head",rig,mats["visor"])
    bevel_box("SvenFaceMask",(0,-.161,1.606),(.22,.052,.081),"Head",rig,mats["gloves"],.02)
    # Sculpted lower body. Deliberately asymmetrical crouched rifle-ready pose.
    for side in ("Left","Right"):
        left=side=="Left"
        sign=-1 if left else 1
        top=(sign*.18,.015,.91)
        knee=(sign*(.30 if left else .26),-.12 if left else .12,.56)
        ankle=(sign*(.29 if left else .32),-.17 if left else -.015,.16)
        foot=(sign*(.29 if left else .32),-.30 if left else -.18,.06)
        blob(f"Sven{side}Thigh",(0,0,0),(.158,.152,1),
             f"{side}UpperLeg",rig,mats["cloth"],ends=(top,knee))
        blob(f"Sven{side}Shin",(0,0,0),(.124,.12,1),
             f"{side}LowerLeg",rig,mats["dark_cloth"],ends=(knee,ankle))
        blob(f"Sven{side}KneeArmour",knee,(.13,.115,.073),
             f"{side}LowerLeg",rig,mats["armour"])
        blob(f"Sven{side}Foot",foot,(.145,.22,.080),
             f"{side}Foot",rig,mats["boots"])
        # Legs have practical pouches, no floating badged RPG icons.
        blob(f"Sven{side}BootCuff",(ankle[0],ankle[1],.185),(.14,.12,.065),
             f"{side}LowerLeg",rig,mats["webbing"])
    for side in ("Left","Right"):
        bones={name:(Vector(a),Vector(b)) for name,_,a,b in BONES}
        upper=bones[f"{side}UpperArm"];fore=bones[f"{side}ForeArm"];hand=bones[f"{side}Hand"]
        blob(f"Sven{side}Sleeve",(0,0,0),(.125,.119,1),
             f"{side}UpperArm",rig,mats["cloth"],ends=upper)
        blob(f"Sven{side}Forearm",(0,0,0),(.103,.108,1),
             f"{side}ForeArm",rig,mats["dark_cloth"],ends=fore)
        blob(f"Sven{side}Glove",tuple(hand[1]),(.077,.067,.068),
             f"{side}Hand",rig,mats["gloves"])
        blob(f"Sven{side}ShoulderPad",tuple(upper[0]),(.15,.134,.115),
             f"{side}UpperArm",rig,mats["armour"])
    # Form-fitted tactical vest, one visual silhouette rather than LEGO boxes.
    bevel_box("SvenProtectiveVest",(0,-.188,1.260),(.585,.145,.383),"Chest",rig,mats["armour"],.050)
    for x in (-.17,0,.17):
        bevel_box(f"SvenVestPlate_{x}",(x,-.247,1.30),
                  (.132,.035,.155),"Chest",rig,mats["armor_edge"],.012)
    for x in (-.19,.0,.19):
        bevel_box(f"SvenChestMagazine_{x}",(x,-.263,1.132),
                  (.103,.072,.120),"Chest",rig,mats["webbing"],.014)
    for x in (-.19,.19):
        bevel_box(f"SvenThighPouch_{x}",(x,.192,.83),
                  (.16,.115,.165),"Pelvis",rig,mats["webbing"],.021)
    bevel_box("SvenRadio",( .323,.050,1.33),(.110,.105,.156),"Chest",rig,mats["metal"],.014)
    metal_rod("SvenRadioAntenna",(.33,.05,1.37),(.34,.05,1.59),.007,rig,mats["metal_edge"],"Chest")
    # Sculpt a real gun with stock, receiver, magazine, foregrip and long barrel.
    # Both hands are positioned at foregrip + pistol grip, not hovering at the sides.
    bevel_box("SvenCarbineReceiver",(0,-.45,1.178),(.19,.36,.13),"RightHand",rig,mats["metal"],.021)
    bevel_box("SvenCarbineStock",(.02,-.18,1.158),(.13,.23,.092),"RightHand",rig,mats["metal"],.014)
    bevel_box("SvenCarbineForeEnd",(0,-.735,1.178),(.103,.31,.102),"RightHand",rig,mats["metal_edge"],.015)
    metal_rod("SvenCarbineBarrel",(0,-.84,1.18),(0,-1.06,1.18),.027,rig,mats["metal"])
    metal_rod("SvenCarbineMuzzle",(0,-1.05,1.18),(0,-1.09,1.18),.041,rig,mats["metal_edge"])
    bevel_box("SvenCarbineMagazine",(.06,-.47,1.096),(.073,.082,.182),"RightHand",rig,mats["metal"],.009)
    bevel_box("SvenCarbineOptic",(0,-.47,1.288),(.087,.115,.079),"RightHand",rig,mats["visor"],.012)
    metal_rod("SvenCarbineSling",(-.065,-.24,1.15),(-.22,-.28,1.07),.010,rig,mats["webbing"])
    # Source is intentionally absent from Git; output GLB + editable .blend
    # as ephemeral workflow review artifacts until an artist accepts the look.
    out_dir.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "sven-owned-v42.blend"))
    bpy.ops.export_scene.gltf(filepath=str(out_dir / "sven-owned-v42.glb"),
                             export_format="GLB", export_animations=False)
    print("Sven original authored candidate generated. NOT APPROVED.")
    print(json.dumps({"bones":len(BONES),"object_count":len([o for o in bpy.data.objects if o.type=="MESH"]),
                      "blender":bpy.app.version_string,"review_only":True},sort_keys=True))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    build(args.output_dir)


if __name__=="__main__":
    main()
