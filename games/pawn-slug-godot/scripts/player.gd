extends CharacterBody2D

signal fired(origin: Vector2, direction: float)

const MatthiasArt := preload("res://scripts/matthias_art.gd")
const MOVE_SPEED := 330.0
const GROUND_ACCEL := 2200.0
const AIR_ACCEL := 1350.0
const GROUND_DECEL := 2800.0
const JUMP_SPEED := 610.0
const GRAVITY := 1550.0
const COYOTE_TIME := 0.10
const JUMP_BUFFER_TIME := 0.12
const FIRE_INTERVAL := 0.16

var facing := 1.0
var fire_cooldown := 0.0
var muzzle_flash := 0.0
var _coyote_remaining := 0.0
var _jump_buffer_remaining := 0.0
var _jump_was_pressed := false
var _art

func _ready() -> void:
    _art = MatthiasArt.new()
    _art.name = "MatthiasArt"
    add_child(_art)

func _physics_process(delta: float) -> void:
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
    var fired_now := false
    if _fire_pressed() and fire_cooldown <= 0.0:
        fire_cooldown = FIRE_INTERVAL
        muzzle_flash = 0.055
        fired_now = true
        fired.emit(global_position + Vector2(facing * 38.0, -7.0), facing)

    _art.update_visual(delta, axis, is_on_floor(), facing, fired_now)
    queue_redraw()

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
    if _art == null or not _art.body_ready():
        draw_rect(Rect2(Vector2(-24.0, -26.0), Vector2(48.0, 58.0)), Color("20262c"), true)
        draw_circle(Vector2(0.0, -43.0), 24.0, Color("d7c2a0"))
        draw_rect(Rect2(Vector2(-30.0, -69.0), Vector2(60.0, 10.0)), Color("11151a"), true)
        draw_rect(Rect2(Vector2(-18.0, -78.0), Vector2(36.0, 12.0)), Color("171c21"), true)

        var gun_origin := Vector2(facing * 14.0, -7.0)
        draw_line(gun_origin, gun_origin + Vector2(facing * 42.0, 0.0), Color("a4abb1"), 9.0)

    if muzzle_flash > 0.0:
        draw_circle(Vector2(facing * 65.0, -10.0), 9.0, Color("ffd36a"))
