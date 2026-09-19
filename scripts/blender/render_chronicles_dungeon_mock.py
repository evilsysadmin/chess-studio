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

    macro = nt.nodes.new("ShaderNodeTexNoise")
    macro.inputs["Scale"].default_value = 3.0 if dark else 4.0
    macro.inputs["Detail"].default_value = 5.0
    macro.inputs["Roughness"].default_value = .68
    macro.inputs["Distortion"].default_value = .12

    micro = nt.nodes.new("ShaderNodeTexNoise")
    micro.inputs["Scale"].default_value = 34.0
    micro.inputs["Detail"].default_value = 4.0
    micro.inputs["Roughness"].default_value = .62

    stain = nt.nodes.new("ShaderNodeTexNoise")
    stain.inputs["Scale"].default_value = 1.55
    stain.inputs["Detail"].default_value = 5.0
    stain.inputs["Roughness"].default_value = .72
    stain.inputs["Distortion"].default_value = .18

    mix_noise = nt.nodes.new("ShaderNodeMixRGB")
    mix_noise.blend_type = "MULTIPLY"
    mix_noise.inputs[0].default_value = .46
    nt.links.new(macro.outputs["Fac"], mix_noise.inputs[1])
    nt.links.new(micro.outputs["Fac"], mix_noise.inputs[2])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    if dark:
        ramp.color_ramp.elements[0].color = (.016, .020, .026, 1)
        ramp.color_ramp.elements[1].color = (.082, .074, .068, 1)
    else:
        ramp.color_ramp.elements[0].color = (.040, .045, .052, 1)
        ramp.color_ramp.elements[1].color = (.205, .178, .150, 1)

    obj = nt.nodes.new("ShaderNodeObjectInfo")
    obj_ramp = nt.nodes.new("ShaderNodeValToRGB")
    obj_ramp.color_ramp.elements[0].color = (.82, .82, .80, 1)
    obj_ramp.color_ramp.elements[1].color = (1.02, .98, .90, 1)

    tint = nt.nodes.new("ShaderNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0

    bump_mix = nt.nodes.new("ShaderNodeMixRGB")
    bump_mix.blend_type = "MULTIPLY"
    bump_mix.inputs[0].default_value = .58

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .41
    bump.inputs["Distance"].default_value = .048

    nt.links.new(mix_noise.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(obj.outputs["Random"], obj_ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], tint.inputs[1])
    nt.links.new(obj_ramp.outputs["Color"], tint.inputs[2])
    nt.links.new(tint.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(micro.outputs["Fac"], bump_mix.inputs[1])
    nt.links.new(macro.outputs["Fac"], bump_mix.inputs[2])
    nt.links.new(bump_mix.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bs.inputs["Normal"])

    bs.inputs["Roughness"].default_value = .34 if wet else .64
    if "Coat Weight" in bs.inputs:
        bs.inputs["Coat Weight"].default_value = .18 if wet else .015
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
        "flame": mat_principled("DungeonFlame", (1.0, .075, .003), .42, 0, (1.0, .018, .001), 1.15),
        "wax": mat_principled("DungeonWax", (.78, .62, .34), .66, 0),
        "wet_overlay": mat_principled("DungeonWetOverlay", (.018, .026, .032), .11, .08),
        "moss": mat_principled("DungeonMoss", (.030, .075, .045), .92, 0),
    }




def tile(M, x, y, z=0.0, size=.96):
    zz = z + random.uniform(-.018, .018)
    rz = math.radians(random.uniform(-.26, .26))
    slab = cube(f"floor_{x}_{y}", (x, y, zz-.10), (size*.5, size*.5, .10), M["floor"], (0, 0, rz), .026)
    if random.random() < .24:
        angle = math.radians(random.choice((-31, -17, 19, 37)))
        length = random.uniform(.12, .28)
        cube("floor_crack", (x+random.uniform(-.18,.18), y+random.uniform(-.18,.18), zz+.010),
             (length, .004, .004), M["stone_dark"], (0, 0, angle), .001)
    return slab


def wall_block(M, x, y, z, sx=.5, sy=.5, sz=.33, dark=False):
    rot = (math.radians(random.uniform(-.30,.30)),
           math.radians(random.uniform(-.30,.30)),
           math.radians(random.uniform(-.65,.65)))
    jx = random.uniform(.94, 1.04)
    jy = random.uniform(.94, 1.04)
    jz = random.uniform(.94, 1.035)
    return cube("wall_block",
                (x+random.uniform(-.022,.022), y+random.uniform(-.022,.022), z+random.uniform(-.012,.012)),
                (sx*jx, sy*jy, sz*jz), M["stone_dark" if dark else "stone"], rot, .034)


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
    cyl("torch_handle", (x, y, z-.22), .035, .48, M["iron"], rot, bevel=.010)
    cyl("torch_bowl", (x, y, z+.035), .105, .075, M["brass"], bevel=.012)
    bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=.072, radius2=.008, depth=.27,
                                    location=(x, y, z+.21))
    flame = bpy.context.object
    flame.name = "torch_flame"
    finish(flame, M["flame"], .009, True)
    point_light("torch_light", (x, y, z+.28), 224, (1.0, .22, .055), .52)


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
        point_light(f"candle_light_{i}", (x+dx, y+dy, z+h+.10), 48, (1.0, .30, .08), .35)


def rubble(M, cx, cy, n=20, r=.85):
    for i in range(n):
        a = random.random()*math.tau
        rr = random.random()*r
        s = random.uniform(.05, .18)
        cube(f"rubble_{i}", (cx+math.cos(a)*rr, cy+math.sin(a)*rr, s*.48),
             (s, s*random.uniform(.5, 1.3), s*random.uniform(.4, .9)),
             M["stone_dark"], rot=(random.random(), random.random(), random.random()), bevel=.025)


def floor_grate(M, x, y, z=.045, size=.70):
    frame = size * .5
    t = .035
    cube("grate_top", (x, y-frame, z), (frame, t, .025), M["iron"], bevel=.008)
    cube("grate_bottom", (x, y+frame, z), (frame, t, .025), M["iron"], bevel=.008)
    cube("grate_left", (x-frame, y, z), (t, frame, .025), M["iron"], bevel=.008)
    cube("grate_right", (x+frame, y, z), (t, frame, .025), M["iron"], bevel=.008)
    for i in range(-3, 4):
        off = i * size / 8
        cube("grate_bar_x", (x+off, y, z+.008), (.018, frame-.05, .018), M["iron"], bevel=.005)
        cube("grate_bar_y", (x, y+off, z+.010), (frame-.05, .014, .014), M["iron"], bevel=.004)


def puddle(M, x, y, sx=.55, sy=.32, z=.024):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=.012, location=(x, y, z))
    o = bpy.context.object
    o.name = "dungeon_puddle"
    o.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, M["wet_overlay"], .006, True)


def hanging_chain(M, x, y, z=2.25, links=7):
    for i in range(links):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=.075, minor_radius=.014,
            major_segments=16, minor_segments=8,
            location=(x, y, z-i*.135),
            rotation=(math.radians(90 if i % 2 == 0 else 0), 0, 0),
        )
        finish(bpy.context.object, M["iron"], .004, True)


def moss_patch(M, x, y, z=.028, sx=.26, sy=.10, angle=0):
    return cube("moss_patch", (x, y, z), (sx, sy, .006), M["moss"], (0, 0, math.radians(angle)), .004)


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
    trim_mat = M["brass"] if armored or green else M["iron"]

    pelvis = cube("hero_pelvis", (x, y, z+.54), (.20, .15, .13), torso_mat, bevel=.050)
    parent_keep_world(pelvis, root)
    chest = cube("hero_torso", (x, y, z+.87), (.25, .17, .28), torso_mat, bevel=.075)
    parent_keep_world(chest, root)
    belt = cube("hero_belt", (x, y-.175, z+.63), (.22, .028, .038), trim_mat, bevel=.012)
    parent_keep_world(belt, root)

    head = sphere("hero_head", (x, y-.02, z+1.29), (.205, .19, .22), M["skin"])
    parent_keep_world(head, root)
    neck = cyl("hero_neck", (x, y, z+1.09), .075, .13, M["skin"], vertices=22, bevel=.012)
    parent_keep_world(neck, root)
    cap = cyl("hero_cap", (x, y, z+1.47), .225, .075, M["ivory" if green else "black"], vertices=30, bevel=.022)
    parent_keep_world(cap, root)
    crown = sphere("hero_cap_crown", (x, y+.01, z+1.515), (.19,.18,.075), M["ivory" if green else "black"])
    parent_keep_world(crown, root)

    if plume:
        p = cyl("hero_plume", (x+.01, y, z+1.70), .038, .33, M["red"],
                rot=(0, math.radians(13), 0), vertices=16, bevel=.014)
        parent_keep_world(p, root)

    if armored:
        plate = cube("hero_breastplate", (x, y-.185, z+.90), (.205, .042, .205), M["steel"], bevel=.042)
        parent_keep_world(plate, root)
        for side in (-1, 1):
            paul = sphere("hero_pauldron", (x+side*.30, y, z+.99), (.12,.15,.10), M["steel"])
            parent_keep_world(paul, root)

    for side in (-1, 1):
        leg = cyl("hero_leg", (x+side*.12, y, z+.28), .064, .38, M["iron"], vertices=20, bevel=.014)
        parent_keep_world(leg, root)
        boot = cube("hero_boot", (x+side*.12, y-.055, z+.09), (.082,.13,.055), M["black"], bevel=.023)
        parent_keep_world(boot, root)
        arm_mat = M["steel"] if armored else torso_mat
        arm = cyl("hero_arm", (x+side*.31, y-.005, z+.87), .057, .34, arm_mat,
                  rot=(0, math.radians(side*12), 0), vertices=20, bevel=.014)
        parent_keep_world(arm, root)
        hand = sphere("hero_hand", (x+side*.36, y-.03, z+.71), (.060,.058,.066), M["skin"])
        parent_keep_world(hand, root)

    if green:
        coat_tail = cube("hero_coat_tail", (x, y+.115, z+.49), (.22,.055,.22), M["green"], bevel=.042)
        parent_keep_world(coat_tail, root)
        staff = cyl("hero_staff", (x+.42, y-.03, z+.78), .030, 1.35, M["brass"], vertices=18, bevel=.010)
        parent_keep_world(staff, root)
        orb = sphere("hero_orb", (x+.42, y-.03, z+1.49), (.095,.095,.095), M["brass"])
        parent_keep_world(orb, root)
    return root


def fallen_guard(M, x, y, plume=False, heading=0.0, dark=False):
    root = bpy.data.objects.new("fallen_guard_root", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, .08)
    root.rotation_euler = (0, 0, math.radians(heading))
    armor = M["stone_dark"] if dark else M["steel"]

    chest = cube("fallen_chest", (x, y, .27), (.30,.22,.16), armor, bevel=.075)
    parent_keep_world(chest, root)
    pelvis = cube("fallen_pelvis", (x-.31, y+.015, .22), (.18,.18,.13), M["iron"], bevel=.055)
    parent_keep_world(pelvis, root)
    head = sphere("fallen_head", (x+.40, y-.015, .25), (.16,.16,.16), M["skin"])
    parent_keep_world(head, root)
    helm = sphere("fallen_helm", (x+.43, y-.005, .30), (.18,.17,.115), M["black"])
    parent_keep_world(helm, root)
    brim = cyl("fallen_helm_brim", (x+.43, y-.005, .27), .19, .045, M["iron"], vertices=28, bevel=.018)
    parent_keep_world(brim, root)
    if plume:
        p = cyl("fallen_plume", (x+.49, y-.01, .43), .032, .27, M["red"],
                rot=(0, math.radians(58), 0), vertices=14, bevel=.012)
        parent_keep_world(p, root)

    for side, dy in ((-1,-.12),(1,.13)):
        thigh = cyl("fallen_leg", (x-.52, y+dy, .18), .070, .40, M["iron"],
                    rot=(0, math.radians(78), math.radians(side*8)), vertices=20, bevel=.014)
        parent_keep_world(thigh, root)
        boot = cube("fallen_boot", (x-.72, y+dy+side*.03, .16), (.13,.085,.060), M["black"],
                    rot=(0,0,math.radians(side*8)), bevel=.025)
        parent_keep_world(boot, root)

    arm1 = cyl("fallen_arm", (x+.02, y-.34, .24), .060, .43, armor,
               rot=(math.radians(78),0,math.radians(24)), vertices=20, bevel=.014)
    parent_keep_world(arm1, root)
    arm2 = cyl("fallen_arm", (x+.07, y+.31, .22), .060, .38, armor,
               rot=(math.radians(82),0,math.radians(-18)), vertices=20, bevel=.014)
    parent_keep_world(arm2, root)

    shield = cyl("fallen_shield", (x-.03, y+.42, .13), .27, .055, M["steel"],
                 rot=(math.radians(90),0,0), vertices=32, bevel=.022)
    parent_keep_world(shield, root)
    cross_v = cube("fallen_shield_mark_v", (x-.03, y+.45, .15), (.025,.012,.15), M["brass"], bevel=.008)
    parent_keep_world(cross_v, root)
    return root


def zzz(M, x, y, z):
    cam = bpy.context.scene.camera
    for i in range(3):
        curve = bpy.data.curves.new(f"zzz_{i}", "FONT")
        curve.body = "Z"
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = .20+i*.055
        curve.extrude = .010
        curve.bevel_depth = .004
        o = bpy.data.objects.new(f"zzz_{i}", curve)
        bpy.context.collection.objects.link(o)
        o.location = (x+.10*i, y-.03*i, z+.14*i)
        if cam is not None:
            direction = cam.location - o.location
            o.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        curve.materials.append(M["ivory"])




def floor_sigil(M, x, y, z=.018):
    # Thin inset brass/chalk geometry: readable tactical landmark, not UI.
    m = M["brass"]
    t = .014
    for dx, dy, sx, sy in (
        (0, -.34, .24, t), (0, .34, .24, t), (-.34, 0, t, .24), (.34, 0, t, .24),
        (0, -.15, .11, t), (0, .15, .11, t), (-.15, 0, t, .11), (.15, 0, t, .11),
    ):
        cube("floor_sigil", (x+dx, y+dy, z), (sx, sy, .006), m, bevel=.003)
    for a in (45, 135, 225, 315):
        r = math.radians(a)
        px, py = x+math.cos(r)*.42, y+math.sin(r)*.42
        cube("floor_sigil_tick", (px, py, z), (.10, t, .006), m, (0,0,r), .003)


def sword_prop(M, x, y, z=.10, angle=0.0):
    r = math.radians(angle)
    blade = cube("fallen_sword_blade", (x, y, z), (.38,.025,.018), M["steel"], (0,0,r), .008)
    hilt_x = x-math.cos(r)*.40
    hilt_y = y-math.sin(r)*.40
    cube("fallen_sword_guard", (hilt_x, hilt_y, z+.005), (.07,.018,.025), M["brass"], (0,0,r+math.pi/2), .006)
    cyl("fallen_sword_grip", (hilt_x-math.cos(r)*.10, hilt_y-math.sin(r)*.10, z), .022, .18,
        M["black"], rot=(0,math.radians(90),r), vertices=16, bevel=.006)
    return blade


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
    scene.world.color = (.004, .007, .012)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = 0.49
    except Exception:
        pass

    camd = bpy.data.cameras.new("DungeonCamera")
    cam = bpy.data.objects.new("DungeonCamera", camd)
    bpy.context.collection.objects.link(cam)
    cam.location = (11.2, -14.8, 12.6)
    camd.type = "ORTHO"
    camd.ortho_scale = 10.55
    look_at(cam, (.05, .35, .55))
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

    wall_segment(M, -4.55, .6, 8, "y", 2.30)
    wall_segment(M, 0.0, 4.55, 8, "x", 2.12)
    wall_segment(M, 4.55, .8, 6, "y", 2.02)
    wall_segment(M, 2.0, 1.55, 4, "x", 1.62)
    wall_segment(M, 1.55, 3.2, 3, "y", 1.52)
    wall_segment(M, -1.8, -1.0, 3, "x", 1.22)
    arch(M, -1.0, 1.42, 1.55, 2.15, .62)
    pillar(M, -3.55, -1.20, 3.15)
    pillar(M, -3.55, 3.45, 2.95)
    pillar(M, 3.65, 3.55, 2.75)

    torch(M, -3.95, 1.20, 1.55, "y")
    torch(M, -.25, 4.15, 1.72, "x")
    torch(M, 3.90, 1.1, 1.65, "y")
    torch(M, -3.55, -.45, 1.4, "x")
    banner(M, -2.75, 4.18, 1.52, blue=True)
    banner(M, .35, 4.18, 1.52, blue=True)
    banner(M, -3.18, -1.08, 1.22, blue=False)
    banner(M, 3.55, 1.36, 1.15, blue=True)

    crate(M, 2.85, .55, .38, .44)
    crate(M, 3.55, -2.0, .38, .40)
    crate(M, -3.42, -2.05, .30, .30)
    urn(M, 2.35, .72, .28)
    urn(M, 3.15, .82, .24)
    candles(M, -3.20, -2.25, .02)
    rubble(M, 2.5, -1.45, 24, 1.00)
    rubble(M, 3.1, 2.3, 15, .76)
    rubble(M, -2.0, -1.85, 15, .70)
    rubble(M, -3.65, .55, 10, .45)

    # Diegetic dungeon wear: subtle drainage, dampness and growth break the
    # tiled-board read without changing tactical geometry or silhouettes.
    floor_grate(M, 2.15, .55, size=.62)
    puddle(M, -.45, 2.18, .62, .24)
    puddle(M, 2.72, -.55, .42, .20)
    moss_patch(M, -2.55, 2.82, sx=.34, sy=.08, angle=-8)
    moss_patch(M, 3.18, .18, sx=.25, sy=.07, angle=12)
    hanging_chain(M, 3.78, 2.92, 2.36, 8)

    # Layered background architecture below the playable slab for cinematic depth.
    for dx, dy, h in ((-6.0, 2.8, 2.8), (-5.8, -1.5, 2.2), (5.9, 3.0, 2.5), (5.7, -1.8, 2.0)):
        pillar(M, dx, dy, h)
        point_light("distant_ember", (dx, dy, h*.72), 52, (1.0,.14,.035), .42)

    tile_outline(M, -1.0, .52, warm=True)
    tile_outline(M, .15, -.55, False)
    tile_outline(M, 1.6, -1.8, False)
    floor_sigil(M, 2.55, -.15)

    humanoid(M, -1.0, .55, .10, green=True)
    pawn_piece(M, .15, -.55, .10, black=True)

    fallen_guard(M, -.20, -2.0, plume=False, heading=-8)
    zzz(M, -.10, -1.95, .72)
    fallen_guard(M, 1.65, -1.75, plume=True, heading=10)
    zzz(M, 1.72, -1.72, .76)
    fallen_guard(M, 2.65, -1.25, plume=True, heading=-18, dark=True)
    zzz(M, 2.72, -1.22, .72)
    pawn_piece(M, 3.45, -1.35, .10, black=True, red_rings=True, tilt=-18)
    zzz(M, 3.45, -1.35, 1.18)

    cyl("fallen_shield", (1.35, -1.58, .16), .28, .08, M["steel"], rot=(math.radians(88), 0, 0), vertices=32, bevel=.025)
    cyl("fallen_spear", (.20, -1.78, .16), .025, 1.35, M["brass"], rot=(0, math.radians(72), 0), vertices=16, bevel=.01)
    sword_prop(M, 2.30, -2.05, .10, angle=-18)
    sword_prop(M, -.70, -1.72, .10, angle=16)

    # Cool ambient fill + warm practicals: torches should own the image.
    area_light("DungeonKey", (-5.8, -6.5, 10.5), 470, 7.2, (.36, .45, .60), (0, 0, .6))
    area_light("DungeonFill", (5.5, -3.0, 7.5), 625, 6.4, (.16, .27, .46), (0, 0, .8))
    area_light("DungeonTopFill", (.5, 2.0, 11.0), 250, 5.0, (.34, .42, .52), (0, .7, .6))
    area_light("DungeonRim", (1.0, 6.0, 9.5), 118, 5.2, (1.0, .23, .055), (0, 1.0, 1.1))
    area_light("DungeonStoneGraze", (5.8, 4.2, 5.2), 145, 4.0, (.18, .32, .52), (1.2, 1.2, .8))
    cube("void_floor", (0, 0, -1.35), (12, 12, .5), M["black"], bevel=0)


def main():
    a = args()
    out = os.path.abspath(a.output)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    clean()
    M = material_bank()
    scene = setup_scene(out)
    build(M)
    scene["chronicles_dungeon_mock"] = "canonical-lookdev-v2"
    scene["chronicles_dungeon_mock_seed"] = SEED
    bpy.ops.render.render(write_still=True)
    print("Chronicles dungeon mock:", out)


if __name__ == "__main__":
    main()
