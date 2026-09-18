#!/usr/bin/env python3
"""Render the canonical Chronicles tactics dungeon look-development mock.

This is a deterministic Blender-authored review render for the tactical dungeon.
It intentionally renders the 3D world only: the runtime HTML HUD remains owned by
Chronicles UI and is not baked into the art.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SEED = 1488
random.seed(SEED)


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat_principled(name, base, rough=.6, metallic=0.0, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*base, 1)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metallic
    if emission is not None:
        for key in ("Emission Color", "Emission"):
            if key in bs.inputs:
                bs.inputs[key].default_value = (*emission, 1)
                break
        if "Emission Strength" in bs.inputs:
            bs.inputs["Emission Strength"].default_value = emission_strength
    return m


def mat_stone(name, dark=False, wet=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes.get("Principled BSDF")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 4.4 if dark else 6.2
    noise.inputs["Detail"].default_value = 10.0
    noise.inputs["Roughness"].default_value = .82
    noise.inputs["Distortion"].default_value = .15
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    if dark:
        ramp.color_ramp.elements[0].color = (.018, .020, .024, 1)
        ramp.color_ramp.elements[1].color = (.105, .090, .076, 1)
    else:
        ramp.color_ramp.elements[0].color = (.045, .045, .047, 1)
        ramp.color_ramp.elements[1].color = (.205, .175, .145, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .48
    bump.inputs["Distance"].default_value = .18
    obj = nt.nodes.new("ShaderNodeObjectInfo")
    obj_ramp = nt.nodes.new("ShaderNodeValToRGB")
    obj_ramp.color_ramp.elements[0].color = (.72, .72, .72, 1)
    obj_ramp.color_ramp.elements[1].color = (1.0, .96, .90, 1)
    tint = nt.nodes.new("ShaderNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(obj.outputs["Random"], obj_ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], tint.inputs[1])
    nt.links.new(obj_ramp.outputs["Color"], tint.inputs[2])
    nt.links.new(tint.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(bump.outputs["Normal"], bs.inputs["Normal"])
    bs.inputs["Roughness"].default_value = .48 if wet else .80
    if "Coat Weight" in bs.inputs:
        bs.inputs["Coat Weight"].default_value = .08 if wet else .0
    return m


def mat_wood():
    m = bpy.data.materials.new("DungeonWood")
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes.get("Principled BSDF")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 5.0
    noise.inputs["Detail"].default_value = 6.0
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 7.0
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = .55
    nt.links.new(noise.outputs["Fac"], mix.inputs[1])
    nt.links.new(wave.outputs["Color"], mix.inputs[2])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (.025, .012, .006, 1)
    ramp.color_ramp.elements[1].color = (.22, .075, .025, 1)
    nt.links.new(mix.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = .72
    return m


def finish(obj, material=None, bevel=.04, smooth=False):
    if material is not None and hasattr(obj.data, "materials"):
        obj.data.materials.append(material)
    if smooth and hasattr(obj.data, "polygons"):
        for p in obj.data.polygons:
            p.use_smooth = True
    if bevel and obj.type == "MESH":
        mod = obj.modifiers.new("Dungeon bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return obj


def cube(name, loc, scale, mat, rot=(0, 0, 0), bevel=.04):
    """Create a box from half-extents, matching the authored scene measurements."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = tuple(v * 2.0 for v in scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bevel, False)


def cyl(name, loc, radius, depth, mat, rot=(0, 0, 0), vertices=28, bevel=.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, mat, bevel, True)


def sphere(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, .015, True)


def point_light(name, loc, energy, color, radius=0.8):
    d = bpy.data.lights.new(name, "POINT")
    d.energy = energy
    d.color = color
    d.shadow_soft_size = radius
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    return o


def look_at(obj, target):
    v = Vector(target) - obj.location
    obj.rotation_euler = v.to_track_quat("-Z", "Y").to_euler()


def area_light(name, loc, energy, size, color, target):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy
    d.shape = "DISK"
    d.size = size
    d.color = color
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    return o


def material_bank():
    return {
        "stone": mat_stone("DungeonStone"),
        "stone_dark": mat_stone("DungeonStoneDark", dark=True),
        "floor": mat_stone("DungeonFloor", wet=True),
        "iron": mat_principled("DungeonIron", (.06, .065, .07), .30, .86),
        "steel": mat_principled("DungeonSteel", (.20, .23, .26), .23, .78),
        "brass": mat_principled("DungeonBrass", (.47, .25, .045), .24, .80),
        "black": mat_principled("DungeonBlack", (.006, .008, .010), .48, .42),
        "red": mat_principled("DungeonRed", (.38, .015, .010), .48, .05),
        "green": mat_principled("DungeonGreen", (.025, .18, .10), .68, 0),
        "skin": mat_principled("DungeonSkin", (.66, .45, .30), .72, 0),
        "ivory": mat_principled("DungeonIvory", (.70, .64, .48), .72, 0),
        "cloth_red": mat_principled("DungeonBannerRed", (.25, .018, .012), .84, 0),
        "cloth_blue": mat_principled("DungeonBannerBlue", (.018, .045, .11), .86, 0),
        "wood": mat_wood(),
        "highlight": mat_principled("DungeonHighlight", (.03, .27, .42), .36, .08, (.03, .32, .48), 2.5),
        "highlight_warm": mat_principled("DungeonHighlightWarm", (.50, .34, .12), .42, .02, (.68, .38, .08), 1.5),
        "flame": mat_principled("DungeonFlame", (1.0, .12, .008), .34, 0, (1.0, .11, .006), 4.5),
        "wax": mat_principled("DungeonWax", (.78, .62, .34), .66, 0),
    }


def tile(M, x, y, z=0.0, size=.98):
    zz = z + random.uniform(-.025, .025)
    rz = math.radians(random.uniform(-.5, .5))
    return cube(f"floor_{x}_{y}", (x, y, zz-.12), (size*.5, size*.5, .12), M["floor"], (0, 0, rz), .055)


def wall_block(M, x, y, z, sx=.5, sy=.5, sz=.33, dark=False):
    rot = (0, 0, math.radians(random.uniform(-.5, .5)))
    return cube("wall_block", (x+random.uniform(-.018, .018), y+random.uniform(-.018, .018), z),
                (sx, sy, sz), M["stone_dark" if dark else "stone"], rot, .075)


def wall_segment(M, x, y, length=4, axis="x", height=2.6):
    rows = int(height/.62)
    for r in range(rows):
        z = .30+r*.62
        for i in range(length*2):
            off = (i-(length*2-1)/2)*.5
            xx = x+off if axis == "x" else x
            yy = y if axis == "x" else y+off
            wall_block(M, xx, yy, z, .255 if axis == "x" else .50, .50 if axis == "x" else .255, .29, dark=(r % 3 == 2))


def pillar(M, x, y, h=3.1):
    cyl("pillar_base", (x, y, .18), .42, .36, M["stone_dark"], vertices=32, bevel=.055)
    cyl("pillar_shaft", (x, y, h*.48), .28, h-.55, M["stone"], vertices=24, bevel=.035)
    cyl("pillar_cap", (x, y, h-.12), .40, .26, M["stone_dark"], vertices=32, bevel=.055)


def arch(M, x, y, width=1.8, height=2.25, depth=.45):
    cube("arch_jamb_l", (x-width*.5, y, height*.42), (.23, depth*.5, height*.42), M["stone_dark"], bevel=.07)
    cube("arch_jamb_r", (x+width*.5, y, height*.42), (.23, depth*.5, height*.42), M["stone_dark"], bevel=.07)
    R = width*.62
    for i in range(9):
        a = math.pi*(i/8)
        xx = x+math.cos(a)*R
        zz = height*.68+math.sin(a)*R*.62
        cube("arch_block", (xx, y, zz), (.22, depth*.56, .22), M["stone"], (0, -a+math.pi/2, 0), .055)


def torch(M, x, y, z=1.55, wall_axis="x"):
    rot = (0, math.radians(90), 0) if wall_axis == "x" else (math.radians(90), 0, 0)
    cyl("torch_handle", (x, y, z-.20), .045, .50, M["iron"], rot, bevel=.012)
    cyl("torch_bowl", (x, y, z+.08), .11, .08, M["brass"], bevel=.015)
    sphere("torch_flame", (x, y, z+.26), (.09, .09, .20), M["flame"])
    point_light("torch_light", (x, y, z+.33), 620, (1.0, .24, .055), .72)


def banner(M, x, y, z, blue=False):
    cube("banner", (x, y, z), (.34, .025, .74), M["cloth_blue" if blue else "cloth_red"], bevel=.02)
    cube("banner_mark_v", (x, y-.032, z), (.035, .018, .28), M["brass"], bevel=.01)
    cube("banner_mark_h", (x, y-.034, z+.08), (.18, .018, .035), M["brass"], bevel=.01)


def crate(M, x, y, z=.42, scale=.55):
    cube("crate_body", (x, y, z), (scale, scale, scale), M["wood"], bevel=.035)
    for dz in (-.42, .42):
        cube("crate_sl", (x, y-.57*scale, z+dz*scale), (.52*scale, .04*scale, .055*scale), M["iron"], bevel=.01)


def urn(M, x, y, z=.30):
    cyl("urn_base", (x, y, z-.18), .14, .10, M["brass"], vertices=24, bevel=.025)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, location=(x, y, z))
    o = bpy.context.object
    o.scale = (.24, .24, .32)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o, M["stone_dark"], .025, True)
    cyl("urn_neck", (x, y, z+.30), .10, .16, M["stone_dark"], vertices=24, bevel=.02)


def candles(M, x, y, z):
    for i, (dx, dy, h) in enumerate(((0, 0, .48), (.22, .03, .32), (-.18, .04, .38), (.08, .16, .25), (-.10, .14, .22))):
        cyl(f"candle_{i}", (x+dx, y+dy, z+h*.5), .06, h, M["wax"], vertices=24, bevel=.015)
        sphere(f"candle_flame_{i}", (x+dx, y+dy, z+h+.08), (.035, .035, .09), M["flame"])
        point_light(f"candle_light_{i}", (x+dx, y+dy, z+h+.10), 110, (1.0, .30, .08), .35)


def rubble(M, cx, cy, n=20, r=.85):
    for i in range(n):
        a = random.random()*math.tau
        rr = random.random()*r
        s = random.uniform(.05, .18)
        cube(f"rubble_{i}", (cx+math.cos(a)*rr, cy+math.sin(a)*rr, s*.48),
             (s, s*random.uniform(.5, 1.3), s*random.uniform(.4, .9)),
             M["stone_dark"], rot=(random.random(), random.random(), random.random()), bevel=.025)


def tile_outline(M, x, y, warm=False):
    m = M["highlight_warm" if warm else "highlight"]
    z = .032
    t = .035
    cube("tile_edge", (x, y-.47, z), (.47, t, .025), m, bevel=.012)
    cube("tile_edge", (x, y+.47, z), (.47, t, .025), m, bevel=.012)
    cube("tile_edge", (x-.47, y, z), (t, .47, .025), m, bevel=.012)
    cube("tile_edge", (x+.47, y, z), (t, .47, .025), m, bevel=.012)


def parent_keep_world(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world
    return obj


def pawn_piece(M, x, y, z=.15, black=False, red_rings=False, tilt=0):
    root = bpy.data.objects.new("pawn_root", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, z)
    mat = M["black"] if black else M["ivory"]
    for name, zz, r, d in (("base", .08, .32, .12), ("foot", .20, .26, .16), ("body", .45, .18, .48), ("collar", .72, .22, .09)):
        o = cyl("pawn_"+name, (x, y, z+zz), r, d, mat, vertices=32, bevel=.035)
        parent_keep_world(o, root)
    h = sphere("pawn_head", (x, y, z+.96), (.19, .19, .19), mat)
    parent_keep_world(h, root)
    if red_rings:
        for zz, rr in ((.42, .205), (.68, .235)):
            o = cyl("red_ring", (x, y, z+zz), rr, .045, M["red"], vertices=32, bevel=.02)
            parent_keep_world(o, root)
    root.scale = (.84, .84, .84)
    if tilt:
        root.rotation_euler = (0, math.radians(tilt), 0)
    return root


def humanoid(M, x, y, z=.10, green=False, sleep=False, armored=False, plume=False):
    root = bpy.data.objects.new("humanoid_root", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, z)
    torso_mat = M["steel"] if armored else (M["green"] if green else M["stone_dark"])
    skin = M["skin"]
    body = cyl("hero_body", (x, y, z+.75), .24, .65, torso_mat, vertices=28, bevel=.035)
    parent_keep_world(body, root)
    head = sphere("hero_head", (x, y-.02, z+1.25), (.22, .20, .23), skin)
    parent_keep_world(head, root)
    cap = cyl("hero_cap", (x, y, z+1.47), .24, .08, M["ivory" if green else "black"], vertices=28, bevel=.025)
    parent_keep_world(cap, root)
    if plume:
        p = cyl("hero_plume", (x, y, z+1.69), .045, .34, M["red"], rot=(0, math.radians(18), 0), vertices=16, bevel=.02)
        parent_keep_world(p, root)
    for side in (-1, 1):
        leg = cyl("hero_leg", (x+side*.11, y, z+.28), .07, .38, M["iron"], vertices=20, bevel=.018)
        parent_keep_world(leg, root)
        arm_mat = M["steel"] if armored else torso_mat
        arm = cyl("hero_arm", (x+side*.33, y-.02, z+.78), .065, .45, arm_mat,
                  rot=(0, math.radians(12*side), 0), vertices=20, bevel=.018)
        parent_keep_world(arm, root)
    if green:
        staff = cyl("hero_staff", (x+.42, y-.03, z+.78), .035, 1.35, M["brass"], vertices=18, bevel=.012)
        parent_keep_world(staff, root)
        orb = sphere("hero_orb", (x+.42, y-.03, z+1.49), (.10, .10, .10), M["brass"])
        parent_keep_world(orb, root)
    if armored:
        chest = cube("hero_chest", (x, y-.20, z+.80), (.22, .06, .26), M["steel"], bevel=.055)
        parent_keep_world(chest, root)
    if sleep:
        root.rotation_euler = (
            math.radians(random.uniform(68, 86)),
            math.radians(random.uniform(-12, 12)),
            math.radians(random.uniform(-24, 24)),
        )
    return root

def zzz(M, x, y, z):
    for i in range(3):
        curve = bpy.data.curves.new(f"zzz_{i}", "FONT")
        curve.body = "Z"
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = .22+i*.06
        curve.extrude = .008
        o = bpy.data.objects.new(f"zzz_{i}", curve)
        bpy.context.collection.objects.link(o)
        o.location = (x+.10*i, y, z+.12*i)
        o.rotation_euler = (math.radians(72), 0, 0)
        curve.materials.append(M["ivory"])


def setup_scene(out):
    scene = bpy.context.scene
    prop = scene.bl_rna.properties["render"].fixed_type.properties["engine"]
    available = {item.identifier for item in prop.enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available else "BLENDER_EEVEE"
    scene.render.resolution_x = 1672
    scene.render.resolution_y = 941
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = out
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = int(os.environ.get("BLENDER_PREVIEW_SAMPLES", "48"))
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("DungeonWorld")
    scene.world.color = (.004, .003, .004)
    # Blender 5.2 compositor ownership changed; keep the lookdev render self-contained
    # and rely on emissive materials + physical lights instead of version-fragile glow nodes.
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = 0.85
    except Exception:
        pass
    camd = bpy.data.cameras.new("DungeonCamera")
    cam = bpy.data.objects.new("DungeonCamera", camd)
    bpy.context.collection.objects.link(cam)
    cam.location = (11.8, -14.0, 11.2)
    camd.type = "ORTHO"
    camd.ortho_scale = 10.7
    look_at(cam, (.2, .45, .65))
    scene.camera = cam
    return scene


def build(M):
    coords = []
    for y in range(-3, 5):
        for x in range(-4, 5):
            if y >= 3 and x > 2:
                continue
            if y == 2 and x in (2, 3):
                continue
            if y <= -2 and x < -3:
                continue
            coords.append((x, y))
    for x, y in coords:
        tile(M, x, y)

    wall_segment(M, -4.55, .6, 8, "y", 2.20)
    wall_segment(M, 0.0, 4.55, 8, "x", 2.05)
    wall_segment(M, 4.55, .8, 6, "y", 1.95)
    wall_segment(M, 2.0, 1.55, 4, "x", 1.55)
    wall_segment(M, 1.55, 3.2, 3, "y", 1.45)
    wall_segment(M, -1.8, -1.0, 3, "x", 1.20)
    arch(M, -1.0, 1.42, 1.55, 2.15, .62)
    pillar(M, -3.55, -1.20, 3.2)
    pillar(M, -3.55, 3.45, 3.0)
    pillar(M, 3.65, 3.55, 2.8)

    torch(M, -3.95, 1.20, 1.55, "y")
    torch(M, -.25, 4.15, 1.72, "x")
    torch(M, 3.90, 1.1, 1.65, "y")
    torch(M, -3.55, -.45, 1.4, "x")
    banner(M, -2.75, 4.18, 1.58, blue=True)
    banner(M, .35, 4.18, 1.58, blue=True)
    banner(M, -3.95, -1.0, 1.25, blue=False)
    crate(M, 2.85, .55, .38, .44)
    crate(M, 3.55, -2.0, .38, .40)
    urn(M, 2.35, .72, .28)
    candles(M, -3.20, -2.25, .02)
    rubble(M, 2.5, -1.45, 18, .95)
    rubble(M, 3.1, 2.3, 12, .72)
    rubble(M, -2.0, -1.85, 11, .65)

    tile_outline(M, -1.0, .52, warm=True)
    tile_outline(M, .15, -.55, False)
    tile_outline(M, 1.6, -1.8, False)

    humanoid(M, -1.0, .55, .10, green=True)
    pawn_piece(M, .15, -.55, .10, black=True)
    humanoid(M, -.20, -2.0, .10, sleep=True, armored=True)
    zzz(M, -.25, -2.1, 1.05)
    humanoid(M, 1.65, -1.75, .10, sleep=True, armored=True, plume=True)
    zzz(M, 1.65, -1.8, 1.05)
    humanoid(M, 2.65, -1.25, .10, sleep=True, armored=False, plume=True)
    zzz(M, 2.65, -1.25, 1.05)
    pawn_piece(M, 3.45, -1.35, .10, black=True, red_rings=True, tilt=-18)
    zzz(M, 3.45, -1.35, 1.25)

    cyl("fallen_shield", (1.35, -1.58, .16), .28, .08, M["steel"], rot=(math.radians(88), 0, 0), vertices=32, bevel=.025)
    cyl("fallen_spear", (.20, -1.78, .16), .025, 1.35, M["brass"], rot=(0, math.radians(72), 0), vertices=16, bevel=.01)

    area_light("DungeonKey", (-5.8, -6.5, 10.5), 760, 6.5, (.62, .70, .82), (0, 0, .6))
    area_light("DungeonFill", (5.5, -3.0, 7.5), 520, 5.4, (.16, .27, .46), (0, 0, .8))
    area_light("DungeonRim", (1.0, 6.0, 9.5), 690, 4.4, (1.0, .20, .05), (0, 1.0, 1.1))
    cube("void_floor", (0, 0, -1.35), (12, 12, .5), M["black"], bevel=0)


def main():
    a = args()
    out = os.path.abspath(a.output)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    clean()
    M = material_bank()
    scene = setup_scene(out)
    build(M)
    scene["chronicles_dungeon_mock"] = "canonical-lookdev-v1"
    scene["chronicles_dungeon_mock_seed"] = SEED
    bpy.ops.render.render(write_still=True)
    print("Chronicles dungeon mock:", out)


if __name__ == "__main__":
    main()
