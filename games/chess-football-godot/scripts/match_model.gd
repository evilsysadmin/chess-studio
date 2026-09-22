class_name ChessFootballMatchModel
extends RefCounted

const FIELD := Rect2(120.0, 80.0, 1040.0, 560.0)
const HOME_GOAL := Rect2(90.0, 280.0, 30.0, 160.0)
const AWAY_GOAL := Rect2(1160.0, 280.0, 30.0, 160.0)
const PLAYER_SPEED := 235.0
const BALL_FRICTION := 0.988
const PASS_SPEED := 520.0
const SHOT_SPEED := 760.0

static func home_formation() -> Array[Vector2]:
	return [
		Vector2(210, 360),
		Vector2(380, 205),
		Vector2(380, 515),
		Vector2(570, 285),
		Vector2(570, 435),
	]

static func away_formation() -> Array[Vector2]:
	return [
		Vector2(1070, 360),
		Vector2(900, 205),
		Vector2(900, 515),
		Vector2(710, 285),
		Vector2(710, 435),
	]

static func clamp_player(position: Vector2) -> Vector2:
	return Vector2(
		clampf(position.x, FIELD.position.x + 18.0, FIELD.end.x - 18.0),
		clampf(position.y, FIELD.position.y + 18.0, FIELD.end.y - 18.0)
	)

static func nearest_teammate_index(players: Array[Vector2], active_index: int, direction: Vector2) -> int:
	var best_index := -1
	var best_score := -INF
	var facing := direction.normalized()
	if facing == Vector2.ZERO:
		facing = Vector2.RIGHT
	for i in range(players.size()):
		if i == active_index:
			continue
		var delta := players[i] - players[active_index]
		var distance := maxf(delta.length(), 1.0)
		var alignment := facing.dot(delta / distance)
		var score := alignment * 3.0 - distance / 500.0
		if score > best_score:
			best_score = score
			best_index = i
	return best_index

static func kick_velocity(from: Vector2, to: Vector2, speed: float) -> Vector2:
	var direction := (to - from).normalized()
	if direction == Vector2.ZERO:
		direction = Vector2.RIGHT
	return direction * speed

static func goal_side(ball: Vector2) -> int:
	if HOME_GOAL.has_point(ball):
		return -1
	if AWAY_GOAL.has_point(ball):
		return 1
	return 0
