extends CharacterBody2D

signal fired(origin: Vector2, direction: Vector2, shot: Dictionary)
signal grenade_thrown(origin: Vector2, direction: float)
signal grenades_changed(count: int)
signal checkpoint_changed(checkpoint_x: float)
signal hurt(current_hp: int, max_hp: int)
signal healed(current_hp: int, max_hp: int)
signal died(lives_remaining: int)
signal respawned(current_hp: int, max_hp: int, lives_remaining: int)
signal game_over
signal weapon_changed(weapon_id: String, ammo_remaining: int)
signal landed(intensity: float)

const MatthiasArt := preload("res://scripts/matthias_art.gd")
const MOVE_SPEED := 330.0
const CROUCH_SPEED_SCALE := 0.30
const STANDING_HITBOX_SIZE := Vector2(48.0, 84.0)
const CROUCH_HITBOX_SIZE := Vector2(48.0, 48.0)
const CROUCH_HITBOX_OFFSET_Y := (STANDING_HITBOX_SIZE.y - CROUCH_HITBOX_SIZE.y) * 0.5
const STAND_CLEARANCE_SIZE := Vector2(46.0, STANDING_HITBOX_SIZE.y - CROUCH_HITBOX_SIZE.y)
const STAND_CLEARANCE_OFFSET_Y := -24.0
const RESPAWN_SEARCH_X_OFFSETS := [
    0.0, -48.0, 48.0, -96.0, 96.0, -144.0, 144.0,
    -192.0, 192.0, -256.0, 256.0,
]
const RESPAWN_RAY_UP_DISTANCE := 460.0
const RESPAWN_RAY_DOWN_DISTANCE := 320.0
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
const DEFAULT_CHECKPOINT_X := [110.0, 1480.0, 2980.0, 4140.0]
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
var _touch_controls
var _collision_shape: CollisionShape2D
var _crouching := false
var _last_safe_position := Vector2.ZERO
var _checkpoint_xs: Array[float] = []

func _ready() -> void:
    _touch_controls = get_parent().get_node_or_null("TouchControls")
    _collision_shape = get_node_or_null("CollisionShape2D") as CollisionShape2D
    _checkpoint_xs.assign(DEFAULT_CHECKPOINT_X)
    global_position.x = _checkpoint_xs[0]
    _spawn_position = global_position
    _checkpoint_position = _spawn_position
    _last_safe_position = _spawn_position
    _set_crouching(false, true)
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

func configure_stage(start_x: float, checkpoints: Array) -> void:
    _checkpoint_xs.clear()
    for value in checkpoints:
        _checkpoint_xs.append(float(value))
    if _checkpoint_xs.is_empty():
        _checkpoint_xs.assign(DEFAULT_CHECKPOINT_X)
    _checkpoint_xs.sort()
    global_position.x = start_x
    _spawn_position = global_position
    _checkpoint_position = _find_safe_respawn_position(_spawn_position)
    _last_safe_position = _checkpoint_position


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
    var aim_direction := _aim_direction()
    if _fire_pressed() and absf(aim_direction.x) > 0.25:
        facing = signf(aim_direction.x)

    _update_crouch_state()
    var speed_scale := CROUCH_SPEED_SCALE if _crouching else 1.0
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

    var aiming_up_while_firing := _fire_pressed() and _aim_vertical_axis() < -0.5
    var jump_pressed := _jump_pressed() and not aiming_up_while_firing
    if jump_pressed and not _jump_was_pressed:
        _jump_buffer_remaining = JUMP_BUFFER_TIME
    else:
        _jump_buffer_remaining = maxf(0.0, _jump_buffer_remaining - delta)

    if _jump_buffer_remaining > 0.0 and _coyote_remaining > 0.0 and not _crouching:
        velocity.y = -JUMP_SPEED
        _jump_buffer_remaining = 0.0
        _coyote_remaining = 0.0
    elif _jump_was_pressed and not jump_pressed and velocity.y < -JUMP_SPEED * 0.35:
        velocity.y *= 0.55
    _jump_was_pressed = jump_pressed

    var landing_speed := maxf(0.0, velocity.y)
    move_and_slide()
    _update_crouch_state()
    _update_checkpoint()
    if is_on_floor() and _respawn_position_is_clear(global_position):
        _last_safe_position = global_position
    var landed_now := not was_on_floor and is_on_floor()
    if landed_now:
        landed.emit(clampf((landing_speed - 180.0) / 620.0, 0.0, 1.0))
    var horizontal_speed_ratio := clampf(absf(velocity.x) / MOVE_SPEED, 0.0, 1.0)

    # Pose/facing must be current before weapon or grenade origins are resolved.
    _art.set_combat_state(hurt_visual_remaining, invuln_remaining, false, 0.0)
    _art.set_aim_direction(aim_direction)
    _art.update_visual(
        delta,
        horizontal_speed_ratio,
        is_on_floor(),
        _crouching,
        landed_now,
        velocity.y,
        facing,
        false,
    )

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    var fired_now := _update_fire_input(aim_direction)
    if fired_now:
        _art.update_visual(
            0.0,
            horizontal_speed_ratio,
            is_on_floor(),
            _crouching,
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

func cycle_weapon(step: int) -> bool:
    return _cycle_weapon(step)

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

func _update_fire_input(aim_direction: Vector2) -> bool:
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
    fired.emit(_projectile_origin(), aim_direction, shot)

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
    for checkpoint_x in _checkpoint_xs:
        if global_position.x + 0.01 < checkpoint_x:
            break
        if checkpoint_x <= _checkpoint_position.x:
            continue
        var preferred := Vector2(checkpoint_x, _spawn_position.y)
        _checkpoint_position = _find_safe_respawn_position(preferred)
        checkpoint_changed.emit(checkpoint_x)

func current_checkpoint_x() -> float:
    return _checkpoint_position.x

func combat_hitbox_rect() -> Rect2:
    var size := CROUCH_HITBOX_SIZE if _crouching else STANDING_HITBOX_SIZE
    var offset_y := CROUCH_HITBOX_OFFSET_Y if _crouching else 0.0
    var center := global_position + Vector2(0.0, offset_y)
    return Rect2(center - size * 0.5, size)

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
    global_position = _find_safe_respawn_position(_checkpoint_position)
    _set_crouching(false, true)
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

func _update_crouch_state() -> void:
    if _collision_shape == null:
        _crouching = false
        return
    var wants_crouch := _crouch_pressed() and is_on_floor()
    if wants_crouch:
        _set_crouching(true)
    elif _crouching and _can_stand():
        _set_crouching(false)

func _set_crouching(value: bool, force := false) -> void:
    if _collision_shape == null or (_crouching == value and not force):
        return
    if not value and not force and not _can_stand():
        return
    var rect := _collision_shape.shape as RectangleShape2D
    if rect == null:
        return
    _crouching = value
    rect.size = CROUCH_HITBOX_SIZE if value else STANDING_HITBOX_SIZE
    _collision_shape.position.y = CROUCH_HITBOX_OFFSET_Y if value else 0.0

func _can_stand() -> bool:
    return _shape_position_is_clear(
        global_position + Vector2(0.0, STAND_CLEARANCE_OFFSET_Y),
        STAND_CLEARANCE_SIZE,
    )

func _shape_position_is_clear(center: Vector2, size: Vector2) -> bool:
    var shape := RectangleShape2D.new()
    shape.size = size
    var params := PhysicsShapeQueryParameters2D.new()
    params.shape = shape
    params.transform = Transform2D(0.0, center)
    params.exclude = [get_rid()]
    params.collision_mask = collision_mask
    params.collide_with_bodies = true
    params.collide_with_areas = false
    params.margin = 0.0
    return get_world_2d().direct_space_state.intersect_shape(params, 1).is_empty()

func _respawn_position_is_clear(candidate: Vector2) -> bool:
    return _shape_position_is_clear(candidate, STANDING_HITBOX_SIZE)

func _grounded_respawn_candidate(x: float, around_y: float) -> Dictionary:
    var ray := PhysicsRayQueryParameters2D.create(
        Vector2(x, around_y - RESPAWN_RAY_UP_DISTANCE),
        Vector2(x, around_y + RESPAWN_RAY_DOWN_DISTANCE),
        collision_mask,
        [get_rid()],
    )
    ray.collide_with_areas = false
    ray.collide_with_bodies = true
    var hit := get_world_2d().direct_space_state.intersect_ray(ray)
    if hit.is_empty():
        return {"valid": false}
    var surface: Vector2 = hit["position"]
    return {
        "valid": true,
        "position": Vector2(x, surface.y - STANDING_HITBOX_SIZE.y * 0.5 - 1.0),
    }

func _find_safe_respawn_position(preferred: Vector2) -> Vector2:
    for offset_x in RESPAWN_SEARCH_X_OFFSETS:
        var candidate_info := _grounded_respawn_candidate(preferred.x + float(offset_x), preferred.y)
        if not bool(candidate_info.get("valid", false)):
            continue
        var candidate: Vector2 = candidate_info["position"]
        if _respawn_position_is_clear(candidate):
            return candidate
    if _last_safe_position != Vector2.ZERO and _respawn_position_is_clear(_last_safe_position):
        return _last_safe_position
    var spawn_info := _grounded_respawn_candidate(_spawn_position.x, _spawn_position.y)
    if bool(spawn_info.get("valid", false)):
        var spawn_candidate: Vector2 = spawn_info["position"]
        if _respawn_position_is_clear(spawn_candidate):
            return spawn_candidate
    return _spawn_position

func _aim_vertical_axis() -> float:
    if _touch_controls != null and _touch_controls.has_method("aim_vector"):
        var touch_aim: Vector2 = _touch_controls.aim_vector()
        if absf(touch_aim.y) > 0.25:
            return signf(touch_aim.y)
    var vertical := 0.0
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
        vertical -= 1.0
    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
        vertical += 1.0
    var joypads := Input.get_connected_joypads()
    if not joypads.is_empty():
        var joypad := joypads[0]
        var stick_y := Input.get_joy_axis(joypad, JOY_AXIS_RIGHT_Y)
        if absf(stick_y) > 0.45:
            return signf(stick_y)
        if Input.is_joy_button_pressed(joypad, JOY_BUTTON_DPAD_UP):
            vertical -= 1.0
        if Input.is_joy_button_pressed(joypad, JOY_BUTTON_DPAD_DOWN):
            vertical += 1.0
    return clampf(vertical, -1.0, 1.0)

func _aim_direction() -> Vector2:
    if _touch_controls != null and _touch_controls.has_method("aim_vector"):
        var touch_aim: Vector2 = _touch_controls.aim_vector()
        if touch_aim.length_squared() > 0.05:
            return _quantize_aim(touch_aim)

    var joypads := Input.get_connected_joypads()
    if not joypads.is_empty():
        var joypad := joypads[0]
        var right_stick := Vector2(
            Input.get_joy_axis(joypad, JOY_AXIS_RIGHT_X),
            Input.get_joy_axis(joypad, JOY_AXIS_RIGHT_Y),
        )
        if right_stick.length() > 0.45:
            return _quantize_aim(right_stick)

    var vertical := _aim_vertical_axis()
    if absf(vertical) > 0.5:
        var horizontal := 0.0
        if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
            horizontal -= 1.0
        if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
            horizontal += 1.0
        if not joypads.is_empty():
            var joypad := joypads[0]
            if Input.is_joy_button_pressed(joypad, JOY_BUTTON_DPAD_LEFT):
                horizontal -= 1.0
            if Input.is_joy_button_pressed(joypad, JOY_BUTTON_DPAD_RIGHT):
                horizontal += 1.0
        return _quantize_aim(Vector2(horizontal, vertical))
    return Vector2(facing, 0.0)

func _quantize_aim(raw: Vector2) -> Vector2:
    if raw.length_squared() <= 0.01:
        return Vector2(facing, 0.0)
    var step := PI / 4.0
    var angle := roundf(raw.angle() / step) * step
    var direction := Vector2.RIGHT.rotated(angle).normalized()
    return _constrain_vertical_aim(direction, is_on_floor())

func _constrain_vertical_aim(direction: Vector2, grounded: bool) -> Vector2:
    if (
        grounded
        and absf(direction.x) < 0.25
        and absf(direction.y) > 0.75
    ):
        return Vector2(facing, signf(direction.y)).normalized()
    return direction

func _movement_axis() -> float:
    var axis := 0.0
    if _touch_controls != null:
        axis = float(_touch_controls.move_axis())
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
    if _touch_controls != null and bool(_touch_controls.crouch_pressed()):
        return true
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
    if _touch_controls != null and bool(_touch_controls.jump_pressed()):
        return true
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_SPACE):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_A)

func _fire_pressed() -> bool:
    if _touch_controls != null and bool(_touch_controls.fire_pressed()):
        return true
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
    if _touch_controls != null and bool(_touch_controls.grenade_pressed()):
        return true
    if Input.is_key_pressed(KEY_X) or Input.is_key_pressed(KEY_K):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_Y)
