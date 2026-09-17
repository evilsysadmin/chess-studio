extends Node2D

const VIEW_SIZE := Vector2(1280.0, 720.0)
const WORLD_SIZE := Vector2(2600.0, 720.0)
const FLOOR_Y := 610.0
const BULLET_SPEED := 920.0
const ENEMY_MAX_HP := 5
const ENEMY_POSITION := Vector2(2300.0, 568.0)
const PLATFORMS: Array[Rect2] = [
    Rect2(460.0, 498.0, 280.0, 24.0),
    Rect2(920.0, 418.0, 240.0, 24.0),
    Rect2(1300.0, 508.0, 320.0, 24.0),
    Rect2(1760.0, 388.0, 280.0, 24.0),
    Rect2(2140.0, 488.0, 240.0, 24.0),
]

var projectiles: Array[Dictionary] = []
var enemy_hp := ENEMY_MAX_HP
var enemy_respawn := 0.0

@onready var player: CharacterBody2D = $Player

func _ready() -> void:
    player.connect("fired", Callable(self, "_on_player_fired"))
    _notify_parent("ready")
    queue_redraw()

func _process(delta: float) -> void:
    _update_projectiles(delta)
    _update_enemy(delta)
    queue_redraw()

func _unhandled_key_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
        _notify_parent("exit")
        get_viewport().set_input_as_handled()

func _on_player_fired(origin: Vector2, direction: float) -> void:
    projectiles.append({
        "position": origin,
        "direction": direction,
    })

func _update_projectiles(delta: float) -> void:
    for index in range(projectiles.size() - 1, -1, -1):
        var projectile := projectiles[index]
        var position: Vector2 = projectile["position"]
        position.x += float(projectile["direction"]) * BULLET_SPEED * delta
        projectile["position"] = position
        projectiles[index] = projectile

        if enemy_hp > 0 and Rect2(ENEMY_POSITION - Vector2(34.0, 44.0), Vector2(68.0, 88.0)).has_point(position):
            enemy_hp -= 1
            projectiles.remove_at(index)
            if enemy_hp <= 0:
                enemy_respawn = 1.25
            continue

        if position.x < -30.0 or position.x > WORLD_SIZE.x + 30.0:
            projectiles.remove_at(index)

func _update_enemy(delta: float) -> void:
    if enemy_hp > 0:
        return
    enemy_respawn -= delta
    if enemy_respawn <= 0.0:
        enemy_hp = ENEMY_MAX_HP

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

    _draw_enemy()

    for projectile in projectiles:
        var position: Vector2 = projectile["position"]
        draw_circle(position, 5.0, Color("ffd36a"))
        draw_line(position - Vector2(float(projectile["direction"]) * 18.0, 0.0), position, Color(1.0, 0.72, 0.24, 0.45), 3.0)

func _draw_enemy() -> void:
    if enemy_hp <= 0:
        draw_circle(ENEMY_POSITION + Vector2(0.0, 34.0), 34.0, Color(0.25, 0.11, 0.09, 0.5))
        return

    draw_rect(Rect2(ENEMY_POSITION - Vector2(30.0, 34.0), Vector2(60.0, 68.0)), Color("633c35"), true)
    draw_circle(ENEMY_POSITION - Vector2(0.0, 47.0), 22.0, Color("c8ad8a"))
    draw_rect(Rect2(ENEMY_POSITION + Vector2(-36.0, -83.0), Vector2(72.0, 8.0)), Color("4a2c28"), true)

    var hp_width := 70.0
    draw_rect(Rect2(ENEMY_POSITION + Vector2(-hp_width / 2.0, -108.0), Vector2(hp_width, 7.0)), Color("2f3438"), true)
    draw_rect(Rect2(ENEMY_POSITION + Vector2(-hp_width / 2.0, -108.0), Vector2(hp_width * float(enemy_hp) / float(ENEMY_MAX_HP), 7.0)), Color("c7634e"), true)

func _notify_parent(message_type: String) -> void:
    if not OS.has_feature("web"):
        return
    var message := JSON.stringify({"source": "pawn-slug-godot", "type": message_type})
    JavaScriptBridge.eval("window.parent.postMessage(" + message + ", '*');")
