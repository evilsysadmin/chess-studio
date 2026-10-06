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
	assert(ChessFootballMath.PITCH_RECT.size.x >= 2000.0)
	assert(ChessFootballMath.PITCH_RECT.size.y >= 1000.0)
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
	tackler.velocity = Vector2.RIGHT * tackler.base_speed

	var forward_hitbox: Dictionary = match_node.debug_tackle_hitbox(tackler, Vector2(688.0, 522.0))
	assert(bool(forward_hitbox["inside"]))
	assert(float(forward_hitbox["lateral_distance"]) <= 27.0)
	var behind_hitbox: Dictionary = match_node.debug_tackle_hitbox(tackler, Vector2(616.0, 500.0))
	assert(not bool(behind_hitbox["inside"]))
	assert(bool(behind_hitbox["contact"]))
	assert(bool(behind_hitbox["foul"]))
	var wide_hitbox: Dictionary = match_node.debug_tackle_hitbox(tackler, Vector2(676.0, 536.0))
	assert(not bool(wide_hitbox["inside"]))

	victim.global_position = Vector2(676.0, 514.0)
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

	# Pressing tackle slightly early still leaves a short active contact window.
	# The rival starts outside the capsule, enters it during the animation, and
	# must be stealable without a second button press.
	tackler._process(2.0)
	tackler.global_position = Vector2(640.0, 560.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	victim.global_position = Vector2(722.0, 560.0)
	match_node.ball.attach_to(victim)
	assert(not match_node.debug_try_tackle(tackler))
	assert(tackler.debug_tackle_active())
	assert(match_node.ball.carrier == victim)
	victim.global_position = Vector2(700.0, 572.0)
	match_node.debug_update_active_tackle_contacts()
	assert(match_node.ball.carrier == null)
	assert(victim.contact_stun_active())

	# A late/rear contact is a foul rather than a free steal. The opponent gets
	# a proper dead-ball restart at the contact spot.
	tackler._process(2.0)
	tackler.global_position = Vector2(640.0, 620.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	victim.global_position = Vector2(620.0, 620.0)
	match_node.ball.attach_to(victim)
	var foul_hitbox: Dictionary = match_node.debug_tackle_hitbox(tackler, victim.global_position)
	assert(bool(foul_hitbox["contact"]))
	assert(bool(foul_hitbox["foul"]))
	assert(match_node.debug_try_tackle(tackler))
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_set_piece_kind() == "FALTA")
	assert(match_node.debug_set_piece_team() == victim.team_id)
	assert(match_node.ball.carrier != null)
	assert(match_node.ball.carrier.team_id == victim.team_id)
	match_node.debug_force_set_piece_ready()
	assert(not match_node.debug_set_piece_active())

	# Shift+E contract: an aggressive slide reaches farther than the normal
	# tackle, but a non-clean hit is automatically a foul.
	tackler._process(2.0)
	tackler.global_position = Vector2(760.0, 720.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	victim.global_position = Vector2(842.0, 720.0)
	match_node.ball.attach_to(victim)
	var normal_long_hitbox: Dictionary = match_node.debug_tackle_hitbox(tackler, victim.global_position)
	assert(not bool(normal_long_hitbox["contact"]))
	assert(match_node.debug_try_tackle(tackler, true))
	assert(tackler.debug_tackle_aggressive())
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_set_piece_kind() == "FALTA")
	match_node.debug_force_set_piece_ready()
	assert(not match_node.debug_set_piece_active())

	# A foul inside the defending penalty area becomes a penalty at the fixed
	# spot, not an arbitrary free kick from the collision coordinates.
	var penalty_tackler: Footballer = match_node.teams[1][1]
	var penalty_victim: Footballer = match_node.teams[0][4]
	var penalty_goal := ChessFootballMath.goal_center(0)
	var foul_point := Vector2(penalty_goal.x - 120.0, penalty_goal.y)
	assert(match_node.debug_penalty_area_contains(0, foul_point))
	penalty_tackler._process(2.0)
	penalty_tackler.global_position = foul_point + Vector2(20.0, 0.0)
	penalty_tackler.velocity = Vector2.RIGHT * penalty_tackler.base_speed
	penalty_victim.global_position = foul_point
	match_node.ball.attach_to(penalty_victim)
	assert(match_node.debug_try_tackle(penalty_tackler))
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_set_piece_kind() == "PENALTI")
	assert(match_node.debug_set_piece_team() == 0)
	assert(
		match_node.debug_set_piece_spot().distance_to(
			match_node.debug_penalty_spot(0)
		) < 0.01
	)
	for penalty_teammate in match_node.teams[0]:
		if penalty_teammate != match_node.ball.carrier and penalty_teammate.role != "keeper":
			assert(not match_node.debug_penalty_area_contains(0, penalty_teammate.global_position))
	for penalty_opponent in match_node.teams[1]:
		if penalty_opponent.role != "keeper":
			assert(not match_node.debug_penalty_area_contains(0, penalty_opponent.global_position))
	match_node.debug_force_set_piece_ready()
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_human_penalty_ready())
	match_node.debug_set_penalty_aim(-0.72)
	match_node.debug_sync_presentation()
	assert(match_node.debug_penalty_aim_visible())
	var human_penalty_target: Vector2 = match_node.debug_penalty_target(-0.72)
	assert(human_penalty_target.y < ChessFootballMath.PITCH_RECT.get_center().y)
	match_node.debug_force_human_penalty_shot(0.68, -0.72)
	assert(not match_node.debug_set_piece_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.x > 0.0)
	assert(match_node.ball.velocity.y < 0.0)

	# Rival penalty: the human controls the goalkeeper on the goal line during
	# the freeze, then the existing save logic takes over once the shot flies.
	match_node.debug_prepare_penalty(1)
	var penalty_keeper: Footballer = match_node.teams[0][0]
	var penalty_keeper_y_before := penalty_keeper.global_position.y
	match_node.debug_move_penalty_keeper(-1.0, 0.20)
	assert(penalty_keeper.global_position.y < penalty_keeper_y_before)
	match_node.debug_force_set_piece_ready()
	assert(not match_node.debug_set_piece_active())
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.x < 0.0)

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
	match_node.debug_sync_presentation()
	assert(match_node.debug_3d_ball_height() > 0.80)

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

	var shooter: Footballer = match_node.controlled
	shooter.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x - 520.0,
		ChessFootballMath.PITCH_RECT.get_center().y + 72.0
	)
	var defending_keeper: Footballer = match_node.teams[1][0]
	defending_keeper.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x - 92.0,
		ChessFootballMath.PITCH_RECT.get_center().y + 38.0
	)
	var auto_target: Vector2 = match_node.debug_assisted_shot_target(shooter, 0.0)
	var upper_target: Vector2 = match_node.debug_assisted_shot_target(shooter, -1.0)
	var lower_target: Vector2 = match_node.debug_assisted_shot_target(shooter, 1.0)
	var safe_span: float = (
		ChessFootballMath.GOAL_HALF_HEIGHT
		- ChessFootballMath.GOAL_FRAME_POST_RADIUS
		- 26.0
	)
	assert(absf(auto_target.y - ChessFootballMath.PITCH_RECT.get_center().y) <= safe_span + 0.01)
	assert(absf(upper_target.y - ChessFootballMath.PITCH_RECT.get_center().y) <= safe_span + 0.01)
	assert(absf(lower_target.y - ChessFootballMath.PITCH_RECT.get_center().y) <= safe_span + 0.01)
	assert(upper_target.y < ChessFootballMath.PITCH_RECT.get_center().y)
	assert(lower_target.y > ChessFootballMath.PITCH_RECT.get_center().y)
	assert(auto_target.y < ChessFootballMath.PITCH_RECT.get_center().y)

	var assisted_power: float = match_node.debug_shot_power_for_ratio(1.0)
	var assisted_requested_lift: float = match_node.debug_shot_lift_for_ratio(1.0)
	var assisted_lift: float = match_node.debug_safe_shot_lift(
		shooter,
		auto_target,
		assisted_power,
		assisted_requested_lift
	)
	var predicted_goal_height: float = match_node.debug_predicted_shot_height_at_goal(
		shooter,
		auto_target,
		assisted_power,
		assisted_lift
	)
	assert(assisted_lift <= assisted_requested_lift)
	assert(predicted_goal_height <= 50.01)
	assert(predicted_goal_height < ChessFootballMath.GOAL_MAX_FLIGHT_HEIGHT)

	# End-to-end contract: use the real charged-shot release and real ball
	# friction/gravity until it crosses the goal plane. A fully charged assisted
	# shot must still be on frame; keeper/posts may stop it in match play, but
	# the shooting system itself must not send it wide or over.
	match_node.ball.attach_to(shooter)
	match_node.debug_force_shot_charge(1.0, -1.0)
	match_node.debug_release_charged_shot()
	assert(match_node.ball.velocity.x > 0.0)
	var crossed_goal_plane := false
	for _shot_step in range(240):
		match_node.ball.tick_ball(1.0 / 120.0)
		if match_node.ball.global_position.x >= ChessFootballMath.PITCH_RECT.end.x:
			crossed_goal_plane = true
			break
	assert(crossed_goal_plane)
	assert(
		absf(
			match_node.ball.global_position.y
			- ChessFootballMath.PITCH_RECT.get_center().y
		) <= safe_span + 2.0
	)
	assert(match_node.ball.flight_height <= ChessFootballMath.GOAL_MAX_FLIGHT_HEIGHT)

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
	var escape_event := InputEventKey.new()
	escape_event.keycode = KEY_ESCAPE
	escape_event.pressed = true
	match_node._unhandled_input(escape_event)
	assert(match_node.debug_pause_menu_open())
	match_node._unhandled_input(escape_event)
	assert(not match_node.debug_pause_menu_open())

	assert(match_node.debug_camera_mode() == "broadcast")
	match_node.debug_toggle_camera_mode()
	assert(match_node.debug_camera_mode() == "tactical")
	match_node.debug_toggle_camera_mode()
	assert(match_node.debug_camera_mode() == "broadcast")

	# Discipline contract: aggressive foul => yellow; second yellow dismisses;
	# aggressive contact clearly from behind => straight red. Dismissed players
	# remain in the roster but disappear from runtime play and presentation.
	var booked_player: Footballer = match_node.teams[1][3]
	var first_card: String = match_node.debug_apply_foul_card(booked_player, true, 22.0)
	assert(first_card.begins_with("AMARILLA"))
	assert(booked_player.debug_yellow_cards() == 1)
	assert(not booked_player.debug_sent_off())
	var second_card: String = match_node.debug_apply_foul_card(booked_player, true, 18.0)
	assert(second_card.begins_with("SEGUNDA AMARILLA"))
	assert(booked_player.debug_yellow_cards() == 2)
	assert(booked_player.debug_sent_off())
	assert(not booked_player.debug_tackle_ready())
	match_node.debug_sync_presentation()
	assert(match_node.debug_3d_visible_players() == 9)

	var red_player: Footballer = match_node.teams[1][2]
	var straight_red: String = match_node.debug_apply_foul_card(red_player, true, -18.0)
	assert(straight_red.begins_with("ROJA"))
	assert(red_player.debug_sent_off())
	match_node.debug_sync_presentation()
	assert(match_node.debug_3d_visible_players() == 8)
	print("SMOKE_STAGE=discipline")

	print("chess-football godot smoke: OK")
	quit(0)
