extends Node2D

const EnemyVisual := preload("res://scripts/enemy_visual.gd")
const BossVisual := preload("res://scripts/boss_visual.gd")
const ExtractionVisual := preload("res://scripts/extraction_visual.gd")
const VIEW_SIZE := Vector2(1280.0, 720.0)
const WORLD_SIZE := Vector2(5200.0, 720.0)
const FLOOR_Y := 610.0
const PLAYER_HITBOX_HALF := Vector2(24.0, 42.0)
const PICKUP_RADIUS_X := 44.0
const PICKUP_Y := 566.0
const ENEMY_AGGRO_RANGE := 1080.0
const BOSS_X := 4580.0
const EXTRACTION_X := 5050.0
const BOSS_TRIGGER_X := BOSS_X - 720.0
const BOSS_ARENA_LEFT := BOSS_X - 570.0
const BOSS_ARENA_RIGHT := BOSS_X + 500.0
const BOSS_HP := 780
const BOSS_SIZE := Vector2(190.0, 150.0)
const BOSS_REGULAR_RANGE := 1280.0
const BOSS_SHELL_RANGE := 1440.0
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
    "pawn": {"hp": 34, "speed": 54.0, "width": 38.0, "height": 62.0, "standoff": 270.0},
    "knight": {"hp": 62, "speed": 92.0, "width": 48.0, "height": 68.0, "standoff": 225.0},
    "rook": {"hp": 112, "speed": 0.0, "width": 58.0, "height": 76.0, "standoff": 420.0},
    "bishop": {"hp": 310, "speed": 42.0, "width": 78.0, "height": 112.0, "standoff": 430.0},
}
const ENEMY_FIRE_PROFILES := {
    "pistol": {"range": 720.0, "min_range": 0.0, "cooldown_min": 1.05, "cooldown_max": 1.55, "speed": 540.0, "pellets": 1, "spread": 0.0, "explosive": false},
    "machinegun": {"range": 840.0, "min_range": 0.0, "cooldown_min": 0.62, "cooldown_max": 0.95, "speed": 630.0, "pellets": 1, "spread": 0.035, "explosive": false},
    "shotgun": {"range": 545.0, "min_range": 0.0, "cooldown_min": 1.25, "cooldown_max": 1.70, "speed": 510.0, "pellets": 5, "spread": 0.16, "explosive": false},
    "panzerfaust": {"range": 1200.0, "min_range": 290.0, "cooldown_min": 1.80, "cooldown_max": 2.45, "speed": 420.0, "pellets": 1, "spread": 0.0, "explosive": true},
}

var projectiles: Array[Dictionary] = []
var enemy_projectiles: Array[Dictionary] = []
var enemies: Array[Dictionary] = []
var enemy_visuals: Dictionary = {}
var pickups: Array[Dictionary] = [
    {"x": 920.0, "type": "machinegun", "taken": false},
    {"x": 2470.0, "type": "shotgun", "taken": false},
    {"x": 3500.0, "type": "panzerfaust", "taken": false},
]
var boss_spawned := false
var boss_defeated := false
var mission_complete := false
var boss: Dictionary = {}
var boss_visual
var extraction_visual

@onready var player = $Player
@onready var status_bar: ColorRect = $HUD/StatusBar

func _ready() -> void:
    enemies = _build_enemy_roster()
    _build_enemy_visuals()
    _build_extraction_visual()
    player.connect("fired", Callable(self, "_on_player_fired"))
    player.connect("hurt", Callable(self, "_on_player_hurt"))
    player.connect("died", Callable(self, "_on_player_died"))
    player.connect("respawned", Callable(self, "_on_player_respawned"))
    player.connect("game_over", Callable(self, "_on_player_game_over"))
    player.connect("weapon_changed", Callable(self, "_on_player_weapon_changed"))
    _sync_hud()
    _notify_parent("ready")
    queue_redraw()

func _process(delta: float) -> void:
    _spawn_boss_if_needed()
    _update_projectiles(delta)
    _update_enemies(delta)
    _update_boss(delta)
    _update_enemy_projectiles(delta)
    _update_pickups()
    _enforce_boss_arena()
    _check_victory()
    queue_redraw()

func _unhandled_key_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
        _notify_parent("exit")
        get_viewport().set_input_as_handled()

func _on_player_fired(origin: Vector2, direction: float, shot: Dictionary) -> void:
    var speed := float(shot.get("speed", 760.0))
    var damage := int(shot.get("damage", 1))
    var pellets := maxi(1, int(shot.get("pellets", 1)))
    var spread := float(shot.get("spread", 0.0))
    var explosive := bool(shot.get("explosive", false))
    var weapon := String(shot.get("weapon", "pistol"))
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

func _on_player_weapon_changed(_weapon_id: String, _ammo_remaining: int) -> void:
    _notify_parent("weapon-changed")

func _on_player_hurt(_current_hp: int, _max_hp: int) -> void:
    _sync_hud()
    _notify_parent("player-hurt")

func _on_player_died(_lives_remaining: int) -> void:
    enemy_projectiles.clear()
    _sync_hud()
    _notify_parent("player-death")

func _on_player_respawned(_current_hp: int, _max_hp: int, _lives_remaining: int) -> void:
    enemy_projectiles.clear()
    for index in range(enemies.size()):
        var enemy := enemies[index]
        if int(enemy["hp"]) <= 0:
            continue
        enemy["cooldown"] = 0.35 + float(index % 5) * 0.08
        enemies[index] = enemy
    if boss_spawned and not boss_defeated:
        boss["regular_cooldown"] = 0.65
        boss["shell_cooldown"] = 1.35
    _sync_hud()
    _notify_parent("player-respawn")

func _on_player_game_over() -> void:
    enemy_projectiles.clear()
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
        roster.append({
            "id": "%s-%d" % [type, index],
            "type": type,
            "x": float(spawn[0]),
            "spawn_x": float(spawn[0]),
            "hp": int(stats["hp"]),
            "max_hp": int(stats["hp"]),
            "weapon": _enemy_weapon_for(type, index),
            "cooldown": 0.35 + float(index % 5) * 0.08,
        })
    return roster

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
        _sync_enemy_visual(enemy, false)

func _build_extraction_visual() -> void:
    extraction_visual = ExtractionVisual.new()
    extraction_visual.name = "Extraction"
    extraction_visual.position = Vector2(EXTRACTION_X, FLOOR_Y)
    extraction_visual.z_index = 1
    add_child(extraction_visual)
    extraction_visual.set_unlocked(false)

func _sync_enemy_visual(enemy: Dictionary, moving: bool) -> void:
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual == null:
        return
    var direction := -1.0 if player.global_position.x < float(enemy["x"]) else 1.0
    visual.sync_state(
        float(enemy["x"]),
        FLOOR_Y,
        direction,
        moving,
        int(enemy["hp"]),
        int(enemy["max_hp"]),
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
            enemy["hp"] = maxi(0, int(enemy["hp"]) - int(projectile["damage"]))
            enemies[enemy_index] = enemy
            hit_target = true
            break

        if not hit_target and boss_spawned and not boss_defeated and _boss_rect().has_point(position):
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

func _update_enemies(delta: float) -> void:
    for index in range(enemies.size()):
        var enemy := enemies[index]
        if int(enemy["hp"]) <= 0:
            _sync_enemy_visual(enemy, false)
            continue
        var type := String(enemy["type"])
        var stats: Dictionary = ENEMY_TYPES[type]
        var distance_x := player.global_position.x - float(enemy["x"])
        var abs_distance := absf(distance_x)
        var moved := false

        if not player.dead and not player.is_game_over and abs_distance <= ENEMY_AGGRO_RANGE:
            var speed := float(stats["speed"])
            var standoff := float(stats["standoff"])
            if speed > 0.0 and abs_distance > standoff:
                var move_direction := 1.0 if distance_x > 0.0 else -1.0
                enemy["x"] = clampf(
                    float(enemy["x"]) + move_direction * speed * delta,
                    maxf(0.0, float(enemy["spawn_x"]) - 360.0),
                    minf(WORLD_SIZE.x, float(enemy["spawn_x"]) + 360.0),
                )
                moved = true

            _sync_enemy_visual(enemy, moved)
            enemy["cooldown"] = maxf(0.0, float(enemy["cooldown"]) - delta)
            if float(enemy["cooldown"]) <= 0.0:
                _try_enemy_fire(enemy)
                enemy["cooldown"] = _enemy_fire_cooldown(String(enemy["weapon"]))
        else:
            enemy["cooldown"] = maxf(0.0, float(enemy["cooldown"]) - delta)
            _sync_enemy_visual(enemy, false)
        enemies[index] = enemy

func _update_boss(delta: float) -> void:
    if not boss_spawned or boss_defeated or boss.is_empty():
        return
    _sync_boss_visual()
    if player.dead or player.is_game_over:
        return

    var distance := absf(player.global_position.x - float(boss["x"]))
    boss["regular_cooldown"] = maxf(0.0, float(boss["regular_cooldown"]) - delta)
    boss["shell_cooldown"] = maxf(0.0, float(boss["shell_cooldown"]) - delta)

    if distance <= BOSS_REGULAR_RANGE and float(boss["regular_cooldown"]) <= 0.0:
        _fire_boss(false)
        boss["regular_cooldown"] = _enemy_fire_cooldown("machinegun")

    if distance <= BOSS_SHELL_RANGE and distance >= float(ENEMY_FIRE_PROFILES["panzerfaust"]["min_range"]) and float(boss["shell_cooldown"]) <= 0.0:
        _fire_boss(true)
        boss["shell_cooldown"] = randf_range(1.65, 2.10)

func _try_enemy_fire(enemy: Dictionary) -> void:
    var weapon := String(enemy["weapon"])
    var profile: Dictionary = ENEMY_FIRE_PROFILES[weapon]
    var origin := _enemy_fire_origin(enemy)
    var target := player.global_position + Vector2(0.0, -18.0)
    var target_delta := target - origin
    var distance := target_delta.length()
    if distance > float(profile["range"]) or distance < float(profile["min_range"]):
        return
    var base_direction := target_delta.normalized()
    var pellets := maxi(1, int(profile["pellets"]))
    var spread := float(profile["spread"])
    for _pellet in range(pellets):
        var angle := randf_range(-spread, spread) if spread > 0.0 else 0.0
        enemy_projectiles.append({
            "position": origin,
            "velocity": base_direction.rotated(angle) * float(profile["speed"]),
            "weapon": weapon,
            "explosive": bool(profile["explosive"]),
        })
    var visual = enemy_visuals.get(String(enemy["id"]))
    if visual != null:
        visual.play_fire()

func _fire_boss(explosive: bool) -> void:
    if boss_visual == null or player.dead or player.is_game_over:
        return
    var weapon := "panzerfaust" if explosive else "machinegun"
    var profile: Dictionary = ENEMY_FIRE_PROFILES[weapon]
    var origin: Vector2 = boss_visual.muzzle_global_position()
    var target := player.global_position + Vector2(0.0, -18.0)
    var direction := (target - origin).normalized()
    var spread := 0.0 if explosive else float(profile["spread"])
    var angle := randf_range(-spread, spread) if spread > 0.0 else 0.0
    enemy_projectiles.append({
        "position": origin,
        "velocity": direction.rotated(angle) * float(profile["speed"]),
        "weapon": weapon,
        "explosive": explosive,
    })
    boss_visual.play_fire(explosive)

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
            player.take_damage(1)
            enemy_projectiles.remove_at(index)
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
        if player.grant_weapon(String(pickup["type"])):
            pickup["taken"] = true
            pickups[index] = pickup
            _notify_parent("weapon-pickup")

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
    return Rect2(Vector2(float(enemy["x"]) - width * 0.5, FLOOR_Y - height), Vector2(width, height))

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

func _draw() -> void:
    draw_rect(Rect2(Vector2.ZERO, WORLD_SIZE), Color("10161d"))
    draw_rect(Rect2(Vector2(0.0, FLOOR_Y), Vector2(WORLD_SIZE.x, WORLD_SIZE.y - FLOOR_Y)), Color("222a2f"))
    draw_line(Vector2(0.0, FLOOR_Y), Vector2(WORLD_SIZE.x, FLOOR_Y), Color("8b7451"), 4.0)

    for x in range(0, int(WORLD_SIZE.x), 80):
        var tower_height := 55.0 + float((x / 80) % 4) * 18.0
        draw_rect(Rect2(Vector2(float(x), FLOOR_Y - tower_height), Vector2(48.0, tower_height)), Color(0.10, 0.13, 0.16, 0.68))

    for platform in PLATFORMS:
        draw_rect(platform, Color("39434b"), true)
        draw_line(platform.position, platform.position + Vector2(platform.size.x, 0.0), Color("b5883e"), 3.0)

    _draw_pickups()

    for projectile in projectiles:
        var position: Vector2 = projectile["position"]
        var velocity: Vector2 = projectile["velocity"]
        var explosive := bool(projectile["explosive"])
        var radius := 8.0 if explosive else 5.0
        var color := Color("ff9d4d") if explosive else Color("ffd36a")
        var trail := velocity.normalized() * (28.0 if explosive else 18.0)
        draw_circle(position, radius, color)
        draw_line(position - trail, position, Color(color.r, color.g, color.b, 0.45), 3.0)

    for projectile in enemy_projectiles:
        var position: Vector2 = projectile["position"]
        var velocity: Vector2 = projectile["velocity"]
        var explosive := bool(projectile["explosive"])
        var radius := 8.0 if explosive else 5.0
        var color := Color("f28a52") if explosive else Color("e36d5a")
        var trail := velocity.normalized() * (28.0 if explosive else 18.0)
        draw_circle(position, radius, color)
        draw_line(position - trail, position, Color(color.r, color.g, color.b, 0.5), 3.0)

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

func _notify_parent(message_type: String) -> void:
    if not OS.has_feature("web"):
        return
    var message := JSON.stringify({"source": "pawn-slug-godot", "type": message_type})
    JavaScriptBridge.eval("window.parent.postMessage(" + message + ", '*');")
