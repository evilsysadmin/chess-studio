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
	for expected_audio in ["goal", "pass", "save", "shot", "tackle", "whistle"]:
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

	match_node.ball.flight_height = 48.0
	match_node.ball.vertical_velocity = 120.0
	match_node.debug_score_goal(0)
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
	match_node.ball.global_position = keeper.global_position + Vector2(48.0, 0.0)
	assert(not match_node.debug_try_keeper_save(keeper))
	match_node.ball.velocity = Vector2.LEFT * 760.0
	assert(match_node.debug_try_keeper_save(keeper))
	assert(match_node.ball.carrier == keeper)
	assert(keeper.debug_keeper_hold_active())
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
