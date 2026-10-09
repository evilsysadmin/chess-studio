extends SceneTree

# A playable pitch must spread ten footballers in real 3D field coordinates,
# not merely render larger empty grass around the same packed central scrum.
func _initialize() -> void:
	var scene := load("res://main.tscn") as PackedScene
	assert(scene != null)
	var game = scene.instantiate()
	root.add_child(game)
	await process_frame
	await process_frame
	game.set_physics_process(false)
	game.set_process(false)
	var pitch := ChessFootballMath.PITCH_RECT
	assert(pitch.size == Vector2(2480.0, 1680.0))
	assert(pitch.get_center() == Vector2(1320.0, 790.0))
	assert(is_equal_approx(game.presentation_3d.field_depth, pitch.size.y * ChessFootball3DPresenter.WORLD_SCALE))
	assert(ChessFootballMath.in_goal_mouth(ChessFootballMath.goal_center(0)))
	for team in game.teams:
		var keeper: Footballer = team[0]
		var defender: Footballer = team[1]
		var midfielder: Footballer = team[2]
		var wing: Footballer = team[3]
		var forward: Footballer = team[4]
		assert(absf(keeper.home_position.y - pitch.get_center().y) < 0.01)
		assert(wing.home_position.y - defender.home_position.y > 950.0)
		assert(midfielder.home_position.y - forward.home_position.y > 290.0)
		for player in team:
			assert(pitch.has_point(player.global_position))
	# A midfielder in possession should have genuinely distinct passing lanes.
	var carrier: Footballer = game.teams[0][2]
	game.ball.attach_to(carrier)
	var support_def: Vector2 = game._ai_support_target(game.teams[0][1])
	var support_wing: Vector2 = game._ai_support_target(game.teams[0][3])
	var support_forward: Vector2 = game._ai_support_target(game.teams[0][4])
	assert(support_wing.y - support_def.y > 650.0)
	assert(support_def.y + 130.0 < support_forward.y)
	assert(support_forward.y + 130.0 < support_wing.y)
	for p in [support_def, support_forward, support_wing]:
		assert(pitch.has_point(p))
	# The far-side non-pressing defenders must not collapse into the dribbler.
	assert(game.AI_DEFENSIVE_SHIFT_RATIO <= 0.17)
	print("FOOTBALL_WIDTH=%.0f SUPPORT_SPREAD=%.0f" % [
		pitch.size.y, support_wing.y - support_def.y
	])
	print("chess-football pitch spacing smoke: OK")
	quit(0)
