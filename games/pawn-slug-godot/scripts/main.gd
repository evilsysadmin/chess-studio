extends Node2D

const VIEW_SIZE := Vector2(1280.0, 720.0)
const FLOOR_Y := 610.0
const PLAYER_HALF := Vector2(24.0, 42.0)
const PLAYER_SPEED := 330.0
const JUMP_SPEED := 610.0
const GRAVITY := 1550.0
const BULLET_SPEED := 920.0
const FIRE_INTERVAL := 0.16

var player_position := Vector2(180.0, FLOOR_Y - PLAYER_HALF.y)
var velocity := Vector2.ZERO
var facing := 1.0
var projectiles: Array[Dictionary] = []
var fire_cooldown := 0.0
var muzzle_flash := 0.0

var enemy_position := Vector2(1010.0, FLOOR_Y - 42.0)
var enemy_hp := 5
var enemy_respawn := 0.0

func _ready() -> void:
    _notify_parent("ready")
    queue_redraw()

func _process(delta: float) -> void:
    var axis := 0.0
    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
        axis -= 1.0
    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
        axis += 1.0

    if axis != 0.0:
        facing = sign(axis)
    velocity.x = axis * PLAYER_SPEED

    var standing_y := FLOOR_Y - PLAYER_HALF.y
    var grounded := player_position.y >= standing_y - 0.5
    if grounded:
        player_position.y = standing_y
        velocity.y = 0.0
        if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
            velocity.y = -JUMP_SPEED
    else:
        velocity.y += GRAVITY * delta

    player_position += velocity * delta
    player_position.x = clamp(player_position.x, PLAYER_HALF.x + 24.0, VIEW_SIZE.x - PLAYER_HALF.x - 24.0)
    if player_position.y > standing_y:
        player_position.y = standing_y
        velocity.y = 0.0

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    muzzle_flash = maxf(0.0, muzzle_flash - delta)
    var firing := Input.is_key_pressed(KEY_SPACE) or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
    if firing and fire_cooldown <= 0.0:
        _fire()

    _update_projectiles(delta)
    _update_enemy(delta)
    queue_redraw()

func _unhandled_key_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
        _notify_parent("exit")
        get_viewport().set_input_as_handled()

func _fire() -> void:
    fire_cooldown = FIRE_INTERVAL
    muzzle_flash = 0.055
    projectiles.append({
        "position": player_position + Vector2(facing * 38.0, -7.0),
        "direction": facing,
    })

func _update_projectiles(delta: float) -> void:
    for index in range(projectiles.size() - 1, -1, -1):
        var projectile := projectiles[index]
        var position: Vector2 = projectile["position"]
        position.x += float(projectile["direction"]) * BULLET_SPEED * delta
        projectile["position"] = position
        projectiles[index] = projectile

        if enemy_hp > 0 and Rect2(enemy_position - Vector2(34.0, 44.0), Vector2(68.0, 88.0)).has_point(position):
            enemy_hp -= 1
            projectiles.remove_at(index)
            if enemy_hp <= 0:
                enemy_respawn = 1.25
            continue

        if position.x < -30.0 or position.x > VIEW_SIZE.x + 30.0:
            projectiles.remove_at(index)

func _update_enemy(delta: float) -> void:
    if enemy_hp > 0:
        return
    enemy_respawn -= delta
    if enemy_respawn <= 0.0:
        enemy_hp = 5

func _draw() -> void:
    draw_rect(Rect2(Vector2.ZERO, VIEW_SIZE), Color("10161d"))
    draw_rect(Rect2(Vector2(0.0, FLOOR_Y), Vector2(VIEW_SIZE.x, VIEW_SIZE.y - FLOOR_Y)), Color("222a2f"))
    draw_line(Vector2(0.0, FLOOR_Y), Vector2(VIEW_SIZE.x, FLOOR_Y), Color("8b7451"), 4.0)

    for x in range(0, 1280, 80):
        var tower_height := 55.0 + float((x / 80) % 4) * 18.0
        draw_rect(Rect2(Vector2(float(x), FLOOR_Y - tower_height), Vector2(48.0, tower_height)), Color(0.10, 0.13, 0.16, 0.68))

    _draw_player()
    _draw_enemy()

    for projectile in projectiles:
        var position: Vector2 = projectile["position"]
        draw_circle(position, 5.0, Color("ffd36a"))
        draw_line(position - Vector2(float(projectile["direction"]) * 18.0, 0.0), position, Color(1.0, 0.72, 0.24, 0.45), 3.0)

    draw_rect(Rect2(Vector2(28.0, 24.0), Vector2(320.0, 58.0)), Color(0.02, 0.025, 0.03, 0.74), true)
    draw_rect(Rect2(Vector2(42.0, 42.0), Vector2(220.0, 10.0)), Color("313943"), true)
    draw_rect(Rect2(Vector2(42.0, 42.0), Vector2(220.0, 10.0)), Color("b5883e"), false, 2.0)

func _draw_player() -> void:
    var body := Rect2(player_position - Vector2(PLAYER_HALF.x, 26.0), Vector2(PLAYER_HALF.x * 2.0, 58.0))
    draw_rect(body, Color("20262c"), true)
    draw_circle(player_position - Vector2(0.0, 43.0), 24.0, Color("d7c2a0"))
    draw_rect(Rect2(player_position + Vector2(-30.0, -69.0), Vector2(60.0, 10.0)), Color("11151a"), true)
    draw_rect(Rect2(player_position + Vector2(-18.0, -78.0), Vector2(36.0, 12.0)), Color("171c21"), true)

    var gun_origin := player_position + Vector2(facing * 14.0, -7.0)
    draw_line(gun_origin, gun_origin + Vector2(facing * 42.0, 0.0), Color("a4abb1"), 9.0)
    if muzzle_flash > 0.0:
        draw_circle(gun_origin + Vector2(facing * 51.0, 0.0), 10.0, Color("ffd36a"))

func _draw_enemy() -> void:
    if enemy_hp <= 0:
        draw_circle(enemy_position + Vector2(0.0, 34.0), 34.0, Color(0.25, 0.11, 0.09, 0.5))
        return

    draw_rect(Rect2(enemy_position - Vector2(30.0, 34.0), Vector2(60.0, 68.0)), Color("633c35"), true)
    draw_circle(enemy_position - Vector2(0.0, 47.0), 22.0, Color("c8ad8a"))
    draw_rect(Rect2(enemy_position + Vector2(-36.0, -83.0), Vector2(72.0, 8.0)), Color("4a2c28"), true)

    var hp_width := 70.0
    draw_rect(Rect2(enemy_position + Vector2(-hp_width / 2.0, -108.0), Vector2(hp_width, 7.0)), Color("2f3438"), true)
    draw_rect(Rect2(enemy_position + Vector2(-hp_width / 2.0, -108.0), Vector2(hp_width * float(enemy_hp) / 5.0, 7.0)), Color("c7634e"), true)

func _notify_parent(message_type: String) -> void:
    if not OS.has_feature("web"):
        return
    var message := JSON.stringify({"source": "pawn-slug-godot", "type": message_type})
    JavaScriptBridge.eval("window.parent.postMessage(" + message + ", '*');")
