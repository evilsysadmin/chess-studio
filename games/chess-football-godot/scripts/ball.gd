class_name FootballBall
extends CharacterBody2D

var carrier: Footballer = null
var friction: float = 0.965
var fast_ball_friction: float = 0.982
var max_speed: float = 1260.0
var flight_height: float = 0.0
var vertical_velocity: float = 0.0
const FAST_BALL_THRESHOLD := 650.0
const BALL_GRAVITY := 1120.0
const AIR_FRICTION := 0.992
const GROUND_BOUNCE := 0.24
const MIN_BOUNCE_SPEED := 82.0
var spin_direction: float = 1.0
var reclaim_block_player: Footballer = null
var reclaim_block_seconds: float = 0.0
const RECLAIM_BLOCK_SECONDS := 0.22

func attach_to(player: Footballer) -> void:
	reclaim_block_player = null
	reclaim_block_seconds = 0.0
	if carrier != null:
		carrier.has_ball = false
		carrier.queue_redraw()
	carrier = player
	velocity = Vector2.ZERO
	flight_height = 0.0
	vertical_velocity = 0.0
	rotation = 0.0
	player.has_ball = true
	player.queue_redraw()
	global_position = player.global_position + player.ball_anchor()

func release(direction: Vector2, power: float, lift_velocity: float = 0.0) -> void:
	var previous_carrier: Footballer = carrier
	if previous_carrier != null:
		previous_carrier.has_ball = false
		previous_carrier.queue_redraw()
	reclaim_block_player = previous_carrier
	reclaim_block_seconds = RECLAIM_BLOCK_SECONDS if previous_carrier != null else 0.0
	carrier = null
	var dir := direction.normalized() if direction.length_squared() > 0.001 else Vector2.RIGHT
	spin_direction = -1.0 if dir.x < 0.0 else 1.0
	velocity = dir * minf(power, max_speed)
	flight_height = 0.0
	vertical_velocity = maxf(0.0, lift_velocity)

func tick_ball(delta: float) -> void:
	reclaim_block_seconds = maxf(0.0, reclaim_block_seconds - delta)
	if reclaim_block_seconds <= 0.0:
		reclaim_block_player = null
	if carrier != null:
		global_position = carrier.global_position + carrier.ball_anchor()
		flight_height = 0.0
		vertical_velocity = 0.0
		rotation = 0.0
		return

	if flight_height > 0.0 or vertical_velocity > 0.0:
		vertical_velocity -= BALL_GRAVITY * delta
		flight_height += vertical_velocity * delta
		if flight_height <= 0.0:
			flight_height = 0.0
			if absf(vertical_velocity) >= MIN_BOUNCE_SPEED:
				vertical_velocity = -vertical_velocity * GROUND_BOUNCE
			else:
				vertical_velocity = 0.0

	move_and_slide()
	rotation += velocity.length() * delta * 0.012 * spin_direction
	var active_friction := AIR_FRICTION if flight_height > 0.0 else (fast_ball_friction if velocity.length() >= FAST_BALL_THRESHOLD else friction)
	velocity *= pow(active_friction, delta * 60.0)
	if velocity.length() < 4.0:
		velocity = Vector2.ZERO

func reclaim_blocked_for(player: Footballer) -> bool:
	return reclaim_block_seconds > 0.0 and reclaim_block_player == player

func airborne() -> bool:
	return flight_height > 1.0 or vertical_velocity > 1.0

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
