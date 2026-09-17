extends CharacterBody2D

signal fired(origin: Vector2, direction: float, shot: Dictionary)
signal hurt(current_hp: int, max_hp: int)
signal died(lives_remaining: int)
signal respawned(current_hp: int, max_hp: int, lives_remaining: int)
signal game_over
signal weapon_changed(weapon_id: String, ammo_remaining: int)

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
const MAX_HP := 3
const STARTING_LIVES := 3
const HIT_INVULN_SECONDS := 0.85
const HURT_VISUAL_SECONDS := 0.18
const DEATH_PAUSE_SECONDS := 0.55
const RESPAWN_INVULN_SECONDS := 1.8
const WEAPON_ORDER := ["pistol", "machinegun", "shotgun", "panzerfaust"]
const WEAPONS := {
    "pistol": {
        "slot": 1,
        "trigger": "semi",
        "ammo": -1,
        "cadence": 0.380,
        "damage": 22,
        "speed": 760.0,
        "pellets": 1,
        "spread": 0.0,
        "explosive": false,
    },
    "machinegun": {
        "slot": 2,
        "trigger": "auto",
        "ammo": 180,
        "cadence": 0.082,
        "damage": 13,
        "speed": 860.0,
        "pellets": 1,
        "spread": 0.025,
        "explosive": false,
    },
    "shotgun": {
        "slot": 3,
        "trigger": "semi",
        "ammo": 42,
        "cadence": 0.430,
        "damage": 13,
        "speed": 690.0,
        "pellets": 6,
        "spread": 0.19,
        "explosive": false,
    },
    "panzerfaust": {
        "slot": 4,
        "trigger": "semi",
        "ammo": 9,
        "cadence": 0.720,
        "damage": 92,
        "speed": 520.0,
        "pellets": 1,
        "spread": 0.0,
        "explosive": true,
    },
}

var facing := 1.0
var fire_cooldown := 0.0
var hp := MAX_HP
var lives := STARTING_LIVES
var invuln_remaining := 0.0
var hurt_visual_remaining := 0.0
var dead := false
var is_game_over := false
var weapon := "pistol"
var arsenal := {
    "pistol": {"unlocked": true, "ammo": -1},
    "machinegun": {"unlocked": false, "ammo": 0},
    "shotgun": {"unlocked": false, "ammo": 0},
    "panzerfaust": {"unlocked": false, "ammo": 0},
}
var _death_remaining := 0.0
var _spawn_position := Vector2.ZERO
var _coyote_remaining := 0.0
var _jump_buffer_remaining := 0.0
var _jump_was_pressed := false
var _fire_was_pressed := false
var _art

func _ready() -> void:
    _spawn_position = global_position
    _art = MatthiasArt.new()
    _art.name = "MatthiasArt"
    add_child(_art)
    _art.set_weapon(weapon)

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
    var fired_now := _update_fire_input()

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

func _unhandled_key_input(event: InputEvent) -> void:
    if not (event is InputEventKey) or not event.pressed or event.echo:
        return
    match event.keycode:
        KEY_1:
            select_weapon("pistol")
        KEY_2:
            select_weapon("machinegun")
        KEY_3:
            select_weapon("shotgun")
        KEY_4:
            select_weapon("panzerfaust")

func grant_weapon(id: String, ammo_bonus: int = -1) -> bool:
    if not WEAPONS.has(id) or id == "pistol":
        return false
    var slot: Dictionary = arsenal[id]
    var default_ammo := int(WEAPONS[id]["ammo"])
    var granted_ammo := default_ammo if ammo_bonus < 0 else ammo_bonus
    if not bool(slot["unlocked"]):
        slot["unlocked"] = true
        slot["ammo"] = maxi(0, granted_ammo)
    else:
        slot["ammo"] = maxi(0, int(slot["ammo"]) + granted_ammo)
    arsenal[id] = slot
    select_weapon(id)
    return true

func select_weapon(id: String) -> bool:
    if not WEAPONS.has(id):
        return false
    var slot: Dictionary = arsenal[id]
    if not bool(slot["unlocked"]):
        return false
    if int(slot["ammo"]) == 0:
        return false
    weapon = id
    fire_cooldown = 0.0
    _fire_was_pressed = _fire_pressed()
    _art.set_weapon(weapon)
    weapon_changed.emit(weapon, current_ammo())
    return true

func current_ammo() -> int:
    return int(arsenal[weapon]["ammo"])

func weapon_unlocked(id: String) -> bool:
    return WEAPONS.has(id) and bool(arsenal[id]["unlocked"])

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

func _update_fire_input() -> bool:
    var fire_pressed := _fire_pressed()
    var profile: Dictionary = WEAPONS[weapon]
    var trigger := String(profile["trigger"])
    var wants_fire := fire_pressed if trigger == "auto" else fire_pressed and not _fire_was_pressed
    _fire_was_pressed = fire_pressed
    if not wants_fire or fire_cooldown > 0.0:
        return false

    var slot: Dictionary = arsenal[weapon]
    var ammo := int(slot["ammo"])
    if ammo == 0:
        _fallback_to_pistol()
        return false

    fire_cooldown = float(profile["cadence"])
    var shot := {
        "weapon": weapon,
        "speed": float(profile["speed"]),
        "damage": int(profile["damage"]),
        "pellets": int(profile["pellets"]),
        "spread": float(profile["spread"]),
        "explosive": bool(profile["explosive"]),
    }
    fired.emit(global_position + Vector2(facing * 38.0, -7.0), facing, shot)

    if ammo > 0:
        ammo -= 1
        slot["ammo"] = ammo
        arsenal[weapon] = slot
        weapon_changed.emit(weapon, ammo)
        if ammo == 0:
            _fallback_to_pistol()
    return true

func _fallback_to_pistol() -> void:
    if weapon == "pistol":
        return
    select_weapon("pistol")

func _begin_death() -> void:
    dead = true
    hurt_visual_remaining = 0.0
    _death_remaining = DEATH_PAUSE_SECONDS
    lives = maxi(0, lives - 1)
    velocity = Vector2.ZERO
    fire_cooldown = float(WEAPONS[weapon]["cadence"])
    _fire_was_pressed = false
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
    _fire_was_pressed = false
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
