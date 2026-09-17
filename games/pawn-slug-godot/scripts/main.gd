extends Node2D

const WORLD_SIZE := Vector2(2600.0, 720.0)
const FLOOR_Y := 610.0
const PLAYER_BULLET_SPEED := 920.0
const ENEMY_BULLET_SPEED := 560.0
const PLATFORMS: Array[Rect2] = [
    Rect2(460.0, 498.0, 280.0, 24.0),
    Rect2(920.0, 418.0, 240.0, 24.0),
    Rect2(1300.0, 508.0, 320.0, 24.0),
    Rect2(1760.0, 388.0, 280.0, 24.0),
    Rect2(2140.0, 488.0, 240.0, 24.0),
]

var player_projectiles: Array[Dictionary] = []
var enemy_projectiles: Array[Dictionary] = []

@onready var player: CharacterBody2D = $Player
@onready var enemy: Node2D = $Enemy
@onready var status_bar: ColorRect = $HUD/StatusBar

func _ready() -> void:
    player.connect("fired", Callable(self, "_on_player_fired"))
    player.connect("health_changed", Callable(self, "_on_player_health_changed"))
    enemy.connect("fired", Callable(self, "_on_enemy_fired"))
    _notify_parent("ready")
    queue_redraw()

func _process(delta: float) -> void:
    _update_player_projectiles(delta)
    _update_enemy_projectiles(delta)
    queue_redraw()

func _unhandled_key_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
        _notify_parent("exit")
        get_viewport().set_input_as_handled()

func _on_player_fired(origin: Vector2, direction: float) -> void:
    player_projectiles.append({
        "position": origin,
        "direction": direction,
    })

func _on_enemy_fired(origin: Vector2, direction: Vector2) -> void:
    enemy_projectiles.append({
        "position": origin,
        "direction": direction,
    })

func _on_player_health_changed(current: int, maximum: int) -> void:
    var ratio := clampf(float(current) / float(maximum), 0.0, 1.0)
    status_bar.size = Vector2(220.0 * ratio, 10.0)

func _update_player_projectiles(delta: float) -> void:
    for index in range(player_projectiles.size() - 1, -1, -1):
        var projectile := player_projectiles[index]
        var position: Vector2 = projectile["position"]
        position.x += float(projectile["direction"]) * PLAYER_BULLET_SPEED * delta
        projectile["position"] = position
        player_projectiles[index] = projectile

        if bool(enemy.call("is_alive")) and bool(enemy.call("contains_world_point", position)):
            enemy.call("take_damage", 1)
            player_projectiles.remove_at(index)
            continue

        if position.x < -30.0 or position.x > WORLD_SIZE.x + 30.0:
            player_projectiles.remove_at(index)

func _update_enemy_projectiles(delta: float) -> void:
    for index in range(enemy_projectiles.size() - 1, -1, -1):
        var projectile := enemy_projectiles[index]
        var position: Vector2 = projectile["position"]
        var direction: Vector2 = projectile["direction"]
        position += direction * ENEMY_BULLET_SPEED * delta
        projectile["position"] = position
        enemy_projectiles[index] = projectile

        if bool(player.call("contains_world_point", position)):
            player.call("take_hit", 1)
            enemy_projectiles.remove_at(index)
            continue

        if position.x < -30.0 or position.x > WORLD_SIZE.x + 30.0 or position.y < -30.0 or position.y > WORLD_SIZE.y + 30.0:
            enemy_projectiles.remove_at(index)

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

    for projectile in player_projectiles:
        var position: Vector2 = projectile["position"]
        draw_circle(position, 5.0, Color("ffd36a"))
        draw_line(position - Vector2(float(projectile["direction"]) * 18.0, 0.0), position, Color(1.0, 0.72, 0.24, 0.45), 3.0)

    for projectile in enemy_projectiles:
        var position: Vector2 = projectile["position"]
        var direction: Vector2 = projectile["direction"]
        draw_circle(position, 5.0, Color("ff6f59"))
        draw_line(position - direction * 16.0, position, Color(1.0, 0.25, 0.15, 0.45), 3.0)

func _notify_parent(message_type: String) -> void:
    if not OS.has_feature("web"):
        return
    var message := JSON.stringify({"source": "pawn-slug-godot", "type": message_type})
    JavaScriptBridge.eval("window.parent.postMessage(" + message + ", '*');")
