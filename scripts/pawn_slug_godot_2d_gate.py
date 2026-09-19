#!/usr/bin/env python3
"""Keep Pawn Slug's Godot runtime strictly 2D and frame-driven.

The gate protects games/pawn-slug-godot from accidental 3D runtime assets and
also keeps Matthias on the Godot AnimatedSprite2D/SpriteFrames path.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
GODOT_ROOT = ROOT / "games/pawn-slug-godot"
MATTHIAS = GODOT_ROOT / "scripts/matthias_art.gd"
ENEMIES = GODOT_ROOT / "scripts/enemy_visual.gd"
ENVIRONMENT = GODOT_ROOT / "scripts/environment_visual.gd"
PARALLAX = GODOT_ROOT / "scripts/parallax_layer_visual.gd"
SETPIECES = GODOT_ROOT / "scripts/setpiece_visual.gd"
PAUSE_MENU = GODOT_ROOT / "scripts/pause_menu.gd"
MAIN = GODOT_ROOT / "scripts/main.gd"
PLAYER = GODOT_ROOT / "scripts/player.gd"
COMBAT_AUDIO = GODOT_ROOT / "scripts/combat_audio.gd"
BOSS = GODOT_ROOT / "scripts/boss_visual.gd"
TOUCH = GODOT_ROOT / "scripts/touch_controls.gd"
HUD = GODOT_ROOT / "scripts/hud_overlay.gd"
PLAYER_PROBE = GODOT_ROOT / "tests/player_probe.gd"
RUNTIME_SMOKE = GODOT_ROOT / "tests/player_runtime_smoke.gd"

TEXT_SUFFIXES = {".gd", ".tscn", ".tres", ".godot", ".cfg", ".svg", ".md"}
FORBIDDEN = (
    "blender",
    ".blend",
    "node3d",
    "meshinstance3d",
    "sprite3d",
    "skeleton3d",
    ".glb",
    ".gltf",
)
REQUIRED_MATTHIAS = (
    "AnimatedSprite2D",
    "SpriteFrames",
    "Marker2D",
    "HTTPRequest",
    "MASTER_URL",
    "LEGACY_PISTOL_ATLAS_URL",
    "/pawn-slug/matthias/master/matthias_canonical_sprite_sheet_v1-",
    "/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-",
    "V10_RUNTIME_PROMOTION_ENABLED := false",
    "V10_PISTOL_ATLAS_URL",
    "/pawn-slug-godot/matthias/strict-v10/pistol/matthias_pistol_godot_strict_12x9_256_v10-",
    "V10_ATLAS_COLUMNS := 12",
    "V10_ATLAS_ROWS := 9",
    "V10_ATLAS_CELL_SIZE := 256",
    "V10_BODY_SCALE := 0.74",
    "V10_PACKED_FOOT_Y := 232.0",
    '"run": {"row": 2, "count": 12',
    '"crouch_walk": {"row": 7, "count": 8',
    '"move_fire": {"row": 8, "count": 6',
    "_append_v10_locomotion_frames",
    "_ensure_v10_locomotion",
    '"locomotion-v10"',
    "V9_ATLAS_COLUMNS := 6",
    "V9_ATLAS_ROWS := 18",
    "V9_ATLAS_CELL_SIZE := 416",
    "V9_ATLAS_SIZE := Vector2i(",
    "/pawn-slug-godot/matthias/strict-v9/pistol/matthias_pistol_godot_strict_6x18_416_v9-",
    "/pawn-slug-godot/matthias/strict-v9/machinegun/matthias_machinegun_godot_strict_6x18_416_v9-",
    "/pawn-slug-godot/matthias/strict-v9/shotgun/matthias_shotgun_godot_strict_6x18_416_v9-",
    "/pawn-slug-godot/matthias/strict-v9/panzerfaust/matthias_panzerfaust_godot_strict_6x18_416_v9-",
    "V9_BODY_SCALE := 0.43",
    "V9_PACKED_FOOT_Y := 382.0",
    "V9_ACTIONS",
    '"crouch_walk": {"row": 7',
    '"shoot_up": {"row": 9',
    '"shoot_down": {"row": 10',
    '"shoot_diag_up": {"row": 11',
    '"shoot_diag_down": {"row": 13',
    '"shoot_crouch": {"row": 14',
    "_build_v9_frames",
    "_v9_muzzle_position",
    "V9_MUZZLE_LENGTH",
    "FULL_ATLAS_COLUMNS := 8",
    "FULL_ATLAS_ROWS := 11",
    "FULL_ATLAS_CELL_SIZE := 256",
    "FULL_ATLAS_SIZE := Vector2i(FULL_ATLAS_COLUMNS * FULL_ATLAS_CELL_SIZE, FULL_ATLAS_ROWS * FULL_ATLAS_CELL_SIZE)",
    "/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/",
    "matthias_pistol_godot_strict_8x11_256_v6.png",
    "matthias_machinegun_godot_strict_8x11_256_v6.png",
    "matthias_shotgun_godot_strict_8x11_256_v6.png",
    "matthias_panzerfaust_godot_strict_8x11_256_v6.png",
    "FULL_ATLAS_FALLBACK_URLS",
    "DIRECTIONAL_ATLAS_URLS",
    "matthias_pistol_directional_strict_v8.png",
    "matthias_machinegun_directional_strict_v8.png",
    "matthias_shotgun_directional_strict_v8.png",
    "matthias_panzerfaust_directional_strict_v8.png",
    "DIRECTIONAL_ATLAS_COLUMNS := 3",
    "DIRECTIONAL_ATLAS_ROWS := 4",
    "DIRECTIONAL_ATLAS_CELL_SIZE := 362",
    "_append_directional_atlas_frames",
    "_directional_body_y_for_cell",
    "DIRECTIONAL_SOURCE_RECTS",
    "_append_directional_source_frames",
    '"directional-v7-source"',
    "V7_SOURCE_SIZE",
    "_normalize_v7_source",
    "Image.INTERPOLATE_LANCZOS",
    '"full-v7-source"',
    '"shoot_up"',
    '"shoot_down"',
    '"shoot_crouch"',
    "FULL_ACTIONS",
    '"shoot": {"row": 6, "count": 6',
    '"die": {"row": 9, "count": 8',
    '"crouch": {"row": 10, "count": 1',
    "_normalized_cell_texture",
    "ImageTexture.create_from_image",
    "load_png_from_buffer",
    "load_webp_from_buffer",
    "animation_finished.connect",
    "_advance_locomotion",
    "_apply_locomotion_polish",
    "locomoting_now",
    "RUN_ENTER_SPEED_RATIO",
    "RUN_EXIT_SPEED_RATIO",
    "RUN_CYCLE_HZ_MIN",
    "RUN_CYCLE_HZ_MAX",
    "_cell_has_visible_pixels",
    "RUN_LEG_MOTION_MIN_SCORE",
    "_rendered_weapon",
    "_prefetch_machinegun",
    "_full_muzzle_positions_for_atlas",
    "_muzzle_from_full_cell",
    "RUN_FIRE_RECOIL_DEGREES",
    "MOVING_FIRE_RECOIL_BOOST",
    "MOVING_FIRE_FLASH_BOOST",
    "MOVING_FIRE_FLASH_SECONDS",
    "MOVING_FIRE_RECOIL_HOLD_SECONDS",
    "MOVING_FIRE_RECOIL_DECAY_PX",
    'name = "WeaponRoot"',
    "set_aim_direction",
    "_sync_aim_feedback",
    "_flash.rotation = local_aim.angle()",
    "SHOOT_FACE_REPAIR_SOURCE_FRAMES",
    "SHOOT_FACE_REPAIR_CUT_X",
    "_repair_distorted_shoot_frames",
    "set_climb_state",
    "_apply_climb_visual",

)
FORBIDDEN_MATTHIAS = (
    "MOTION_ATLAS_URL",
    "PISTOL_SHOOT_URL",
    "WEAPON_URLS",
    "res://assets/weapon_atlas.svg",
    "_pistol_shoot",
    "_draw_boot_fallback",
    "_install_combat_crouch",
    'frames.get_frame_texture("fall", 0)',
    "/pawn-slug/matthias/machinegun/",
    "/pawn-slug/matthias/shotgun/",
    "/pawn-slug/matthias/panzerfaust/",
)
REQUIRED_ENVIRONMENT = (
    "_draw_ground",
    "_draw_platforms",
    "_draw_obstacles",
    "_draw_foreground_props",
    "_draw_foreground_story_props",
    "_platform_specs",
    '"wood"',
    '"stone"',
    '"concrete"',
)
REQUIRED_PARALLAX = (
    "func _draw_sky",
    "func _draw_far_ridge",
    "func _draw_ruined_city",
    "func _draw_mid_defence",
    "func _noise",
)
REQUIRED_SETPIECE_VISUAL = (
    '"moving_platform"',
    '"bunker_turret"',
    '"convoy"',
    '"collapse_bridge"',
    '"waterfall"',
    '"tunnel_portal"',
    '"destructible_barricade"',
    '"destructible_platform"',
    '"artillery_barrage"',
    "func pulse_fire",
    "func set_destroyed",
    "func set_warning",
    "func _draw_collapse_bridge",
    "func _draw_waterfall",
    "func _draw_tunnel_portal",
    "func _draw_destructible_barricade",
    "func _draw_destructible_platform",
    "func _draw_artillery_barrage",
)
REQUIRED_SETPIECE_MAIN = (
    "SetpieceVisual",
    "_build_stage_setpieces",
    "_update_stage_setpieces",
    "_spawn_reinforcement_wave",
    "_update_bunker_turret",
    "_update_convoy_setpiece",
    "AnimatableBody2D.new()",
    "_moving_platform_rects",
    "_collapsing_platform_rects",
    "_dynamic_platform_rects",
    "_destructible_geometry_rects",
    "_damage_destructible_at",
    "_update_artillery_barrage",
    "PICKUP_SPAWN_SIZE",
    "_pickup_spawn_clear",
    "_resolve_pickup_spawn",
    '"state": "idle"',
    '"state"] = "falling"',
)

REQUIRED_PAUSE_MENU = (
    "PROCESS_MODE_ALWAYS",
    "KEY_ESCAPE",
    "DEFAULT_NATIVE_FULLSCREEN := false",
    "get_tree().paused = true",
    "get_tree().paused = false",
    "DisplayServer.WINDOW_MODE_FULLSCREEN",
    "DisplayServer.WINDOW_MODE_WINDOWED",
    "requestFullscreen",
    "exitFullscreen",
    "AudioServer.set_bus_volume_db",
    "ConfigFile",
    "JOY_BUTTON_START",
    "grab_focus",
)
REQUIRED_PARALLAX_MAIN = (
    "ParallaxLayerVisual",
    "Parallax2D.new()",
    "_build_parallax_backdrop",
    "scroll_scale",
)

REQUIRED_COMBAT_FX = (
    "muzzle_fx",
    "impact_fx",
    "_add_muzzle_fx",
    "_add_impact_fx",
    "_draw_projectile",
    "_draw_muzzle_flashes",
    "_draw_impacts",
    '"machinegun"',
    '"shotgun"',
    '"panzerfaust"',
)
REQUIRED_PLAYER_FEEL = (
    "signal landed",
    "landing_speed",
    "landed.emit",
)
REQUIRED_PLAYER_MOBILITY = (
    "signal fired(origin: Vector2, direction: Vector2",
    "STANDING_HITBOX_SIZE",
    "CROUCH_HITBOX_SIZE",
    "STAND_CLEARANCE_SIZE",
    "_set_crouching",
    "_can_stand",
    "_aim_direction",
    "_quantize_aim",
    "_find_safe_respawn_position",
    "_respawn_position_is_clear",
    "_find_ledge_climb_target",
    "_start_ledge_climb",
    "_update_ledge_climb",
    "LEDGE_DOUBLE_TAP_WINDOW",
    "LEDGE_CLIMB_DURATION",
    "combat_hitbox_rect",
    "_art.set_aim_direction(aim_direction)",
    "_update_fire_input(aim_direction: Vector2)",
    "KEY_SPACE",
)
REQUIRED_RUNTIME_PROBE = (
    'extends "res://scripts/player.gd"',
    "force_crouching",
    "can_stand_probe",
    "find_safe_respawn_probe",
    "respawn_position_is_clear_probe",
    "find_ledge_climb_target_probe",
    "start_ledge_climb_probe",
    "is_climbing_probe",
    "quantize_aim_probe",
)
REQUIRED_RUNTIME_SMOKE = (
    "crouch conserva la línea de pies",
    "Matthias no puede levantarse dentro de un techo bajo",
    "aim 8-way",
    "ledge climb detecta una cornisa alcanzable",
    "el segundo toque puede iniciar el estado de escalada",
    "checkpoint legacy de prueba está realmente bloqueado",
    "respawn final queda libre de geometría",
)

REQUIRED_CONTEXTUAL_MOVEMENT_HINT = (
    "contextual_movement_hint",
    "PLAYER_STANDING_HEIGHT",
    "PLAYER_CROUCH_HEIGHT",
    "MOVEMENT_HINT_LOOKAHEAD",
    "SPACE salta",
    "←/→ + ↑ FIRE diagonal",
    "↓ + MOVER",
)
REQUIRED_HUD_MOVEMENT_HINT = (
    'name = "MovementHintPanel"',
    'name = "MovementHint"',
    'has_method("contextual_movement_hint")',
    "_movement_hint_panel.visible",
)

REQUIRED_DIRECTIONAL_FIRE = (
    "func _on_player_fired(origin: Vector2, direction: Vector2",
    "safe_direction.rotated(angle)",
    "player.combat_hitbox_rect()",
    "func _kick_camera_for_weapon(weapon: String, direction: Vector2)",
)
REQUIRED_AUDIO = (
    "AudioStreamPlayer",
    "AudioStreamWAV",
    "PackedByteArray",
    "play_weapon",
    "play_impact",
    "play_explosion",
    "play_pickup",
    "play_hurt",
    "play_land",
    "_start_ambient",
    "_make_ambient_loop",
    "AudioStreamWAV.LOOP_FORWARD",
)
REQUIRED_FEEL = (
    "_kick_camera_for_weapon",
    "_add_camera_kick",
    "_update_camera_feel",
    "_prefers_reduced_motion",
    "combat_audio.play_weapon",
    "combat_audio.play_explosion",
)
REQUIRED_COMBAT_FAIRNESS = (
    "MAX_HOSTILE_PROJECTILES",
    "MAX_HOSTILE_EXPLOSIVES",
    "HOSTILE_FIRE_GAP",
    "_world_x_is_combat_visible",
    "_can_spawn_hostile_shot",
    "BOSS_SHELL_WINDUP",
    "checkpoint_changed",
    '_notify_parent("checkpoint")',
    "Consume the projectile before damage signals can mutate the whole",
)
REQUIRED_BOSS_TELEGRAPH = (
    "set_shell_telegraph",
    "_shell_telegraph",
    "draw_arc",
)
REQUIRED_TOUCH = (
    "DisplayServer.is_touchscreen_available",
    "DisplayServer.get_display_safe_area",
    "move_axis",
    "aim_vector",
    "crouch_pressed",
    "jump_pressed",
    "fire_pressed",
    "grenade_pressed",
    "pause_requested",
    "weapon_cycle_requested",
    "orientation_blocked",
    "GIRA EL MÓVIL",
    "view.y > view.x",
)
REQUIRED_MOBILE_PLAYER = (
    'get_node_or_null("TouchControls")',
    "cycle_weapon",
    "_touch_controls.move_axis",
    "_touch_controls.fire_pressed",
)
REQUIRED_MOBILE_PAUSE = (
    "toggle_pause",
    "screen.orientation.lock('landscape')",
    "screen.orientation.unlock",
)
REQUIRED_ENEMY_AI = (
    "_enemy_engaged",
    "_alert_enemies",
    "_raise_enemy_alarm",
    "_enemy_is_static_sentry",
    "idle_pose",
    "idle_reaction",
    "_enemy_weapon_standoff",
    "_grenade_evade_direction",
    "GUNFIRE_HEARING_RANGE",
    "GRENADE_EVADE_RADIUS",
    "SOLDIER_SPRINT_MULTIPLIER",
    "SOLDIER_BACKPEDAL_MULTIPLIER",
    "_enemy_has_line_of_sight",
    "_platform_blocks_line",
    "SUPPRESSION_PUSH_SECONDS",
    "SUPPRESSION_ASSAULT_STANDOFF_BONUS",
)

REQUIRED_ENEMIES = (
    "Sprite2D",
    "Marker2D",
    "HTTPRequest",
    "func set_idle_state",
    "func _draw_idle_prop",
    "res://assets/weapon_atlas.svg",
    "/pawn-slug/enemies/premium-raster/",
    "enemy_premium_raster_v5",
    "REMOTE_ATLAS_ROWS := 3",
    "load_webp_from_buffer",
    "ENEMY_VISUAL_SCALE",
    '"scout"',
    '"commando"',
    '"shield"',
)


class GateError(RuntimeError):
    pass


def source_files() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for path in GODOT_ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if "build" in path.relative_to(GODOT_ROOT).parts:
            continue
        files.append(path)
    return sorted(files)


def validate_contract(path: pathlib.Path, label: str, required: tuple[str, ...], violations: list[str]) -> None:
    if not path.is_file():
        violations.append(f"falta {path.relative_to(ROOT)}")
        return
    text = path.read_text(encoding="utf-8")
    for token in required:
        if token not in text:
            violations.append(f"{label} perdió contrato 2D requerido: {token}")
    if path == MATTHIAS:
        for token in FORBIDDEN_MATTHIAS:
            if token in text:
                violations.append(f"{label} reintrodujo identidad visual legacy: {token}")


def validate() -> None:
    if not GODOT_ROOT.is_dir():
        raise GateError(f"No existe Pawn Slug Godot: {GODOT_ROOT}")

    violations: list[str] = []
    for path in source_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        lowered = text.lower()
        for token in FORBIDDEN:
            if token in lowered:
                violations.append(f"{path.relative_to(ROOT)}: token prohibido {token!r}")

    validate_contract(MATTHIAS, "matthias_art.gd", REQUIRED_MATTHIAS, violations)
    validate_contract(ENEMIES, "enemy_visual.gd", REQUIRED_ENEMIES, violations)
    validate_contract(ENVIRONMENT, "environment_visual.gd", REQUIRED_ENVIRONMENT, violations)
    validate_contract(PARALLAX, "parallax_layer_visual.gd", REQUIRED_PARALLAX, violations)
    validate_contract(SETPIECES, "setpiece_visual.gd", REQUIRED_SETPIECE_VISUAL, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_SETPIECE_MAIN, violations)
    validate_contract(PAUSE_MENU, "pause_menu.gd", REQUIRED_PAUSE_MENU, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_PARALLAX_MAIN, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_COMBAT_FX, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_FEEL, violations)
    validate_contract(PLAYER, "player.gd", REQUIRED_PLAYER_FEEL, violations)
    validate_contract(PLAYER, "player.gd", REQUIRED_PLAYER_MOBILITY, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_DIRECTIONAL_FIRE, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_CONTEXTUAL_MOVEMENT_HINT, violations)
    validate_contract(HUD, "hud_overlay.gd", REQUIRED_HUD_MOVEMENT_HINT, violations)
    validate_contract(PLAYER_PROBE, "tests/player_probe.gd", REQUIRED_RUNTIME_PROBE, violations)
    validate_contract(RUNTIME_SMOKE, "tests/player_runtime_smoke.gd", REQUIRED_RUNTIME_SMOKE, violations)
    validate_contract(COMBAT_AUDIO, "combat_audio.gd", REQUIRED_AUDIO, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_COMBAT_FAIRNESS, violations)
    validate_contract(MAIN, "main.gd", REQUIRED_ENEMY_AI, violations)
    validate_contract(BOSS, "boss_visual.gd", REQUIRED_BOSS_TELEGRAPH, violations)
    validate_contract(TOUCH, "touch_controls.gd", REQUIRED_TOUCH, violations)
    validate_contract(PLAYER, "player.gd", REQUIRED_MOBILE_PLAYER, violations)
    validate_contract(PAUSE_MENU, "pause_menu.gd", REQUIRED_MOBILE_PAUSE, violations)

    if violations:
        raise GateError("\n".join(violations))


def self_test() -> None:
    assert "blender" in FORBIDDEN
    assert "node3d" in FORBIDDEN
    assert "AnimatedSprite2D" in REQUIRED_MATTHIAS
    assert "SpriteFrames" in REQUIRED_MATTHIAS
    assert "V9_ATLAS_COLUMNS := 6" in REQUIRED_MATTHIAS
    assert "V9_ATLAS_ROWS := 18" in REQUIRED_MATTHIAS
    assert "V9_ATLAS_CELL_SIZE := 416" in REQUIRED_MATTHIAS
    assert any("matthias_machinegun_godot_strict_6x18_416_v9-" in token for token in REQUIRED_MATTHIAS)
    assert "FULL_ATLAS_COLUMNS := 8" in REQUIRED_MATTHIAS
    assert "FULL_ATLAS_ROWS := 11" in REQUIRED_MATTHIAS
    assert "FULL_ATLAS_CELL_SIZE := 256" in REQUIRED_MATTHIAS
    assert "_advance_locomotion" in REQUIRED_MATTHIAS
    assert "locomoting_now" in REQUIRED_MATTHIAS
    assert "load_webp_from_buffer" in REQUIRED_MATTHIAS
    assert "WEAPON_URLS" in FORBIDDEN_MATTHIAS
    assert "/pawn-slug/matthias/machinegun/" in FORBIDDEN_MATTHIAS
    assert "_draw_obstacles" in REQUIRED_ENVIRONMENT
    assert "_draw_foreground_props" in REQUIRED_ENVIRONMENT
    assert "HTTPRequest" in REQUIRED_ENEMIES
    assert "/pawn-slug/enemies/premium-raster/" in REQUIRED_ENEMIES
    assert "PROCESS_MODE_ALWAYS" in REQUIRED_PAUSE_MENU
    assert "requestFullscreen" in REQUIRED_PAUSE_MENU
    assert "JOY_BUTTON_START" in REQUIRED_PAUSE_MENU
    assert "grab_focus" in REQUIRED_PAUSE_MENU
    assert "_draw_projectile" in REQUIRED_COMBAT_FX
    assert "_draw_muzzle_flashes" in REQUIRED_COMBAT_FX
    assert "_prefers_reduced_motion" in REQUIRED_FEEL
    assert "AudioStreamWAV" in REQUIRED_AUDIO
    assert "_make_ambient_loop" in REQUIRED_AUDIO
    assert "AudioStreamWAV.LOOP_FORWARD" in REQUIRED_AUDIO
    assert "landed.emit" in REQUIRED_PLAYER_FEEL
    assert "_find_safe_respawn_position" in REQUIRED_PLAYER_MOBILITY
    assert "_aim_direction" in REQUIRED_PLAYER_MOBILITY
    assert "safe_direction.rotated(angle)" in REQUIRED_DIRECTIONAL_FIRE
    assert "quantize_aim_probe" in REQUIRED_RUNTIME_PROBE
    assert "respawn final queda libre de geometría" in REQUIRED_RUNTIME_SMOKE
    assert "contextual_movement_hint" in REQUIRED_CONTEXTUAL_MOVEMENT_HINT
    assert '_movement_hint_panel.visible' in REQUIRED_HUD_MOVEMENT_HINT
    assert "_can_spawn_hostile_shot" in REQUIRED_COMBAT_FAIRNESS
    assert '_notify_parent("checkpoint")' in REQUIRED_COMBAT_FAIRNESS
    assert "_enemy_engaged" in REQUIRED_ENEMY_AI
    assert "GRENADE_EVADE_RADIUS" in REQUIRED_ENEMY_AI
    assert "_platform_blocks_line" in REQUIRED_ENEMY_AI
    assert "SUPPRESSION_PUSH_SECONDS" in REQUIRED_ENEMY_AI
    assert "_full_muzzle_positions_for_atlas" in REQUIRED_MATTHIAS
    assert "RUN_FIRE_RECOIL_DEGREES" in REQUIRED_MATTHIAS
    assert "MOVING_FIRE_RECOIL_BOOST" in REQUIRED_MATTHIAS
    assert "MOVING_FIRE_FLASH_BOOST" in REQUIRED_MATTHIAS
    assert "MOVING_FIRE_RECOIL_HOLD_SECONDS" in REQUIRED_MATTHIAS
    assert "MOVING_FIRE_RECOIL_DECAY_PX" in REQUIRED_MATTHIAS
    assert "set_shell_telegraph" in REQUIRED_BOSS_TELEGRAPH
    assert "DisplayServer.get_display_safe_area" in REQUIRED_TOUCH
    assert "aim_vector" in REQUIRED_TOUCH
    assert "GIRA EL MÓVIL" in REQUIRED_TOUCH
    assert "orientation_blocked" in REQUIRED_TOUCH
    assert "_touch_controls.fire_pressed" in REQUIRED_MOBILE_PLAYER
    assert "screen.orientation.lock(\'landscape\')" in REQUIRED_MOBILE_PAUSE
    print("OK Pawn Slug Godot 2D SpriteFrames gate self-test")


def main() -> int:
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "self-test":
            self_test()
        else:
            validate()
            print("OK Pawn Slug Godot stays 2D and frame-driven")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
