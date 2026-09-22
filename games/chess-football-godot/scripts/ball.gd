class_name FootballBall
extends CharacterBody2D

var carrier: Footballer = null
var friction: float = 0.965
var max_speed: float = 920.0

func attach_to(player: Footballer) -> void:
	if carrier != null:
		carrier.has_ball = false
		carrier.queue_redraw()
	carrier = player
	velocity = Vector2.ZERO
	player.has_ball = true
	player.queue_redraw()
	global_position = player.global_position + Vector2(0, 28)

func release(direction: Vector2, power: float) -> void:
	if carrier != null:
		carrier.has_ball = false
		carrier.queue_redraw()
	carrier = null
	var dir := direction.normalized() if direction.length_squared() > 0.001 else Vector2.RIGHT
	velocity = dir * minf(power, max_speed)

func tick_ball(delta: float) -> void:
	if carrier != null:
		global_position = carrier.global_position + Vector2(0, 28)
		return
	move_and_slide()
	velocity *= pow(friction, delta * 60.0)
	if velocity.length() < 4.0:
		velocity = Vector2.ZERO

func _draw() -> void:
	draw_circle(Vector2.ZERO, 9.0, Color(0.96, 0.96, 0.92))
	draw_circle(Vector2.ZERO, 9.0, Color(0.1, 0.1, 0.1), false, 1.5)
