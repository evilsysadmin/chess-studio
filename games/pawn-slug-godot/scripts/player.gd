extends CharacterBody2D

signal fired(origin: Vector2, direction: float)
signal hurt(current_hp: int, max_hp: int)
signal died(lives_remaining: int)
signal respawned(current_hp: int, max_hp: int, lives_remaining: int)
signal game_over

const MatthiasArt := preload("res://scripts/matthias_art.gd")
const MOVE_SPEED := 330.0
const CROUCH_SPEED_SCALE := 0.30
const GROUND_ACCEL := 2200.0
const AIR_ACCEL := 1350.0
const GROUND_DECEL := 2800.0
const JUMP_SPEED := 610.0
const GRAVITY := 1550.0
const COYOTE_TIME := 0.10
const JUMP_BUFFER_TIME := 0.12
const FIRE_INTERVAL := 0.16
const MAX_HP := 3
const STARTING_LIVES := 3
const HIT_INVULN_SECONDS := 0.85
const HURT_VISUAL_SECONDS := 0.18
const DEATH_PAUSE_SECONDS := 0.55
const RESPAWN_INVULN_SECONDS := 1.8

var facing := 1.0
var fire_cooldown := 0.0
var hp := MAX_HP
var lives := STARTING_LIVES
var invuln_remaining := 0.0
var hurt_visual_remaining := 0.0
var dead := false
var is_game_over := false
var _death_remaining := 0.0
var _spawn_position := Vector2.ZERO
var _coyote_remaining := 0.0
var _jump_buffer_remaining := 0.0
var _jump_was_pressed := false
var _art

func _ready() -> void:
    _spawn_position = global_position
    _art = MatthiasArt.new()
    _art.name = "MatthiasArt"
    add_child(_art)

func _physics_process(delta: float) -> void:
    invuln_remaining = maxf(0.0, invuln_remaining - delta)
    hurt_visual_remaining = maxf(0.0, hurt_visual_remaining - delta)
    if dead:
        _update_dead_state(delta)
        return

    var was_on_floor := is_on_floor()
    var axis := _movement_axis()
    if absf(axis) > 0.08:
        facing = 1.0 if axis > 0.0 else -1.0

    var crouching := _crouch_pressed() and is_on_floor()
    var speed_scale := CROUCH_SPEED_SCALE if crouching else 1.0
    var target_speed := axis * MOVE_SPEED * speed_scale
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

    if _jump_buffer_remaining > 0.0 and _coyote_remaining > 0.0 and not crouching:
        velocity.y = -JUMP_SPEED
        _jump_buffer_remaining = 0.0
        _coyote_remaining = 0.0
    elif _jump_was_pressed and not jump_pressed and velocity.y < -JUMP_SPEED * 0.35:
        velocity.y *= 0.55
    _jump_was_pressed = jump_pressed

    move_and_slide()
    var landed_now := not was_on_floor and is_on_floor()
    crouching = _crouch_pressed() and is_on_floor()
    var horizontal_speed_ratio := clampf(absf(velocity.x) / MOVE_SPEED, 0.0, 1.0)

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    var fired_now := false
    if _fire_pressed() and fire_cooldown <= 0.0:
        fire_cooldown = FIRE_INTERVAL
        fired_now = true
        fired.emit(global_position + Vector2(facing * 38.0, -7.0), facing)

    _art.set_combat_state(hurt_visual_remaining, invuln_remaining, false, 0.0)
    _art.update_visual(
        delta,
        horizontal_speed_ratio,
        is_on_floor(),
        crouching,
        landed_now,
        velocity.y,
        facing,
        fired_now,
    )
    queue_redraw()

func can_take_damage() -> bool:
    return not dead and not is_game_over and invuln_remaining <= 0.0

func take_damage(amount: int = 1) -> bool:
    if amount <= 0 or not can_take_damage():
        return false
    hp = maxi(0, hp - amount)
    invuln_remaining = HIT_INVULN_SECONDS
    hurt_visual_remaining = HURT_VISUAL_SECONDS
    hurt.emit(hp, MAX_HP)
    if hp <= 0:
        _begin_death()
    return true

func _begin_death() -> void:
    dead = true
    hurt_visual_remaining = 0.0
    _death_remaining = DEATH_PAUSE_SECONDS
    lives = maxi(0, lives - 1)
    velocity = Vector2.ZERO
    fire_cooldown = FIRE_INTERVAL
    died.emit(lives)
    if lives <= 0:
        is_game_over = true
        game_over.emit()

func _update_dead_state(delta: float) -> void:
    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    if not is_on_floor():
        velocity.y += GRAVITY * delta
    velocity.x = move_toward(velocity.x, 0.0, GROUND_DECEL * delta)
    move_and_slide()

    _death_remaining = maxf(0.0, _death_remaining - delta)
    var death_progress := clampf(
        1.0 - (_death_remaining / DEATH_PAUSE_SECONDS),
        0.0,
        1.0,
    )
    if not is_game_over and _death_remaining <= 0.0:
        _respawn()
        return

    var horizontal_speed_ratio := clampf(absf(velocity.x) / MOVE_SPEED, 0.0, 1.0)
    _art.set_combat_state(0.0, 0.0, true, death_progress)
    _art.update_visual(
        delta,
        horizontal_speed_ratio,
        is_on_floor(),
        false,
        false,
        velocity.y,
        facing,
        false,
    )
    queue_redraw()

func _respawn() -> void:
    global_position = _spawn_position
    velocity = Vector2.ZERO
    hp = MAX_HP
    invuln_remaining = RESPAWN_INVULN_SECONDS
    hurt_visual_remaining = 0.0
    dead = false
    _death_remaining = 0.0
    _coyote_remaining = 0.0
    _jump_buffer_remaining = 0.0
    _jump_was_pressed = false
    _art.set_combat_state(0.0, invuln_remaining, false, 0.0)
    respawned.emit(hp, MAX_HP, lives)

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

func _crouch_pressed() -> bool:
    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
        return true
    var joypads := Input.get_connected_joypads()
    if joypads.is_empty():
        return false
    var joypad := joypads[0]
    return (
        Input.is_joy_button_pressed(joypad, JOY_BUTTON_DPAD_DOWN)
        or Input.get_joy_axis(joypad, JOY_AXIS_LEFT_Y) > 0.55
    )

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
