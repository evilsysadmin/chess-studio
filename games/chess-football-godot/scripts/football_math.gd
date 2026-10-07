class_name ChessFootballMath
extends RefCounted

const PITCH_RECT := Rect2(80.0, 70.0, 2480.0, 1440.0)
# 5v5 arcade mouth: 360 pitch units. The 290-unit first enlargement still
# looked undersized against the widened pitch and left too little real target.
const GOAL_HALF_HEIGHT := 180.0
const PENALTY_AREA_DEPTH := 265.0
const PENALTY_AREA_HALF_WIDTH := 215.0
const PENALTY_SPOT_DEPTH := 175.0

# Vertical simulation uses pitch-space units. With the current 3D contract
# (WORLD_SCALE 0.014, ground ball centre 0.18, radius 0.16, 1.50 crossbar
# centre and 0.075 bar thickness), about 80 units is the highest ball centre
# trajectory that still fits entirely below the bar.
const GOAL_MAX_FLIGHT_HEIGHT := 80.0
const GOAL_FRAME_POST_RADIUS := 16.0
const GOAL_FRAME_CROSSBAR_HEIGHT := 94.0
const GOAL_FRAME_CROSSBAR_RADIUS := 10.0

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

static func goal_frame_collision(
	previous_position: Vector2,
	current_position: Vector2,
	previous_height: float,
	current_height: float,
) -> Dictionary:
	var delta_x: float = current_position.x - previous_position.x
	if absf(delta_x) < 0.001:
		return {}

	var center_y: float = PITCH_RECT.get_center().y
	var goal_lines: Array[float] = [PITCH_RECT.position.x, PITCH_RECT.end.x]
	for goal_x in goal_lines:
		var from_side: float = previous_position.x - goal_x
		var to_side: float = current_position.x - goal_x
		if from_side * to_side > 0.0:
			continue
		var ratio: float = clampf((goal_x - previous_position.x) / delta_x, 0.0, 1.0)
		var contact_y: float = lerpf(previous_position.y, current_position.y, ratio)
		var contact_height: float = lerpf(previous_height, current_height, ratio)
		var post_delta: float = absf(absf(contact_y - center_y) - GOAL_HALF_HEIGHT)
		if (
			post_delta <= GOAL_FRAME_POST_RADIUS
			and contact_height <= GOAL_FRAME_CROSSBAR_HEIGHT + GOAL_FRAME_CROSSBAR_RADIUS
		):
			return {
				"kind": "post",
				"goal_x": goal_x,
				"contact_y": contact_y,
				"contact_height": contact_height,
			}

		var inside_posts: bool = (
			absf(contact_y - center_y)
			<= GOAL_HALF_HEIGHT - GOAL_FRAME_POST_RADIUS * 0.35
		)
		if (
			inside_posts
			and absf(contact_height - GOAL_FRAME_CROSSBAR_HEIGHT)
			<= GOAL_FRAME_CROSSBAR_RADIUS
		):
			return {
				"kind": "crossbar",
				"goal_x": goal_x,
				"contact_y": contact_y,
				"contact_height": contact_height,
			}
	return {}
