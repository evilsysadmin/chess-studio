#!/usr/bin/env python3
"""Fail CI when an authored Home Matthias routine destroys the readable pawn face."""
import math

import bpy
from mathutils import Vector

PROP_BONES = ("prop_book", "prop_cup", "prop_pen", "prop_bite")
EXPECTED_MID_PROPS = {
    "Idle": set(),
    "Speak": set(),
    "Think": set(),
    "Read": {"prop_book"},
    "Write": {"prop_book", "prop_pen"},
    "Dossier": {"prop_book"},
    "Sip": {"prop_cup"},
    "Bite": {"prop_bite"},
    "Sleep": set(),
}
ROUTINE_PREFIXES = (
    "RoutineBook",
    "RoutineCup",
    "RoutinePen",
    "RoutineSandwich",
)
FACE_INTRUSION_CANDIDATES = (
    "Upper arm.L", "Upper arm.R",
    "Forearm.L", "Forearm.R",
    "Hand.L", "Hand.R",
)
MAX_HEAD_ROTATION_DEG = 18.0
MAX_SPINE_ROTATION_DEG = 10.0
MAX_SPEAK_MOUTH_OFFSET = 0.026
PROP_VISIBLE_SCALE = 0.20
PROP_HIDDEN_SCALE = 0.02
UPPER_FACE_CLEARANCE = 0.012


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return tuple(
        (min(getattr(corner, axis) for corner in corners), max(getattr(corner, axis) for corner in corners))
        for axis in ("x", "y", "z")
    )


def world_center(obj):
    bounds = world_bounds(obj)
    return Vector(tuple((axis[0] + axis[1]) * .5 for axis in bounds))


def visible_scale(pose_bone):
    scale = pose_bone.scale
    return max(abs(scale.x), abs(scale.y), abs(scale.z))


def rotation_deg(pose_bone):
    e = pose_bone.rotation_euler
    return max(abs(math.degrees(e.x)), abs(math.degrees(e.y)), abs(math.degrees(e.z)))


def overlaps(a, b):
    return a[0] <= b[1] and b[0] <= a[1]


def sample_frames(action):
    start, end = (int(round(value)) for value in action.frame_range)
    span = max(1, end - start)
    return sorted({
        start,
        start + int(round(span * .25)),
        start + int(round(span * .50)),
        start + int(round(span * .75)),
        end,
    })


def set_action(scene, rig, action, frame):
    rig.animation_data.action = action
    scene.frame_set(frame)
    bpy.context.view_layer.update()


def assert_prop_visibility(rig, action_name, frame, expected_visible):
    for bone_name in PROP_BONES:
        scale = visible_scale(rig.pose.bones[bone_name])
        if bone_name in expected_visible:
            assert scale >= PROP_VISIBLE_SCALE, (
                f"{action_name}@{frame}: {bone_name} should be visible, scale={scale:.4f}"
            )
        else:
            assert scale <= PROP_HIDDEN_SCALE, (
                f"{action_name}@{frame}: {bone_name} leaked into routine, scale={scale:.4f}"
            )


def assert_upper_face_clear(objects, action_name, frame):
    head = objects["Head"]
    left_eye = objects["Eye.L"]
    right_eye = objects["Eye.R"]
    head_bounds = world_bounds(head)
    eye_bounds = [world_bounds(left_eye), world_bounds(right_eye)]
    eye_floor = min(bounds[2][0] for bounds in eye_bounds)
    eye_front = min(bounds[1][0] for bounds in eye_bounds)

    # Only geometry that is physically in front of the face and reaches the
    # eye/brow zone can obscure Matthias's identity. Lower-mouth props may
    # approach the authored bite/sip area without tripping this guard.
    guard_x = (head_bounds[0][0] + .08, head_bounds[0][1] - .08)
    guard_z = (eye_floor - UPPER_FACE_CLEARANCE, head_bounds[2][1])

    candidates = [
        obj for obj in objects.values()
        if obj.name.startswith(ROUTINE_PREFIXES) or obj.name in FACE_INTRUSION_CANDIDATES
    ]
    offenders = []
    for obj in candidates:
        bounds = world_bounds(obj)
        scale = max(abs(value) for value in obj.matrix_world.to_scale())
        if scale < PROP_HIDDEN_SCALE:
            continue
        in_front = bounds[1][0] <= eye_front + .025
        if in_front and overlaps(bounds[0], guard_x) and overlaps(bounds[2], guard_z):
            offenders.append(obj.name)
    assert not offenders, f"{action_name}@{frame}: upper face obscured by {sorted(offenders)}"


def main():
    scene = bpy.context.scene
    rig = bpy.data.objects.get("MatthiasRig")
    assert rig is not None, "missing MatthiasRig"
    assert rig.animation_data is not None, "MatthiasRig has no animation_data"

    objects = {obj.name: obj for obj in bpy.data.objects}
    for required in ("Head", "Eye.L", "Eye.R", *FACE_INTRUSION_CANDIDATES):
        assert required in objects, f"missing routine-clearance object: {required}"

    actions = {action.name: action for action in bpy.data.actions}
    assert set(EXPECTED_MID_PROPS) <= set(actions), (
        "missing routine actions",
        sorted(set(EXPECTED_MID_PROPS) - set(actions)),
    )

    for action_name, expected_mid in EXPECTED_MID_PROPS.items():
        action = actions[action_name]
        frames = sample_frames(action)
        start, middle, end = frames[0], frames[len(frames) // 2], frames[-1]

        set_action(scene, rig, action, start)
        assert_prop_visibility(rig, action_name, start, set())

        set_action(scene, rig, action, middle)
        assert_prop_visibility(rig, action_name, middle, expected_mid)

        for frame in frames:
            set_action(scene, rig, action, frame)
            assert rotation_deg(rig.pose.bones["head"]) <= MAX_HEAD_ROTATION_DEG, (
                f"{action_name}@{frame}: head pose too extreme"
            )
            assert rotation_deg(rig.pose.bones["spine"]) <= MAX_SPINE_ROTATION_DEG, (
                f"{action_name}@{frame}: spine pose too extreme"
            )
            assert_upper_face_clear(objects, action_name, frame)
            if action_name == "Speak":
                mouth_offset = rig.pose.bones["face_mouth"].location.length
                assert mouth_offset <= MAX_SPEAK_MOUTH_OFFSET, (
                    f"Speak@{frame}: mouth displacement {mouth_offset:.4f} destroys stern face"
                )

        set_action(scene, rig, action, end)
        assert_prop_visibility(rig, action_name, end, set())

    rig.animation_data.action = None
    scene.frame_set(1)
    bpy.context.view_layer.update()
    print(
        "Home Matthias routine gates OK | "
        f"actions={len(EXPECTED_MID_PROPS)} "
        f"head<={MAX_HEAD_ROTATION_DEG:.0f}deg "
        f"spine<={MAX_SPINE_ROTATION_DEG:.0f}deg"
    )


if __name__ == "__main__":
    main()
