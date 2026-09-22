class_name ChessFootballMath
extends RefCounted

const PITCH_RECT := Rect2(80.0, 70.0, 1640.0, 860.0)
const GOAL_HALF_HEIGHT := 105.0

static func clamp_to_pitch(position: Vector2) -> Vector2:
	return Vector2(
		clampf(position.x, PITCH_RECT.position.x + 20.0, PITCH_RECT.end.x - 20.0),
		clampf(position.y, PITCH_RECT.position.y + 20.0, PITCH_RECT.end.y - 20.0)
	)

static func goal_center(attacking_team: int) -> Vector2:
	var x := PITCH_RECT.end.x if attacking_team == 0 else PITCH_RECT.position.x
	return Vector2(x, PITCH_RECT.get_center().y)

static func in_goal_mouth(position: Vector2) -> bool:
	return absf(position.y - PITCH_RECT.get_center().y) <= GOAL_HALF_HEIGHT
