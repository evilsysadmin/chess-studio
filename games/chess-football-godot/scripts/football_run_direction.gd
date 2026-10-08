class_name ChessFootballRunDirection
extends RefCounted

# Direction is derived from actual pitch velocity, not from the team or camera.
# The existing side-facing canonical run stays authoritative for lateral motion.
const HOLD_SPEED_SQUARED := 18.0 * 18.0
const SIDE_ENTER_RATIO := 0.48
const FRONT_ENTER_RATIO := 2.05
const SIDE_EXIT_RATIO := 0.63
const FRONT_EXIT_RATIO := 1.55
const DIAGONAL_MIN_RATIO := 0.35
const DIAGONAL_MAX_RATIO := 2.65

static func view_for_velocity(velocity: Vector2, previous: String = "side") -> String:
	if velocity.length_squared() < HOLD_SPEED_SQUARED:
		return previous
	var ratio := absf(velocity.y) / maxf(absf(velocity.x), 0.001)
	var vertical_sign := "front" if velocity.y > 0.0 else "back"
	if previous == "side" and ratio < SIDE_EXIT_RATIO:
		return "side"
	if previous == vertical_sign and ratio > FRONT_EXIT_RATIO:
		return vertical_sign
	if previous == vertical_sign + "_diagonal" and ratio > DIAGONAL_MIN_RATIO and ratio < DIAGONAL_MAX_RATIO:
		return previous
	if ratio <= SIDE_ENTER_RATIO:
		return "side"
	if ratio >= FRONT_ENTER_RATIO:
		return vertical_sign
	return vertical_sign + "_diagonal"

static func animation_for(base_animation: StringName, view: String) -> StringName:
	if base_animation not in [&"run", &"sprint"] or view == "side":
		return base_animation
	return StringName(String(base_animation) + "_" + view)
