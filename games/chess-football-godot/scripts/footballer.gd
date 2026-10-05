class_name Footballer
extends CharacterBody2D

var team_id: int = 0
var squad_index: int = 0
var role: String = "midfielder"
var base_speed: float = 250.0
const MOVE_ACCELERATION := 1650.0
const MOVE_DECELERATION := 2150.0
var home_position: Vector2
var active: bool = false
var has_ball: bool = false
var ai_target: Vector2
var team_color: Color = Color(0.2, 0.45, 0.95)

var visual: AnimatedSprite2D
var action_lock_seconds: float = 0.0
var tackle_cooldown_seconds: float = 0.0
var tackle_recovery_seconds: float = 0.0
var contact_stun_seconds: float = 0.0
var contact_stun_total: float = 0.0
var contact_sway_sign: float = 1.0
var keeper_hold_seconds: float = 0.0
var last_sprinting: bool = false

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
	visual.sprite_frames = ChessFootballSpriteBank.build_frames(team_id, role)
	visual.centered = true
	var cell := ChessFootballSpriteBank.cell_size()
	var visual_scale := ChessFootballSpriteBank.display_scale()
	visual.scale = Vector2.ONE * visual_scale
	visual.position = Vector2(0.0, -(ChessFootballSpriteBank.footline() - cell.y * 0.5) * visual_scale)
	visual.flip_h = team_id == 1
	visual.play("idle")

func _process(delta: float) -> void:
	tackle_cooldown_seconds = maxf(0.0, tackle_cooldown_seconds - delta)
	tackle_recovery_seconds = maxf(0.0, tackle_recovery_seconds - delta)
	contact_stun_seconds = maxf(0.0, contact_stun_seconds - delta)
	keeper_hold_seconds = maxf(0.0, keeper_hold_seconds - delta)
	if action_lock_seconds <= 0.0:
		return
	action_lock_seconds = maxf(0.0, action_lock_seconds - delta)
	if action_lock_seconds <= 0.0:
		_sync_locomotion(last_sprinting)

func set_active(value: bool) -> void:
	active = value
	queue_redraw()

func move_human(delta: float, direction: Vector2, sprinting: bool) -> void:
	last_sprinting = sprinting
	var speed := base_speed * (1.34 if sprinting else 1.0)
	if tackle_recovery_seconds > 0.0:
		speed *= 0.42
	if contact_stun_seconds > 0.0:
		speed *= 0.32
	var desired := direction.normalized() * speed if direction.length_squared() > 0.001 else Vector2.ZERO
	var acceleration := MOVE_ACCELERATION if desired.length_squared() > 0.001 else MOVE_DECELERATION
	velocity = velocity.move_toward(desired, acceleration * delta)
	if velocity.length() < 1.0:
		velocity = Vector2.ZERO
	move_and_slide()
	global_position = ChessFootballMath.clamp_to_pitch(global_position)
	_sync_facing()
	_sync_locomotion(sprinting)

func move_ai(delta: float, target: Vector2, intensity: float = 1.0) -> void:
	ai_target = target
	var offset := target - global_position
	last_sprinting = intensity >= 0.88
	var recovery_scale := 0.42 if tackle_recovery_seconds > 0.0 else 1.0
	if contact_stun_seconds > 0.0:
		recovery_scale *= 0.32
	var desired := Vector2.ZERO
	if offset.length() >= 8.0:
		desired = offset.normalized() * base_speed * clampf(intensity, 0.35, 1.0) * recovery_scale
	var acceleration := MOVE_ACCELERATION if desired.length_squared() > 0.001 else MOVE_DECELERATION
	velocity = velocity.move_toward(desired, acceleration * delta)
	if velocity.length() < 1.0:
		velocity = Vector2.ZERO
	move_and_slide()
	global_position = ChessFootballMath.clamp_to_pitch(global_position)
	_sync_facing()
	_sync_locomotion(last_sprinting)

func play_action(animation_name: String, duration: float = 0.78) -> void:
	if visual == null or not visual.sprite_frames.has_animation(animation_name):
		return
	action_lock_seconds = maxf(duration, 0.05)
	visual.speed_scale = 1.0
	visual.play(animation_name)

func can_tackle() -> bool:
	return not has_ball and tackle_cooldown_seconds <= 0.0 and action_lock_seconds <= 0.0

func start_tackle() -> bool:
	if not can_tackle():
		return false
	tackle_cooldown_seconds = 1.10
	tackle_recovery_seconds = 0.38
	velocity *= 0.35
	play_action("tackle", 0.50)
	return true

func receive_tackle_contact(push_direction: Vector2, duration: float = 0.30) -> void:
	contact_stun_total = maxf(duration, 0.05)
	contact_stun_seconds = contact_stun_total
	tackle_recovery_seconds = maxf(tackle_recovery_seconds, duration + 0.08)
	if absf(push_direction.x) > 0.01:
		contact_sway_sign = signf(push_direction.x)
	velocity = push_direction.normalized() * base_speed * 0.26 if push_direction.length_squared() > 0.001 else Vector2.ZERO

func contact_stun_active() -> bool:
	return contact_stun_seconds > 0.0

func contact_stun_ratio() -> float:
	if contact_stun_total <= 0.0:
		return 0.0
	return clampf(contact_stun_seconds / contact_stun_total, 0.0, 1.0)

func begin_keeper_hold(duration: float = 0.72) -> void:
	keeper_hold_seconds = maxf(duration, 0.0)

func keeper_hold_active() -> bool:
	return keeper_hold_seconds > 0.0

func ball_anchor() -> Vector2:
	var facing := -1.0 if visual != null and visual.flip_h else 1.0
	return Vector2(18.0 * facing * scale.x, -5.0)

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

func debug_visual_ready() -> bool:
	return visual != null and visual.sprite_frames != null

func debug_animation_names() -> PackedStringArray:
	return ChessFootballSpriteBank.animation_names()

func debug_tackle_ready() -> bool:
	return can_tackle()

func debug_keeper_hold_active() -> bool:
	return keeper_hold_active()

func _draw() -> void:
	if active:
		draw_arc(Vector2(0, 2), 24.0, 0.0, TAU, 32, Color(1.0, 0.82, 0.24, 0.92), 3.0)
		var marker := PackedVector2Array([
			Vector2(-5, -66),
			Vector2(5, -66),
			Vector2(0, -58),
		])
		draw_colored_polygon(marker, Color(1.0, 0.82, 0.24, 0.96))
