class_name Footballer
extends CharacterBody2D

var team_id: int = 0
var squad_index: int = 0
var role: String = "midfielder"
var base_speed: float = 250.0
var home_position: Vector2
var active: bool = false
var has_ball: bool = false
var ai_target: Vector2
var team_color: Color = Color(0.2, 0.45, 0.95)

func configure(p_team_id: int, p_index: int, p_role: String, p_position: Vector2, p_color: Color) -> void:
	team_id = p_team_id
	squad_index = p_index
	role = p_role
	global_position = p_position
	home_position = p_position
	ai_target = p_position
	team_color = p_color
	queue_redraw()

func set_active(value: bool) -> void:
	active = value
	queue_redraw()

func move_human(direction: Vector2, sprinting: bool) -> void:
	var speed := base_speed * (1.34 if sprinting else 1.0)
	velocity = direction.normalized() * speed if direction.length_squared() > 0.001 else Vector2.ZERO
	move_and_slide()
	global_position = ChessFootballMath.clamp_to_pitch(global_position)

func move_ai(delta: float, target: Vector2, intensity: float = 1.0) -> void:
	ai_target = target
	var offset := target - global_position
	if offset.length() < 8.0:
		velocity = Vector2.ZERO
		return
	velocity = offset.normalized() * base_speed * clampf(intensity, 0.35, 1.0)
	move_and_slide()
	global_position = ChessFootballMath.clamp_to_pitch(global_position)

func _draw() -> void:
	var radius := 18.0
	draw_circle(Vector2.ZERO, radius, team_color)
	draw_circle(Vector2.ZERO, radius, Color(1, 1, 1, 0.82), false, 2.0)
	if active:
		draw_arc(Vector2.ZERO, radius + 7.0, 0.0, TAU, 32, Color(1.0, 0.82, 0.24), 3.0)
	if has_ball:
		draw_circle(Vector2(0, 28), 4.0, Color.WHITE)
	var fallback_font := ThemeDB.fallback_font
	draw_string(fallback_font, Vector2(-5, 5), str(squad_index + 1), HORIZONTAL_ALIGNMENT_CENTER, 10.0, 12, Color.WHITE)
