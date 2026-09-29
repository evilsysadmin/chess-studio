#!/usr/bin/env python3
"""Build Chess Studio's independent PvP Duel Room shell.

The Duel Room is a medieval castle chamber authored specifically for human-vs-human
play. It deliberately reuses only the proven War Room board anchor, preview pieces,
camera plumbing and export helpers; the visible room is independent.

Blender owns the static room. The app owns clocks, player identity, turn state,
legal moves, overlays and all chess semantics.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_war_room_premium as base  # noqa: E402


CONTRACT = "pvp-duel-room-medieval-v1"
DUEL_WEATHER_MATERIALS = frozenset({
    "PVP_MAT_wall_stone",
    "PVP_MAT_floor_stone",
    "PVP_MAT_dais_stone",
})


def clear_inherited_room(static):
    """Keep only the proven camera from the inherited v2 shell."""
    for obj in list(static.objects):
        if obj.name == "WR_CAMERA_hero":
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def palette():
    return {
        "wall": base.material(
            "PVP_MAT_wall_stone", (0.22, 0.16, 0.105, 1),
            rough=0.84, texture="stone", scale=4.4, bump=0.075, weather=True,
        ),
        "floor": base.material(
            "PVP_MAT_floor_stone", (0.105, 0.115, 0.115, 1),
            rough=0.78, texture="stone", scale=4.8, bump=0.055, weather=True,
        ),
        "dais": base.material(
            "PVP_MAT_dais_stone", (0.29, 0.24, 0.17, 1),
            rough=0.68, coat=0.03, texture="stone", scale=3.8, bump=0.045, weather=True,
        ),
        "oak": base.material(
            "PVP_MAT_dark_oak", (0.080, 0.028, 0.010, 1),
            rough=0.40, coat=0.24, texture="wood", scale=2.2, bump=0.052,
        ),
        "oak_mid": base.material(
            "PVP_MAT_oak_mid", (0.16, 0.062, 0.018, 1),
            rough=0.39, coat=0.20, texture="wood", scale=2.6, bump=0.046,
        ),
        "iron": base.material(
            "PVP_MAT_black_iron", (0.018, 0.021, 0.024, 1),
            metal=0.82, rough=0.45, texture="metal", scale=26, bump=0.020,
        ),
        "brass": base.material(
            "PVP_MAT_old_brass", (0.48, 0.22, 0.045, 1),
            metal=0.90, rough=0.29, coat=0.14, texture="metal", scale=28, bump=0.014,
        ),
        "red": base.material(
            "PVP_MAT_banner_red", (0.30, 0.018, 0.012, 1),
            rough=0.72, sheen=0.18, texture="fabric", scale=46, bump=0.040,
        ),
        "blue": base.material(
            "PVP_MAT_banner_blue", (0.016, 0.060, 0.18, 1),
            rough=0.72, sheen=0.18, texture="fabric", scale=46, bump=0.040,
        ),
        "ivory": base.material(
            "PVP_MAT_ivory", (0.56, 0.46, 0.31, 1),
            rough=0.55, coat=0.05, texture="stone", scale=3.0, bump=0.025,
        ),
        "fire": bpy.data.materials["WR_MAT_fire_core"],
        "night": base.material(
            "PVP_MAT_moon_glass", (0.010, 0.035, 0.12, 1),
            rough=0.18, coat=0.42,
            emission=(0.014, 0.08, 0.28, 1), emission_strength=0.72,
        ),
    }


def cylinder_between(name, start, end, radius, material, owner, *, vertices=24):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = base.cylinder(name, (start + end) / 2.0, radius, direction.length,
                        material, owner, vertices=vertices)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def build_floor_and_dais(static, p):
    # Strong central axis: the player reads the board before the room.
    base.cube("PVP_ROOM_floor", (0, 0.8, -0.10), (8.6, 7.0, 0.10),
              p["floor"], static, bevel=0.035)
    for row in range(-5, 6):
        y = row * 1.08 + 0.65
        for col in range(-7, 8):
            x = col * 1.08
            if abs(x) > 7.95 or y < -4.75 or y > 6.05:
                continue
            inset = 0.505
            mat = p["dais"] if (row + col) % 7 == 0 else p["floor"]
            base.cube(
                f"PVP_ROOM_floor_tile_{row+5}_{col+7}", (x, y, 0.015),
                (inset, inset, 0.025), mat, static, bevel=0.015,
            )

    # Octagonal-looking raised stage assembled from a drum + brass rings.
    base.cylinder("PVP_DUEL_dais", (0, 0.0, 0.18), 4.35, 0.34,
                  p["dais"], static, vertices=8)
    base.torus("PVP_DUEL_dais_outer_brass", (0, 0.0, 0.365), 4.05, 0.055,
               p["brass"], static)
    base.torus("PVP_DUEL_dais_inner_brass", (0, 0.0, 0.372), 3.56, 0.025,
               p["brass"], static)

    # Two subtle approach runners imply two human sides without stealing space.
    for side, mat in ((-1, p["red"]), (1, p["blue"])):
        runner = base.cube(
            f"PVP_DUEL_runner_{'red' if side < 0 else 'blue'}",
            (side * 2.25, -4.20, 0.105),
            (0.82, 2.15, 0.025), mat, static, bevel=0.08,
        )
        runner.rotation_euler.z = math.radians(side * 4.5)


def build_architecture(static, p):
    # Rear masonry wall, buttresses and side walls. No foreground columns.
    base.cube("PVP_ROOM_rear_wall", (0, 6.52, 3.20), (8.7, 0.26, 3.30),
              p["wall"], static, bevel=0.05)
    base.cube("PVP_ROOM_left_wall", (-8.47, 0.85, 3.05), (0.25, 5.55, 3.15),
              p["wall"], static, bevel=0.05)
    base.cube("PVP_ROOM_right_wall", (8.47, 0.85, 3.05), (0.25, 5.55, 3.15),
              p["wall"], static, bevel=0.05)

    for side in (-1, 1):
        for idx, y in enumerate((-2.9, 0.2, 3.3)):
            x = side * 7.93
            base.cube(
                f"PVP_ROOM_buttress_{side}_{idx}", (x, y, 2.65),
                (0.42, 0.48, 2.72), p["wall"], static, bevel=0.10,
            )
            base.cylinder(
                f"PVP_ROOM_buttress_cap_{side}_{idx}", (x, y, 5.43),
                0.46, 0.18, p["brass"], static, vertices=8,
            )

    # Central pointed-window composition, assembled with a deep framed opening.
    base.cube("PVP_ROOM_window_reveal", (0, 6.18, 4.10), (2.12, 0.20, 2.10),
              p["oak"], static, bevel=0.22)
    base.cube("PVP_ROOM_window_glass", (0, 5.94, 4.10), (1.82, 0.035, 1.78),
              p["night"], static, bevel=0.16)
    for x in (-0.60, 0.60):
        base.cube(f"PVP_ROOM_window_mullion_{x:+.2f}", (x, 5.86, 4.10),
                  (0.055, 0.055, 1.68), p["brass"], static, bevel=0.018)
    base.cube("PVP_ROOM_window_transom", (0, 5.86, 4.28),
              (1.70, 0.055, 0.045), p["brass"], static, bevel=0.018)

    # Heavy oak lower panelling keeps the room castle-like and warm.
    for col in range(-6, 7):
        x = col * 1.22
        if abs(x) < 2.35:
            continue
        base.cube(
            f"PVP_ROOM_wainscot_{col+6}", (x, 6.15, 1.18),
            (0.54, 0.09, 1.02), p["oak_mid"], static, bevel=0.055,
        )


def build_duel_banners(static, p):
    # Rival banners flank the room and remain readable behind the board.
    for side, mat, label in ((-1, p["red"], "red"), (1, p["blue"], "blue")):
        x = side * 5.25
        banner = base.cube(
            f"PVP_DUEL_banner_{label}", (x, 5.85, 3.30),
            (1.02, 0.055, 1.70), mat, static, bevel=0.09,
        )
        banner.rotation_euler.y = math.radians(side * 2.0)
        base.cylinder(
            f"PVP_DUEL_banner_rail_{label}", (x, 5.78, 5.08),
            0.07, 2.45, p["brass"], static, vertices=24,
        ).rotation_euler.y = math.pi / 2
        # Minimal heraldry: crossed diagonal steel bars, not ornate mascots.
        for tilt in (-1, 1):
            bar = base.cube(
                f"PVP_DUEL_banner_mark_{label}_{tilt}", (x, 5.70, 3.44),
                (0.08, 0.035, 0.70), p["brass"], static, bevel=0.028,
            )
            bar.rotation_euler.y = math.radians(tilt * 38)


def build_sconces_and_gate(static, p):
    # Gate silhouette makes this feel like a guarded castle chamber rather than a lounge.
    for side in (-1, 1):
        x = side * 7.00
        for post in (-0.55, 0.55):
            base.cylinder(
                f"PVP_DUEL_gate_bar_{side}_{post:+.2f}",
                (x + post, 6.00, 1.55), 0.055, 2.80,
                p["iron"], static, vertices=16,
            )
        base.cube(
            f"PVP_DUEL_gate_lintel_{side}", (x, 6.00, 2.93),
            (0.78, 0.08, 0.08), p["iron"], static, bevel=0.025,
        )

    for side, x in (("left", -3.55), ("right", 3.55)):
        y, z = 6.00, 2.45
        base.cube(
            f"PVP_DUEL_sconce_{side}_plate", (x, y, z),
            (0.16, 0.06, 0.34), p["iron"], static, bevel=0.05,
        )
        base.cube(
            f"PVP_DUEL_sconce_{side}_flame", (x, y - 0.10, z + 0.05),
            (0.10, 0.07, 0.24), p["fire"], static, bevel=0.08,
        )
        lamp = base.light(
            f"PVP_LIGHT_sconce_{side}", "POINT", (x, y - 0.45, z + 0.10),
            120.0, (1.0, 0.34, 0.08), static, radius=1.00,
        )
        lamp["war_room_runtime_dynamic"] = "pvp-sconce"


def build_duelist_furniture(static, p):
    # Deliberately outside the board interaction cone; seats signal human opponents.
    for side, mat, label in ((-1, p["red"], "red"), (1, p["blue"], "blue")):
        x = side * 6.65
        y = -2.45
        base.cube(
            f"PVP_DUEL_seat_{label}", (x, y, 0.62),
            (0.68, 0.60, 0.16), p["oak"], static, bevel=0.13,
        )
        back = base.cube(
            f"PVP_DUEL_seat_back_{label}", (x, y + 0.47, 1.38),
            (0.72, 0.13, 0.82), mat, static, bevel=0.14,
        )
        back.rotation_euler.x = math.radians(-6)
        for sx in (-0.55, 0.55):
            base.cylinder(
                f"PVP_DUEL_seat_post_{label}_{sx:+.2f}",
                (x + sx, y + 0.46, 1.42), 0.055, 1.72,
                p["brass"], static, vertices=20,
            )


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "pvp-duel-room"
    scene["pvp_duel_room_contract"] = CONTRACT
    scene.view_settings.exposure = 0.16

    # Red-side warm key and blue-side moon key meet on the board.
    warm = base.light("PVP_LIGHT_warm_side", "AREA", (-5.2, -1.8, 7.6), 520.0,
                      (1.0, 0.40, 0.16), static, size=5.0)
    base.look_at(warm, (-0.5, 0.2, 1.0))
    cool = base.light("PVP_LIGHT_cool_side", "AREA", (5.2, -0.8, 7.8), 500.0,
                      (0.16, 0.34, 1.0), static, size=5.2)
    base.look_at(cool, (0.5, 0.2, 1.0))
    top = base.light("PVP_LIGHT_board_top", "AREA", (0, 1.0, 8.5), 270.0,
                     (0.95, 0.76, 0.48), static, size=4.8)
    base.look_at(top, (0, 0.2, 0.7))

    base.anchor("PVP_ANCHOR_red_identity", (-5.25, 5.60, 3.35), static)
    base.anchor("PVP_ANCHOR_blue_identity", (5.25, 5.60, 3.35), static)
    base.anchor("PVP_ANCHOR_room_status", (0, 5.65, 5.55), static)


def bake_weather():
    base.WEATHER_MATERIALS = DUEL_WEATHER_MATERIALS
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        if any(mat and mat.name in DUEL_WEATHER_MATERIALS for mat in obj.data.materials):
            base._bake_weather_colors(obj)


def apply_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("PvP Duel Room inherited static collection missing")
    clear_inherited_room(static)
    p = palette()
    build_floor_and_dais(static, p)
    build_architecture(static, p)
    build_duel_banners(static, p)
    build_sconces_and_gate(static, p)
    build_duelist_furniture(static, p)
    build_lighting(static)
    bake_weather()
    for obj in bpy.context.scene.objects:
        if obj.get("war_room_role"):
            obj["war_room_contract"] = CONTRACT
    bpy.context.scene["war_room_contract"] = CONTRACT


def validate_scene():
    names = {obj.name for obj in bpy.context.scene.objects}
    required = {
        "WR_ANCHOR_board_origin",
        "PVP_ROOM_floor",
        "PVP_DUEL_dais",
        "PVP_DUEL_banner_red",
        "PVP_DUEL_banner_blue",
        "PVP_ROOM_window_glass",
        "PVP_DUEL_seat_red",
        "PVP_DUEL_seat_blue",
        "PVP_ANCHOR_red_identity",
        "PVP_ANCHOR_blue_identity",
        "PVP_ANCHOR_room_status",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"PvP Duel Room contract objects missing: {missing}")
    forbidden = sorted(name for name in names if name.startswith(("WR_ARCH_", "WR_CANON_", "WR3_OBS_")))
    if forbidden:
        raise RuntimeError(f"PvP Duel Room inherited visible War Room geometry: {forbidden[:12]}")

    anchor = bpy.data.objects["WR_ANCHOR_board_origin"]
    if tuple(round(v, 3) for v in anchor.location) != (0.0, 0.0, round(base.BOARD_Z, 3)):
        raise RuntimeError(f"PvP Duel Room board anchor drift: {tuple(anchor.location)}")

    # Slightly steeper framing than standard War Room improves piece selection.
    camera = bpy.context.scene.camera
    camera.data.lens = 50.0
    camera.location = (0.0, -12.4, 8.15)
    base.look_at(camera, (0.0, 0.55, 1.32))


def export_shell(path):
    links, textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = links
    scene["war_room_runtime_texture_count"] = textures
    base.WEATHER_MATERIALS = DUEL_WEATHER_MATERIALS
    base.strip_unused_weather_layers()

    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in scene.objects:
        is_static = obj.type == "MESH" and obj.get("war_room_role") == base.ROLE_STATIC
        is_anchor = obj.type == "EMPTY" and obj.name.startswith("PVP_ANCHOR_")
        if is_static or is_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 80:
        raise RuntimeError(f"PvP Duel Room runtime selection too small: {selected}")

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        **base.meshopt_export_kwargs(),
    )
    patched = base.patch_runtime_glb_base_color_factors(path, factors)
    if patched < 12:
        raise RuntimeError(f"PvP Duel Room runtime factor patch too small: {patched}")
    data = base.read_glb_json(path)
    if base.MESH_COMPRESSION_EXTENSION not in set(data.get("extensionsUsed", [])):
        raise RuntimeError("PvP Duel Room runtime GLB missing meshopt")
    node_names = {row.get("name") for row in data.get("nodes", [])}
    for name in ("PVP_ANCHOR_red_identity", "PVP_ANCHOR_blue_identity", "PVP_ANCHOR_room_status"):
        if name not in node_names:
            raise RuntimeError(f"PvP Duel Room runtime anchor missing: {name}")


def main():
    opt = base.args()
    base.CONTRACT = CONTRACT
    base.wipe()
    base.build()
    base.validate()
    apply_identity()
    validate_scene()

    blend = Path(opt.blend)
    glb = Path(opt.glb)
    preview = Path(opt.preview)
    manifest = Path(opt.manifest)
    for path in (blend, glb, preview, manifest):
        path.parent.mkdir(parents=True, exist_ok=True)

    base.manifest(manifest)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    base.render(preview)
    export_shell(glb)
    print(f"PvP Duel Room OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
