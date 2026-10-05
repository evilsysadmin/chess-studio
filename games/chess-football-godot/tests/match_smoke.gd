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
	assert(match_node.debug_audio_ready())
	var audio_names: Array[String] = match_node.debug_audio_stream_names()
	for expected_audio in ["goal", "pass", "post", "save", "shot", "tackle", "whistle"]:
		assert(audio_names.has(expected_audio))
	assert(match_node.debug_3d_animated_players() == 10)
	assert(match_node.controlled != null)
	assert(match_node.controlled.debug_visual_ready())
	assert(match_node.controlled.debug_animation_names().size() == 7)
	assert(match_node.controlled.debug_animation_names().has("shoot"))
	assert(ChessFootballSpriteBank.atlas_key(0, "keeper") == "fc_matthias_keeper")
	assert(ChessFootballSpriteBank.atlas_key(1, "keeper") == "real_enroque_keeper")
	assert(ChessFootballSpriteBank.atlas_key(0, "forward") == "fc_matthias")
	var initial_kickoff_team: int = match_node.debug_kickoff_team()
	assert(initial_kickoff_team == 0 or initial_kickoff_team == 1)
	assert(match_node.debug_kickoff_active())
	assert(match_node.ball.carrier != null)
	assert(match_node.ball.carrier.team_id == initial_kickoff_team)
	assert(match_node.ball.global_position.distance_to(ChessFootballMath.PITCH_RECT.get_center()) < 1.0)
	var center_x: float = ChessFootballMath.PITCH_RECT.get_center().x
	for team_id in range(2):
		for player in match_node.teams[team_id]:
			if player == match_node.ball.carrier:
				continue
			if team_id == 0:
				assert(player.global_position.x < center_x)
			else:
				assert(player.global_position.x > center_x)
			if team_id != initial_kickoff_team:
				assert(
					player.global_position.distance_to(
						ChessFootballMath.PITCH_RECT.get_center()
					) > 180.0
				)
	match_node.debug_force_kickoff_ready()
	assert(not match_node.debug_kickoff_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)
	if initial_kickoff_team == 0:
		assert(match_node.controlled == match_node.teams[0][3])
	assert(InputMap.has_action("tackle"))
	print("SMOKE_STAGE=kickoff")

	# The same shot crossing the goal plane is only a goal while the whole
	# ball fits below the crossbar.
	match_node.ball.release(Vector2.RIGHT, 0.0)
	match_node.ball.global_position = ChessFootballMath.goal_center(0) + Vector2(28.0, 0.0)
	match_node.ball.flight_height = ChessFootballMath.GOAL_MAX_FLIGHT_HEIGHT + 8.0
	match_node.ball.vertical_velocity = 120.0
	match_node.debug_check_goal()
	assert(match_node.score == [0, 0])
	assert(not match_node.debug_goal_restart_active())

	match_node.ball.flight_height = ChessFootballMath.GOAL_MAX_FLIGHT_HEIGHT - 4.0
	match_node.debug_check_goal()
	assert(match_node.score == [1, 0])
	assert(match_node.ball.flight_height == 0.0)
	assert(match_node.ball.vertical_velocity == 0.0)
	assert(match_node.debug_goal_restart_active())
	assert(not match_node.debug_kickoff_active())
	match_node.debug_force_goal_restart_ready()
	assert(not match_node.debug_goal_restart_active())
	assert(match_node.debug_kickoff_active())
	assert(match_node.debug_kickoff_team() == 1)
	assert(match_node.ball.carrier != null and match_node.ball.carrier.team_id == 1)
	match_node.debug_force_kickoff_ready()
	assert(not match_node.debug_kickoff_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)

	match_node.debug_score_goal(1)
	assert(match_node.score == [1, 1])
	assert(match_node.debug_goal_restart_active())
	assert(not match_node.debug_kickoff_active())
	match_node.debug_force_goal_restart_ready()
	assert(not match_node.debug_goal_restart_active())
	assert(match_node.debug_kickoff_active())
	assert(match_node.debug_kickoff_team() == 0)
	assert(match_node.ball.carrier != null and match_node.ball.carrier.team_id == 0)
	match_node.debug_force_kickoff_ready()
	assert(not match_node.debug_kickoff_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)
	assert(match_node.controlled == match_node.teams[0][3])

	# Touchline: the other team gets an automatic throw-in restart.
	match_node.ball.attach_to(match_node.teams[0][3])
	match_node.ball.release(Vector2.UP, 420.0)
	match_node.ball.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.get_center().x,
		ChessFootballMath.PITCH_RECT.position.y - 24.0
	)
	match_node.debug_check_ball_out()
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_set_piece_kind() == "SAQUE DE BANDA")
	assert(match_node.debug_set_piece_team() == 1)
	assert(match_node.ball.carrier != null and match_node.ball.carrier.team_id == 1)
	var throw_options := 0
	for teammate in match_node.teams[1]:
		if teammate != match_node.ball.carrier and teammate.role != "keeper":
			if teammate.global_position.distance_to(match_node.ball.global_position) < 320.0:
				throw_options += 1
	assert(throw_options >= 2)
	match_node.debug_force_set_piece_ready()
	assert(not match_node.debug_set_piece_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)

	# Defender last touch over its own goal line becomes a corner.
	match_node.ball.attach_to(match_node.teams[1][1])
	match_node.ball.release(Vector2.RIGHT, 520.0)
	match_node.ball.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x + 24.0,
		ChessFootballMath.PITCH_RECT.position.y + 44.0
	)
	match_node.debug_check_ball_out()
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_set_piece_kind() == "CÓRNER")
	assert(match_node.debug_set_piece_team() == 0)
	var attackers_in_box_zone := 0
	var corner_target := ChessFootballMath.goal_center(0)
	for attacker in match_node.teams[0]:
		if attacker != match_node.ball.carrier and attacker.role != "keeper":
			if attacker.global_position.distance_to(corner_target) < 240.0:
				attackers_in_box_zone += 1
	assert(attackers_in_box_zone >= 2)
	match_node.debug_force_set_piece_ready()
	assert(not match_node.debug_set_piece_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.vertical_velocity > 0.0)

	# Attacker last touch over the same line becomes a goal kick.
	match_node.ball.attach_to(match_node.teams[0][4])
	match_node.ball.release(Vector2.RIGHT, 520.0)
	match_node.ball.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x + 24.0,
		ChessFootballMath.PITCH_RECT.position.y + 44.0
	)
	match_node.debug_check_ball_out()
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_set_piece_kind() == "SAQUE DE PUERTA")
	assert(match_node.debug_set_piece_team() == 1)
	assert(match_node.ball.carrier == match_node.teams[1][0])
	match_node.debug_force_set_piece_ready()
	assert(not match_node.debug_set_piece_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)
	print("SMOKE_STAGE=restarts")

	# Goal frame: clean shots pass through, posts and crossbar rebound.
	var right_goal_x: float = ChessFootballMath.PITCH_RECT.end.x
	var goal_center_y: float = ChessFootballMath.PITCH_RECT.get_center().y
	var lower_post_y: float = goal_center_y + ChessFootballMath.GOAL_HALF_HEIGHT

	match_node.ball.attach_to(match_node.teams[0][4])
	match_node.ball.release(Vector2.RIGHT, 900.0)
	var clean_previous := Vector2(right_goal_x - 18.0, goal_center_y)
	match_node.ball.global_position = Vector2(right_goal_x + 12.0, goal_center_y)
	match_node.ball.flight_height = 20.0
	assert(match_node.debug_resolve_goal_frame_collision(clean_previous, 20.0) == "")
	assert(match_node.ball.velocity.x > 0.0)

	match_node.ball.attach_to(match_node.teams[0][4])
	match_node.ball.release(Vector2.RIGHT, 930.0)
	var post_previous := Vector2(right_goal_x - 18.0, lower_post_y)
	match_node.ball.global_position = Vector2(right_goal_x + 12.0, lower_post_y)
	match_node.ball.flight_height = 18.0
	assert(match_node.debug_resolve_goal_frame_collision(post_previous, 18.0) == "post")
	assert(match_node.ball.velocity.x < 0.0)
	assert(match_node.ball.global_position.x < right_goal_x)

	match_node.ball.attach_to(match_node.teams[0][4])
	match_node.ball.release(Vector2.RIGHT, 1040.0, 180.0)
	var crossbar_previous := Vector2(right_goal_x - 18.0, goal_center_y)
	match_node.ball.global_position = Vector2(right_goal_x + 12.0, goal_center_y)
	match_node.ball.flight_height = ChessFootballMath.GOAL_FRAME_CROSSBAR_HEIGHT
	match_node.ball.vertical_velocity = 45.0
	assert(
		match_node.debug_resolve_goal_frame_collision(
			crossbar_previous,
			ChessFootballMath.GOAL_FRAME_CROSSBAR_HEIGHT,
		) == "crossbar"
	)
	assert(match_node.ball.velocity.x < 0.0)
	assert(match_node.ball.vertical_velocity < 0.0)
	assert(match_node.ball.global_position.x < right_goal_x)
	print("SMOKE_STAGE=goal-frame")

	var tackler: Footballer = match_node.controlled
	var victim: Footballer = match_node.teams[1][2]
	tackler.global_position = Vector2(640.0, 500.0)
	victim.global_position = Vector2(668.0, 500.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	match_node.ball.attach_to(victim)
	var pre_tackle_distance: float = tackler.global_position.distance_to(victim.global_position)
	assert(match_node.debug_try_tackle(tackler))
	assert(tackler.global_position.distance_to(victim.global_position) > pre_tackle_distance + 21.0)
	assert(match_node.ball.carrier == null)
	assert(not victim.has_ball)
	assert(victim.contact_stun_active())
	assert(not tackler.debug_tackle_ready())
	assert(String(tackler.visual.animation) == "tackle")
	match_node.ball.tick_ball(0.21)
	match_node.debug_step_pending_tackle(0.21)
	assert(match_node.ball.carrier == tackler)
	print("SMOKE_STAGE=tackle")

	var keeper: Footballer = match_node.teams[0][0]
	assert(keeper.role == "keeper")
	keeper.global_position = Vector2(200.0, ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.ball.release(Vector2.RIGHT, 760.0)
	match_node.ball.global_position = keeper.global_position + Vector2(48.0, 34.0)
	assert(not match_node.debug_try_keeper_save(keeper))
	match_node.ball.velocity = Vector2.LEFT * 760.0
	assert(match_node.debug_try_keeper_save(keeper))
	assert(match_node.ball.carrier == keeper)
	assert(keeper.debug_keeper_hold_active())
	assert(keeper.debug_keeper_save_active())
	assert(keeper.debug_keeper_save_direction() > 0.0)
	assert(String(keeper.visual.animation) == "tackle")

	var rival_keeper: Footballer = match_node.teams[1][0]
	rival_keeper.global_position = Vector2(ChessFootballMath.PITCH_RECT.end.x - 120.0, ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.ball.attach_to(rival_keeper)
	rival_keeper.begin_keeper_hold(0.0)
	match_node.debug_step_ai(1.0 / 60.0)
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)
	assert(match_node.ball.reclaim_blocked_for(rival_keeper))
	print("SMOKE_STAGE=keeper")
	match_node.ball.tick_ball(1.0 / 60.0)
	match_node.debug_try_claim_loose_ball()
	assert(match_node.ball.carrier != rival_keeper)

	var rival: Footballer = match_node.teams[1][4]
	rival.global_position = Vector2(ChessFootballMath.PITCH_RECT.get_center().x + 240.0, ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.ball.attach_to(rival)
	var dribble_target: Vector2 = match_node.debug_ai_dribble_target(rival)
	assert(dribble_target.x < rival.global_position.x)
	var rival_x_before := rival.global_position.x
	match_node.debug_step_ai(1.0 / 60.0)
	assert(rival.global_position.x < rival_x_before)

	rival.global_position = Vector2(ChessFootballMath.PITCH_RECT.position.x + 300.0, ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.ball.attach_to(rival)
	match_node.debug_force_ai_attack(rival)
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.x < 0.0)
	print("SMOKE_STAGE=ai")

	var tap_power: float = match_node.debug_shot_power_for_ratio(0.0)
	var medium_power: float = match_node.debug_shot_power_for_ratio(0.5)
	var full_power: float = match_node.debug_shot_power_for_ratio(1.0)
	var tap_lift: float = match_node.debug_shot_lift_for_ratio(0.0)
	var medium_lift: float = match_node.debug_shot_lift_for_ratio(0.5)
	var full_lift: float = match_node.debug_shot_lift_for_ratio(1.0)
	assert(tap_power >= 420.0 and tap_power < 500.0)
	assert(medium_power > tap_power + 300.0)
	assert(full_power > medium_power + 400.0)
	assert(full_power <= match_node.ball.max_speed)
	assert(tap_lift < 80.0)
	assert(medium_lift > tap_lift + 120.0)
	assert(full_lift > medium_lift + 200.0)
	assert(match_node.debug_shot_profile_for_ratio(0.1) == "TIRO RASO")
	assert(match_node.debug_shot_profile_for_ratio(0.5) == "TIRO")
	assert(match_node.debug_shot_profile_for_ratio(1.0) == "PEPINAZO")

	match_node.ball.attach_to(match_node.controlled)
	match_node.debug_force_shot_charge(0.5)
	assert(absf(match_node.debug_shot_charge_ratio() - 0.5) < 0.001)
	match_node.debug_release_charged_shot()
	var released_medium_speed: float = match_node.ball.velocity.length()
	assert(released_medium_speed > tap_power)
	assert(match_node.ball.vertical_velocity > 0.0)
	match_node.ball.tick_ball(0.10)
	assert(match_node.ball.flight_height > 0.0)
	assert(String(match_node.controlled.visual.animation) == "shoot")

	match_node.ball.attach_to(match_node.controlled)
	match_node.debug_force_shot_charge(1.0)
	match_node.debug_release_charged_shot()
	var released_full_speed: float = match_node.ball.velocity.length()
	assert(released_full_speed > released_medium_speed + 220.0)
	match_node.ball.tick_ball(1.0 / 60.0)
	assert(match_node.ball.velocity.length() > released_full_speed * 0.97)
	print("SMOKE_STAGE=shots")

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
