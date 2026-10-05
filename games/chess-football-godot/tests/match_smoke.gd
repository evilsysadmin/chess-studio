extends SceneTree

func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var match_node := packed.instantiate()
	root.add_child(match_node)
	await process_frame
	await process_frame
	var counts: Array[int] = match_node.debug_team_counts()
	assert(counts == [5, 5])
	assert(match_node.debug_ball_exists())
	assert(match_node.debug_pitch_exists())
	assert(match_node.debug_3d_ready())
	assert(match_node.debug_3d_animated_players() == 10)
	assert(match_node.controlled != null)
	assert(match_node.controlled.debug_visual_ready())
	assert(match_node.controlled.debug_animation_names().size() == 7)
	assert(match_node.controlled.debug_animation_names().has("shoot"))
	assert(match_node.ball.carrier == match_node.controlled)
	assert(InputMap.has_action("tackle"))

	var tackler: Footballer = match_node.controlled
	var victim: Footballer = match_node.teams[1][2]
	tackler.global_position = Vector2(640.0, 500.0)
	victim.global_position = Vector2(668.0, 500.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	match_node.ball.attach_to(victim)
	assert(match_node.debug_try_tackle(tackler))
	assert(match_node.ball.carrier == tackler)
	assert(not victim.has_ball)
	assert(not tackler.debug_tackle_ready())
	assert(String(tackler.visual.animation) == "tackle")

	var keeper: Footballer = match_node.teams[0][0]
	assert(keeper.role == "keeper")
	keeper.global_position = Vector2(200.0, ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.ball.release(Vector2.RIGHT, 760.0)
	match_node.ball.global_position = keeper.global_position + Vector2(48.0, 0.0)
	assert(not match_node.debug_try_keeper_save(keeper))
	match_node.ball.velocity = Vector2.LEFT * 760.0
	assert(match_node.debug_try_keeper_save(keeper))
	assert(match_node.ball.carrier == keeper)
	assert(keeper.debug_keeper_hold_active())
	assert(String(keeper.visual.animation) == "tackle")

	var rival: Footballer = match_node.teams[1][4]
	rival.global_position = Vector2(ChessFootballMath.PITCH_RECT.position.x + 300.0, ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.ball.attach_to(rival)
	var dribble_target: Vector2 = match_node.debug_ai_dribble_target(rival)
	assert(dribble_target.x < rival.global_position.x)
	match_node.debug_force_ai_attack(rival)
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.x < 0.0)

	assert(not match_node.debug_pause_menu_open())
	assert(match_node.debug_pause_first_option() == "SALIR")
	match_node.debug_toggle_pause_menu()
	assert(match_node.debug_pause_menu_open())
	match_node.debug_toggle_pause_menu()
	assert(not match_node.debug_pause_menu_open())

	assert(match_node.debug_camera_mode() == "broadcast")
	match_node.debug_toggle_camera_mode()
	assert(match_node.debug_camera_mode() == "tactical")
	match_node.debug_toggle_camera_mode()
	assert(match_node.debug_camera_mode() == "broadcast")
	print("chess-football godot smoke: OK")
	quit(0)
