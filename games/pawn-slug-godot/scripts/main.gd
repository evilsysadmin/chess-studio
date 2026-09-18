extends Node2D

const EnemyVisual := preload("res://scripts/enemy_visual.gd")
const BossVisual := preload("res://scripts/boss_visual.gd")
const ExtractionVisual := preload("res://scripts/extraction_visual.gd")
const EnvironmentVisual := preload("res://scripts/environment_visual.gd")
const VIEW_SIZE := Vector2(1280.0, 720.0)
const WORLD_SIZE := Vector2(5200.0, 720.0)
const FLOOR_Y := 610.0
const PLAYER_HITBOX_HALF := Vector2(24.0, 42.0)
const PICKUP_RADIUS_X := 44.0
const PICKUP_Y := 566.0
const ENEMY_AGGRO_RANGE := 1380.0
const START_ZONE_END_X := 900.0
const START_ZONE_AGGRO_RANGE := 900.0
const ENEMY_DISENGAGE_RANGE := 1850.0
const GUNFIRE_HEARING_RANGE := 1550.0
const GRENADE_HEARING_RANGE := 1750.0
const GRENADE_EVADE_RADIUS := 250.0
const GRENADE_EVADE_SPEED_SCALE := 2.15
const SOLDIER_SPRINT_MARGIN := 180.0
const SOLDIER_ADVANCE_MARGIN := 80.0
const SOLDIER_COMFORT_MARGIN := 24.0
const SOLDIER_RETREAT_RATIO := 0.64
const SOLDIER_SPRINT_MULTIPLIER := 2.35
const SOLDIER_ADVANCE_MULTIPLIER := 1.30
const SOLDIER_CREEP_MULTIPLIER := 0.62
const SOLDIER_BACKPEDAL_MULTIPLIER := 0.76
const SOLDIER_ROAM_LIMIT := 540.0
const KNIGHT_SPRINT_MULTIPLIER := 1.45
const KNIGHT_GRAVITY := 880.0
const KNIGHT_LEAP_SPEED := 300.0
const KNIGHT_LEAP_RANGE := 300.0
const KNIGHT_NEAR_SPEED_SCALE := 0.25
const KNIGHT_INITIAL_LEAP_MIN := 0.70
const KNIGHT_INITIAL_LEAP_MAX := 1.90
const KNIGHT_LEAP_COOLDOWN_MIN := 2.20
const KNIGHT_LEAP_COOLDOWN_MAX := 3.60
const BOSS_X := 4580.0
const EXTRACTION_X := 5050.0
const BOSS_TRIGGER_X := BOSS_X - 720.0
const BOSS_ARENA_LEFT := BOSS_X - 570.0
const BOSS_ARENA_RIGHT := BOSS_X + 500.0
const BOSS_HP := 780
const BOSS_SIZE := Vector2(190.0, 150.0)
const BOSS_REGULAR_RANGE := 1280.0
const BOSS_SHELL_RANGE := 1440.0
const BOSS_SHELL_WINDUP := 0.62
const ENEMY_FIRE_SCREEN_MARGIN := 84.0
const MAX_HOSTILE_PROJECTILES := 9
const MAX_HOSTILE_EXPLOSIVES := 2
const HOSTILE_FIRE_GAP := 0.055
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
const PLATFORMS: Array[Rect2] = [
    Rect2(460.0, 498.0, 280.0, 24.0),
    Rect2(920.0, 418.0, 240.0, 24.0),
    Rect2(1300.0, 508.0, 320.0, 24.0),
    Rect2(1760.0, 388.0, 280.0, 24.0),
    Rect2(2140.0, 488.0, 240.0, 24.0),
    Rect2(2580.0, 458.0, 280.0, 24.0),
    Rect2(3000.0, 388.0, 240.0, 24.0),
    Rect2(3420.0, 508.0, 320.0, 24.0),
    Rect2(3860.0, 428.0, 280.0, 24.0),
    Rect2(4300.0, 498.0, 240.0, 24.0),
    Rect2(4700.0, 408.0, 320.0, 24.0),
]
const ENEMY_SPAWNS := [
    [620.0, "pawn"], [790.0, "pawn"], [1080.0, "pawn"], [1210.0, "knight"], [1380.0, "pawn"],
    [1560.0, "rook"], [1710.0, "pawn"], [1940.0, "knight"], [2110.0, "pawn"], [2250.0, "pawn"],
    [2380.0, "bishop"], [2590.0, "rook"], [2730.0, "pawn"], [2890.0, "knight"], [3070.0, "pawn"],
    [3210.0, "pawn"], [3430.0, "rook"], [3560.0, "knight"], [3740.0, "bishop"], [3950.0, "pawn"],
    [4070.0, "knight"], [4190.0, "rook"], [4380.0, "pawn"],
]
const ENEMY_TYPES := {
    "pawn": {"hp": 34, "speed": 54.0, "width": 45.0, "height": 73.0, "standoff": 270.0},
    "knight": {"hp": 62, "speed": 92.0, "width": 57.0, "height": 80.0, "standoff": 225.0},
    "rook": {"hp": 112, "speed": 0.0, "width": 68.0, "height": 90.0, "standoff": 420.0},
    "bishop": {"hp": 310, "speed": 42.0, "width": 90.0, "height": 128.0, "standoff": 430.0},
}
const ENEMY_FIRE_PROFILES := {
    "pistol": {"range": 720.0, "min_range": 0.0, "cooldown_min": 1.05, "cooldown_max": 1.55, "speed": 540.0, "pellets": 1, "spread": 0.0, "explosive": false},
    "machinegun": {"range": 840.0, "min_range": 0.0, "cooldown_min": 0.62, "cooldown_max": 0.95, "speed": 630.0, "pellets": 1, "spread": 0.035, "explosive": false},
    "shotgun": {"range": 545.0, "min_range": 0.0, "cooldown_min": 1.25, "cooldown_max": 1.70, "speed": 510.0, "pellets": 5, "spread": 0.16, "explosive": false},
    "panzerfaust": {"range": 1200.0, "min_range": 290.0, "cooldown_min": 1.80, "cooldown_max": 2.45, "speed": 420.0, "pellets": 1, "spread": 0.0, "explosive": true},
}

var projectiles: Array[Dictionary] = []
var enemy_projectiles: Array[Dictionary] = []
var thrown_grenades: Array[Dictionary] = []
var explosion_fx: Array[Dictionary] = []
var muzzle_fx: Array[Dictionary] = []
var impact_fx: Array[Dictionary] = []
var enemies: Array[Dictionary] = []
var enemy_visuals: Dictionary = {}
var pickups: Array[Dictionary] = [
    {"x": 920.0, "type": "machinegun", "taken": false},
    {"x": 1810.0, "type": "grenade", "taken": false},
    {"x": 2470.0, "type": "shotgun", "taken": false},
    {"x": 3300.0, "type": "medkit", "taken": false},
    {"x": 3500.0, "type": "panzerfaust", "taken": false},
    {"x": 4310.0, "type": "grenade", "taken": false},
]
var boss_spawned := false
var boss_defeated := false
var mission_complete := false
var boss: Dictionary = {}
var boss_visual
var extraction_visual
var environment_visual
var _startup_ready_sent := false
var _camera_kick := Vector2.ZERO
var _reduced_motion := false
var _hostile_fire_gap_remaining := 0.0

@onready var player = $Player
@onready var status_bar: ColorRect = $HUD/StatusBar
@onready var pause_menu = $PauseMenu
@onready var camera: Camera2D = $Player/Camera2D
@onready var combat_audio = $CombatAudio
@onready var touch_controls = $TouchControls

func _ready() -> void:
    _reduced_motion = _prefers_reduced_motion()
    _build_environment_visual()
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

func _on_player_fired(origin: Vector2, direction: float, shot: Dictionary) -> void:
    _alert_enemies(origin.x, GUNFIRE_HEARING_RANGE)
    var speed := float(shot.get("speed", 760.0))
    var damage := int(shot.get("damage", 1))
    var pellets := maxi(1, int(shot.get("pellets", 1)))
    var spread := float(shot.get("spread", 0.0))
    var explosive := bool(shot.get("explosive", false))
    var weapon := String(shot.get("weapon", "pistol"))
    combat_audio.play_weapon(weapon)
    _kick_camera_for_weapon(weapon, direction)
    _add_muzzle_fx(origin, Vector2(direction, 0.0), weapon)
    for _pellet in range(pellets):
        var angle := randf_range(-spread, spread) if spread > 0.0 else 0.0
        var velocity := Vector2(direction, 0.0).rotated(angle) * speed
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
        enemy["cooldown"] = 0.35 + float(index % 5) * 0.08
        if String(enemy["type"]) == "bishop":
            enemy["shell_cooldown"] = 1.65 + randf_range(0.0, 0.45)
            enemy["suppression_cooldown"] = 2.35 + randf_range(0.0, 0.70)
            enemy["suppression_shots"] = 0
            enemy["suppression_index"] = 0
            enemy["suppression_shot_cooldown"] = 0.0
        elif String(enemy["type"]) == "knight":
            enemy["leap_cooldown"] = randf_range(KNIGHT_INITIAL_LEAP_MIN, KNIGHT_INITIAL_LEAP_MAX)
        enemies[index] = enemy
    if boss_spawned and not boss_defeated:
        boss["regular_cooldown"] = 0.65
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
    for index in range(ENEMY_SPAWNS.size()):
        var spawn = ENEMY_SPAWNS[index]
        var type := String(spawn[1])
        var stats: Dictionary = ENEMY_TYPES[type]
        var enemy := {
            "id": "%s-%d" % [type, index],
            "type": type,
            "x": float(spawn[0]),
            "spawn_x": float(spawn[0]),
            "alerted": false,
            "reaction": 0.10 + float(index % 4) * 0.055,
            "y": FLOOR_Y,
            "vy": 0.0,
            "on_ground": true,
            "hp": int(stats["hp"]),
            "max_hp": int(stats["hp"]),
            "weapon": _enemy_weapon_for(type, index),
            "cooldown": 0.35 + float(index % 5) * 0.08,
        }
        if type == "bishop":
            enemy["shell_cooldown"] = 1.65 + randf_range(0.0, 0.45)
            enemy["suppression_cooldown"] = 2.35 + randf_range(0.0, 0.70)
            enemy["suppression_shots"] = 0
            enemy["suppression_index"] = 0
            enemy["suppression_shot_cooldown"] = 0.0
        elif type == "knight":
            enemy["leap_cooldown"] = randf_range(KNIGHT_INITIAL_LEAP_MIN, KNIGHT_INITIAL_LEAP_MAX)
        roster.append(enemy)
    return roster

func _build_environment_visual() -> void:
    environment_visual = EnvironmentVisual.new()
    environment_visual.name = "PremiumEnvironment"
    environment_visual.z_index = -20
    add_child(environment_visual)
    environment_visual.configure(WORLD_SIZE, FLOOR_Y, PLATFORMS)

func _build_enemy_visuals() -> void:
    for enemy in enemies:
        var id := String(enemy["id"])
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
    extraction_visual.position = Vector2(EXTRACTION_X, FLOOR_Y)
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
        float(enemy.get("y", FLOOR_Y)),
        direction,
        move_speed_scale > 0.05,
        int(enemy["hp"]),
        int(enemy["max_hp"]),
        move_speed_scale,
    )

func _enemy_weapon_for(type: String, variant: int) -> String:
    match type:
        "knight":
            return "machinegun" if variant % 2 == 0 else "shotgun"
        "rook", "bishop":
            var choices := ["machinegun", "machinegun", "panzerfaust"]
            return choices[variant % choices.size()]
        _:
            return "pistol" if variant % 2 == 0 else "machinegun"

func _spawn_boss_if_needed() -> void:
    if boss_spawned or boss_defeated or player.global_position.x < BOSS_TRIGGER_X:
        return
    boss_spawned = true
    boss = {
        "id": "boss-panzer-rook",
        "x": BOSS_X,
        "hp": BOSS_HP,
        "max_hp": BOSS_HP,
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
        FLOOR_Y,
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
            or position.x > WORLD_SIZE.x + 30.0
            or position.y < -30.0
            or position.y > WORLD_SIZE.y + 30.0
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

        if position.y >= FLOOR_Y - 8.0 and velocity.y > 0.0:
            position.y = FLOOR_Y - 8.0
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

func _enemy_aggro_range() -> float:
    # The opening still stages the first squad, but anything visible in front of
    # Matthias should not read as a cardboard target.
    if player.global_position.x < START_ZONE_END_X:
        return START_ZONE_AGGRO_RANGE
    return ENEMY_AGGRO_RANGE

func _alert_enemies(world_x: float, hearing_range: float) -> void:
    for index in range(enemies.size()):
        var enemy := enemies[index]
        if int(enemy["hp"]) <= 0:
            continue
        if absf(float(enemy["x"]) - world_x) <= hearing_range:
            enemy["alerted"] = true
            enemy["reaction"] = minf(float(enemy.get("reaction", 0.0)), 0.12)
            enemies[index] = enemy

func _enemy_engaged(enemy: Dictionary, abs_distance: float) -> bool:
    if player.dead or player.is_game_over:
        return false
    if abs_distance <= _enemy_aggro_range():
        enemy["alerted"] = true
    if not bool(enemy.get("alerted", false)):
        return false
    if abs_distance > ENEMY_DISENGAGE_RANGE:
        enemy["alerted"] = false
        return false
    return true

func _enemy_weapon_standoff(enemy: Dictionary, stats: Dictionary) -> float:
    match String(enemy.get("weapon", "pistol")):
        "shotgun":
            return 205.0
        "machinegun":
            return 330.0
        "panzerfaust":
            return 590.0
        _:
            return float(stats["standoff"])

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
                var move_direction := 1.0 if distance_x > 0.0 else -1.0
                var knight_speed_scale := KNIGHT_NEAR_SPEED_SCALE
                if abs_distance > standoff + SOLDIER_SPRINT_MARGIN:
                    knight_speed_scale = KNIGHT_SPRINT_MULTIPLIER
                elif abs_distance > standoff:
                    knight_speed_scale = 1.0
                var knight_speed := speed * knight_speed_scale
                var previous_x := float(enemy["x"])
                enemy["x"] = clampf(
                    previous_x + move_direction * knight_speed * delta,
                    maxf(0.0, float(enemy["spawn_x"]) - 360.0),
                    minf(WORLD_SIZE.x, float(enemy["spawn_x"]) + 360.0),
                )
                if not is_equal_approx(previous_x, float(enemy["x"])):
                    movement_speed_scale = knight_speed_scale
                if (
                    float(enemy["leap_cooldown"]) <= 0.0
                    and abs_distance < KNIGHT_LEAP_RANGE
                    and bool(enemy["on_ground"])
                ):
                    enemy["vy"] = -KNIGHT_LEAP_SPEED
                    enemy["on_ground"] = false
                    enemy["leap_cooldown"] = randf_range(KNIGHT_LEAP_COOLDOWN_MIN, KNIGHT_LEAP_COOLDOWN_MAX)
            elif speed > 0.0:
                movement_speed_scale = _update_soldier_movement(enemy, stats, standoff, distance_x, abs_distance, delta)

        if type == "knight":
            _update_knight_vertical(enemy, delta)

        _sync_enemy_visual(enemy, movement_speed_scale)
        enemy["cooldown"] = maxf(0.0, float(enemy["cooldown"]) - delta)
        if can_act and float(enemy["cooldown"]) <= 0.0:
            _try_enemy_fire(enemy)
            enemy["cooldown"] = _enemy_fire_cooldown(String(enemy["weapon"]))
        enemies[index] = enemy

func _update_soldier_movement(enemy: Dictionary, stats: Dictionary, standoff: float, distance_x: float, abs_distance: float, delta: float) -> float:
    var speed := float(stats["speed"])
    if speed <= 0.0:
        return 0.0

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
    else:
        return 0.0

    var previous_x := float(enemy["x"])
    enemy["x"] = clampf(
        previous_x + move_direction * speed * speed_scale * delta,
        maxf(0.0, float(enemy["spawn_x"]) - SOLDIER_ROAM_LIMIT),
        minf(WORLD_SIZE.x, float(enemy["spawn_x"]) + SOLDIER_ROAM_LIMIT),
    )
    if is_equal_approx(previous_x, float(enemy["x"])):
        return 0.0
    return speed_scale


func _update_knight_vertical(enemy: Dictionary, delta: float) -> void:
    var foot_y := float(enemy.get("y", FLOOR_Y))
    var velocity_y := float(enemy.get("vy", 0.0))
    var on_ground := bool(enemy.get("on_ground", true))
    var world_x := float(enemy["x"])

    if on_ground and foot_y < FLOOR_Y - 1.0 and not _knight_has_support(world_x, foot_y):
        on_ground = false

    if not on_ground:
        var previous_y := foot_y
        velocity_y += KNIGHT_GRAVITY * delta
        foot_y += velocity_y * delta
        if velocity_y >= 0.0:
            var landing_y := _knight_landing_y(world_x, previous_y, foot_y)
            if landing_y >= 0.0:
                foot_y = landing_y
                velocity_y = 0.0
                on_ground = true

    enemy["y"] = foot_y
    enemy["vy"] = velocity_y
    enemy["on_ground"] = on_ground

func _knight_has_support(world_x: float, foot_y: float) -> bool:
    if is_equal_approx(foot_y, FLOOR_Y):
        return true
    for platform in PLATFORMS:
        if (
            absf(foot_y - platform.position.y) <= 2.0
            and world_x >= platform.position.x
            and world_x <= platform.position.x + platform.size.x
        ):
            return true
    return false

func _knight_landing_y(world_x: float, previous_y: float, next_y: float) -> float:
    var landing_y := -1.0
    for platform in PLATFORMS:
        var top := platform.position.y
        if (
            world_x >= platform.position.x
            and world_x <= platform.position.x + platform.size.x
            and previous_y <= top
            and next_y >= top
        ):
            if landing_y < 0.0 or top < landing_y:
                landing_y = top
    if previous_y <= FLOOR_Y and next_y >= FLOOR_Y and (landing_y < 0.0 or FLOOR_Y < landing_y):
        landing_y = FLOOR_Y
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
                minf(WORLD_SIZE.x, float(enemy["spawn_x"]) + 360.0),
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
    var origin := Vector2(float(enemy["x"]) + direction * 48.0, FLOOR_Y - float(lane["height"]))
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
    var target_delta: Vector2 = target - origin
    var distance: float = target_delta.length()
    var pellets := maxi(1, int(profile["pellets"]))
    if distance > float(profile["range"]) or distance < float(profile["min_range"]):
        return
    if not _can_spawn_hostile_shot(origin, weapon, pellets):
        return
    var base_direction: Vector2 = target_delta.normalized()
    var spread := float(profile["spread"])
    for _pellet in range(pellets):
        var angle := randf_range(-spread, spread) if spread > 0.0 else 0.0
        enemy_projectiles.append({
            "position": origin,
            "velocity": base_direction.rotated(angle) * float(profile["speed"]),
            "weapon": weapon,
            "explosive": bool(profile["explosive"]),
        })
    _hostile_fire_gap_remaining = HOSTILE_FIRE_GAP
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
    if weapon == "machinegun":
        if randf() < 0.60:
            return 0.11
        return randf_range(1.50, 2.10)
    return randf_range(float(profile["cooldown_min"]), float(profile["cooldown_max"]))

func _update_enemy_projectiles(delta: float) -> void:
    var player_hitbox := Rect2(
        player.global_position - PLAYER_HITBOX_HALF,
        PLAYER_HITBOX_HALF * 2.0,
    )
    for index in range(enemy_projectiles.size() - 1, -1, -1):
        var projectile := enemy_projectiles[index]
        var position: Vector2 = projectile["position"]
        var velocity: Vector2 = projectile["velocity"]
        position += velocity * delta
        projectile["position"] = position
        enemy_projectiles[index] = projectile

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
            or position.x > WORLD_SIZE.x + 30.0
            or position.y < -30.0
            or position.y > WORLD_SIZE.y + 30.0
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
        if absf(player.global_position.y - PICKUP_Y) > 80.0:
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
    if not boss_spawned or boss_defeated or player.global_position.x <= BOSS_ARENA_LEFT:
        return
    var clamped_x := clampf(player.global_position.x, BOSS_ARENA_LEFT, BOSS_ARENA_RIGHT)
    if not is_equal_approx(clamped_x, player.global_position.x):
        player.global_position.x = clamped_x
        player.velocity.x = 0.0

func _check_victory() -> void:
    if mission_complete or not boss_defeated or player.dead or player.is_game_over:
        return
    if player.global_position.x < EXTRACTION_X - 50.0:
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
    var foot_y := float(enemy.get("y", FLOOR_Y))
    return Rect2(Vector2(float(enemy["x"]) - width * 0.5, foot_y - height), Vector2(width, height))

func _boss_rect() -> Rect2:
    return Rect2(
        Vector2(BOSS_X - BOSS_SIZE.x * 0.5, FLOOR_Y - BOSS_SIZE.y),
        BOSS_SIZE,
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
        var position := Vector2(float(pickup["x"]), PICKUP_Y)
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

func _kick_camera_for_weapon(weapon: String, direction: float) -> void:
    var strength := 2.2
    match weapon:
        "machinegun":
            strength = 1.3
        "shotgun":
            strength = 4.4
        "panzerfaust":
            strength = 7.2
    _add_camera_kick(Vector2(-direction, -0.18), strength)

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
