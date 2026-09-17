extends CharacterBody2D

signal fired(origin: Vector2, direction: float)
signal health_changed(current: int, maximum: int)

const MOVE_SPEED := 330.0
const GROUND_ACCEL := 2200.0
const AIR_ACCEL := 1350.0
const GROUND_DECEL := 2800.0
const JUMP_SPEED := 610.0
const GRAVITY := 1550.0
const COYOTE_TIME := 0.10
const JUMP_BUFFER_TIME := 0.12
const FIRE_INTERVAL := 0.16
const MAX_HEALTH := 3
const INVULNERABILITY_TIME := 0.65

var health := MAX_HEALTH
var facing := 1.0
var fire_cooldown := 0.0
var muzzle_flash := 0.0
var invulnerability_remaining := 0.0
var _coyote_remaining := 0.0
var _jump_buffer_remaining := 0.0
var _jump_was_pressed := false
var _spawn_position := Vector2.ZERO

func _ready() -> void:
    _spawn_position = global_position

func _physics_process(delta: float) -> void:
    invulnerability_remaining = maxf(0.0, invulnerability_remaining - delta)

    var axis := _movement_axis()
    if absf(axis) > 0.08:
        facing = 1.0 if axis > 0.0 else -1.0

    var target_speed := axis * MOVE_SPEED
    var accel := GROUND_ACCEL if is_on_floor() else AIR_ACCEL
    if absf(axis) <= 0.08 and is_on_floor():
        accel = GROUND_DECEL
    velocity.x = move_toward(velocity.x, target_speed, accel * delta)

    if is_on_floor():
        _coyote_remaining = COYOTE_TIME
    else:
        _coyote_remaining = maxf(0.0, _coyote_remaining - delta)
        velocity.y += GRAVITY * delta

    var jump_pressed := _jump_pressed()
    if jump_pressed and not _jump_was_pressed:
        _jump_buffer_remaining = JUMP_BUFFER_TIME
    else:
        _jump_buffer_remaining = maxf(0.0, _jump_buffer_remaining - delta)

    if _jump_buffer_remaining > 0.0 and _coyote_remaining > 0.0:
        velocity.y = -JUMP_SPEED
        _jump_buffer_remaining = 0.0
        _coyote_remaining = 0.0
    elif _jump_was_pressed and not jump_pressed and velocity.y < -JUMP_SPEED * 0.35:
        velocity.y *= 0.55
    _jump_was_pressed = jump_pressed

    move_and_slide()

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    muzzle_flash = maxf(0.0, muzzle_flash - delta)
    if _fire_pressed() and fire_cooldown <= 0.0:
        fire_cooldown = FIRE_INTERVAL
        muzzle_flash = 0.055
        fired.emit(global_position + Vector2(facing * 38.0, -7.0), facing)

    queue_redraw()

func take_hit(amount: int = 1) -> bool:
    if invulnerability_remaining > 0.0:
        return false

    health = maxi(0, health - maxi(1, amount))
    invulnerability_remaining = INVULNERABILITY_TIME
    if health <= 0:
        global_position = _spawn_position
        velocity = Vector2.ZERO
        health = MAX_HEALTH
    health_changed.emit(health, MAX_HEALTH)
    queue_redraw()
    return true

func contains_world_point(point: Vector2) -> bool:
    return Rect2(global_position - Vector2(24.0, 42.0), Vector2(48.0, 84.0)).has_point(point)

func _movement_axis() -> float:
    var axis := 0.0
    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
        axis -= 1.0
    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
        axis += 1.0

    var joypads := Input.get_connected_joypads()
    if not joypads.is_empty():
        var joy_axis := Input.get_joy_axis(joypads[0], JOY_AXIS_LEFT_X)
        if absf(joy_axis) > absf(axis):
            axis = joy_axis
    return clampf(axis, -1.0, 1.0)

func _jump_pressed() -> bool:
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_A)

func _fire_pressed() -> bool:
    if Input.is_key_pressed(KEY_SPACE) or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_X)

func _draw() -> void:
    if invulnerability_remaining > 0.0 and int(Time.get_ticks_msec() / 70) % 2 == 0:
        return

    draw_rect(Rect2(Vector2(-24.0, -26.0), Vector2(48.0, 58.0)), Color("20262c"), true)
    draw_circle(Vector2(0.0, -43.0), 24.0, Color("d7c2a0"))
    draw_rect(Rect2(Vector2(-30.0, -69.0), Vector2(60.0, 10.0)), Color("11151a"), true)
    draw_rect(Rect2(Vector2(-18.0, -78.0), Vector2(36.0, 12.0)), Color("171c21"), true)

    var gun_origin := Vector2(facing * 14.0, -7.0)
    draw_line(gun_origin, gun_origin + Vector2(facing * 42.0, 0.0), Color("a4abb1"), 9.0)
    if muzzle_flash > 0.0:
        draw_circle(gun_origin + Vector2(facing * 51.0, 0.0), 10.0, Color("ffd36a"))
