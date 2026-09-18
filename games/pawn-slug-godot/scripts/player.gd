extends CharacterBody2D

signal fired(origin: Vector2, direction: float, shot: Dictionary)
signal grenade_thrown(origin: Vector2, direction: float)
signal grenades_changed(count: int)
signal checkpoint_changed(checkpoint_x: float)
signal hurt(current_hp: int, max_hp: int)
signal healed(current_hp: int, max_hp: int)
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
const STARTING_GRENADES := 4
const HIT_INVULN_SECONDS := 0.85
const HURT_VISUAL_SECONDS := 0.18
const DEATH_PAUSE_SECONDS := 0.55
const RESPAWN_INVULN_SECONDS := 1.8
const CHECKPOINT_X := [110.0, 1480.0, 2980.0, 4140.0]
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
var grenades := STARTING_GRENADES
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
var _checkpoint_position := Vector2.ZERO
var _coyote_remaining := 0.0
var _jump_buffer_remaining := 0.0
var _jump_was_pressed := false
var _fire_was_pressed := false
var _grenade_was_pressed := false
var _art

func _ready() -> void:
    global_position.x = CHECKPOINT_X[0]
    _spawn_position = global_position
    _checkpoint_position = _spawn_position
    _art = MatthiasArt.new()
    _art.name = "MatthiasArt"
    add_child(_art)
    _art.set_weapon(weapon)
    # Prime the canonical idle pose immediately. Remote atlases may finish after
    # this node is ready, but the art state must already be valid when they land.
    _art.set_combat_state(0.0, 0.0, false, 0.0)
    _art.update_visual(0.0, 0.0, true, false, false, 0.0, facing, false)

func visual_ready() -> bool:
    return _art != null and _art.body_ready()

func _physics_process(delta: float) -> void:
    if not visual_ready():
        velocity = Vector2.ZERO
        return
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
    _update_checkpoint()
    var landed_now := not was_on_floor and is_on_floor()
    crouching = _crouch_pressed() and is_on_floor()
    var horizontal_speed_ratio := clampf(absf(velocity.x) / MOVE_SPEED, 0.0, 1.0)

    # Pose/facing must be current before weapon or grenade origins are resolved.
    _art.set_combat_state(hurt_visual_remaining, invuln_remaining, false, 0.0)
    _art.update_visual(
        delta,
        horizontal_speed_ratio,
        is_on_floor(),
        crouching,
        landed_now,
        velocity.y,
        facing,
        false,
    )

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    var fired_now := _update_fire_input()
    if fired_now:
        _art.update_visual(
            0.0,
            horizontal_speed_ratio,
            is_on_floor(),
            crouching,
            false,
            velocity.y,
            facing,
            true,
        )

    var grenade_pressed := _grenade_pressed()
    if grenade_pressed and not _grenade_was_pressed:
        throw_grenade()
    _grenade_was_pressed = grenade_pressed
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
        KEY_Q:
            _cycle_weapon(-1)
        KEY_E:
            _cycle_weapon(1)

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

func grant_grenades(amount: int = 3) -> bool:
    if amount <= 0:
        return false
    grenades += amount
    grenades_changed.emit(grenades)
    return true

func heal(amount: int = 1) -> bool:
    if amount <= 0 or dead or is_game_over:
        return false
    var previous := hp
    hp = mini(MAX_HP, hp + amount)
    healed.emit(hp, MAX_HP)
    return hp > previous

func throw_grenade() -> bool:
    if grenades <= 0 or dead or is_game_over:
        return false
    grenades -= 1
    grenades_changed.emit(grenades)
    grenade_thrown.emit(global_position + Vector2(facing * 24.0, -34.0), facing)
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

func _cycle_weapon(step: int) -> bool:
    if step == 0:
        return false
    var current_index := WEAPON_ORDER.find(weapon)
    if current_index < 0:
        current_index = 0
    var direction := 1 if step > 0 else -1
    for offset in range(1, WEAPON_ORDER.size() + 1):
        var index := (current_index + direction * offset) % WEAPON_ORDER.size()
        if index < 0:
            index += WEAPON_ORDER.size()
        var candidate := String(WEAPON_ORDER[index])
        var slot: Dictionary = arsenal[candidate]
        if bool(slot["unlocked"]) and int(slot["ammo"]) != 0:
            return select_weapon(candidate)
    return false

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
    fired.emit(_projectile_origin(), facing, shot)

    if ammo > 0:
        ammo -= 1
        slot["ammo"] = ammo
        arsenal[weapon] = slot
        weapon_changed.emit(weapon, ammo)
        if ammo == 0:
            _fallback_to_pistol()
    return true

func _projectile_origin() -> Vector2:
    if _art != null:
        var muzzle := _art.get_node_or_null("FacingRoot/FxRoot/WeaponRoot/Muzzle") as Node2D
        if muzzle != null:
            return muzzle.global_position
    return global_position + Vector2(facing * 38.0, -7.0)

func _update_checkpoint() -> void:
    for checkpoint_x in CHECKPOINT_X:
        if global_position.x + 0.01 < checkpoint_x:
            break
        if checkpoint_x <= _checkpoint_position.x:
            continue
        _checkpoint_position = Vector2(checkpoint_x, _spawn_position.y)
        checkpoint_changed.emit(checkpoint_x)

func current_checkpoint_x() -> float:
    return _checkpoint_position.x

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
    _grenade_was_pressed = false
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
    global_position = _checkpoint_position
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
    _grenade_was_pressed = false
    select_weapon("pistol")
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
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_SPACE):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_A)

func _fire_pressed() -> bool:
    if (
        Input.is_key_pressed(KEY_Z)
        or Input.is_key_pressed(KEY_J)
        or Input.is_key_pressed(KEY_ENTER)
        or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
    ):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_X)

func _grenade_pressed() -> bool:
    if Input.is_key_pressed(KEY_X) or Input.is_key_pressed(KEY_K):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_Y)
