extends SceneTree

const Model = preload("res://scripts/match_model.gd")

func _init() -> void:
	var home := Model.home_formation()
	var away := Model.away_formation()
	assert(home.size() == 5)
	assert(away.size() == 5)
	assert(Model.FIELD.has_point(home[3]))
	assert(Model.FIELD.has_point(away[3]))

	var target := Model.nearest_teammate_index(home, 3, Vector2.LEFT)
	assert(target >= 0)
	assert(target != 3)

	var velocity := Model.kick_velocity(Vector2.ZERO, Vector2(100, 0), Model.PASS_SPEED)
	assert(is_equal_approx(velocity.length(), Model.PASS_SPEED))
	assert(velocity.x > 0.0)

	assert(Model.goal_side(Model.AWAY_GOAL.get_center()) == 1)
	assert(Model.goal_side(Model.HOME_GOAL.get_center()) == -1)
	assert(Model.goal_side(Vector2(640, 360)) == 0)

	print("Chess Football Godot smoke: PASS")
	quit(0)
