class_name FootballBall
extends CharacterBody2D

var carrier: Footballer = null
var friction: float = 0.965
var max_speed: float = 920.0
var spin_direction: float = 1.0

func attach_to(player: Footballer) -> void:
	if carrier != null:
		carrier.has_ball = false
		carrier.queue_redraw()
	carrier = player
	velocity = Vector2.ZERO
	rotation = 0.0
	player.has_ball = true
	player.queue_redraw()
	global_position = player.global_position + player.ball_anchor()

func release(direction: Vector2, power: float) -> void:
	if carrier != null:
		carrier.has_ball = false
		carrier.queue_redraw()
	carrier = null
	var dir := direction.normalized() if direction.length_squared() > 0.001 else Vector2.RIGHT
	spin_direction = -1.0 if dir.x < 0.0 else 1.0
	velocity = dir * minf(power, max_speed)

func tick_ball(delta: float) -> void:
	if carrier != null:
		global_position = carrier.global_position + carrier.ball_anchor()
		rotation = 0.0
		return
	move_and_slide()
	rotation += velocity.length() * delta * 0.012 * spin_direction
	velocity *= pow(friction, delta * 60.0)
	if velocity.length() < 4.0:
		velocity = Vector2.ZERO

func _draw() -> void:
	draw_circle(Vector2.ZERO, 9.0, Color(0.96, 0.96, 0.92))
	draw_circle(Vector2.ZERO, 9.0, Color(0.08, 0.09, 0.10), false, 1.5)
	var center_patch := PackedVector2Array()
	for i in range(5):
		var angle := -PI * 0.5 + TAU * float(i) / 5.0
		center_patch.append(Vector2(cos(angle), sin(angle)) * 3.4)
	draw_colored_polygon(center_patch, Color(0.11, 0.12, 0.13))
	draw_circle(Vector2(-5.5, 2.5), 1.8, Color(0.16, 0.17, 0.18))
	draw_circle(Vector2(5.5, 2.3), 1.7, Color(0.16, 0.17, 0.18))
