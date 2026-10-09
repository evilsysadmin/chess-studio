extends SceneTree

# Football goalkeeper regression: this runs the *real match* and its 3D
# presenter, not a synthetic AnimatedSprite preview.
func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var game = packed.instantiate()
	root.add_child(game)
	await process_frame
	await process_frame
	game.set_process(false)
	game.set_physics_process(false)
	var ball: FootballBall = game.ball
	ball.release(Vector2.RIGHT, 0.0)
	assert(ball.carrier == null)
	var presenter: ChessFootball3DPresenter = game.presentation_3d
	assert(presenter != null)

	for team_id in range(2):
		var keeper: Footballer = game.teams[team_id][0]
		var goal := ChessFootballMath.goal_center(1 - team_id)
		var toward_field := 1.0 if team_id == 0 else -1.0
		var keeper_x: float = goal.x + toward_field * float(game.KEEPER_LINE_OFFSET)
		keeper.global_position = Vector2(keeper_x, goal.y)
		keeper.velocity = Vector2.ZERO
		keeper.action_lock_seconds = 0.0
		ball.velocity = Vector2.ZERO
		ball.global_position = Vector2(goal.x + toward_field * 350.0, goal.y + 225.0)
		var close_target: Vector2 = game._keeper_defensive_target(keeper)
		assert(close_target.y - goal.y >= 90.0)
		assert(close_target.y - goal.y <= game.KEEPER_TRACK_MAX_Y)
		ball.global_position.x = goal.x + toward_field * 1200.0
		var far_target: Vector2 = game._keeper_defensive_target(keeper)
		assert(far_target.y - goal.y < close_target.y - goal.y)

		ball.global_position = Vector2(goal.x + toward_field * 450.0, goal.y - 85.0)
		ball.velocity = Vector2(-toward_field * 850.0, 250.0)
		var shot_target: Vector2 = game._keeper_defensive_target(keeper)
		assert(game._keeper_reading_shot(keeper, keeper_x))
		assert(shot_target.y > goal.y)
		ball.velocity = Vector2(toward_field * 850.0, 250.0)
		assert(not game._keeper_reading_shot(keeper, keeper_x))
		var retreat_target: Vector2 = game._keeper_defensive_target(keeper)
		assert(retreat_target.y < goal.y)
		ball.velocity = Vector2.ZERO
		ball.global_position = Vector2(goal.x + toward_field * 350.0, goal.y + 225.0)

		for _step in range(32):
			game._update_keeper_ai(keeper, 1.0 / 60.0)
		var travel := keeper.global_position.y - goal.y
		assert(travel > 22.0 and travel < game.KEEPER_TRACK_MAX_Y + 3.0)
		assert(keeper.velocity.length() > 15.0)
		assert(keeper.visual.animation in [&"run", &"sprint"])
		presenter.sync_presentation(1.0 / 60.0, "broadcast")
		var sprite: AnimatedSprite3D = presenter.player_sprites[keeper.get_instance_id()]
		assert(sprite != null)
		assert(String(sprite.animation).begins_with("run") or String(sprite.animation).begins_with("sprint"))
		var rendered := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
		assert(rendered is ImageTexture)
		assert(rendered.get_size() == Vector2(128.0, 144.0))
		print("KEEPER_AI_TEAM=%d TRAVEL_Y=%.2f VISUAL=%s" % [team_id, travel, sprite.animation])

	# Regression for AI getting permanently bypassed after an automatic save:
	# while a keeper holds the ball the player can distribute manually, but
	# after releasing it we must hand control back to an outfielder.
	var hand_keeper: Footballer = game.teams[0][0]
	game._select_player(hand_keeper)
	ball.attach_to(hand_keeper)
	game._restore_outfield_control_after_keeper_release()
	assert(game.controlled == hand_keeper)
	ball.release(Vector2.RIGHT, 360.0)
	game._restore_outfield_control_after_keeper_release()
	assert(game.controlled != hand_keeper)
	assert(game.controlled.role != "keeper")
	assert(game.controlled.team_id == 0)

	# Manual penalty shuffle previously moved coordinates but forced ZERO
	# velocity, so the goalkeeper appeared to stand still while sliding.
	var manual: Footballer = game.teams[0][0]
	manual.action_lock_seconds = 0.0
	var old_y := manual.global_position.y
	game.debug_move_penalty_keeper(1.0, 0.10)
	assert(manual.global_position.y - old_y > 25.0)
	assert(manual.velocity.y > 200.0)
	assert(manual.visual.animation == &"run")
	presenter.sync_presentation(1.0 / 60.0, "broadcast")
	var manual_sprite: AnimatedSprite3D = presenter.player_sprites[manual.get_instance_id()]
	assert(manual_sprite.animation == &"run_front")
	game.debug_move_penalty_keeper(0.0, 0.10)
	assert(manual.velocity == Vector2.ZERO)
	# Compare real movement against a field player under equal AI orders.
	# Merely increasing a nominal speed constant would not prove the keeper
	# actually travels faster when approaching a through-ball or cross.
	var field_player: Footballer = game.teams[0][1]
	var keeper_runner: Footballer = game.teams[1][0]
	var pitch_center := ChessFootballMath.PITCH_RECT.get_center()
	field_player.global_position = pitch_center + Vector2(410.0, -390.0)
	keeper_runner.global_position = pitch_center + Vector2(-410.0, -390.0)
	field_player.velocity = Vector2.ZERO
	keeper_runner.velocity = Vector2.ZERO
	field_player.action_lock_seconds = 0.0
	keeper_runner.action_lock_seconds = 0.0
	var field_start := field_player.global_position
	var keeper_start := keeper_runner.global_position
	for _frame in range(24):
		field_player.move_ai(1.0 / 60.0, field_start + Vector2.DOWN * 500.0, 0.86)
		keeper_runner.move_ai(1.0 / 60.0, keeper_start + Vector2.DOWN * 500.0, 0.86)
	var field_distance := field_player.global_position.distance_to(field_start)
	var keeper_distance := keeper_runner.global_position.distance_to(keeper_start)
	print("KEEPER_DISTANCE=%.2f FIELD_DISTANCE=%.2f" % [keeper_distance, field_distance])
	assert(field_distance > 8.0)
	assert(keeper_distance > 25.0)
	assert(keeper_distance > field_distance * 1.40)
	assert(keeper_runner.velocity.length() > field_player.velocity.length() * 1.40)
	print("KEEPER_REACTION_SPEED=%.2f FIELD_SPEED=%.2f" % [
		keeper_runner.velocity.length(), field_player.velocity.length()
	])
	print("chess-football keeper motion smoke: OK")
	quit(0)
