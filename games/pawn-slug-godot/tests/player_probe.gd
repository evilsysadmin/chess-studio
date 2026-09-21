extends "res://scripts/player.gd"

func _ready() -> void:
    # Test probe deliberately bypasses MatthiasArt/network setup. It exercises
    # the real Player collision/aim/respawn implementation in a tiny local world.
    _touch_controls = null
    _collision_shape = get_node_or_null("CollisionShape2D") as CollisionShape2D
    _spawn_position = global_position
    _checkpoint_position = global_position
    _last_safe_position = global_position
    _set_crouching(false, true)
    set_physics_process(false)

func force_crouching(value: bool) -> void:
    _set_crouching(value, true)

func can_stand_probe() -> bool:
    return _can_stand()

func find_safe_respawn_probe(preferred: Vector2) -> Vector2:
    return _find_safe_respawn_position(preferred)

func respawn_position_is_clear_probe(candidate: Vector2) -> bool:
    return _respawn_position_is_clear(candidate)

func find_ledge_climb_target_probe() -> Dictionary:
    return _find_ledge_climb_target()

func start_ledge_climb_probe(target: Vector2) -> void:
    _start_ledge_climb(target)

func is_climbing_probe() -> bool:
    return is_climbing()

func quantize_aim_probe(raw: Vector2) -> Vector2:
    return _quantize_aim(raw)

func constrain_vertical_aim_probe(direction: Vector2, grounded: bool) -> Vector2:
    return _constrain_vertical_aim(direction, grounded)

func try_drop_through_probe() -> bool:
    return _try_drop_through_one_way()

func drop_through_body_probe() -> PhysicsBody2D:
    return _drop_through_body

func clear_drop_through_probe() -> void:
    _clear_drop_through_exception()

func configure_traversal_probe(ladders: Array, kill_y: float = 820.0) -> void:
    configure_stage(global_position.x, [global_position.x], ladders, kill_y)

func ladder_near_player_probe() -> Rect2:
    return _ladder_near_player()

func update_ladder_state_probe(axis: float, delta: float) -> bool:
    return _update_ladder_state(axis, delta)

func is_ladder_climbing_probe() -> bool:
    return is_ladder_climbing()
