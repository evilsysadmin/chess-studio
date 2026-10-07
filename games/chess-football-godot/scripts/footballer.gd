class_name Footballer
extends CharacterBody2D

var team_id: int = 0
var squad_index: int = 0
var role: String = "midfielder"
var base_speed: float = 250.0
const MOVE_ACCELERATION := 1650.0
const MOVE_DECELERATION := 2150.0
const SPRINT_SPEED_MULTIPLIER := 1.34
const STAMINA_MAX := 100.0
const STAMINA_DRAIN_PER_SECOND := 28.0
const STAMINA_RECOVER_MOVING_PER_SECOND := 14.0
const STAMINA_RECOVER_IDLE_PER_SECOND := 26.0
const STAMINA_RECOVER_THRESHOLD := 24.0
const AI_SPRINT_INTENSITY := 0.94
const AI_EXHAUSTED_INTENSITY_CAP := 0.82
const TACKLE_ACTIVE_SECONDS := 0.18
const SLIDE_TACKLE_ACTIVE_SECONDS := 0.24
const DRIBBLE_BURST_SECONDS := 0.22
const DRIBBLE_COOLDOWN_SECONDS := 0.68
const DRIBBLE_SPEED_MULTIPLIER := 1.52
const DRIBBLE_ACCELERATION := 3900.0
const DRIBBLE_TOUCH_DISTANCE := 24.0
var home_position: Vector2
var active: bool = false
var has_ball: bool = false
var ai_target: Vector2
var team_color: Color = Color(0.2, 0.45, 0.95)

var visual: AnimatedSprite2D
var action_lock_seconds: float = 0.0
var tackle_cooldown_seconds: float = 0.0
var tackle_recovery_seconds: float = 0.0
var tackle_active_seconds: float = 0.0
var tackle_launch_speed_ratio: float = 0.0
var tackle_aggressive: bool = false
var dribble_cooldown_seconds: float = 0.0
var dribble_burst_seconds: float = 0.0
var dribble_direction: Vector2 = Vector2.RIGHT
var yellow_cards: int = 0
var sent_off: bool = false
var contact_stun_seconds: float = 0.0
var contact_stun_total: float = 0.0
var contact_sway_sign: float = 1.0
var keeper_hold_seconds: float = 0.0
var keeper_save_seconds: float = 0.0
var keeper_save_total: float = 0.0
var keeper_save_direction: float = 1.0
var last_sprinting: bool = false
var stamina: float = STAMINA_MAX
var sprint_exhausted: bool = false

func configure(p_team_id: int, p_index: int, p_role: String, p_position: Vector2, p_color: Color) -> void:
	team_id = p_team_id
	squad_index = p_index
	role = p_role
	global_position = p_position
	home_position = p_position
	ai_target = p_position
	team_color = p_color
	_configure_visual()
	queue_redraw()

func _configure_visual() -> void:
	if visual == null:
		visual = AnimatedSprite2D.new()
		add_child(visual)
	visual.sprite_frames = ChessFootballSpriteBank.build_frames(team_id, role, squad_index)
	visual.centered = true
	var cell := ChessFootballSpriteBank.cell_size()
	var visual_scale := ChessFootballSpriteBank.display_scale()
	visual.scale = Vector2.ONE * visual_scale
	visual.position = Vector2(0.0, -(ChessFootballSpriteBank.footline() - cell.y * 0.5) * visual_scale)
	visual.flip_h = team_id == 1
	visual.play("idle")
	_apply_loop_phase(&"idle")

func _process(delta: float) -> void:
	tackle_cooldown_seconds = maxf(0.0, tackle_cooldown_seconds - delta)
	dribble_cooldown_seconds = maxf(0.0, dribble_cooldown_seconds - delta)
	dribble_burst_seconds = maxf(0.0, dribble_burst_seconds - delta)
	tackle_recovery_seconds = maxf(0.0, tackle_recovery_seconds - delta)
	tackle_active_seconds = maxf(0.0, tackle_active_seconds - delta)
	if tackle_active_seconds <= 0.0:
		tackle_launch_speed_ratio = 0.0
		tackle_aggressive = false
	contact_stun_seconds = maxf(0.0, contact_stun_seconds - delta)
	keeper_hold_seconds = maxf(0.0, keeper_hold_seconds - delta)
	keeper_save_seconds = maxf(0.0, keeper_save_seconds - delta)
	if action_lock_seconds <= 0.0:
		return
	action_lock_seconds = maxf(0.0, action_lock_seconds - delta)
	if action_lock_seconds <= 0.0:
		_sync_locomotion(last_sprinting)

func set_active(value: bool) -> void:
	active = value
	queue_redraw()

func move_human(delta: float, direction: Vector2, sprinting: bool) -> void:
	if sent_off:
		velocity = Vector2.ZERO
		return
	if dribble_active() and not has_ball:
		dribble_burst_seconds = 0.0
	var dribbling := dribble_active() and has_ball
	var wanted_direction := dribble_direction if dribbling else direction
	var moving := wanted_direction.length_squared() > 0.001
	var actual_sprint := _update_stamina(delta, sprinting and not dribbling, moving)
	last_sprinting = actual_sprint or dribbling
	var speed := (
		base_speed * DRIBBLE_SPEED_MULTIPLIER
		if dribbling
		else base_speed * (SPRINT_SPEED_MULTIPLIER if actual_sprint else 1.0)
	)
	if tackle_recovery_seconds > 0.0:
		speed *= 0.42
	if contact_stun_seconds > 0.0:
		speed *= 0.32
	var desired := wanted_direction.normalized() * speed if moving else Vector2.ZERO
	var acceleration := (
		DRIBBLE_ACCELERATION
		if dribbling
		else (MOVE_ACCELERATION if desired.length_squared() > 0.001 else MOVE_DECELERATION)
	)
	velocity = velocity.move_toward(desired, acceleration * delta)
	if velocity.length() < 1.0:
		velocity = Vector2.ZERO
	move_and_slide()
	global_position = ChessFootballMath.clamp_to_pitch(global_position)
	_sync_facing()
	_sync_locomotion(actual_sprint or dribbling)

func move_ai(delta: float, target: Vector2, intensity: float = 1.0) -> void:
	if sent_off:
		velocity = Vector2.ZERO
		return
	ai_target = target
	var offset := target - global_position
	var moving := offset.length() >= 8.0
	var sprint_requested := intensity >= AI_SPRINT_INTENSITY
	var actual_sprint := _update_stamina(delta, sprint_requested, moving)
	last_sprinting = actual_sprint
	var effective_intensity := clampf(intensity, 0.35, 1.0)
	if sprint_requested and not actual_sprint:
		effective_intensity = minf(effective_intensity, AI_EXHAUSTED_INTENSITY_CAP)
	var recovery_scale := 0.42 if tackle_recovery_seconds > 0.0 else 1.0
	if contact_stun_seconds > 0.0:
		recovery_scale *= 0.32
	var desired := Vector2.ZERO
	if moving:
		desired = offset.normalized() * base_speed * effective_intensity * recovery_scale
	var acceleration := MOVE_ACCELERATION if desired.length_squared() > 0.001 else MOVE_DECELERATION
	velocity = velocity.move_toward(desired, acceleration * delta)
	if velocity.length() < 1.0:
		velocity = Vector2.ZERO
	move_and_slide()
	global_position = ChessFootballMath.clamp_to_pitch(global_position)
	_sync_facing()
	_sync_locomotion(actual_sprint)

func _update_stamina(delta: float, sprint_requested: bool, moving: bool) -> bool:
	var before := stamina
	var actual_sprint := sprint_requested and moving and not sprint_exhausted and stamina > 0.0
	if actual_sprint:
		stamina = maxf(0.0, stamina - STAMINA_DRAIN_PER_SECOND * delta)
		if stamina <= 0.01:
			stamina = 0.0
			sprint_exhausted = true
			actual_sprint = false
	else:
		var recovery_rate := STAMINA_RECOVER_MOVING_PER_SECOND if moving else STAMINA_RECOVER_IDLE_PER_SECOND
		stamina = minf(STAMINA_MAX, stamina + recovery_rate * delta)
		if sprint_exhausted and stamina >= STAMINA_RECOVER_THRESHOLD:
			sprint_exhausted = false
	if absf(stamina - before) > 0.001:
		queue_redraw()
	return actual_sprint

func stamina_ratio() -> float:
	return clampf(stamina / STAMINA_MAX, 0.0, 1.0)

func can_sprint() -> bool:
	return not sprint_exhausted and stamina > 0.0

func play_action(animation_name: String, duration: float = 0.78) -> void:
	if visual == null or not visual.sprite_frames.has_animation(animation_name):
		return
	action_lock_seconds = maxf(duration, 0.05)
	visual.speed_scale = 1.0
	visual.play(animation_name)

func can_tackle() -> bool:
	return (
		not sent_off
		and not has_ball
		and tackle_cooldown_seconds <= 0.0
		and action_lock_seconds <= 0.0
	)

func start_tackle(aggressive: bool = false) -> bool:
	if not can_tackle():
		return false
	tackle_aggressive = aggressive
	tackle_cooldown_seconds = 1.45 if aggressive else 1.10
	tackle_recovery_seconds = 0.68 if aggressive else 0.38
	tackle_active_seconds = SLIDE_TACKLE_ACTIVE_SECONDS if aggressive else TACKLE_ACTIVE_SECONDS
	tackle_launch_speed_ratio = clampf(
		velocity.length() / maxf(base_speed, 1.0),
		0.0,
		1.35,
	)
	velocity *= 0.68 if aggressive else 0.35
	play_action("tackle", 0.64 if aggressive else 0.50)
	return true

func tackle_active() -> bool:
	return tackle_active_seconds > 0.0

func tackle_aggressive_active() -> bool:
	return tackle_active() and tackle_aggressive

func tackle_momentum_ratio() -> float:
	return tackle_launch_speed_ratio if tackle_active() else 0.0

func can_dribble() -> bool:
	return (
		not sent_off
		and has_ball
		and dribble_cooldown_seconds <= 0.0
		and dribble_burst_seconds <= 0.0
		and action_lock_seconds <= 0.0
		and contact_stun_seconds <= 0.0
		and tackle_recovery_seconds <= 0.0
	)

func start_dribble(direction: Vector2) -> bool:
	if not can_dribble():
		return false
	var wanted := direction
	if wanted.length_squared() < 0.001:
		var facing := -1.0 if visual != null and visual.flip_h else 1.0
		wanted = Vector2(facing, 0.0)
	dribble_direction = wanted.normalized()
	dribble_burst_seconds = DRIBBLE_BURST_SECONDS
	dribble_cooldown_seconds = DRIBBLE_COOLDOWN_SECONDS
	velocity = dribble_direction * base_speed * 0.72
	return true

func dribble_active() -> bool:
	return dribble_burst_seconds > 0.0

func dribble_touch_ratio() -> float:
	if not dribble_active():
		return 0.0
	var progress := 1.0 - clampf(dribble_burst_seconds / DRIBBLE_BURST_SECONDS, 0.0, 1.0)
	return sin(PI * progress)

func receive_yellow_card() -> bool:
	if sent_off:
		return true
	yellow_cards += 1
	if yellow_cards >= 2:
		send_off()
		return true
	return false

func receive_red_card() -> void:
	send_off()

func send_off() -> void:
	if sent_off:
		return
	sent_off = true
	active = false
	has_ball = false
	velocity = Vector2.ZERO
	tackle_cooldown_seconds = 0.0
	tackle_recovery_seconds = 0.0
	tackle_active_seconds = 0.0
	tackle_launch_speed_ratio = 0.0
	tackle_aggressive = false
	dribble_cooldown_seconds = 0.0
	dribble_burst_seconds = 0.0
	dribble_direction = Vector2.RIGHT
	action_lock_seconds = 0.0
	contact_stun_seconds = 0.0
	collision_layer = 0
	collision_mask = 0
	queue_redraw()

func available_for_play() -> bool:
	return not sent_off

func receive_tackle_contact(push_direction: Vector2, duration: float = 0.30) -> void:
	dribble_burst_seconds = 0.0
	contact_stun_total = maxf(duration, 0.05)
	contact_stun_seconds = contact_stun_total
	tackle_recovery_seconds = maxf(tackle_recovery_seconds, duration + 0.08)
	var push := push_direction.normalized() if push_direction.length_squared() > 0.001 else Vector2.RIGHT
	if absf(push.x) > 0.01:
		contact_sway_sign = signf(push.x)
	# Separate the bodies immediately so a clean tackle reads as contact,
	# deflection and recovery instead of two sprites merging into one.
	global_position = ChessFootballMath.clamp_to_pitch(global_position + push * 24.0)
	velocity = push * base_speed * 0.42

func contact_stun_active() -> bool:
	return contact_stun_seconds > 0.0

func contact_stun_ratio() -> float:
	if contact_stun_total <= 0.0:
		return 0.0
	return clampf(contact_stun_seconds / contact_stun_total, 0.0, 1.0)

func begin_keeper_hold(duration: float = 0.72) -> void:
	keeper_hold_seconds = maxf(duration, 0.0)

func begin_keeper_save(direction: float, duration: float = 0.58) -> void:
	keeper_save_total = maxf(duration, 0.05)
	keeper_save_seconds = keeper_save_total
	keeper_save_direction = -1.0 if direction < 0.0 else 1.0
	play_action("tackle", duration)

func keeper_hold_active() -> bool:
	return keeper_hold_seconds > 0.0

func keeper_save_active() -> bool:
	return keeper_save_seconds > 0.0

func keeper_save_ratio() -> float:
	if keeper_save_total <= 0.0:
		return 0.0
	return clampf(keeper_save_seconds / keeper_save_total, 0.0, 1.0)

func ball_anchor() -> Vector2:
	var facing := -1.0 if visual != null and visual.flip_h else 1.0
	var anchor := Vector2(18.0 * facing * scale.x, -5.0)
	if dribble_active():
		anchor += dribble_direction * DRIBBLE_TOUCH_DISTANCE * dribble_touch_ratio()
	return anchor

func _sync_facing() -> void:
	if visual == null or absf(velocity.x) < 4.0:
		return
	visual.flip_h = velocity.x < 0.0

func _sync_locomotion(sprinting: bool) -> void:
	if visual == null or action_lock_seconds > 0.0:
		return
	var wanted := "idle"
	if velocity.length() >= 12.0:
		wanted = "sprint" if sprinting else "run"
	visual.speed_scale = 1.16 if wanted == "sprint" else (1.05 if wanted == "run" else 1.0)
	if String(visual.animation) != wanted or not visual.is_playing():
		visual.play(wanted)
		_apply_loop_phase(StringName(wanted))

func _loop_phase_frame(animation_name: StringName) -> int:
	if visual == null or visual.sprite_frames == null:
		return 0
	var count := visual.sprite_frames.get_frame_count(animation_name)
	if count <= 1:
		return 0
	# Deterministic per-player phase offsets stop a five-a-side lineup from
	# breathing/running in lockstep like cloned mannequins.
	var seed := team_id * 5 + squad_index * 3
	return posmod(seed, count)

func _apply_loop_phase(animation_name: StringName) -> void:
	if visual == null or animation_name not in [&"idle", &"run", &"sprint"]:
		return
	visual.frame = _loop_phase_frame(animation_name)

func debug_visual_ready() -> bool:
	return visual != null and visual.sprite_frames != null

func debug_animation_names() -> PackedStringArray:
	return ChessFootballSpriteBank.animation_names()

func debug_visual_variant_key() -> String:
	return ChessFootballSpriteBank.atlas_key(team_id, role, squad_index)

func debug_loop_phase_frame(animation_name: StringName) -> int:
	return _loop_phase_frame(animation_name)

func debug_tackle_ready() -> bool:
	return can_tackle()

func debug_tackle_active() -> bool:
	return tackle_active()

func debug_tackle_aggressive() -> bool:
	return tackle_aggressive_active()

func debug_dribble_ready() -> bool:
	return can_dribble()

func debug_dribble_active() -> bool:
	return dribble_active()

func debug_dribble_direction() -> Vector2:
	return dribble_direction

func debug_yellow_cards() -> int:
	return yellow_cards

func debug_sent_off() -> bool:
	return sent_off

func debug_keeper_hold_active() -> bool:
	return keeper_hold_active()

func debug_keeper_save_active() -> bool:
	return keeper_save_active()

func debug_keeper_save_direction() -> float:
	return keeper_save_direction

func debug_stamina_ratio() -> float:
	return stamina_ratio()

func debug_stamina_exhausted() -> bool:
	return sprint_exhausted

func debug_set_stamina(value: float, exhausted: bool = false) -> void:
	stamina = clampf(value, 0.0, STAMINA_MAX)
	sprint_exhausted = exhausted
	queue_redraw()

func _draw() -> void:
	if active:
		draw_arc(Vector2(0, 2), 24.0, 0.0, TAU, 32, Color(1.0, 0.82, 0.24, 0.92), 3.0)
		var marker := PackedVector2Array([
			Vector2(-5, -66),
			Vector2(5, -66),
			Vector2(0, -58),
		])
		draw_colored_polygon(marker, Color(1.0, 0.82, 0.24, 0.96))

