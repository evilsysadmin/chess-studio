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

func quantize_aim_probe(raw: Vector2) -> Vector2:
    return _quantize_aim(raw)
