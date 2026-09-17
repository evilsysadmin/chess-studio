extends Node2D

signal fired(origin: Vector2, direction: Vector2)

const MAX_HEALTH := 5
const SIGHT_RANGE := 780.0
const FIRE_INTERVAL := 0.85
const RESPAWN_DELAY := 1.25

@export var player_path: NodePath
@onready var player: CharacterBody2D = get_node(player_path) as CharacterBody2D

var health := MAX_HEALTH
var fire_cooldown := 0.0
var respawn_remaining := 0.0
var facing := -1.0

func _physics_process(delta: float) -> void:
    if health <= 0:
        respawn_remaining -= delta
        if respawn_remaining <= 0.0:
            health = MAX_HEALTH
            fire_cooldown = 0.0
            queue_redraw()
        return

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    if is_instance_valid(player):
        facing = -1.0 if player.global_position.x < global_position.x else 1.0
        if fire_cooldown <= 0.0 and _can_see_player():
            _fire_at_player()
    queue_redraw()

func _can_see_player() -> bool:
    if not is_instance_valid(player):
        return false

    var origin := global_position + Vector2(0.0, -18.0)
    var target := player.global_position + Vector2(0.0, -12.0)
    if origin.distance_to(target) > SIGHT_RANGE:
        return false

    var query := PhysicsRayQueryParameters2D.create(origin, target)
    query.collide_with_areas = false
    var hit := get_world_2d().direct_space_state.intersect_ray(query)
    return not hit.is_empty() and hit.get("collider") == player

func _fire_at_player() -> void:
    var origin := global_position + Vector2(facing * 36.0, -10.0)
    var target := player.global_position + Vector2(0.0, -10.0)
    var direction := origin.direction_to(target)
    if direction == Vector2.ZERO:
        direction = Vector2(facing, 0.0)
    fire_cooldown = FIRE_INTERVAL
    fired.emit(origin, direction)

func take_damage(amount: int = 1) -> bool:
    if health <= 0:
        return false
    health = maxi(0, health - maxi(1, amount))
    if health <= 0:
        respawn_remaining = RESPAWN_DELAY
    queue_redraw()
    return true

func is_alive() -> bool:
    return health > 0

func contains_world_point(point: Vector2) -> bool:
    if health <= 0:
        return false
    return Rect2(global_position - Vector2(34.0, 44.0), Vector2(68.0, 88.0)).has_point(point)

func _draw() -> void:
    if health <= 0:
        draw_circle(Vector2(0.0, 34.0), 34.0, Color(0.25, 0.11, 0.09, 0.5))
        return

    draw_rect(Rect2(Vector2(-30.0, -34.0), Vector2(60.0, 68.0)), Color("633c35"), true)
    draw_circle(Vector2(0.0, -47.0), 22.0, Color("c8ad8a"))
    draw_rect(Rect2(Vector2(-36.0, -83.0), Vector2(72.0, 8.0)), Color("4a2c28"), true)

    var gun_origin := Vector2(facing * 14.0, -10.0)
    draw_line(gun_origin, gun_origin + Vector2(facing * 34.0, 0.0), Color("8e969d"), 8.0)

    var hp_width := 70.0
    draw_rect(Rect2(Vector2(-hp_width / 2.0, -108.0), Vector2(hp_width, 7.0)), Color("2f3438"), true)
    draw_rect(Rect2(Vector2(-hp_width / 2.0, -108.0), Vector2(hp_width * float(health) / float(MAX_HEALTH), 7.0)), Color("c7634e"), true)
