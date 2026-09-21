import math
import bpy

PROP_BONES = ('prop_book', 'prop_cup', 'prop_pen', 'prop_bite')
HIDDEN_PROP_SCALE = (.001, .001, .001)
VISIBLE_PROP_SCALE = (1.0, 1.0, 1.0)


def action(rig, name, poses, total):
    a = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = a

    for p in rig.pose.bones:
        p.rotation_euler = (0, 0, 0)
        p.location = (0, 0, 0)
        p.scale = HIDDEN_PROP_SCALE if p.name in PROP_BONES else (1, 1, 1)
        p.keyframe_insert('rotation_euler', frame=1)
        p.keyframe_insert('location', frame=1)
        p.keyframe_insert('scale', frame=1)

    for item in poses:
        frame, rots, locs = item[:3]
        scales = item[3] if len(item) > 3 else None
        for bone, value in (rots or {}).items():
            rig.pose.bones[bone].rotation_euler = value
            rig.pose.bones[bone].keyframe_insert('rotation_euler', frame=frame)
        for bone, value in (locs or {}).items():
            rig.pose.bones[bone].location = value
            rig.pose.bones[bone].keyframe_insert('location', frame=frame)
        for bone, value in (scales or {}).items():
            rig.pose.bones[bone].scale = value
            rig.pose.bones[bone].keyframe_insert('scale', frame=frame)

    for p in rig.pose.bones:
        if p.name in PROP_BONES:
            p.scale = HIDDEN_PROP_SCALE
        p.keyframe_insert('rotation_euler', frame=total)
        p.keyframe_insert('location', frame=total)
        p.keyframe_insert('scale', frame=total)

    # Blender 5 layered Actions no longer expose Action.fcurves. Keyframes are
    # already Bezier by default there; retain the explicit legacy pass when the
    # collection exists so older supported Blender versions behave identically.
    for curve in getattr(a, 'fcurves', ()):
        for key in curve.keyframe_points:
            key.interpolation = 'BEZIER'
    return a


def show(bone):
    return {bone: VISIBLE_PROP_SCALE}


def hide(bone):
    return {bone: HIDDEN_PROP_SCALE}


def build_actions(rig):
    """Home Matthias routines.

    Neutral Matthias remains angry and rigid. Speak carries the strongest gesture
    because verbal roasting is the one context where he is allowed to vacilar.
    Reading, dossier, sipping and writing expose real Blender props through rig
    bone scale; the runtime does not synthesize fake DOM accessories.
    """
    d = math.radians
    specs = {
        'Idle': (112, [
            (28, {'spine': (d(.7), 0, d(-.7)), 'head': (d(-1), d(2.2), d(.8))}, {'root': (0, 0, .010)}),
            (56, {'spine': (d(-.3), 0, d(.5)), 'head': (d(.5), d(-1.6), d(-.6))}, {'root': (0, 0, -.004)}),
            (84, {'head': (d(-1.3), d(.2), d(.2))}, {'root': (0, 0, .006)}),
        ]),
        'Speak': (48, [
            (8, {'head': (d(-2), d(1), d(-1)), 'upper_arm.R': (d(-8), d(-2), d(12)), 'forearm.R': (d(-18), 0, d(-12))}, {'face_mouth': (0, 0, -.016)}),
            (16, {'head': (d(1), d(-1), d(.8)), 'upper_arm.R': (d(-4), d(1), d(8)), 'forearm.R': (d(-10), 0, d(7))}, {'face_mouth': (0, 0, .006)}),
            (26, {'head': (d(-1), d(.4), d(-.4)), 'forearm.L': (d(-7), 0, d(5))}, {'face_mouth': (0, 0, -.012)}),
            (36, {'head': (d(.5), d(-.5), d(.5)), 'forearm.R': (d(-14), 0, d(-8))}, {'face_mouth': (0, 0, .004)}),
        ]),
        'Think': (84, [
            (24, {'head': (d(7), d(-7), d(2)), 'forearm.R': (d(-42), d(-7), d(-14)), 'spine': (d(3), 0, d(-1))}, None),
            (58, {'head': (d(4), d(5), d(-2)), 'forearm.R': (d(-34), d(-4), d(-10))}, None),
        ]),
        'Read': (88, [
            (2, None, None, show('prop_book')),
            (26, {'head': (d(10), d(-3), d(1)), 'spine': (d(3.5), 0, 0), 'forearm.L': (d(-26), d(3), d(8)), 'forearm.R': (d(-26), d(-3), d(-8))}, None),
            (56, {'head': (d(12), d(2), d(-1)), 'spine': (d(4), 0, 0)}, None),
            (84, None, None, hide('prop_book')),
        ]),
        'Write': (72, [
            (2, None, None, {**show('prop_book'), **show('prop_pen')}),
            (18, {'head': (d(11), d(-5), d(1)), 'spine': (d(5), 0, d(-1)), 'forearm.R': (d(-38), d(-5), d(-12))}, None),
            (36, {'forearm.R': (d(-28), d(-3), d(-7))}, None),
            (54, {'forearm.R': (d(-40), d(-6), d(-13))}, None),
            (68, None, None, {**hide('prop_book'), **hide('prop_pen')}),
        ]),
        'Dossier': (80, [
            (2, None, None, show('prop_book')),
            (22, {'head': (d(11), d(5), d(-2)), 'spine': (d(4), 0, d(1)), 'forearm.L': (d(-28), 0, d(8))}, None),
            (52, {'head': (d(8), d(-5), d(2)), 'forearm.R': (d(-24), 0, d(-7))}, None),
            (76, None, None, hide('prop_book')),
        ]),
        'Sip': (72, [
            (2, None, None, show('prop_cup')),
            (18, {'forearm.R': (d(-46), d(-6), d(-16)), 'head': (d(-3), d(3), d(-1))}, None),
            (34, {'forearm.R': (d(-62), d(-8), d(-20)), 'head': (d(-2), d(2), d(-1))}, None),
            (52, {'forearm.R': (d(-15), 0, d(-6))}, None),
            (68, None, None, hide('prop_cup')),
        ]),
        'Bite': (74, [
            (2, None, None, show('prop_bite')),
            (18, {'forearm.L': (d(-42), d(6), d(14)), 'head': (d(-4), d(-4), d(1))}, None),
            (36, {'forearm.L': (d(-58), d(8), d(18)), 'head': (d(2), d(-2), d(1))}, None),
            (54, {'forearm.L': (d(-12), 0, d(4))}, None),
            (70, None, None, hide('prop_bite')),
        ]),
        'Sleep': (104, [
            (36, {'head': (d(11), d(-6), d(9)), 'spine': (d(5), 0, d(4))}, {'root': (0, 0, -.018)}),
            (72, {'head': (d(13), d(-5), d(10)), 'spine': (d(6), 0, d(5))}, {'root': (0, 0, -.026)}),
        ]),
    }

    made = [action(rig, name, poses, total) for name, (total, poses) in specs.items()]
    rig.animation_data.action = None
    for item in made:
        track = rig.animation_data.nla_tracks.new()
        track.name = item.name
        track.strips.new(item.name, 1, item)
    return made
