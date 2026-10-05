class_name ChessFootballMath
extends RefCounted

const PITCH_RECT := Rect2(80.0, 70.0, 1640.0, 860.0)
const GOAL_HALF_HEIGHT := 105.0

# Vertical simulation uses pitch-space units. With the current 3D contract
# (WORLD_SCALE 0.014, ground ball centre 0.18, radius 0.16, 1.25 crossbar
# centre and 0.075 bar thickness), about 62 units is the highest ball centre
# trajectory that still fits entirely below the bar.
const GOAL_MAX_FLIGHT_HEIGHT := 62.0

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

static func ball_fits_under_crossbar(flight_height: float) -> bool:
	return flight_height <= GOAL_MAX_FLIGHT_HEIGHT
