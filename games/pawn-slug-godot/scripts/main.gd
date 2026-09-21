extends Node2D

const EnemyVisual := preload("res://scripts/enemy_visual.gd")
const BossVisual := preload("res://scripts/boss_visual.gd")
const ExtractionVisual := preload("res://scripts/extraction_visual.gd")
const EnvironmentVisual := preload("res://scripts/environment_visual.gd")
const ParallaxLayerVisual := preload("res://scripts/parallax_layer_visual.gd")
const SetpieceVisual := preload("res://scripts/setpiece_visual.gd")
const DEFAULT_STAGE_ID := "industrial_front_v1"
const STAGE_CATALOG := ["industrial_front_v1", "harbor_raid_v1", "alpine_fortress_v1", "jungle_relay_v1"]
const VIEW_SIZE := Vector2(1280.0, 720.0)
const PICKUP_RADIUS_X := 44.0
const PICKUP_SPAWN_SIZE := Vector2(56.0, 56.0)
const PICKUP_SPAWN_CLEARANCE := 6.0
const PICKUP_SPAWN_SEARCH_STEP := 48.0
const ENEMY_AGGRO_RANGE := 1380.0
const START_ZONE_END_X := 1150.0
const START_ZONE_AGGRO_RANGE := 520.0
const OPENING_SAFE_UNTIL_X := 320.0
const OPENING_ALERT_REACTION_MIN := 0.45
const RESPAWN_HOSTILE_GRACE_SECONDS := 1.10
const ENEMY_DISENGAGE_RANGE := 1850.0
const GUNFIRE_HEARING_RANGE := 1550.0
const GRENADE_HEARING_RANGE := 1750.0
const STATIC_ALARM_RANGE := 900.0
const IDLE_SURPRISE_MIN := 0.72
const ARTILLERY_PLAYER_DAMAGE_RADIUS := 74.0
const GRENADE_EVADE_RADIUS := 250.0
const GRENADE_EVADE_SPEED_SCALE := 2.15
const SUPPRESSION_PUSH_SECONDS := 0.65
const SUPPRESSION_ASSAULT_STANDOFF_BONUS := 95.0
const SUPPRESSION_ASSAULT_SPEED_MULTIPLIER := 1.18
const BLOCKED_LOS_PUSH_BONUS := 80.0
const SOLDIER_SPRINT_MARGIN := 180.0
const SOLDIER_ADVANCE_MARGIN := 80.0
const SOLDIER_COMFORT_MARGIN := 24.0
const SOLDIER_RETREAT_RATIO := 0.64
const SOLDIER_SPRINT_MULTIPLIER := 2.35
const SOLDIER_ADVANCE_MULTIPLIER := 1.30
const SOLDIER_CREEP_MULTIPLIER := 0.62
const SOLDIER_BACKPEDAL_MULTIPLIER := 0.76
const SOLDIER_ROAM_LIMIT := 540.0
const ENEMY_TRAVERSAL_GRAVITY := 1180.0
const ENEMY_TRAVERSAL_JUMP_SPEED := 500.0
const ENEMY_TRAVERSAL_PIT_JUMP_SPEED := 610.0
const ENEMY_TRAVERSAL_LOOKAHEAD := 74.0
const ENEMY_TRAVERSAL_MAX_CLIMB_HEIGHT := 118.0
const ENEMY_TRAVERSAL_LADDER_THRESHOLD := 64.0
const ENEMY_TRAVERSAL_LADDER_APPROACH_RANGE := 520.0
const ENEMY_TRAVERSAL_LADDER_SNAP_X := 11.0
const ENEMY_TRAVERSAL_LADDER_SPEED := 155.0
const ENEMY_TRAVERSAL_LADDER_EXIT_NUDGE := 20.0
const ENEMY_TRAVERSAL_TERRAIN_AIR_SPEED_SCALE := 1.65
const ENEMY_TRAVERSAL_PIT_AIR_SPEED_SCALE := 5.0
const ENEMY_TRAVERSAL_TERRAIN_MIN_AIR_SPEED := 150.0
const ENEMY_TRAVERSAL_PIT_MIN_AIR_SPEED := 285.0
const KNIGHT_SPRINT_MULTIPLIER := 1.45
const KNIGHT_GRAVITY := 880.0
const KNIGHT_LEAP_SPEED := 300.0
const KNIGHT_LEAP_RANGE := 300.0
const KNIGHT_NEAR_SPEED_SCALE := 0.25
const KNIGHT_INITIAL_LEAP_MIN := 0.70
const KNIGHT_INITIAL_LEAP_MAX := 1.90
const KNIGHT_LEAP_COOLDOWN_MIN := 2.20
const KNIGHT_LEAP_COOLDOWN_MAX := 3.60
const BOSS_REGULAR_RANGE := 1280.0
const BOSS_SHELL_RANGE := 1440.0
const BOSS_SHELL_WINDUP := 0.62
const ENEMY_FIRE_SCREEN_MARGIN := 84.0
const MAX_HOSTILE_PROJECTILES := 6
const MAX_HOSTILE_EXPLOSIVES := 2
const HOSTILE_FIRE_GAP := 0.18
const ENEMY_INTENTIONAL_MISS_CHANCE := 0.30
const ENEMY_MISS_ANGLE_MIN := 0.085
const ENEMY_MISS_ANGLE_MAX := 0.14
const GRENADE_START_SPEED := Vector2(540.0, -600.0)
const GRENADE_GRAVITY := 1116.0
const GRENADE_FUSE := 1.35
const GRENADE_BOUNCE := 0.38
const GRENADE_FRICTION := 0.72
const GRENADE_RADIUS := 210.0
const GRENADE_DAMAGE := 125
const PANZER_BLAST_RADIUS := 152.0
const EXPLOSION_VISUAL_SECONDS := 0.28
const MUZZLE_FLASH_SECONDS := 0.085
const IMPACT_FX_SECONDS := 0.16
const CAMERA_KICK_DECAY := 32.0
const BISHOP_SHELL_TELEGRAPH := 0.52
const BISHOP_SHELL_RANGE := 1000.0
const BISHOP_SUPPRESSION_TELEGRAPH := 0.46
const BISHOP_SUPPRESSION_RANGE := 760.0
const BISHOP_SUPPRESSION_SHOTS := 3
const BISHOP_SUPPRESSION_INTERVAL := 0.14
const BISHOP_SUPPRESSION_LANES := [
    {"height": 50.0, "speed": 668.0},
    {"height": 134.0, "speed": 652.0},
    {"height": 86.0, "speed": 676.0},
]
const PLAYER_STANDING_HEIGHT := 84.0
const PLAYER_CROUCH_HEIGHT := 48.0
const PLATFORM_ONE_WAY_MARGIN := 7.0
const MOVEMENT_HINT_LOOKAHEAD := 180.0
const MOVEMENT_HINT_TRAIL := 36.0
const ENEMY_TYPES := {
    "pawn": {"hp": 34, "speed": 54.0, "width": 45.0, "height": 73.0, "standoff": 270.0},
    "knight": {"hp": 62, "speed": 92.0, "width": 57.0, "height": 80.0, "standoff": 225.0},
    "rook": {"hp": 112, "speed": 0.0, "width": 68.0, "height": 90.0, "standoff": 420.0},
    "bishop": {"hp": 310, "speed": 42.0, "width": 90.0, "height": 128.0, "standoff": 430.0},
    "queen": {"hp": 156, "speed": 74.0, "width": 62.0, "height": 96.0, "standoff": 345.0},
    "grenadier": {"hp": 82, "speed": 50.0, "width": 54.0, "height": 82.0, "standoff": 470.0},
    "scout": {"hp": 46, "speed": 84.0, "width": 48.0, "height": 76.0, "standoff": 245.0},
    "commando": {"hp": 78, "speed": 76.0, "width": 58.0, "height": 84.0, "standoff": 300.0},
    "shield": {"hp": 168, "speed": 32.0, "width": 72.0, "height": 94.0, "standoff": 255.0},
}
const ENEMY_FIRE_PROFILES := {
    "pistol": {"range": 720.0, "min_range": 0.0, "cooldown_min": 1.55, "cooldown_max": 2.25, "speed": 500.0, "pellets": 1, "spread": 0.085, "explosive": false},
    "machinegun": {"range": 840.0, "min_range": 0.0, "cooldown_min": 1.35, "cooldown_max": 1.95, "speed": 560.0, "pellets": 1, "spread": 0.105, "explosive": false},
    "shotgun": {"range": 545.0, "min_range": 0.0, "cooldown_min": 1.85, "cooldown_max": 2.50, "speed": 470.0, "pellets": 5, "spread": 0.20, "explosive": false},
    "panzerfaust": {"range": 1200.0, "min_range": 290.0, "cooldown_min": 2.50, "cooldown_max": 3.35, "speed": 390.0, "pellets": 1, "spread": 0.035, "explosive": true},
}

var _stage_id := DEFAULT_STAGE_ID
var _stage_manifest: Dictionary = {}
var _world_size := Vector2(1280.0, 720.0)
var _floor_y := 610.0
var _floor_depth := 110.0
var _boundary_thickness := 40.0
var _stage_start_x := 110.0
var _checkpoints: Array = [110.0]
var _platforms: Array[Rect2] = []
var _platform_specs: Array[Dictionary] = []
var _obstacles: Array[Rect2] = []
var _obstacle_specs: Array[Dictionary] = []
var _dressing_specs: Array[Dictionary] = []
var _story_prop_specs: Array[Dictionary] = []
var _enemy_spawns: Array[Dictionary] = []
var _setpieces: Array[Dictionary] = []
var _setpiece_nodes: Dictionary = {}
var _moving_platforms: Array[Dictionary] = []
var _collapsing_platforms: Array[Dictionary] = []
var _destructible_setpieces: Array[Dictionary] = []
var _boss_x := 4580.0
var _boss_hp := 780
var _boss_size := Vector2(190.0, 150.0)
var _boss_trigger_x := 3860.0
var _boss_arena_left := 4010.0
var _boss_arena_right := 5080.0
var _extraction_x := 5050.0
var _map_geometry_root: Node2D

var projectiles: Array[Dictionary] = []
var enemy_projectiles: Array[Dictionary] = []
var thrown_grenades: Array[Dictionary] = []
var explosion_fx: Array[Dictionary] = []
var muzzle_fx: Array[Dictionary] = []
var impact_fx: Array[Dictionary] = []
var enemies: Array[Dictionary] = []
var enemy_visuals: Dictionary = {}
var pickups: Array[Dictionary] = []
var boss_spawned := false
var boss_defeated := false
var mission_complete := false
var boss: Dictionary = {}
var boss_visual
var extraction_visual
var environment_visual
var _parallax_root: Node2D
var _startup_ready_sent := false
var _camera_kick := Vector2.ZERO
var _reduced_motion := false
var _hostile_fire_gap_remaining := 0.0
var _hostile_grace_remaining := 0.0
var _enemy_suppression_remaining := 0.0

@onready var player = $Player
@onready var status_bar: ColorRect = $HUD/StatusBar
@onready var pause_menu = $PauseMenu
@onready var camera: Camera2D = $Player/Camera2D
@onready var combat_audio = $CombatAudio
@onready var touch_controls = $TouchControls

func _ready() -> void:
    _reduced_motion = _prefers_reduced_motion()
    var selected_stage := _selected_stage_id()
    if not _load_stage_manifest(selected_stage):
        push_error("Pawn Slug stage manifest failed; using minimal safe fallback")
    _build_stage_geometry()
    var traversal_manager = get_node_or_null("TraversalManager")
    if traversal_manager != null and traversal_manager.has_method("configure_stage"):
        traversal_manager.configure_stage(_stage_manifest)
    if player.has_method("configure_stage"):
        player.configure_stage(_stage_start_x, _checkpoints)
    _apply_visual_capture_probe()
    if camera != null:
        camera.limit_right = int(_world_size.x)
        camera.limit_bottom = int(_world_size.y)
    _build_parallax_backdrop()
    _build_environment_visual()
    _build_stage_setpieces()
    enemies = _build_enemy_roster()
    _build_enemy_visuals()
    _build_extraction_visual()
    player.connect("fired", Callable(self, "_on_player_fired"))
    player.connect("grenade_thrown", Callable(self, "_on_player_grenade_thrown"))
    player.connect("grenades_changed", Callable(self, "_on_player_grenades_changed"))
    player.connect("hurt", Callable(self, "_on_player_hurt"))
    player.connect("healed", Callable(self, "_on_player_healed"))
    player.connect("died", Callable(self, "_on_player_died"))
    player.connect("respawned", Callable(self, "_on_player_respawned"))
    player.connect("game_over", Callable(self, "_on_player_game_over"))
    player.connect("weapon_changed", Callable(self, "_on_player_weapon_changed"))
    player.connect("landed", Callable(self, "_on_player_landed"))
    player.connect("checkpoint_changed", Callable(self, "_on_player_checkpoint_changed"))
    pause_menu.connect("exit_requested", Callable(self, "_on_pause_exit_requested"))
    touch_controls.connect("pause_requested", Callable(pause_menu, "toggle_pause"))
    touch_controls.connect("weapon_cycle_requested", Callable(self, "_on_touch_weapon_cycle_requested"))
    _sync_hud()
    queue_redraw()

func _selected_stage_id() -> String:
    if OS.has_feature("web"):
        var selected = JavaScriptBridge.eval(
            "(new URLSearchParams(window.location.search)).get('stage') || ''",
            true,
        )
        var candidate := String(selected)
        if candidate in STAGE_CATALOG:
            return candidate
    return DEFAULT_STAGE_ID

func _apply_visual_capture_probe() -> void:
    # CI's Playwright harness injects this JS-only global before Godot boots.
    # Normal production pages never define it, so this cannot become a URL
    # teleport or alter regular gameplay.
    if not OS.has_feature("web"):
        return
    var probe = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbeX === 'number' ? window.__pawnSlugVisualProbeX : null",
        true,
    )
    if typeof(probe) not in [TYPE_INT, TYPE_FLOAT]:
        return
    var target_x := clampf(float(probe), _stage_start_x, _world_size.x - 96.0)
    player.global_position.x = target_x
    player.velocity = Vector2.ZERO
    player.reset_physics_interpolation()

func available_stage_ids() -> Array:
    return STAGE_CATALOG.duplicate()

func _load_stage_manifest(stage_id: String) -> bool:
    _stage_id = stage_id
    var path := "res://maps/%s.json" % stage_id
    if not FileAccess.file_exists(path):
        return false
    var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
    if typeof(parsed) != TYPE_DICTIONARY:
        return false

    _stage_manifest = parsed
    var world: Dictionary = _stage_manifest.get("world", {})
    _world_size = Vector2(float(world.get("width", 1280.0)), float(world.get("height", 720.0)))
    _floor_y = float(world.get("floor_y", 610.0))
    _floor_depth = float(world.get("floor_depth", 110.0))
    _boundary_thickness = float(world.get("boundary_thickness", 40.0))
    _stage_start_x = float(world.get("start_x", 110.0))

    _checkpoints = _stage_manifest.get("checkpoints", [_stage_start_x]).duplicate(true)
    _platform_specs.clear()
    for entry in _stage_manifest.get("platforms", []):
        if typeof(entry) == TYPE_DICTIONARY:
            _platform_specs.append(Dictionary(entry).duplicate(true))
    _platforms = _stage_rects(_platform_specs)
    _obstacle_specs.clear()
    for entry in _stage_manifest.get("obstacles", []):
        if typeof(entry) == TYPE_DICTIONARY:
            _obstacle_specs.append(Dictionary(entry).duplicate(true))
    _obstacles = _stage_rects(_obstacle_specs)
    _dressing_specs.clear()
    for entry in _stage_manifest.get("dressing", []):
        if typeof(entry) == TYPE_DICTIONARY:
            _dressing_specs.append(Dictionary(entry).duplicate(true))
    _story_prop_specs.clear()
    for entry in _stage_manifest.get("story_props", []):
        if typeof(entry) == TYPE_DICTIONARY:
            _story_prop_specs.append(Dictionary(entry).duplicate(true))

    _enemy_spawns.clear()
    for entry in _stage_manifest.get("enemies", []):
        if typeof(entry) == TYPE_DICTIONARY:
            _enemy_spawns.append(Dictionary(entry).duplicate(true))

    _setpieces.clear()
    for entry in _stage_manifest.get("setpieces", []):
        if typeof(entry) == TYPE_DICTIONARY:
            _setpieces.append(Dictionary(entry).duplicate(true))

    pickups.clear()
    for entry in _stage_manifest.get("pickups", []):
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var pickup := Dictionary(entry).duplicate(true)
        var desired_pickup := Vector2(
            float(pickup.get("x", _stage_start_x)),
            float(pickup.get("y", _floor_y - 44.0)),
        )
        var safe_pickup := _resolve_pickup_spawn(desired_pickup)
        pickup["x"] = safe_pickup.x
        pickup["y"] = safe_pickup.y
        pickup["taken"] = false
        pickups.append(pickup)

    var boss_spec: Dictionary = _stage_manifest.get("boss", {})
    _boss_x = float(boss_spec.get("x", 4580.0))
    _boss_hp = int(boss_spec.get("hp", 780))
    _boss_size = Vector2(float(boss_spec.get("width", 190.0)), float(boss_spec.get("height", 150.0)))
    _boss_trigger_x = float(boss_spec.get("trigger_x", _boss_x - 720.0))
    _boss_arena_left = float(boss_spec.get("arena_left", _boss_x - 570.0))
    _boss_arena_right = float(boss_spec.get("arena_right", _boss_x + 500.0))

    var extraction_spec: Dictionary = _stage_manifest.get("extraction", {})
    _extraction_x = float(extraction_spec.get("x", _world_size.x - 150.0))
    return true

func _stage_rects(raw: Array) -> Array[Rect2]:
    var result: Array[Rect2] = []
    for entry in raw:
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var item: Dictionary = entry
        result.append(Rect2(
            float(item.get("x", 0.0)),
            float(item.get("y", 0.0)),
            float(item.get("w", 0.0)),
            float(item.get("h", 0.0)),
        ))
    return result

func _build_stage_geometry() -> void:
    if _map_geometry_root != null:
        _map_geometry_root.queue_free()
    _map_geometry_root = Node2D.new()
    _map_geometry_root.name = "StageGeometry"
    add_child(_map_geometry_root)

    _add_stage_body(
        Rect2(0.0, _floor_y, _world_size.x, _floor_depth),
        "Floor",
    )
    _add_stage_body(
        Rect2(-_boundary_thickness, 0.0, _boundary_thickness, _world_size.y),
        "LeftBoundary",
    )
    _add_stage_body(
        Rect2(_world_size.x, 0.0, _boundary_thickness, _world_size.y),
        "RightBoundary",
    )
    for index in range(_platforms.size()):
        var one_way := false
        if index < _platform_specs.size():
            one_way = bool(_platform_specs[index].get("one_way", false))
        _add_stage_body(_platforms[index], "Platform_%02d" % index, one_way)
    for index in range(_obstacles.size()):
        _add_stage_body(_obstacles[index], "Obstacle_%02d" % index)

func _add_stage_body(rect: Rect2, body_name: String, one_way := false) -> void:
    if rect.size.x <= 0.0 or rect.size.y <= 0.0:
        return
    var body := StaticBody2D.new()
    body.name = body_name
    body.position = rect.get_center()
    var collision := CollisionShape2D.new()
    collision.name = "CollisionShape2D"
    var shape := RectangleShape2D.new()
    shape.size = rect.size
    collision.shape = shape
    collision.one_way_collision = one_way
    if one_way:
        collision.one_way_collision_margin = PLATFORM_ONE_WAY_MARGIN
    body.add_child(collision)
    _map_geometry_root.add_child(body)

func _point_hits_stage_geometry(point: Vector2) -> bool:
    if point.y >= _floor_y:
        return true
    for rect in _platforms:
        if rect.has_point(point):
            return true
    for rect in _obstacles:
        if rect.has_point(point):
            return true
    for rect in _dynamic_platform_rects():
        if rect.has_point(point):
            return true
    for rect in _destructible_geometry_rects():
        if rect.has_point(point):
            return true
    return false

func _pickup_spawn_rect(position: Vector2) -> Rect2:
    return Rect2(position - PICKUP_SPAWN_SIZE * 0.5, PICKUP_SPAWN_SIZE)

func _pickup_spawn_clear(position: Vector2) -> bool:
    var rect := _pickup_spawn_rect(position)
    if rect.position.x < 0.0 or rect.end.x > _world_size.x:
        return false
    if rect.position.y < 0.0 or rect.end.y >= _floor_y - 1.0:
        return false
    for obstacle in _obstacles:
        if rect.intersects(obstacle.grow(PICKUP_SPAWN_CLEARANCE)):
            return false
    for platform in _platforms:
        if rect.intersects(platform.grow(PICKUP_SPAWN_CLEARANCE)):
            return false
    return true

func _resolve_pickup_spawn(desired: Vector2) -> Vector2:
    if _pickup_spawn_clear(desired):
        return desired

    var desired_rect := _pickup_spawn_rect(desired)
    var blockers: Array[Rect2] = []
    blockers.append_array(_obstacles)
    blockers.append_array(_platforms)
    for blocker in blockers:
        var expanded := blocker.grow(PICKUP_SPAWN_CLEARANCE)
        if not desired_rect.intersects(expanded):
            continue
        var above := Vector2(
            clampf(desired.x, PICKUP_SPAWN_SIZE.x * 0.5, _world_size.x - PICKUP_SPAWN_SIZE.x * 0.5),
            blocker.position.y - PICKUP_SPAWN_SIZE.y * 0.5 - PICKUP_SPAWN_CLEARANCE,
        )
        if _pickup_spawn_clear(above):
            return above

    # If authored geometry changed around a pickup, search nearby instead of
    # allowing the item to materialize inside a crate/platform.
    for ring in range(1, 7):
        var distance := PICKUP_SPAWN_SEARCH_STEP * float(ring)
        var offsets := [
            Vector2(-distance, 0.0),
            Vector2(distance, 0.0),
            Vector2(0.0, -distance),
            Vector2(-distance, -distance),
            Vector2(distance, -distance),
        ]
        for offset in offsets:
            var candidate: Vector2 = desired + Vector2(offset)
            candidate.x = clampf(
                candidate.x,
                PICKUP_SPAWN_SIZE.x * 0.5,
                _world_size.x - PICKUP_SPAWN_SIZE.x * 0.5,
            )
            candidate.y = minf(
                candidate.y,
                _floor_y - PICKUP_SPAWN_SIZE.y * 0.5 - PICKUP_SPAWN_CLEARANCE,
            )
            if _pickup_spawn_clear(candidate):
                return candidate

    push_warning("Pickup spawn blocked near %s; keeping safest clamped fallback" % desired)
    return Vector2(
        clampf(desired.x, PICKUP_SPAWN_SIZE.x * 0.5, _world_size.x - PICKUP_SPAWN_SIZE.x * 0.5),
        minf(desired.y, _floor_y - PICKUP_SPAWN_SIZE.y * 0.5 - PICKUP_SPAWN_CLEARANCE),
    )

func contextual_movement_hint(player_x: float) -> String:
    if player_x < 420.0:
        return "SPACE salta | W/UP + FIRE arriba | A/D + W/UP + FIRE diagonal | S/DOWN agacha"

    for platform in _platforms:
        var clearance := _floor_y - platform.end.y
        var crouch_only := (
            clearance < PLAYER_STANDING_HEIGHT + 2.0
            and clearance >= PLAYER_CROUCH_HEIGHT + 8.0
        )
        if not crouch_only:
            continue
        if (
            player_x >= platform.position.x - MOVEMENT_HINT_LOOKAHEAD
            and player_x <= platform.end.x + MOVEMENT_HINT_TRAIL
        ):
            return "S/DOWN + MOVER | pasa agachado bajo la plataforma"
    return ""

func _process(delta: float) -> void:
    if not _startup_ready_sent:
        if not player.visual_ready():
            return
        _startup_ready_sent = true
        _notify_parent("ready")

    if touch_controls != null and touch_controls.orientation_blocked():
        enemy_projectiles.clear()
        return

    _hostile_fire_gap_remaining = maxf(0.0, _hostile_fire_gap_remaining - delta)
    _hostile_grace_remaining = maxf(0.0, _hostile_grace_remaining - delta)
    _enemy_suppression_remaining = maxf(0.0, _enemy_suppression_remaining - delta)
    _update_stage_setpieces(delta)
    _spawn_boss_if_needed()
    _update_projectiles(delta)
    _update_grenades(delta)
    _update_explosion_fx(delta)
    _update_combat_fx(delta)
    _update_camera_feel(delta)
    _update_enemies(delta)
    _update_boss(delta)
    _update_enemy_projectiles(delta)
    _update_pickups()
    _enforce_boss_arena()
    _check_victory()
    queue_redraw()

func _on_player_fired(origin: Vector2, direction: Vector2, shot: Dictionary) -> void:
    _notify_parent("player-fired")
    _alert_enemies(origin.x, GUNFIRE_HEARING_RANGE)
    var safe_direction := direction.normalized()
    if safe_direction.length_squared() <= 0.001:
        safe_direction = Vector2.RIGHT
    var speed := float(shot.get("speed", 760.0))
    var damage := int(shot.get("damage", 1))
    var pellets := maxi(1, int(shot.get("pellets", 1)))
    var spread := float(shot.get("spread", 0.0))
    var explosive := bool(shot.get("explosive", false))
    var weapon := String(shot.get("weapon", "pistol"))
    combat_audio.play_weapon(weapon)
    _kick_camera_for_weapon(weapon, safe_direction)
    _add_muzzle_fx(origin, safe_direction, weapon)
    for _pellet in range(pellets):
        var angle := randf_range(-spread, spread) if spread > 0.0 else 0.0
        var velocity := safe_direction.rotated(angle) * speed
        projectiles.append({
            "position": origin,
            "velocity": velocity,
            "damage": damage,
            "weapon": weapon,
            "explosive": explosive,
        })

func _on_player_grenade_thrown(origin: Vector2, direction: float) -> void:
    _alert_enemies(origin.x, GRENADE_HEARING_RANGE)
    thrown_grenades.append({
        "position": origin,
        "velocity": Vector2(GRENADE_START_SPEED.x * direction, GRENADE_START_SPEED.y),
        "fuse": GRENADE_FUSE,
        "spin": 0.0,
    })
    _notify_parent("grenade-thrown")

func _on_player_grenades_changed(_count: int) -> void:
    _notify_parent("grenades-changed")

func _on_player_weapon_changed(_weapon_id: String, _ammo_remaining: int) -> void:
    _notify_parent("weapon-changed")

func _on_touch_weapon_cycle_requested(step: int) -> void:
    player.cycle_weapon(step)

func _on_pause_exit_requested() -> void:
    touch_controls.release_all()
    get_tree().paused = false
    if OS.has_feature("web"):
        _notify_parent("exit")
    else:
        get_tree().quit()

func _on_player_hurt(_current_hp: int, _max_hp: int) -> void:
    combat_audio.play_hurt()
    _add_camera_kick(Vector2(randf_range(-0.7, 0.7), -0.35), 5.5)
    _sync_hud()
    _notify_parent("player-hurt")

func _on_player_landed(intensity: float) -> void:
    combat_audio.play_land(intensity)
    _add_camera_kick(Vector2(0.0, 1.0), lerpf(1.0, 4.5, clampf(intensity, 0.0, 1.0)))

func _on_player_checkpoint_changed(_checkpoint_x: float) -> void:
    _notify_parent("checkpoint")

func _on_player_healed(_current_hp: int, _max_hp: int) -> void:
    _sync_hud()
    _notify_parent("player-healed")

func _on_player_died(_lives_remaining: int) -> void:
    enemy_projectiles.clear()
    _sync_hud()
    _notify_parent("player-death")

func _on_player_respawned(_current_hp: int, _max_hp: int, _lives_remaining: int) -> void:
    enemy_projectiles.clear()
    thrown_grenades.clear()
    for index in range(enemies.size()):
        var enemy := enemies[index]
        if int(enemy["hp"]) <= 0:
            continue
        enemy["cooldown"] = maxf(
            0.35 + float(index % 5) * 0.08,
            RESPAWN_HOSTILE_GRACE_SECONDS,
        )
        enemy["reaction"] = maxf(
            float(enemy.get("reaction", 0.0)),
            RESPAWN_HOSTILE_GRACE_SECONDS,
        )
        if String(enemy["type"]) == "bishop":
            enemy["shell_cooldown"] = 1.65 + randf_range(0.0, 0.45)
            enemy["suppression_cooldown"] = 2.35 + randf_range(0.0, 0.70)
            enemy["suppression_shots"] = 0
            enemy["suppression_index"] = 0
            enemy["suppression_shot_cooldown"] = 0.0
        elif String(enemy["type"]) == "knight":
            enemy["leap_cooldown"] = randf_range(KNIGHT_INITIAL_LEAP_MIN, KNIGHT_INITIAL_LEAP_MAX)
        enemies[index] = enemy
    _hostile_grace_remaining = RESPAWN_HOSTILE_GRACE_SECONDS
    if boss_spawned and not boss_defeated:
        boss["regular_cooldown"] = maxf(0.65, RESPAWN_HOSTILE_GRACE_SECONDS)
        boss["shell_cooldown"] = 1.35
        boss["shell_windup"] = 0.0
        boss["shell_armed"] = false
        if boss_visual != null:
            boss_visual.set_shell_telegraph(0.0)
    _sync_hud()
    _notify_parent("player-respawn")

func _on_player_game_over() -> void:
    enemy_projectiles.clear()
    thrown_grenades.clear()
    _sync_hud()
    _notify_parent("gameover")

func _sync_hud() -> void:
    if status_bar == null:
        return
    var hp_ratio := clampf(float(player.hp) / float(player.MAX_HP), 0.0, 1.0)
    status_bar.offset_right = status_bar.offset_left + 220.0 * hp_ratio

func _build_enemy_roster() -> Array[Dictionary]:
    var roster: Array[Dictionary] = []
    for index in range(_enemy_spawns.size()):
        roster.append(_enemy_from_spawn(_enemy_spawns[index], index, "base"))
    return roster

func _enemy_from_spawn(spawn: Dictionary, variant: int, id_prefix: String) -> Dictionary:
    var spawn_x := float(spawn.get("x", 0.0))
    var spawn_y := float(spawn.get("y", _floor_y))
    var type := String(spawn.get("type", "pawn"))
    var stats: Dictionary = ENEMY_TYPES[type]
    var weapon := _enemy_weapon_for(type, variant)
    var role := "hold"
    if type in ["pawn", "knight", "queen", "grenadier", "scout", "commando", "shield"]:
        role = "support" if weapon in ["machinegun", "panzerfaust"] and variant % 3 != 0 else "assaulter"
    var enemy := {
        "id": "%s-%s-%d" % [id_prefix, type, variant],
        "type": type,
        "x": spawn_x,
        "spawn_x": spawn_x,
        "alerted": false,
        "reaction": _initial_enemy_reaction(spawn_x, variant),
        "idle_pose": String(spawn.get("idle_pose", "")),
        "idle_reaction": maxf(IDLE_SURPRISE_MIN, float(spawn.get("idle_reaction", IDLE_SURPRISE_MIN))),
        "y": spawn_y,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
        "traversal_ladder": {},
        "air_direction": 0.0,
        "air_speed_scale": 1.0,
        "hp": int(stats["hp"]),
        "max_hp": int(stats["hp"]),
        "weapon": weapon,
        "role": role,
        "cooldown": 0.35 + float(variant % 5) * 0.08,
    }
    if type == "bishop":
        enemy["shell_cooldown"] = 1.65 + randf_range(0.0, 0.45)
        enemy["suppression_cooldown"] = 2.35 + randf_range(0.0, 0.70)
        enemy["suppression_shots"] = 0
        enemy["suppression_index"] = 0
        enemy["suppression_shot_cooldown"] = 0.0
    elif type == "knight":
        enemy["leap_cooldown"] = randf_range(KNIGHT_INITIAL_LEAP_MIN, KNIGHT_INITIAL_LEAP_MAX)
    return enemy

func _build_stage_setpieces() -> void:
    _setpiece_nodes.clear()
    _moving_platforms.clear()
    _collapsing_platforms.clear()
    _destructible_setpieces.clear()
    var theme := String(_stage_manifest.get("theme", "night_front"))

    for index in range(_setpieces.size()):
        var setpiece := _setpieces[index]
        var kind := String(setpiece.get("type", ""))
        var id := String(setpiece.get("id", "%s-%02d" % [kind, index]))
        setpiece["_id"] = id
        setpiece["_triggered"] = false
        setpiece["_complete"] = false

        if kind == "moving_platform":
            var width := float(setpiece.get("w", 140.0))
            var height := float(setpiece.get("h", 24.0))
            var body := AnimatableBody2D.new()
            body.name = "Setpiece_%s" % id
            body.position = Vector2(
                float(setpiece.get("x", 0.0)) + width * 0.5,
                float(setpiece.get("y", _floor_y - 120.0)) + height * 0.5,
            )
            body.sync_to_physics = true
            var collision := CollisionShape2D.new()
            var shape := RectangleShape2D.new()
            shape.size = Vector2(width, height)
            collision.shape = shape
            body.add_child(collision)
            var visual = SetpieceVisual.new()
            visual.configure(kind, Vector2(width, height), theme)
            body.add_child(visual)
            add_child(body)
            var moving := {
                "id": id,
                "body": body,
                "origin": body.position,
                "travel": Vector2(
                    float(setpiece.get("travel_x", 0.0)),
                    float(setpiece.get("travel_y", 0.0)),
                ),
                "period": maxf(1.5, float(setpiece.get("period", 4.0))),
                "phase": float(setpiece.get("phase", 0.0)),
                "elapsed": 0.0,
                "size": Vector2(width, height),
            }
            _moving_platforms.append(moving)
            _setpiece_nodes[id] = body
        elif kind == "collapse_bridge":
            var width := float(setpiece.get("w", 180.0))
            var height := float(setpiece.get("h", 24.0))
            var body := AnimatableBody2D.new()
            body.name = "Setpiece_%s" % id
            body.position = Vector2(
                float(setpiece.get("x", 0.0)) + width * 0.5,
                float(setpiece.get("y", _floor_y - 160.0)) + height * 0.5,
            )
            body.sync_to_physics = true
            var collision := CollisionShape2D.new()
            collision.name = "CollisionShape2D"
            var shape := RectangleShape2D.new()
            shape.size = Vector2(width, height)
            collision.shape = shape
            body.add_child(collision)
            var visual = SetpieceVisual.new()
            visual.configure(kind, Vector2(width, height), theme)
            body.add_child(visual)
            add_child(body)
            _collapsing_platforms.append({
                "id": id,
                "body": body,
                "collision": collision,
                "visual": visual,
                "origin": body.position,
                "size": Vector2(width, height),
                "trigger_x": float(setpiece.get("trigger_x", float(setpiece.get("x", 0.0)) + width + 40.0)),
                "warning_duration": maxf(0.20, float(setpiece.get("warning", 0.75))),
                "timer": 0.0,
                "elapsed": 0.0,
                "velocity": 0.0,
                "fall_gravity": maxf(240.0, float(setpiece.get("fall_gravity", 980.0))),
                "state": "idle",
            })
            _setpiece_nodes[id] = body
        elif kind in ["destructible_barricade", "destructible_platform"]:
            var width := float(setpiece.get("w", 120.0))
            var default_height := 54.0 if kind == "destructible_barricade" else 24.0
            var height := float(setpiece.get("h", default_height))
            var body := StaticBody2D.new()
            body.name = "Setpiece_%s" % id
            body.position = Vector2(
                float(setpiece.get("x", 0.0)) + width * 0.5,
                float(setpiece.get("y", _floor_y - height)) + height * 0.5,
            )
            var collision := CollisionShape2D.new()
            collision.name = "CollisionShape2D"
            var shape := RectangleShape2D.new()
            shape.size = Vector2(width, height)
            collision.shape = shape
            body.add_child(collision)
            var visual = SetpieceVisual.new()
            visual.configure(kind, Vector2(width, height), theme)
            if kind == "destructible_barricade":
                visual.position.y = height * 0.5
            body.add_child(visual)
            add_child(body)
            var max_hp := int(setpiece.get("hp", 90 if kind == "destructible_barricade" else 70))
            _destructible_setpieces.append({
                "id": id,
                "kind": kind,
                "body": body,
                "collision": collision,
                "visual": visual,
                "size": Vector2(width, height),
                "hp": max_hp,
                "max_hp": max_hp,
                "destroyed": false,
            })
            _setpiece_nodes[id] = body
        elif kind == "bunker_turret":
            var visual = SetpieceVisual.new()
            visual.name = "Setpiece_%s" % id
            visual.position = Vector2(
                float(setpiece.get("x", 0.0)),
                float(setpiece.get("y", _floor_y)),
            )
            visual.z_index = 1
            var size := Vector2(
                float(setpiece.get("w", 126.0)),
                float(setpiece.get("h", 82.0)),
            )
            visual.configure(kind, size, theme)
            add_child(visual)
            setpiece["_hp"] = int(setpiece.get("hp", 180))
            setpiece["_max_hp"] = int(setpiece.get("hp", 180))
            setpiece["_cooldown"] = float(setpiece.get("reaction", 0.70))
            _setpiece_nodes[id] = visual
        elif kind == "convoy":
            var visual = SetpieceVisual.new()
            visual.name = "Setpiece_%s" % id
            visual.position = Vector2(
                float(setpiece.get("start_x", 0.0)),
                float(setpiece.get("y", _floor_y - 4.0)),
            )
            visual.z_index = 2
            visual.configure(
                kind,
                Vector2(float(setpiece.get("w", 150.0)), float(setpiece.get("h", 68.0))),
                theme,
            )
            visual.visible = false
            add_child(visual)
            _setpiece_nodes[id] = visual
        elif kind in ["waterfall", "tunnel_portal"]:
            var visual = SetpieceVisual.new()
            visual.name = "Setpiece_%s" % id
            visual.position = Vector2(
                float(setpiece.get("x", 0.0)),
                float(setpiece.get("y", _floor_y)),
            )
            visual.z_index = 0 if kind == "waterfall" else 2
            visual.configure(
                kind,
                Vector2(float(setpiece.get("w", 180.0)), float(setpiece.get("h", 220.0))),
                theme,
            )
            add_child(visual)
            _setpiece_nodes[id] = visual
        elif kind == "artillery_barrage":
            var visual = SetpieceVisual.new()
            visual.name = "Setpiece_%s" % id
            visual.visible = false
            visual.z_index = 5
            var radius := float(setpiece.get("radius", 82.0))
            visual.configure(kind, Vector2(radius * 2.0, radius * 2.0), theme)
            add_child(visual)
            setpiece["_phase"] = "idle"
            setpiece["_timer"] = 0.0
            setpiece["_salvos_left"] = int(setpiece.get("salvos", 3))
            setpiece["_target"] = Vector2.ZERO
            _setpiece_nodes[id] = visual

        _setpieces[index] = setpiece

func _physics_process(delta: float) -> void:
    for index in range(_moving_platforms.size()):
        var moving := _moving_platforms[index]
        var body = moving.get("body")
        if body == null:
            continue
        moving["elapsed"] = float(moving.get("elapsed", 0.0)) + delta
        var period := float(moving["period"])
        var phase := float(moving["phase"])
        var wave := (sin((float(moving["elapsed"]) / period + phase) * TAU) + 1.0) * 0.5
        body.position = Vector2(moving["origin"]) + Vector2(moving["travel"]) * wave
        _moving_platforms[index] = moving

    for index in range(_collapsing_platforms.size()):
        var bridge := _collapsing_platforms[index]
        var body = bridge.get("body")
        if body == null:
            continue
        var state := String(bridge.get("state", "idle"))
        if state == "gone":
            continue
        if state == "idle" and player.global_position.x >= float(bridge["trigger_x"]):
            state = "warning"
            bridge["state"] = state
            bridge["timer"] = float(bridge["warning_duration"])
            bridge["elapsed"] = 0.0
            var visual = bridge.get("visual")
            if visual != null:
                visual.set_warning(true)
        if state == "warning":
            bridge["elapsed"] = float(bridge["elapsed"]) + delta
            bridge["timer"] = float(bridge["timer"]) - delta
            body.position = Vector2(bridge["origin"]) + Vector2(
                sin(float(bridge["elapsed"]) * 34.0) * 2.2,
                0.0,
            )
            if float(bridge["timer"]) <= 0.0:
                bridge["state"] = "falling"
                var visual = bridge.get("visual")
                if visual != null:
                    visual.set_warning(false)
        elif state == "falling":
            bridge["velocity"] = float(bridge["velocity"]) + float(bridge["fall_gravity"]) * delta
            body.position.y += float(bridge["velocity"]) * delta
            body.rotation += delta * 0.16
            if body.position.y - float(Vector2(bridge["size"]).y) * 0.5 > _world_size.y + 90.0:
                bridge["state"] = "gone"
                var collision = bridge.get("collision")
                if collision != null:
                    collision.disabled = true
                body.visible = false
        _collapsing_platforms[index] = bridge

func _moving_platform_rects() -> Array[Rect2]:
    var rects: Array[Rect2] = []
    for moving in _moving_platforms:
        var body = moving.get("body")
        if body == null:
            continue
        var size: Vector2 = moving["size"]
        rects.append(Rect2(Vector2(body.position) - size * 0.5, size))
    return rects

func _collapsing_platform_rects() -> Array[Rect2]:
    var rects: Array[Rect2] = []
    for bridge in _collapsing_platforms:
        if String(bridge.get("state", "idle")) == "gone":
            continue
        var body = bridge.get("body")
        if body == null:
            continue
        var size: Vector2 = bridge["size"]
        rects.append(Rect2(Vector2(body.position) - size * 0.5, size))
    return rects

func _destructible_platform_rects() -> Array[Rect2]:
    var rects: Array[Rect2] = []
    for item in _destructible_setpieces:
        if bool(item.get("destroyed", false)) or String(item.get("kind", "")) != "destructible_platform":
            continue
        var body = item.get("body")
        if body == null:
            continue
        var size: Vector2 = item["size"]
        rects.append(Rect2(Vector2(body.position) - size * 0.5, size))
    return rects

func _destructible_geometry_rects() -> Array[Rect2]:
    var rects: Array[Rect2] = []
    for item in _destructible_setpieces:
        if bool(item.get("destroyed", false)):
            continue
        var body = item.get("body")
        if body == null:
            continue
        var size: Vector2 = item["size"]
        rects.append(Rect2(Vector2(body.position) - size * 0.5, size))
    return rects

func _dynamic_platform_rects() -> Array[Rect2]:
    var rects := _moving_platform_rects()
    rects.append_array(_collapsing_platform_rects())
    rects.append_array(_destructible_platform_rects())
    return rects

func _update_stage_setpieces(delta: float) -> void:
    for index in range(_setpieces.size()):
        var setpiece := _setpieces[index]
        var kind := String(setpiece.get("type", ""))
        match kind:
            "reinforcement_wave":
                if (
                    not bool(setpiece.get("_triggered", false))
                    and player.global_position.x >= float(setpiece.get("trigger_x", 0.0))
                ):
                    setpiece["_triggered"] = true
                    _spawn_reinforcement_wave(setpiece, index)
            "bunker_turret":
                _update_bunker_turret(setpiece, delta)
            "convoy":
                _update_convoy_setpiece(setpiece, delta)
            "artillery_barrage":
                _update_artillery_barrage(setpiece, delta)
        _setpieces[index] = setpiece

func _spawn_reinforcement_wave(setpiece: Dictionary, setpiece_index: int) -> void:
    var wave: Array = setpiece.get("enemies", [])
    var base_reaction := float(setpiece.get("reaction", 0.45))
    for wave_index in range(wave.size()):
        var raw = wave[wave_index]
        if typeof(raw) != TYPE_DICTIONARY:
            continue
        var spawn := Dictionary(raw)
        var variant := enemies.size() + wave_index
        var enemy := _enemy_from_spawn(spawn, variant, "wave-%02d" % setpiece_index)
        enemy["alerted"] = true
        enemy["reaction"] = base_reaction + float(wave_index) * 0.08
        enemies.append(enemy)
        _add_enemy_visual(enemy)

func _update_bunker_turret(setpiece: Dictionary, delta: float) -> void:
    if int(setpiece.get("_hp", 0)) <= 0:
        return
    var trigger_x := float(setpiece.get("trigger_x", setpiece.get("x", 0.0) - 620.0))
    if player.global_position.x < trigger_x:
        return

    setpiece["_triggered"] = true
    setpiece["_cooldown"] = maxf(0.0, float(setpiece.get("_cooldown", 0.0)) - delta)
    var bunker_x := float(setpiece.get("x", 0.0))
    var bunker_y := float(setpiece.get("y", _floor_y))
    var width := float(setpiece.get("w", 126.0))
    var height := float(setpiece.get("h", 82.0))
    var origin := Vector2(bunker_x - width * 0.56, bunker_y - height * 0.64)
    var target := Vector2(player.global_position) + Vector2(0.0, -18.0)
    var max_range := float(setpiece.get("range", 760.0))
    if origin.distance_to(target) > max_range:
        return
    if _platform_blocks_line(origin, target):
        return
    if float(setpiece["_cooldown"]) > 0.0:
        return
    if not _can_spawn_hostile_shot(origin, "machinegun", 1):
        return

    var profile: Dictionary = ENEMY_FIRE_PROFILES["machinegun"]
    var direction := (target - origin).normalized()
    enemy_projectiles.append({
        "position": origin,
        "velocity": direction * float(profile["speed"]),
        "weapon": "machinegun",
        "explosive": false,
    })
    _hostile_fire_gap_remaining = HOSTILE_FIRE_GAP
    setpiece["_cooldown"] = randf_range(
        float(setpiece.get("cooldown_min", 0.72)),
        float(setpiece.get("cooldown_max", 1.08)),
    )
    var visual = _setpiece_nodes.get(String(setpiece.get("_id", "")))
    if visual != null:
        visual.pulse_fire()

func _update_convoy_setpiece(setpiece: Dictionary, delta: float) -> void:
    var id := String(setpiece.get("_id", ""))
    var visual = _setpiece_nodes.get(id)
    if visual == null:
        return
    if not bool(setpiece.get("_triggered", false)):
        if player.global_position.x < float(setpiece.get("trigger_x", 0.0)):
            return
        setpiece["_triggered"] = true
        visual.visible = true

    if bool(setpiece.get("_complete", false)):
        return

    var end_x := float(setpiece.get("end_x", visual.position.x))
    var speed := maxf(40.0, float(setpiece.get("speed", 260.0)))
    var direction := 1.0 if end_x >= visual.position.x else -1.0
    visual.position.x += direction * speed * delta
    if (
        (direction > 0.0 and visual.position.x >= end_x)
        or (direction < 0.0 and visual.position.x <= end_x)
    ):
        visual.position.x = end_x
        visual.visible = false
        setpiece["_complete"] = true

func _damage_destructible_at(point: Vector2, damage: int) -> bool:
    for index in range(_destructible_setpieces.size()):
        var item := _destructible_setpieces[index]
        if bool(item.get("destroyed", false)):
            continue
        var body = item.get("body")
        if body == null:
            continue
        var size: Vector2 = item["size"]
        var rect := Rect2(Vector2(body.position) - size * 0.5, size)
        if not rect.has_point(point):
            continue
        if damage > 0:
            _damage_destructible(index, damage)
        return true
    return false

func _damage_destructibles_in_radius(position: Vector2, radius: float, damage: int) -> void:
    for index in range(_destructible_setpieces.size()):
        var item := _destructible_setpieces[index]
        if bool(item.get("destroyed", false)):
            continue
        var body = item.get("body")
        if body == null:
            continue
        var size: Vector2 = item["size"]
        var distance := position.distance_to(Vector2(body.position))
        if distance > radius + maxf(size.x, size.y) * 0.30:
            continue
        _damage_destructible(index, _explosion_damage(damage, distance, radius))

func _damage_destructible(index: int, damage: int) -> void:
    if index < 0 or index >= _destructible_setpieces.size() or damage <= 0:
        return
    var item := _destructible_setpieces[index]
    if bool(item.get("destroyed", false)):
        return
    var next_hp := maxi(0, int(item.get("hp", 0)) - damage)
    item["hp"] = next_hp
    var max_hp := maxi(1, int(item.get("max_hp", 1)))
    var visual = item.get("visual")
    if visual != null:
        visual.set_health_ratio(float(next_hp) / float(max_hp))
    if next_hp <= 0:
        item["destroyed"] = true
        var collision = item.get("collision")
        if collision != null:
            collision.set_deferred("disabled", true)
        if visual != null:
            visual.set_destroyed(true)
        var body = item.get("body")
        if body != null:
            _add_explosion_fx(
                Vector2(body.position),
                minf(92.0, maxf(56.0, float(Vector2(item["size"]).x) * 0.35)),
            )
    _destructible_setpieces[index] = item

func _update_artillery_barrage(setpiece: Dictionary, delta: float) -> void:
    if bool(setpiece.get("_complete", false)):
        return
    if not bool(setpiece.get("_triggered", false)):
        if player.global_position.x < float(setpiece.get("trigger_x", 0.0)):
            return
        setpiece["_triggered"] = true
        setpiece["_phase"] = "cooldown"
        setpiece["_timer"] = float(setpiece.get("initial_delay", 0.55))

    var visual = _setpiece_nodes.get(String(setpiece.get("_id", "")))
    var phase := String(setpiece.get("_phase", "idle"))
    setpiece["_timer"] = maxf(0.0, float(setpiece.get("_timer", 0.0)) - delta)

    if phase == "cooldown" and float(setpiece["_timer"]) <= 0.0:
        if int(setpiece.get("_salvos_left", 0)) <= 0:
            setpiece["_complete"] = true
            if visual != null:
                visual.visible = false
                visual.set_warning(false)
            return
        var lead := float(setpiece.get("lead", 70.0))
        var direction := 1.0 if player.velocity.x >= 0.0 else -1.0
        var offset_index := int(setpiece.get("_salvos_left", 1)) % 3 - 1
        var target_x := clampf(
            player.global_position.x + direction * lead + float(offset_index) * 72.0,
            float(setpiece.get("min_x", 0.0)),
            float(setpiece.get("max_x", _world_size.x)),
        )
        var target := Vector2(target_x, _floor_y - 4.0)
        setpiece["_target"] = target
        setpiece["_phase"] = "warning"
        setpiece["_timer"] = maxf(0.45, float(setpiece.get("telegraph", 0.95)))
        if visual != null:
            visual.position = target
            visual.visible = true
            visual.set_warning(true)
    elif phase == "warning" and float(setpiece["_timer"]) <= 0.0:
        var target: Vector2 = setpiece.get("_target", Vector2.ZERO)
        var radius := float(setpiece.get("radius", 82.0))
        if visual != null:
            visual.set_warning(false)
            visual.visible = false
        _add_explosion_fx(target, radius)
        var damage := int(setpiece.get("damage", 90))
        _damage_destructibles_in_radius(target, radius, damage)
        _damage_bunkers_in_radius(target, radius, damage)
        if Vector2(player.global_position).distance_to(target) <= minf(radius, ARTILLERY_PLAYER_DAMAGE_RADIUS):
            player.take_damage(1)
        setpiece["_salvos_left"] = maxi(0, int(setpiece.get("_salvos_left", 0)) - 1)
        setpiece["_phase"] = "cooldown"
        setpiece["_timer"] = maxf(0.45, float(setpiece.get("interval", 0.85)))

func _bunker_hitbox(setpiece: Dictionary) -> Rect2:
    var width := float(setpiece.get("w", 126.0))
    var height := float(setpiece.get("h", 82.0))
    return Rect2(
        Vector2(float(setpiece.get("x", 0.0)) - width * 0.5, float(setpiece.get("y", _floor_y)) - height),
        Vector2(width, height),
    )

func _damage_bunker_at(point: Vector2, damage: int) -> bool:
    for index in range(_setpieces.size()):
        var setpiece := _setpieces[index]
        if String(setpiece.get("type", "")) != "bunker_turret" or int(setpiece.get("_hp", 0)) <= 0:
            continue
        if not _bunker_hitbox(setpiece).has_point(point):
            continue
        _damage_bunker(index, damage)
        return true
    return false

func _damage_bunkers_in_radius(position: Vector2, radius: float, damage: int) -> void:
    for index in range(_setpieces.size()):
        var setpiece := _setpieces[index]
        if String(setpiece.get("type", "")) != "bunker_turret" or int(setpiece.get("_hp", 0)) <= 0:
            continue
        var distance := position.distance_to(_bunker_hitbox(setpiece).get_center())
        if distance > radius:
            continue
        _damage_bunker(index, _explosion_damage(damage, distance, radius))

func _damage_bunker(index: int, damage: int) -> void:
    var setpiece := _setpieces[index]
    var next_hp := maxi(0, int(setpiece.get("_hp", 0)) - damage)
    setpiece["_hp"] = next_hp
    var max_hp := maxi(1, int(setpiece.get("_max_hp", 1)))
    var visual = _setpiece_nodes.get(String(setpiece.get("_id", "")))
    if visual != null:
        visual.set_health_ratio(float(next_hp) / float(max_hp))
        if next_hp <= 0:
            visual.set_destroyed(true)
    if next_hp <= 0:
        _add_explosion_fx(_bunker_hitbox(setpiece).get_center(), 72.0)
    _setpieces[index] = setpiece

func _build_parallax_backdrop() -> void:
    if _parallax_root != null:
        _parallax_root.queue_free()
    _parallax_root = Node2D.new()
    _parallax_root.name = "ParallaxBackdrop"
    add_child(_parallax_root)

    var backdrop: Dictionary = _stage_manifest.get("backdrop", {})
    var seed := int(backdrop.get("seed", 1))
    var layers: Array = backdrop.get("layers", [])
    for index in range(layers.size()):
        var layer_spec = layers[index]
        if typeof(layer_spec) != TYPE_DICTIONARY:
            continue
        var spec: Dictionary = layer_spec
        var kind := String(spec.get("kind", "far_ridge"))
        var parallax := Parallax2D.new()
        parallax.name = "Parallax_%s_%02d" % [kind, index]
        var scroll := float(spec.get("scroll", 0.35))
        parallax.scroll_scale = Vector2(scroll, 1.0)
        parallax.z_index = int(spec.get("z", -60))
        _parallax_root.add_child(parallax)

        var visual = ParallaxLayerVisual.new()
        visual.name = "LayerVisual"
        parallax.add_child(visual)
        visual.configure(
            _world_size,
            _floor_y,
            kind,
            seed + index * 97,
            float(spec.get("intensity", 1.0)),
            String(backdrop.get("preset", _stage_manifest.get("theme", "night_front"))),
        )

func _build_environment_visual() -> void:
    environment_visual = EnvironmentVisual.new()
    environment_visual.name = "PremiumEnvironment"
    environment_visual.z_index = -20
    add_child(environment_visual)
    environment_visual.configure(_world_size, _floor_y, _platforms, _obstacles, String(_stage_manifest.get("theme", "night_front")), _platform_specs, _dressing_specs, _story_prop_specs, _obstacle_specs)

func _build_enemy_visuals() -> void:
    for enemy in enemies:
        _add_enemy_visual(enemy)

func _add_enemy_visual(enemy: Dictionary) -> void:
    var id := String(enemy["id"])
    if enemy_visuals.has(id):
        return
    var type := String(enemy["type"])
    var stats: Dictionary = ENEMY_TYPES[type]
    var visual = EnemyVisual.new()
    visual.name = "Enemy_%s" % id
    visual.z_index = 1
    add_child(visual)
    visual.configure(
        type,
        String(enemy["weapon"]),
        float(stats["height"]),
        int(enemy["hp"]),
        int(enemy["max_hp"]),
    )
    enemy_visuals[id] = visual
    _sync_enemy_visual(enemy, 0.0)

func _build_extraction_visual() -> void:
    extraction_visual = ExtractionVisual.new()
    extraction_visual.name = "Extraction"
    extraction_visual.position = Vector2(_extraction_x, _floor_y)
    extraction_visual.z_index = 1
    add_child(extraction_visual)
    extraction_visual.set_unlocked(false)

func _sync_enemy_visual(enemy: Dictionary, move_speed_scale: float) -> void:
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual == null:
        return
    # Enemies keep their torso/weapon facing Matthias even while retreating,
    # which reads as deliberate backpedalling instead of blind wandering.
    var direction := -1.0 if player.global_position.x < float(enemy["x"]) else 1.0
    visual.sync_state(
        float(enemy["x"]),
        float(enemy.get("y", _floor_y)),
        direction,
        move_speed_scale > 0.05,
        int(enemy["hp"]),
        int(enemy["max_hp"]),
        move_speed_scale,
    )
    var idle_pose := ""
    var surprise := 0.0
    if String(enemy.get("idle_pose", "")) != "":
        if not bool(enemy.get("alerted", false)):
            idle_pose = String(enemy["idle_pose"])
        elif float(enemy.get("reaction", 0.0)) > 0.0:
            surprise = 0.32
    visual.set_idle_state(idle_pose, surprise)

func _enemy_weapon_for(type: String, variant: int) -> String:
    match type:
        "knight":
            return "machinegun" if variant % 2 == 0 else "shotgun"
        "rook", "bishop":
            var choices := ["machinegun", "machinegun", "panzerfaust"]
            return choices[variant % choices.size()]
        "queen":
            var queen_choices := ["machinegun", "shotgun", "machinegun"]
            return queen_choices[variant % queen_choices.size()]
        "grenadier":
            return "panzerfaust" if variant % 3 == 0 else "machinegun"
        "scout":
            return "machinegun" if variant % 3 == 0 else "pistol"
        "commando":
            return "machinegun" if variant % 2 == 0 else "shotgun"
        "shield":
            return "shotgun" if variant % 2 == 0 else "machinegun"
        _:
            return "pistol" if variant % 2 == 0 else "machinegun"

func _spawn_boss_if_needed() -> void:
    if boss_spawned or boss_defeated or player.global_position.x < _boss_trigger_x:
        return
    boss_spawned = true
    boss = {
        "id": "boss-panzer-rook",
        "x": _boss_x,
        "hp": _boss_hp,
        "max_hp": _boss_hp,
        "regular_cooldown": 0.45,
        "shell_cooldown": 1.55,
        "shell_windup": 0.0,
        "shell_armed": false,
    }
    boss_visual = BossVisual.new()
    boss_visual.name = "BossPanzerRook"
    boss_visual.z_index = 1
    add_child(boss_visual)
    _sync_boss_visual()
    _notify_parent("boss-spawned")

func _sync_boss_visual() -> void:
    if boss_visual == null or boss.is_empty():
        return
    var facing := -1.0 if player.global_position.x < float(boss["x"]) else 1.0
    boss_visual.sync_state(
        float(boss["x"]),
        _floor_y,
        facing,
        int(boss["hp"]),
        int(boss["max_hp"]),
    )

func _update_projectiles(delta: float) -> void:
    for index in range(projectiles.size() - 1, -1, -1):
        var projectile := projectiles[index]
        var position: Vector2 = projectile["position"]
        var velocity: Vector2 = projectile["velocity"]
        position += velocity * delta
        projectile["position"] = position
        projectiles[index] = projectile

        var direct_destructible_damage := 0 if bool(projectile["explosive"]) else int(projectile["damage"])
        if _damage_destructible_at(position, direct_destructible_damage):
            if bool(projectile["explosive"]):
                _explode_player_weapon(position, PANZER_BLAST_RADIUS, int(projectile["damage"]))
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    false,
                )
            projectiles.remove_at(index)
            continue

        var direct_bunker_damage := 0 if bool(projectile["explosive"]) else int(projectile["damage"])
        if _damage_bunker_at(position, direct_bunker_damage):
            if bool(projectile["explosive"]):
                _explode_player_weapon(position, PANZER_BLAST_RADIUS, int(projectile["damage"]))
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    false,
                )
            projectiles.remove_at(index)
            continue

        if _point_hits_stage_geometry(position):
            if bool(projectile["explosive"]):
                _explode_player_weapon(position, PANZER_BLAST_RADIUS, int(projectile["damage"]))
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    false,
                )
            projectiles.remove_at(index)
            continue

        var hit_target := false
        for enemy_index in range(enemies.size()):
            var enemy := enemies[enemy_index]
            if int(enemy["hp"]) <= 0:
                continue
            if not _enemy_rect(enemy).has_point(position):
                continue
            if bool(projectile["explosive"]):
                _explode_player_weapon(position, PANZER_BLAST_RADIUS, int(projectile["damage"]))
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    false,
                )
                enemy["hp"] = maxi(0, int(enemy["hp"]) - int(projectile["damage"]))
                enemies[enemy_index] = enemy
                if _enemy_is_static_sentry(enemy):
                    _raise_enemy_alarm(enemy_index)
                    enemy = enemies[enemy_index]
                _sync_enemy_visual(enemy, 0.0)
            hit_target = true
            break

        if not hit_target and boss_spawned and not boss_defeated and _boss_rect().has_point(position):
            if bool(projectile["explosive"]):
                _explode_player_weapon(position, PANZER_BLAST_RADIUS, int(projectile["damage"]))
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    false,
                )
                boss["hp"] = maxi(0, int(boss["hp"]) - int(projectile["damage"]))
                _sync_boss_visual()
                if int(boss["hp"]) <= 0:
                    _defeat_boss()
            hit_target = true

        if hit_target:
            projectiles.remove_at(index)
            continue

        if (
            position.x < -30.0
            or position.x > _world_size.x + 30.0
            or position.y < -30.0
            or position.y > _world_size.y + 30.0
        ):
            projectiles.remove_at(index)

func _update_grenades(delta: float) -> void:
    for index in range(thrown_grenades.size() - 1, -1, -1):
        var grenade := thrown_grenades[index]
        var position: Vector2 = grenade["position"]
        var velocity: Vector2 = grenade["velocity"]
        grenade["fuse"] = float(grenade["fuse"]) - delta
        velocity.y += GRENADE_GRAVITY * delta
        position += velocity * delta

        if position.y >= _floor_y - 8.0 and velocity.y > 0.0:
            position.y = _floor_y - 8.0
            velocity.y = -absf(velocity.y) * GRENADE_BOUNCE
            velocity.x *= GRENADE_FRICTION
            if absf(velocity.y) < 55.0:
                velocity.y = 0.0

        grenade["position"] = position
        grenade["velocity"] = velocity
        grenade["spin"] = float(grenade["spin"]) + delta * 8.0
        thrown_grenades[index] = grenade

        if float(grenade["fuse"]) <= 0.0:
            _explode_player_weapon(position, GRENADE_RADIUS, GRENADE_DAMAGE)
            thrown_grenades.remove_at(index)

func _explode_player_weapon(position: Vector2, radius: float, damage: int) -> void:
    _add_explosion_fx(position, radius)
    _damage_bunkers_in_radius(position, radius, damage)
    _damage_destructibles_in_radius(position, radius, damage)
    for enemy_index in range(enemies.size()):
        var enemy := enemies[enemy_index]
        if int(enemy["hp"]) <= 0:
            continue
        var distance := position.distance_to(_enemy_rect(enemy).get_center())
        if distance > radius:
            continue
        var applied := _explosion_damage(damage, distance, radius)
        enemy["hp"] = maxi(0, int(enemy["hp"]) - applied)
        enemies[enemy_index] = enemy
        if int(enemy["hp"]) > 0 and _enemy_is_static_sentry(enemy):
            _raise_enemy_alarm(enemy_index)
            enemy = enemies[enemy_index]
        _sync_enemy_visual(enemy, 0.0)

    if boss_spawned and not boss_defeated and not boss.is_empty():
        var distance := position.distance_to(_boss_rect().get_center())
        if distance <= radius:
            boss["hp"] = maxi(0, int(boss["hp"]) - _explosion_damage(damage, distance, radius))
            _sync_boss_visual()
            if int(boss["hp"]) <= 0:
                _defeat_boss()

func _explosion_damage(base_damage: int, distance: float, radius: float) -> int:
    var falloff := 1.0 - distance / (radius * 1.35)
    return maxi(1, int(round(float(base_damage) * clampf(falloff, 0.0, 1.0))))

func _add_explosion_fx(position: Vector2, radius: float) -> void:
    combat_audio.play_explosion()
    _add_camera_kick(Vector2(randf_range(-0.7, 0.7), randf_range(-0.45, 0.25)), 7.0)
    explosion_fx.append({
        "position": position,
        "radius": radius,
        "age": 0.0,
        "duration": EXPLOSION_VISUAL_SECONDS,
    })

func _update_explosion_fx(delta: float) -> void:
    for index in range(explosion_fx.size() - 1, -1, -1):
        var effect := explosion_fx[index]
        effect["age"] = float(effect["age"]) + delta
        if float(effect["age"]) >= float(effect["duration"]):
            explosion_fx.remove_at(index)
        else:
            explosion_fx[index] = effect

func _initial_enemy_reaction(spawn_x: float, index: int) -> float:
    if spawn_x < 900.0:
        return 0.75
    if spawn_x < 1220.0:
        return 0.55
    if spawn_x < 1420.0:
        return 0.42
    if spawn_x < 1600.0:
        return 0.32
    return 0.10 + float(index % 4) * 0.055


func _enemy_aggro_range() -> float:
    # The opening still stages the first squad, but anything visible in front of
    # Matthias should not read as a cardboard target.
    if player.global_position.x < START_ZONE_END_X:
        return START_ZONE_AGGRO_RANGE
    return ENEMY_AGGRO_RANGE

func _alert_enemies(world_x: float, hearing_range: float) -> void:
    if player.global_position.x < OPENING_SAFE_UNTIL_X:
        return
    var effective_hearing := hearing_range
    if player.global_position.x < START_ZONE_END_X:
        # Early gunfire should wake the next visible threat, not the whole squad.
        effective_hearing = minf(effective_hearing, START_ZONE_AGGRO_RANGE)
    for index in range(enemies.size()):
        var enemy := enemies[index]
        if int(enemy["hp"]) <= 0:
            continue
        if absf(float(enemy["x"]) - world_x) <= effective_hearing:
            enemy["alerted"] = true
            if player.global_position.x < START_ZONE_END_X:
                enemy["reaction"] = maxf(
                    float(enemy.get("reaction", 0.0)),
                    OPENING_ALERT_REACTION_MIN,
                )
            else:
                enemy["reaction"] = minf(float(enemy.get("reaction", 0.0)), 0.12)
            enemies[index] = enemy

func _enemy_engaged(enemy: Dictionary, abs_distance: float) -> bool:
    if player.dead or player.is_game_over:
        return false
    if player.global_position.x < OPENING_SAFE_UNTIL_X:
        return false
    if abs_distance <= _enemy_aggro_range() and not bool(enemy.get("alerted", false)):
        enemy["alerted"] = true
        if String(enemy.get("idle_pose", "")) != "":
            enemy["reaction"] = maxf(
                float(enemy.get("reaction", 0.0)),
                float(enemy.get("idle_reaction", IDLE_SURPRISE_MIN)),
            )
    if not bool(enemy.get("alerted", false)):
        return false
    if abs_distance > ENEMY_DISENGAGE_RANGE:
        enemy["alerted"] = false
        return false
    return true

func _enemy_is_static_sentry(enemy: Dictionary) -> bool:
    return (
        String(enemy.get("idle_pose", "")) != ""
        or String(enemy.get("type", "")) in ["rook", "bishop"]
        or String(enemy.get("role", "")) == "hold"
    )

func _raise_enemy_alarm(source_index: int, radius: float = STATIC_ALARM_RANGE) -> void:
    if source_index < 0 or source_index >= enemies.size():
        return
    var source := enemies[source_index]
    source["alerted"] = true
    source["reaction"] = minf(float(source.get("reaction", 0.0)), 0.18)
    enemies[source_index] = source
    var source_x := float(source["x"])
    for index in range(enemies.size()):
        if index == source_index:
            continue
        var enemy := enemies[index]
        if int(enemy.get("hp", 0)) <= 0:
            continue
        if absf(float(enemy["x"]) - source_x) > radius:
            continue
        enemy["alerted"] = true
        if String(enemy.get("idle_pose", "")) != "":
            enemy["reaction"] = maxf(
                float(enemy.get("reaction", 0.0)),
                float(enemy.get("idle_reaction", IDLE_SURPRISE_MIN)),
            )
        else:
            enemy["reaction"] = minf(float(enemy.get("reaction", 0.0)), 0.22)
        enemies[index] = enemy

func _enemy_weapon_standoff(enemy: Dictionary, stats: Dictionary) -> float:
    var standoff := float(stats["standoff"])
    match String(enemy.get("weapon", "pistol")):
        "shotgun":
            standoff = 205.0
        "machinegun":
            standoff = 330.0
        "panzerfaust":
            standoff = 590.0
    if _enemy_suppression_remaining > 0.0 and String(enemy.get("role", "")) == "assaulter":
        standoff = maxf(145.0, standoff - SUPPRESSION_ASSAULT_STANDOFF_BONUS)
    if not _enemy_has_line_of_sight(enemy, stats):
        standoff = maxf(140.0, standoff - BLOCKED_LOS_PUSH_BONUS)
    return standoff

func _enemy_has_line_of_sight(enemy: Dictionary, stats: Dictionary) -> bool:
    var origin := Vector2(
        float(enemy["x"]),
        float(enemy.get("y", _floor_y)) - float(stats["height"]) * 0.58,
    )
    var target := Vector2(player.global_position) + Vector2(0.0, -18.0)
    return not _platform_blocks_line(origin, target)

func _platform_blocks_line(origin: Vector2, target: Vector2) -> bool:
    var dx := target.x - origin.x
    if absf(dx) < 0.001:
        return false
    var line_min_x := minf(origin.x, target.x)
    var line_max_x := maxf(origin.x, target.x)
    for platform in _platforms:
        var platform_min_x := platform.position.x
        var platform_max_x := platform.position.x + platform.size.x
        if platform_max_x < line_min_x or platform_min_x > line_max_x:
            continue
        var sample_x := clampf(platform.get_center().x, line_min_x, line_max_x)
        var t := clampf((sample_x - origin.x) / dx, 0.0, 1.0)
        var line_y := lerpf(origin.y, target.y, t)
        var top := platform.position.y - 3.0
        var bottom := platform.position.y + platform.size.y + 3.0
        if line_y >= top and line_y <= bottom:
            return true
    for obstacle in _obstacles:
        var obstacle_min_x := obstacle.position.x
        var obstacle_max_x := obstacle.end.x
        if obstacle_max_x < line_min_x or obstacle_min_x > line_max_x:
            continue
        var sample_x := clampf(obstacle.get_center().x, line_min_x, line_max_x)
        var t := clampf((sample_x - origin.x) / dx, 0.0, 1.0)
        var line_y := lerpf(origin.y, target.y, t)
        if line_y >= obstacle.position.y - 3.0 and line_y <= obstacle.end.y + 3.0:
            return true
    for platform in _dynamic_platform_rects():
        if platform.end.x < line_min_x or platform.position.x > line_max_x:
            continue
        var sample_x := clampf(platform.get_center().x, line_min_x, line_max_x)
        var t := clampf((sample_x - origin.x) / dx, 0.0, 1.0)
        var line_y := lerpf(origin.y, target.y, t)
        if line_y >= platform.position.y - 3.0 and line_y <= platform.end.y + 3.0:
            return true
    for obstacle in _destructible_geometry_rects():
        if obstacle.end.x < line_min_x or obstacle.position.x > line_max_x:
            continue
        var sample_x := clampf(obstacle.get_center().x, line_min_x, line_max_x)
        var t := clampf((sample_x - origin.x) / dx, 0.0, 1.0)
        var line_y := lerpf(origin.y, target.y, t)
        if line_y >= obstacle.position.y - 3.0 and line_y <= obstacle.end.y + 3.0:
            return true
    return false

func _grenade_evade_direction(enemy_x: float) -> float:
    var nearest_distance := GRENADE_EVADE_RADIUS + 1.0
    var nearest_x := 0.0
    for grenade in thrown_grenades:
        var grenade_x := float(Vector2(grenade["position"]).x)
        var distance := absf(enemy_x - grenade_x)
        if distance < nearest_distance:
            nearest_distance = distance
            nearest_x = grenade_x
    if nearest_distance > GRENADE_EVADE_RADIUS:
        return 0.0
    if is_equal_approx(enemy_x, nearest_x):
        return -1.0 if player.global_position.x > enemy_x else 1.0
    return 1.0 if enemy_x > nearest_x else -1.0

func _update_enemies(delta: float) -> void:
    for index in range(enemies.size()):
        var enemy := enemies[index]
        if int(enemy["hp"]) <= 0:
            _sync_enemy_visual(enemy, 0.0)
            continue
        var type := String(enemy["type"])
        var stats: Dictionary = ENEMY_TYPES[type]
        var distance_x: float = float(player.global_position.x) - float(enemy["x"])
        var abs_distance: float = absf(distance_x)
        var movement_speed_scale := 0.0

        var player_active := _enemy_engaged(enemy, abs_distance)
        if player_active:
            enemy["reaction"] = maxf(0.0, float(enemy.get("reaction", 0.0)) - delta)
        var can_act := player_active and float(enemy.get("reaction", 0.0)) <= 0.0

        if type == "bishop":
            if can_act:
                movement_speed_scale = 1.0 if _update_bishop(enemy, delta, abs_distance, distance_x) else 0.0
            else:
                _set_bishop_telegraph(enemy, 0.0, 0.0)
            _sync_enemy_visual(enemy, movement_speed_scale)
            enemies[index] = enemy
            continue

        if type == "knight":
            enemy["leap_cooldown"] = maxf(0.0, float(enemy["leap_cooldown"]) - delta)

        if can_act:
            var speed := float(stats["speed"])
            var standoff := _enemy_weapon_standoff(enemy, stats)
            if type == "knight":
                var ladder_scale := _update_enemy_ladder_movement(enemy, stats, delta)
                if ladder_scale >= 0.0:
                    movement_speed_scale = ladder_scale
                else:
                    var move_direction := 1.0 if distance_x > 0.0 else -1.0
                    var knight_speed_scale := KNIGHT_NEAR_SPEED_SCALE
                    if abs_distance > standoff + SOLDIER_SPRINT_MARGIN:
                        knight_speed_scale = KNIGHT_SPRINT_MULTIPLIER
                    elif abs_distance > standoff:
                        knight_speed_scale = 1.0
                    if not bool(enemy.get("on_ground", true)):
                        move_direction = float(enemy.get("air_direction", move_direction))
                        knight_speed_scale = maxf(
                            knight_speed_scale,
                            float(enemy.get("air_speed_scale", 1.0)),
                        )
                    elif _enemy_try_auto_jump(enemy, move_direction):
                        knight_speed_scale = maxf(
                            knight_speed_scale,
                            float(enemy.get("air_speed_scale", 1.0)),
                        )
                    var knight_speed := speed * knight_speed_scale
                    var previous_x := float(enemy["x"])
                    enemy["x"] = clampf(
                        previous_x + move_direction * knight_speed * delta,
                        maxf(0.0, float(enemy["spawn_x"]) - 360.0),
                        minf(_world_size.x, float(enemy["spawn_x"]) + 360.0),
                    )
                    if not is_equal_approx(previous_x, float(enemy["x"])):
                        movement_speed_scale = knight_speed_scale
                    if (
                        float(enemy["leap_cooldown"]) <= 0.0
                        and abs_distance < KNIGHT_LEAP_RANGE
                        and bool(enemy["on_ground"])
                        and String(enemy.get("traversal_mode", "ground")) == "ground"
                    ):
                        _begin_enemy_jump(
                            enemy,
                            move_direction,
                            KNIGHT_LEAP_SPEED,
                            maxf(1.15, knight_speed_scale),
                        )
                        enemy["leap_cooldown"] = randf_range(
                            KNIGHT_LEAP_COOLDOWN_MIN,
                            KNIGHT_LEAP_COOLDOWN_MAX,
                        )
            elif speed > 0.0:
                movement_speed_scale = _update_soldier_movement(
                    enemy,
                    stats,
                    standoff,
                    distance_x,
                    abs_distance,
                    delta,
                )

        if _enemy_is_traversal_mobile(type):
            _update_enemy_vertical(enemy, delta)

        _sync_enemy_visual(enemy, movement_speed_scale)
        enemy["cooldown"] = maxf(0.0, float(enemy["cooldown"]) - delta)
        if (
            can_act
            and float(enemy["cooldown"]) <= 0.0
            and String(enemy.get("traversal_mode", "ground")) != "ladder"
        ):
            _try_enemy_fire(enemy)
            enemy["cooldown"] = _enemy_fire_cooldown(String(enemy["weapon"]))
        enemies[index] = enemy

func _enemy_is_traversal_mobile(type: String) -> bool:
    if type in ["rook", "bishop"]:
        return false
    return float(ENEMY_TYPES.get(type, {}).get("speed", 0.0)) > 0.0

func _update_soldier_movement(enemy: Dictionary, stats: Dictionary, standoff: float, distance_x: float, abs_distance: float, delta: float) -> float:
    var speed := float(stats["speed"])
    if speed <= 0.0:
        return 0.0

    var ladder_scale := _update_enemy_ladder_movement(enemy, stats, delta)
    if ladder_scale >= 0.0:
        return ladder_scale

    var toward_player := 1.0 if distance_x > 0.0 else -1.0
    var move_direction := 0.0
    var speed_scale := 0.0
    var grenade_evade := _grenade_evade_direction(float(enemy["x"]))
    if not is_zero_approx(grenade_evade):
        move_direction = grenade_evade
        speed_scale = GRENADE_EVADE_SPEED_SCALE
    elif abs_distance > standoff + SOLDIER_SPRINT_MARGIN:
        move_direction = toward_player
        speed_scale = SOLDIER_SPRINT_MULTIPLIER
    elif abs_distance > standoff + SOLDIER_ADVANCE_MARGIN:
        move_direction = toward_player
        speed_scale = SOLDIER_ADVANCE_MULTIPLIER
    elif abs_distance > standoff + SOLDIER_COMFORT_MARGIN:
        move_direction = toward_player
        speed_scale = SOLDIER_CREEP_MULTIPLIER
    elif abs_distance < standoff * SOLDIER_RETREAT_RATIO:
        # Too close: create firing room while keeping the visual facing Matthias.
        move_direction = -toward_player
        speed_scale = SOLDIER_BACKPEDAL_MULTIPLIER
    elif absf(_player_foot_y() - float(enemy.get("y", _floor_y))) > ENEMY_TRAVERSAL_LADDER_THRESHOLD:
        # Vertical separation must not freeze a soldier directly below/above
        # Matthias. Keep searching laterally for a route instead of becoming a
        # firing-range tancredo.
        move_direction = toward_player
        speed_scale = SOLDIER_CREEP_MULTIPLIER
    else:
        return 0.0

    if (
        _enemy_suppression_remaining > 0.0
        and String(enemy.get("role", "")) == "assaulter"
        and is_equal_approx(move_direction, toward_player)
    ):
        speed_scale *= SUPPRESSION_ASSAULT_SPEED_MULTIPLIER

    if not bool(enemy.get("on_ground", true)):
        move_direction = float(enemy.get("air_direction", move_direction))
        speed_scale = maxf(speed_scale, float(enemy.get("air_speed_scale", 1.0)))
    elif _enemy_try_auto_jump(enemy, move_direction):
        speed_scale = maxf(speed_scale, float(enemy.get("air_speed_scale", 1.0)))

    var previous_x := float(enemy["x"])
    enemy["x"] = clampf(
        previous_x + move_direction * speed * speed_scale * delta,
        maxf(0.0, float(enemy["spawn_x"]) - SOLDIER_ROAM_LIMIT),
        minf(_world_size.x, float(enemy["spawn_x"]) + SOLDIER_ROAM_LIMIT),
    )
    if is_equal_approx(previous_x, float(enemy["x"])):
        return 0.0
    return speed_scale

func _player_foot_y() -> float:
    return float(player.global_position.y) + PLAYER_STANDING_HEIGHT * 0.5

func _update_enemy_ladder_movement(enemy: Dictionary, stats: Dictionary, delta: float) -> float:
    if String(enemy.get("traversal_mode", "ground")) == "ladder":
        return _climb_enemy_ladder(enemy, delta)

    if not bool(enemy.get("on_ground", true)):
        return -1.0

    var ladder := _enemy_route_ladder_toward(enemy, _player_foot_y())
    if ladder.is_empty():
        return -1.0

    var ladder_x := float(ladder["x"])
    var dx := ladder_x - float(enemy["x"])
    if absf(dx) <= ENEMY_TRAVERSAL_LADDER_SNAP_X:
        enemy["x"] = ladder_x
        enemy["traversal_mode"] = "ladder"
        enemy["traversal_ladder"] = ladder.duplicate(true)
        enemy["vy"] = 0.0
        enemy["on_ground"] = false
        return 1.0

    var direction := signf(dx)
    var speed_scale := 1.10
    if _enemy_try_auto_jump(enemy, direction):
        speed_scale = maxf(speed_scale, float(enemy.get("air_speed_scale", 1.0)))
    var speed := float(stats["speed"]) * speed_scale
    var roam := SOLDIER_ROAM_LIMIT + 120.0
    enemy["x"] = clampf(
        float(enemy["x"]) + direction * speed * delta,
        maxf(0.0, float(enemy["spawn_x"]) - roam),
        minf(_world_size.x, float(enemy["spawn_x"]) + roam),
    )
    return speed_scale

func _enemy_route_ladder_toward(enemy: Dictionary, target_foot_y: float) -> Dictionary:
    var current_y := float(enemy.get("y", _floor_y))
    var current_x := float(enemy.get("x", 0.0))
    var going_up := target_foot_y < current_y - ENEMY_TRAVERSAL_LADDER_THRESHOLD
    var going_down := target_foot_y > current_y + ENEMY_TRAVERSAL_LADDER_THRESHOLD
    if not going_up and not going_down:
        return {}

    var best: Dictionary = {}
    var best_score := INF
    var raw_ladders = _stage_manifest.get("ladders", [])
    if typeof(raw_ladders) != TYPE_ARRAY:
        return {}

    for raw in raw_ladders:
        if typeof(raw) != TYPE_DICTIONARY:
            continue
        var ladder := Dictionary(raw)
        var ladder_x := float(ladder.get("x", -1.0))
        var top_y := float(ladder.get("top_y", -1.0))
        var bottom_y := float(ladder.get("bottom_y", -1.0))
        if ladder_x < 0.0 or top_y < 0.0 or bottom_y <= top_y:
            continue
        var x_distance := absf(ladder_x - current_x)
        if x_distance > ENEMY_TRAVERSAL_LADDER_APPROACH_RANGE:
            continue

        var target_y := top_y if going_up else bottom_y
        if going_up:
            if absf(current_y - bottom_y) > 46.0:
                continue
            if top_y >= current_y - ENEMY_TRAVERSAL_LADDER_THRESHOLD:
                continue
        else:
            if absf(current_y - top_y) > 46.0:
                continue
            if bottom_y <= current_y + ENEMY_TRAVERSAL_LADDER_THRESHOLD:
                continue

        var score := x_distance + absf(target_y - target_foot_y) * 0.35
        if score >= best_score:
            continue
        best_score = score
        best = ladder.duplicate(true)
        best["_target_y"] = target_y
        best["_ascending"] = going_up
    return best

func _climb_enemy_ladder(enemy: Dictionary, delta: float) -> float:
    var ladder_variant = enemy.get("traversal_ladder", {})
    if typeof(ladder_variant) != TYPE_DICTIONARY:
        enemy["traversal_mode"] = "ground"
        enemy["on_ground"] = true
        return 0.0
    var ladder := Dictionary(ladder_variant)
    if ladder.is_empty():
        enemy["traversal_mode"] = "ground"
        enemy["on_ground"] = true
        return 0.0

    var ladder_x := float(ladder.get("x", float(enemy["x"])))
    var target_y := float(ladder.get("_target_y", float(enemy.get("y", _floor_y))))
    enemy["x"] = move_toward(float(enemy["x"]), ladder_x, ENEMY_TRAVERSAL_LADDER_SPEED * delta)
    enemy["y"] = move_toward(
        float(enemy.get("y", _floor_y)),
        target_y,
        ENEMY_TRAVERSAL_LADDER_SPEED * delta,
    )
    enemy["vy"] = 0.0
    enemy["on_ground"] = false

    if absf(float(enemy["y"]) - target_y) > 1.0:
        return 1.0

    enemy["y"] = target_y
    enemy["vy"] = 0.0
    enemy["on_ground"] = true
    enemy["traversal_mode"] = "ground"
    enemy["air_speed_scale"] = 1.0
    enemy["air_direction"] = 0.0
    if bool(ladder.get("_ascending", false)):
        enemy["x"] = clampf(
            ladder_x + signf(float(ladder.get("exit_dir", 1.0))) * ENEMY_TRAVERSAL_LADDER_EXIT_NUDGE,
            0.0,
            _world_size.x,
        )
    enemy["traversal_ladder"] = {}
    return 1.0

func _enemy_try_auto_jump(enemy: Dictionary, direction: float) -> bool:
    if is_zero_approx(direction):
        return false
    if not bool(enemy.get("on_ground", true)):
        return false
    if String(enemy.get("traversal_mode", "ground")) == "ladder":
        return false

    if not _enemy_pit_ahead(enemy, direction).is_empty():
        _begin_enemy_jump(
            enemy,
            direction,
            ENEMY_TRAVERSAL_PIT_JUMP_SPEED,
            _enemy_air_speed_scale(
                enemy,
                ENEMY_TRAVERSAL_PIT_AIR_SPEED_SCALE,
                ENEMY_TRAVERSAL_PIT_MIN_AIR_SPEED,
            ),
        )
        return true

    if not _enemy_jump_blocker_ahead(enemy, direction).is_empty():
        _begin_enemy_jump(
            enemy,
            direction,
            ENEMY_TRAVERSAL_JUMP_SPEED,
            _enemy_air_speed_scale(
                enemy,
                ENEMY_TRAVERSAL_TERRAIN_AIR_SPEED_SCALE,
                ENEMY_TRAVERSAL_TERRAIN_MIN_AIR_SPEED,
            ),
        )
        return true
    return false

func _enemy_air_speed_scale(enemy: Dictionary, floor_scale: float, min_world_speed: float) -> float:
    var type := String(enemy.get("type", "pawn"))
    var stats: Dictionary = ENEMY_TYPES.get(type, ENEMY_TYPES["pawn"])
    var base_speed := maxf(1.0, float(stats.get("speed", 1.0)))
    return maxf(floor_scale, min_world_speed / base_speed)

func _begin_enemy_jump(enemy: Dictionary, direction: float, jump_speed: float, air_speed_scale: float) -> void:
    enemy["vy"] = -absf(jump_speed)
    enemy["on_ground"] = false
    enemy["traversal_mode"] = "jump"
    enemy["air_direction"] = signf(direction)
    enemy["air_speed_scale"] = maxf(1.0, air_speed_scale)

func _enemy_jump_blocker_ahead(enemy: Dictionary, direction: float) -> Dictionary:
    var world_x := float(enemy.get("x", 0.0))
    var foot_y := float(enemy.get("y", _floor_y))
    var type := String(enemy.get("type", "pawn"))
    var stats: Dictionary = ENEMY_TYPES.get(type, ENEMY_TYPES["pawn"])
    var body_height := float(stats.get("height", 76.0))
    var body_width := float(stats.get("width", 48.0))
    var half_width := body_width * 0.5
    var body_top := foot_y - body_height + 8.0
    var nearest: Dictionary = {}
    var nearest_distance := ENEMY_TRAVERSAL_LOOKAHEAD + 1.0

    var surfaces: Array[Rect2] = []
    surfaces.append_array(_obstacles)
    surfaces.append_array(_platforms)
    surfaces.append_array(_dynamic_platform_rects())
    surfaces.append_array(_destructible_geometry_rects())

    for rect in surfaces:
        var rise := foot_y - rect.position.y
        if rise < 8.0 or rise > ENEMY_TRAVERSAL_MAX_CLIMB_HEIGHT:
            continue
        if rect.end.y < body_top:
            continue
        var near_edge := rect.position.x if direction > 0.0 else rect.end.x
        var distance := (near_edge - world_x) * direction - half_width
        if distance < -half_width or distance > ENEMY_TRAVERSAL_LOOKAHEAD:
            continue
        if distance >= nearest_distance:
            continue
        nearest_distance = distance
        nearest = {"rect": rect, "distance": distance, "rise": rise}
    return nearest

func _enemy_pit_ahead(enemy: Dictionary, direction: float) -> Dictionary:
    if absf(float(enemy.get("y", _floor_y)) - _floor_y) > 4.0:
        return {}
    var world_x := float(enemy.get("x", 0.0))
    var raw_pits = _stage_manifest.get("pits", [])
    if typeof(raw_pits) != TYPE_ARRAY:
        return {}
    for raw in raw_pits:
        if typeof(raw) != TYPE_DICTIONARY:
            continue
        var pit := Dictionary(raw)
        var pit_x := float(pit.get("x", -1.0))
        var width := float(pit.get("w", 0.0))
        if pit_x < 0.0 or width <= 0.0:
            continue
        var edge := pit_x if direction > 0.0 else pit_x + width
        var distance := (edge - world_x) * direction
        if distance >= 0.0 and distance <= ENEMY_TRAVERSAL_LOOKAHEAD:
            return pit.duplicate(true)
    return {}

func _enemy_pit_below_x(world_x: float) -> bool:
    var raw_pits = _stage_manifest.get("pits", [])
    if typeof(raw_pits) != TYPE_ARRAY:
        return false
    for raw in raw_pits:
        if typeof(raw) != TYPE_DICTIONARY:
            continue
        var pit := Dictionary(raw)
        var pit_x := float(pit.get("x", -1.0))
        var width := float(pit.get("w", 0.0))
        if pit_x >= 0.0 and width > 0.0 and world_x >= pit_x and world_x <= pit_x + width:
            return true
    return false

func _update_enemy_vertical(enemy: Dictionary, delta: float) -> void:
    if String(enemy.get("traversal_mode", "ground")) == "ladder":
        return

    var foot_y := float(enemy.get("y", _floor_y))
    var velocity_y := float(enemy.get("vy", 0.0))
    var on_ground := bool(enemy.get("on_ground", true))
    var world_x := float(enemy["x"])

    if on_ground and not _enemy_has_support(world_x, foot_y):
        on_ground = false
        enemy["traversal_mode"] = "jump"

    if not on_ground:
        var previous_y := foot_y
        var gravity := KNIGHT_GRAVITY if String(enemy.get("type", "")) == "knight" else ENEMY_TRAVERSAL_GRAVITY
        velocity_y += gravity * delta
        foot_y += velocity_y * delta
        if velocity_y >= 0.0:
            var landing_y := _enemy_landing_y(world_x, previous_y, foot_y)
            if landing_y >= 0.0:
                foot_y = landing_y
                velocity_y = 0.0
                on_ground = true
                enemy["traversal_mode"] = "ground"
                enemy["air_speed_scale"] = 1.0
                enemy["air_direction"] = 0.0

    if foot_y > _world_size.y + 100.0:
        enemy["hp"] = 0
        on_ground = false

    enemy["y"] = foot_y
    enemy["vy"] = velocity_y
    enemy["on_ground"] = on_ground

func _enemy_has_support(world_x: float, foot_y: float) -> bool:
    if absf(foot_y - _floor_y) <= 2.0 and not _enemy_pit_below_x(world_x):
        return true
    var surfaces: Array[Rect2] = []
    surfaces.append_array(_platforms)
    surfaces.append_array(_dynamic_platform_rects())
    surfaces.append_array(_obstacles)
    surfaces.append_array(_destructible_geometry_rects())
    for surface in surfaces:
        if (
            absf(foot_y - surface.position.y) <= 2.0
            and world_x >= surface.position.x
            and world_x <= surface.end.x
        ):
            return true
    return false

func _enemy_landing_y(world_x: float, previous_y: float, next_y: float) -> float:
    var landing_y := -1.0
    var surfaces: Array[Rect2] = []
    surfaces.append_array(_platforms)
    surfaces.append_array(_dynamic_platform_rects())
    surfaces.append_array(_obstacles)
    surfaces.append_array(_destructible_geometry_rects())
    for surface in surfaces:
        var top := surface.position.y
        if (
            world_x >= surface.position.x
            and world_x <= surface.end.x
            and previous_y <= top
            and next_y >= top
        ):
            if landing_y < 0.0 or top < landing_y:
                landing_y = top
    if (
        previous_y <= _floor_y
        and next_y >= _floor_y
        and not _enemy_pit_below_x(world_x)
        and (landing_y < 0.0 or _floor_y < landing_y)
    ):
        landing_y = _floor_y
    return landing_y

func _update_bishop(enemy: Dictionary, delta: float, distance: float, distance_x: float) -> bool:
    var stats: Dictionary = ENEMY_TYPES["bishop"]
    enemy["shell_cooldown"] = _bishop_cooldown_tick(
        float(enemy["shell_cooldown"]), distance, BISHOP_SHELL_RANGE, BISHOP_SHELL_TELEGRAPH, delta
    )
    enemy["suppression_cooldown"] = _bishop_cooldown_tick(
        float(enemy["suppression_cooldown"]), distance, BISHOP_SUPPRESSION_RANGE, BISHOP_SUPPRESSION_TELEGRAPH, delta
    )
    enemy["suppression_shot_cooldown"] = maxf(0.0, float(enemy["suppression_shot_cooldown"]) - delta)

    var shell_clear_for_suppression := float(enemy["shell_cooldown"]) > BISHOP_SHELL_TELEGRAPH + 0.35
    var suppression_charging := (
        int(enemy["suppression_shots"]) <= 0
        and shell_clear_for_suppression
        and distance < BISHOP_SUPPRESSION_RANGE
        and float(enemy["suppression_cooldown"]) > 0.0
        and float(enemy["suppression_cooldown"]) <= BISHOP_SUPPRESSION_TELEGRAPH
    )
    var moved := false

    if int(enemy["suppression_shots"]) > 0:
        enemy["shell_cooldown"] = maxf(float(enemy["shell_cooldown"]), BISHOP_SHELL_TELEGRAPH + 0.55)
        if float(enemy["suppression_shot_cooldown"]) <= 0.0:
            _fire_bishop_suppression(enemy, int(enemy["suppression_index"]))
            enemy["suppression_index"] = int(enemy["suppression_index"]) + 1
            enemy["suppression_shots"] = int(enemy["suppression_shots"]) - 1
            enemy["suppression_shot_cooldown"] = BISHOP_SUPPRESSION_INTERVAL
            if int(enemy["suppression_shots"]) <= 0:
                enemy["suppression_cooldown"] = 3.15 + randf_range(0.0, 0.65)
                enemy["cooldown"] = maxf(float(enemy["cooldown"]), 0.32)
    else:
        if not suppression_charging and distance > float(stats["standoff"]):
            var move_direction := 1.0 if distance_x > 0.0 else -1.0
            enemy["x"] = clampf(
                float(enemy["x"]) + move_direction * float(stats["speed"]) * delta,
                maxf(0.0, float(enemy["spawn_x"]) - 360.0),
                minf(_world_size.x, float(enemy["spawn_x"]) + 360.0),
            )
            moved = true

        var regular_fire_clear := not suppression_charging and float(enemy["shell_cooldown"]) > BISHOP_SHELL_TELEGRAPH
        if regular_fire_clear:
            enemy["cooldown"] = maxf(0.0, float(enemy["cooldown"]) - delta)
            if float(enemy["cooldown"]) <= 0.0:
                _try_enemy_fire(enemy)
                enemy["cooldown"] = _enemy_fire_cooldown(String(enemy["weapon"]))

        if shell_clear_for_suppression and distance < BISHOP_SUPPRESSION_RANGE and float(enemy["suppression_cooldown"]) <= 0.0:
            enemy["suppression_shots"] = BISHOP_SUPPRESSION_SHOTS
            enemy["suppression_index"] = 0
            enemy["suppression_shot_cooldown"] = 0.0
            enemy["shell_cooldown"] = maxf(float(enemy["shell_cooldown"]), BISHOP_SHELL_TELEGRAPH + 0.70)
            moved = false
        elif distance < BISHOP_SHELL_RANGE and float(enemy["shell_cooldown"]) <= 0.0:
            _fire_bishop_shell(enemy)
            enemy["shell_cooldown"] = 2.05 + randf_range(0.0, 0.55)

    var shell_telegraph := _bishop_telegraph_strength(float(enemy["shell_cooldown"]), distance, BISHOP_SHELL_RANGE, BISHOP_SHELL_TELEGRAPH)
    var suppression_telegraph := 1.0 if int(enemy["suppression_shots"]) > 0 else _bishop_telegraph_strength(
        float(enemy["suppression_cooldown"]), distance, BISHOP_SUPPRESSION_RANGE, BISHOP_SUPPRESSION_TELEGRAPH
    )
    _set_bishop_telegraph(enemy, shell_telegraph, suppression_telegraph)
    return moved

func _bishop_cooldown_tick(current: float, distance: float, attack_range: float, telegraph_seconds: float, delta: float) -> float:
    if distance > attack_range:
        return maxf(current, telegraph_seconds)
    return current - delta

func _bishop_telegraph_strength(current: float, distance: float, attack_range: float, telegraph_seconds: float) -> float:
    if distance > attack_range:
        return 0.0
    if current <= 0.0:
        return 1.0
    return clampf(1.0 - current / telegraph_seconds, 0.0, 1.0)

func _set_bishop_telegraph(enemy: Dictionary, shell_strength: float, suppression_strength: float) -> void:
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual != null:
        visual.set_bishop_telegraph(shell_strength, suppression_strength)

func _fire_bishop_shell(enemy: Dictionary) -> void:
    var visual = enemy_visuals.get(String(enemy["id"]))
    var origin: Vector2 = _enemy_fire_origin(enemy)
    var target: Vector2 = Vector2(player.global_position) + Vector2(0.0, -18.0)
    var direction: Vector2 = (target - origin).normalized()
    var profile: Dictionary = ENEMY_FIRE_PROFILES["panzerfaust"]
    if not _can_spawn_hostile_shot(origin, "panzerfaust", 1):
        return
    enemy_projectiles.append({
        "position": origin,
        "velocity": direction * float(profile["speed"]),
        "weapon": "panzerfaust",
        "explosive": true,
    })
    _hostile_fire_gap_remaining = HOSTILE_FIRE_GAP
    if visual != null:
        visual.play_fire()

func _fire_bishop_suppression(enemy: Dictionary, shot_index: int) -> void:
    var lane: Dictionary = BISHOP_SUPPRESSION_LANES[shot_index % BISHOP_SUPPRESSION_LANES.size()]
    var direction := 1.0 if player.global_position.x > float(enemy["x"]) else -1.0
    var origin := Vector2(float(enemy["x"]) + direction * 48.0, _floor_y - float(lane["height"]))
    if not _can_spawn_hostile_shot(origin, "machinegun", 1):
        return
    enemy_projectiles.append({
        "position": origin,
        "velocity": Vector2(direction * float(lane["speed"]), 0.0),
        "weapon": "machinegun",
        "explosive": false,
    })
    _hostile_fire_gap_remaining = HOSTILE_FIRE_GAP
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual != null:
        visual.play_fire()

func _update_boss(delta: float) -> void:
    if not boss_spawned or boss_defeated or boss.is_empty():
        return
    _sync_boss_visual()
    if player.dead or player.is_game_over:
        if boss_visual != null:
            boss_visual.set_shell_telegraph(0.0)
        return

    var distance: float = absf(float(player.global_position.x) - float(boss["x"]))
    var boss_visible := _world_x_is_combat_visible(float(boss["x"]))
    boss["regular_cooldown"] = maxf(0.0, float(boss["regular_cooldown"]) - delta)
    boss["shell_cooldown"] = maxf(0.0, float(boss["shell_cooldown"]) - delta)

    if boss_visible and distance <= BOSS_REGULAR_RANGE and float(boss["regular_cooldown"]) <= 0.0:
        if _fire_boss(false):
            boss["regular_cooldown"] = _enemy_fire_cooldown("machinegun")
        else:
            boss["regular_cooldown"] = 0.12

    if bool(boss.get("shell_armed", false)):
        boss["shell_windup"] = maxf(0.0, float(boss["shell_windup"]) - delta)
        var strength := 1.0 - clampf(float(boss["shell_windup"]) / BOSS_SHELL_WINDUP, 0.0, 1.0)
        if boss_visual != null:
            boss_visual.set_shell_telegraph(strength)
        if not boss_visible:
            boss["shell_armed"] = false
            boss["shell_windup"] = 0.0
            boss["shell_cooldown"] = maxf(float(boss["shell_cooldown"]), 0.45)
            if boss_visual != null:
                boss_visual.set_shell_telegraph(0.0)
        elif float(boss["shell_windup"]) <= 0.0:
            if _fire_boss(true):
                boss["shell_cooldown"] = randf_range(1.75, 2.25)
            else:
                boss["shell_cooldown"] = 0.18
            boss["shell_armed"] = false
            if boss_visual != null:
                boss_visual.set_shell_telegraph(0.0)
    elif (
        boss_visible
        and distance <= BOSS_SHELL_RANGE
        and distance >= float(ENEMY_FIRE_PROFILES["panzerfaust"]["min_range"])
        and float(boss["shell_cooldown"]) <= 0.0
    ):
        boss["shell_armed"] = true
        boss["shell_windup"] = BOSS_SHELL_WINDUP
        if boss_visual != null:
            boss_visual.set_shell_telegraph(0.01)

func _try_enemy_fire(enemy: Dictionary) -> void:
    var weapon := String(enemy["weapon"])
    var profile: Dictionary = ENEMY_FIRE_PROFILES[weapon]
    var origin: Vector2 = _enemy_fire_origin(enemy)
    var target: Vector2 = Vector2(player.global_position) + Vector2(0.0, -18.0)
    if _platform_blocks_line(origin, target):
        return
    var target_delta: Vector2 = target - origin
    var distance: float = target_delta.length()
    var pellets := maxi(1, int(profile["pellets"]))
    if distance > float(profile["range"]) or distance < float(profile["min_range"]):
        return
    if not _can_spawn_hostile_shot(origin, weapon, pellets):
        return
    var base_direction: Vector2 = target_delta.normalized()
    var spread := float(profile["spread"])
    var miss_bias := 0.0
    if not bool(profile["explosive"]) and randf() < ENEMY_INTENTIONAL_MISS_CHANCE:
        var miss_sign := -1.0 if randf() < 0.5 else 1.0
        miss_bias = miss_sign * randf_range(ENEMY_MISS_ANGLE_MIN, ENEMY_MISS_ANGLE_MAX)
    for _pellet in range(pellets):
        var angle := miss_bias + (randf_range(-spread, spread) if spread > 0.0 else 0.0)
        enemy_projectiles.append({
            "position": origin,
            "velocity": base_direction.rotated(angle) * float(profile["speed"]),
            "weapon": weapon,
            "explosive": bool(profile["explosive"]),
        })
    _hostile_fire_gap_remaining = HOSTILE_FIRE_GAP
    if weapon == "machinegun" and String(enemy.get("role", "")) == "support":
        # Local squad coordination: a support burst briefly encourages assault
        # units to close distance while the gunner keeps Matthias occupied.
        _enemy_suppression_remaining = SUPPRESSION_PUSH_SECONDS
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual != null:
        visual.play_fire()

func _fire_boss(explosive: bool) -> bool:
    if boss_visual == null or player.dead or player.is_game_over:
        return false
    var weapon := "panzerfaust" if explosive else "machinegun"
    var profile: Dictionary = ENEMY_FIRE_PROFILES[weapon]
    var origin: Vector2 = boss_visual.muzzle_global_position()
    if not _can_spawn_hostile_shot(origin, weapon, 1):
        return false
    var target: Vector2 = Vector2(player.global_position) + Vector2(0.0, -18.0)
    var direction: Vector2 = (target - origin).normalized()
    var spread := 0.0 if explosive else float(profile["spread"])
    var angle := randf_range(-spread, spread) if spread > 0.0 else 0.0
    enemy_projectiles.append({
        "position": origin,
        "velocity": direction.rotated(angle) * float(profile["speed"]),
        "weapon": weapon,
        "explosive": explosive,
    })
    _hostile_fire_gap_remaining = HOSTILE_FIRE_GAP
    boss_visual.play_fire(explosive)
    return true

func _world_x_is_combat_visible(world_x: float) -> bool:
    var half_width := VIEW_SIZE.x * 0.5 + ENEMY_FIRE_SCREEN_MARGIN
    return absf(world_x - player.global_position.x) <= half_width

func _hostile_explosive_count() -> int:
    var count := 0
    for projectile in enemy_projectiles:
        if bool(projectile.get("explosive", false)):
            count += 1
    return count

func _can_spawn_hostile_shot(origin: Vector2, weapon: String, projectile_count: int) -> bool:
    if player.global_position.x < OPENING_SAFE_UNTIL_X:
        return false
    if _hostile_grace_remaining > 0.0:
        return false
    if not _world_x_is_combat_visible(origin.x):
        return false
    if _hostile_fire_gap_remaining > 0.0:
        return false
    if enemy_projectiles.size() + projectile_count > MAX_HOSTILE_PROJECTILES:
        return false
    if weapon == "panzerfaust" and _hostile_explosive_count() >= MAX_HOSTILE_EXPLOSIVES:
        return false
    return true

func _enemy_fire_cooldown(weapon: String) -> float:
    var profile: Dictionary = ENEMY_FIRE_PROFILES[weapon]
    # Enemy weapons intentionally fire as discrete arcade beats. Even gunners
    # pause between shots instead of chaining sub-0.2s bursts.
    return randf_range(float(profile["cooldown_min"]), float(profile["cooldown_max"]))

func _update_enemy_projectiles(delta: float) -> void:
    var player_hitbox: Rect2 = player.combat_hitbox_rect()
    for index in range(enemy_projectiles.size() - 1, -1, -1):
        var projectile := enemy_projectiles[index]
        var position: Vector2 = projectile["position"]
        var velocity: Vector2 = projectile["velocity"]
        position += velocity * delta
        projectile["position"] = position
        enemy_projectiles[index] = projectile

        if _point_hits_stage_geometry(position):
            if bool(projectile["explosive"]):
                _add_explosion_fx(position, PANZER_BLAST_RADIUS)
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    true,
                )
            enemy_projectiles.remove_at(index)
            continue

        if not player.dead and player_hitbox.has_point(position):
            if bool(projectile["explosive"]):
                _add_explosion_fx(position, PANZER_BLAST_RADIUS)
            else:
                _add_impact_fx(
                    position,
                    velocity,
                    String(projectile.get("weapon", "pistol")),
                    true,
                )

            # Consume the projectile before damage signals can mutate the whole
            # hostile-projectile array. A lethal hit emits player_died
            # synchronously and that handler clears enemy_projectiles.
            enemy_projectiles.remove_at(index)
            player.take_damage(1)
            if player.dead or player.is_game_over:
                return
            continue

        if (
            position.x < -30.0
            or position.x > _world_size.x + 30.0
            or position.y < -30.0
            or position.y > _world_size.y + 30.0
        ):
            enemy_projectiles.remove_at(index)

func _update_pickups() -> void:
    if player.dead or player.is_game_over:
        return
    for index in range(pickups.size()):
        var pickup := pickups[index]
        if bool(pickup["taken"]):
            continue
        if absf(player.global_position.x - float(pickup["x"])) > PICKUP_RADIUS_X:
            continue
        if absf(player.global_position.y - float(pickup.get("y", _floor_y - 44.0))) > 80.0:
            continue

        var kind := String(pickup["type"])
        var taken_now := false
        match kind:
            "grenade":
                taken_now = player.grant_grenades(3)
            "medkit":
                player.heal(1)
                taken_now = true
            _:
                taken_now = player.grant_weapon(kind)

        if not taken_now:
            continue
        pickup["taken"] = true
        pickups[index] = pickup
        combat_audio.play_pickup()
        _notify_parent("%s-pickup" % ("weapon" if kind in ["machinegun", "shotgun", "panzerfaust"] else kind))

func _enforce_boss_arena() -> void:
    if not boss_spawned or boss_defeated or player.global_position.x <= _boss_arena_left:
        return
    var clamped_x := clampf(player.global_position.x, _boss_arena_left, _boss_arena_right)
    if not is_equal_approx(clamped_x, player.global_position.x):
        player.global_position.x = clamped_x
        player.velocity.x = 0.0

func _check_victory() -> void:
    if mission_complete or not boss_defeated or player.dead or player.is_game_over:
        return
    if player.global_position.x < _extraction_x - 50.0:
        return
    mission_complete = true
    if extraction_visual != null:
        extraction_visual.set_complete(true)
    player.velocity = Vector2.ZERO
    _notify_parent("victory")

func _defeat_boss() -> void:
    if boss_defeated:
        return
    boss_defeated = true
    boss["hp"] = 0
    _sync_boss_visual()
    if extraction_visual != null:
        extraction_visual.set_unlocked(true)
    _notify_parent("boss-defeated")

func _enemy_rect(enemy: Dictionary) -> Rect2:
    var stats: Dictionary = ENEMY_TYPES[String(enemy["type"])]
    var width := float(stats["width"])
    var height := float(stats["height"])
    var foot_y := float(enemy.get("y", _floor_y))
    return Rect2(Vector2(float(enemy["x"]) - width * 0.5, foot_y - height), Vector2(width, height))

func _boss_rect() -> Rect2:
    return Rect2(
        Vector2(_boss_x - _boss_size.x * 0.5, _floor_y - _boss_size.y),
        _boss_size,
    )

func _enemy_fire_origin(enemy: Dictionary) -> Vector2:
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual != null:
        return visual.muzzle_global_position()
    var rect := _enemy_rect(enemy)
    var direction := -1.0 if player.global_position.x < float(enemy["x"]) else 1.0
    return Vector2(float(enemy["x"]) + direction * rect.size.x * 0.42, rect.position.y + rect.size.y * 0.42)

func _add_muzzle_fx(origin: Vector2, direction: Vector2, weapon: String) -> void:
    var safe_direction := direction.normalized()
    if safe_direction.length_squared() <= 0.001:
        safe_direction = Vector2.RIGHT
    var duration := MUZZLE_FLASH_SECONDS
    match weapon:
        "machinegun":
            duration = 0.060
        "shotgun":
            duration = 0.110
        "panzerfaust":
            duration = 0.145
    muzzle_fx.append({
        "position": origin,
        "direction": safe_direction,
        "weapon": weapon,
        "age": 0.0,
        "duration": duration,
    })

func _add_impact_fx(position: Vector2, velocity: Vector2, weapon: String, hostile: bool) -> void:
    combat_audio.play_impact(hostile)
    impact_fx.append({
        "position": position,
        "incoming": velocity.normalized(),
        "weapon": weapon,
        "hostile": hostile,
        "seed": randf_range(-1.0, 1.0),
        "age": 0.0,
        "duration": IMPACT_FX_SECONDS,
    })

func _update_combat_fx(delta: float) -> void:
    for index in range(muzzle_fx.size() - 1, -1, -1):
        var effect := muzzle_fx[index]
        effect["age"] = float(effect["age"]) + delta
        if float(effect["age"]) >= float(effect["duration"]):
            muzzle_fx.remove_at(index)
        else:
            muzzle_fx[index] = effect

    for index in range(impact_fx.size() - 1, -1, -1):
        var effect := impact_fx[index]
        effect["age"] = float(effect["age"]) + delta
        if float(effect["age"]) >= float(effect["duration"]):
            impact_fx.remove_at(index)
        else:
            impact_fx[index] = effect

func _draw() -> void:
    # Static scenery stays isolated in EnvironmentVisual. Runtime drawing is
    # reserved for readable pickups and short-lived combat feedback.
    _draw_pickups()
    _draw_grenades()
    _draw_explosions()
    _draw_muzzle_flashes()

    for projectile in projectiles:
        _draw_projectile(projectile, false)

    for projectile in enemy_projectiles:
        _draw_projectile(projectile, true)

    _draw_impacts()

func _draw_projectile(projectile: Dictionary, hostile: bool) -> void:
    var position: Vector2 = projectile["position"]
    var velocity: Vector2 = projectile["velocity"]
    var direction := velocity.normalized()
    if direction.length_squared() <= 0.001:
        direction = Vector2.RIGHT
    var weapon := String(projectile.get("weapon", "pistol"))
    var warm := Color("f0bd6b") if not hostile else Color("e46f5f")
    var hot := Color("fff3c9") if not hostile else Color("ffd0c7")

    match weapon:
        "machinegun":
            draw_line(position - direction * 34.0, position, Color(warm.r, warm.g, warm.b, 0.38), 4.0)
            draw_line(position - direction * 25.0, position + direction * 3.0, hot, 1.8)
            draw_circle(position, 2.6, hot)
        "shotgun":
            draw_line(position - direction * 13.0, position, Color(warm.r, warm.g, warm.b, 0.46), 2.4)
            draw_circle(position, 2.2, hot)
        "panzerfaust":
            var smoke := Color(0.58, 0.59, 0.55, 0.24)
            draw_line(position - direction * 42.0, position - direction * 11.0, smoke, 7.0)
            draw_circle(position - direction * 10.0, 5.0, Color(1.0, 0.45, 0.12, 0.72))
            draw_line(position - direction * 7.0, position + direction * 7.0, Color("696b61"), 8.0)
            draw_circle(position + direction * 7.0, 4.5, warm)
            draw_circle(position + direction * 9.0, 2.3, hot)
        _:
            draw_line(position - direction * 22.0, position, Color(warm.r, warm.g, warm.b, 0.34), 3.0)
            draw_line(position - direction * 13.0, position + direction * 2.0, hot, 1.5)
            draw_circle(position, 3.0, hot)

func _draw_muzzle_flashes() -> void:
    for effect in muzzle_fx:
        var position: Vector2 = effect["position"]
        var direction: Vector2 = effect["direction"]
        var weapon := String(effect["weapon"])
        var phase := clampf(float(effect["age"]) / float(effect["duration"]), 0.0, 1.0)
        var alpha := 1.0 - phase
        var side := Vector2(-direction.y, direction.x)
        var length := 30.0
        var half_width := 8.0
        match weapon:
            "machinegun":
                length = 38.0
                half_width = 6.0
            "shotgun":
                length = 34.0
                half_width = 14.0
            "panzerfaust":
                length = 46.0
                half_width = 13.0
        var inner := position + direction * 2.0
        var tip := position + direction * length
        var flare := PackedVector2Array([
            inner + side * half_width,
            tip,
            inner - side * half_width,
        ])
        draw_colored_polygon(flare, Color(1.0, 0.66, 0.20, alpha * 0.72))
        draw_line(position, position + direction * length * 0.82, Color(1.0, 0.94, 0.72, alpha), 3.0)
        draw_circle(position + direction * 5.0, 5.0 + half_width * 0.18, Color(1.0, 0.88, 0.52, alpha * 0.72))
        if weapon == "shotgun":
            draw_line(position, tip + side * 9.0, Color(1.0, 0.72, 0.30, alpha * 0.45), 2.0)
            draw_line(position, tip - side * 9.0, Color(1.0, 0.72, 0.30, alpha * 0.45), 2.0)
        elif weapon == "panzerfaust":
            draw_arc(position - direction * 5.0, 12.0 + phase * 7.0, 0.0, TAU, 18, Color(0.72, 0.68, 0.56, alpha * 0.34), 3.0)

func _draw_impacts() -> void:
    for effect in impact_fx:
        var position: Vector2 = effect["position"]
        var incoming: Vector2 = effect["incoming"]
        var reverse := -incoming
        if reverse.length_squared() <= 0.001:
            reverse = Vector2.LEFT
        var phase := clampf(float(effect["age"]) / float(effect["duration"]), 0.0, 1.0)
        var alpha := 1.0 - phase
        var hostile := bool(effect["hostile"])
        var seed := float(effect["seed"])
        var spark_color := Color("e7715f") if hostile else Color("f2c66d")
        var core_color := Color("ffd8cf") if hostile else Color("fff1bf")
        draw_circle(position, 6.0 * alpha + 1.5, Color(core_color.r, core_color.g, core_color.b, alpha * 0.48))
        for spark_index in range(5):
            var angle := lerpf(-0.82, 0.82, float(spark_index) / 4.0) + seed * 0.12
            var ray := reverse.rotated(angle)
            var length := (10.0 + float((spark_index * 7) % 9)) * alpha
            draw_line(
                position,
                position + ray * length,
                Color(spark_color.r, spark_color.g, spark_color.b, alpha * 0.82),
                2.0,
            )

func _draw_pickups() -> void:
    for pickup in pickups:
        if bool(pickup["taken"]):
            continue
        var position := Vector2(float(pickup["x"]), float(pickup.get("y", _floor_y - 44.0)))
        var kind := String(pickup["type"])
        draw_circle(position, 30.0, Color(0.78, 0.61, 0.25, 0.12))
        draw_rect(Rect2(position - Vector2(25.0, 18.0), Vector2(50.0, 36.0)), Color("4b4a3f"), true)
        draw_rect(Rect2(position - Vector2(25.0, 18.0), Vector2(50.0, 36.0)), Color("c5a45c"), false, 2.0)
        match kind:
            "machinegun":
                draw_line(position + Vector2(-18.0, 0.0), position + Vector2(19.0, 0.0), Color("d6d9da"), 6.0)
                draw_line(position + Vector2(5.0, 0.0), position + Vector2(11.0, 11.0), Color("8d6a42"), 5.0)
            "shotgun":
                draw_line(position + Vector2(-18.0, -3.0), position + Vector2(18.0, -3.0), Color("d6d9da"), 5.0)
                draw_line(position + Vector2(-18.0, 4.0), position + Vector2(18.0, 4.0), Color("aa7444"), 5.0)
            "panzerfaust":
                draw_line(position + Vector2(-18.0, 0.0), position + Vector2(17.0, 0.0), Color("8e927d"), 9.0)
                draw_circle(position + Vector2(18.0, 0.0), 7.0, Color("b7a05f"))
            "grenade":
                draw_circle(position, 11.0, Color("536049"))
                draw_rect(Rect2(position + Vector2(-4.0, -18.0), Vector2(8.0, 8.0)), Color("b6a36a"), true)
                draw_arc(position + Vector2(7.0, -15.0), 7.0, -PI * 0.85, PI * 0.15, 12, Color("d4c083"), 3.0)
            "medkit":
                draw_rect(Rect2(position - Vector2(17.0, 13.0), Vector2(34.0, 26.0)), Color("d8d7cf"), true)
                draw_rect(Rect2(position - Vector2(4.0, 11.0), Vector2(8.0, 22.0)), Color("b94e43"), true)
                draw_rect(Rect2(position - Vector2(11.0, 4.0), Vector2(22.0, 8.0)), Color("b94e43"), true)

func _draw_grenades() -> void:
    for grenade in thrown_grenades:
        var position: Vector2 = grenade["position"]
        var fuse := float(grenade["fuse"])
        var pulse := 0.55 + 0.45 * sin(fuse * 18.0)
        draw_circle(position, 9.0, Color("46513f"))
        draw_circle(position + Vector2(4.0, -7.0), 3.0, Color(1.0, 0.48, 0.24, pulse))

func _draw_explosions() -> void:
    for effect in explosion_fx:
        var position: Vector2 = effect["position"]
        var age := float(effect["age"])
        var duration := float(effect["duration"])
        var max_radius := float(effect["radius"])
        var phase := clampf(age / duration, 0.0, 1.0)
        var radius := lerpf(18.0, minf(max_radius, 92.0), phase)
        var alpha := 1.0 - phase
        draw_circle(position, radius * 0.48, Color(1.0, 0.42, 0.16, alpha * 0.28))
        draw_arc(position, radius, 0.0, TAU, 32, Color(1.0, 0.72, 0.28, alpha * 0.75), 5.0)

func _kick_camera_for_weapon(weapon: String, direction: Vector2) -> void:
    var strength := 2.2
    match weapon:
        "machinegun":
            strength = 1.3
        "shotgun":
            strength = 4.4
        "panzerfaust":
            strength = 7.2
    var safe_direction := direction.normalized()
    if safe_direction.length_squared() <= 0.001:
        safe_direction = Vector2.RIGHT
    _add_camera_kick(Vector2(-safe_direction.x, -safe_direction.y - 0.18), strength)

func _add_camera_kick(direction: Vector2, strength: float) -> void:
    if _reduced_motion or camera == null:
        return
    var safe_direction := direction.normalized()
    if safe_direction.length_squared() <= 0.001:
        safe_direction = Vector2.UP
    _camera_kick += safe_direction * strength
    _camera_kick.x = clampf(_camera_kick.x, -10.0, 10.0)
    _camera_kick.y = clampf(_camera_kick.y, -8.0, 8.0)

func _update_camera_feel(delta: float) -> void:
    if camera == null:
        return
    if _reduced_motion:
        _camera_kick = Vector2.ZERO
        camera.offset = Vector2.ZERO
        return
    _camera_kick = _camera_kick.move_toward(Vector2.ZERO, CAMERA_KICK_DECAY * delta)
    camera.offset = _camera_kick

func _prefers_reduced_motion() -> bool:
    if not OS.has_feature("web"):
        return false
    var result = JavaScriptBridge.eval(
        "Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)",
        true,
    )
    return bool(result)

func _notify_parent(message_type: String) -> void:
    if not OS.has_feature("web"):
        return
    if message_type == "ready":
        JavaScriptBridge.eval("if (window.__pawnSlugGodotVisualReady) window.__pawnSlugGodotVisualReady();")
    var message := JSON.stringify({"source": "pawn-slug-godot", "type": message_type})
    JavaScriptBridge.eval("window.parent.postMessage(" + message + ", '*');")
