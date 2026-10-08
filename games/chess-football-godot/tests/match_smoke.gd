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
	assert(ChessFootballMath.PITCH_RECT.size.x >= 2400.0)
	assert(ChessFootballMath.PITCH_RECT.size.y >= 1400.0)
	assert(ChessFootballMath.GOAL_HALF_HEIGHT >= 180.0)
	assert(
		ChessFootballMath.GOAL_HALF_HEIGHT * 2.0
		/ ChessFootballMath.PITCH_RECT.size.y
		>= 0.25
	)
	var goal_probe_center := ChessFootballMath.PITCH_RECT.get_center()
	assert(
		ChessFootballMath.in_goal_mouth(
			Vector2(ChessFootballMath.PITCH_RECT.end.x, goal_probe_center.y + 165.0)
		)
	)
	assert(
		not ChessFootballMath.in_goal_mouth(
			Vector2(ChessFootballMath.PITCH_RECT.end.x, goal_probe_center.y + 190.0)
		)
	)
	assert(match_node.debug_keeper_track_y_limit() <= 94.01)
	assert(match_node.debug_keeper_track_y_limit() < ChessFootballMath.GOAL_HALF_HEIGHT * 0.60)
	assert(ChessFootballMath.GOAL_MAX_FLIGHT_HEIGHT >= 80.0)
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
	assert(ChessFootballSpriteBank.atlas_key(0, "defender", 1) == "fc_matthias")
	assert(ChessFootballSpriteBank.atlas_key(0, "midfielder", 2) == "fc_matthias_v2")
	assert(ChessFootballSpriteBank.atlas_key(0, "wing", 3) == "fc_matthias_v3")
	assert(ChessFootballSpriteBank.atlas_key(0, "forward", 4) == "fc_matthias_v4")
	assert(ChessFootballSpriteBank.atlas_key(1, "midfielder", 2) == "real_enroque_v2")
	assert(ChessFootballSpriteBank.atlas_key(1, "wing", 3) == "real_enroque_v3")
	assert(ChessFootballSpriteBank.atlas_key(1, "forward", 4) == "real_enroque_v4")
	assert(match_node.teams[0][1].debug_visual_variant_key() == "fc_matthias")
	assert(match_node.teams[0][2].debug_visual_variant_key() == "fc_matthias_v2")
	assert(match_node.teams[0][3].debug_visual_variant_key() == "fc_matthias_v3")
	assert(match_node.teams[0][4].debug_visual_variant_key() == "fc_matthias_v4")
	var sprite_manifest: Dictionary = ChessFootballSpriteBank.manifest()
	assert(int(sprite_manifest["version"]) == 27)
	assert(String(sprite_manifest["quality_contract"]) == "chess-football-vector-v27")
	assert(String(sprite_manifest["canonical_run"]["quality_contract"]) == "chess-football-run-canon-v1")
	assert(String(sprite_manifest["canonical_run"]["sha256"]) == "62e6b26f5cfc11ccf94ae93c643659a51695baf53c4511366bddfdd6692d234c")
	assert(int(sprite_manifest["canonical_run"]["frames"]) == 8)
	assert(int(sprite_manifest["canonical_run"]["footline"]) == 130)
	var canonical_frames := ChessFootballSpriteBank.build_frames(0, "midfielder", 2)
	var canonical_run_frame := canonical_frames.get_frame_texture(&"run", 0) as AtlasTexture
	var canonical_sprint_frame := canonical_frames.get_frame_texture(&"sprint", 0) as AtlasTexture
	assert(canonical_run_frame != null)
	assert(canonical_sprint_frame != null)
	assert(canonical_run_frame.atlas is ImageTexture)
	assert(canonical_sprint_frame.atlas is ImageTexture)
	assert(canonical_run_frame.atlas == canonical_sprint_frame.atlas)
	assert(canonical_run_frame.region == Rect2(0.0, 0.0, 128.0, 144.0))
	assert(canonical_sprint_frame.region == Rect2(0.0, 0.0, 128.0, 144.0))
	assert(is_equal_approx(canonical_frames.get_animation_speed(&"run"), 12.0))
	assert(is_equal_approx(canonical_frames.get_animation_speed(&"sprint"), 15.0))
	assert(sprite_manifest["atlases"]["fc_matthias"]["body_profile"] == "defender")
	assert(sprite_manifest["atlases"]["fc_matthias_v2"]["body_profile"] == "midfielder")
	assert(sprite_manifest["atlases"]["fc_matthias_v3"]["body_profile"] == "wing")
	assert(sprite_manifest["atlases"]["fc_matthias_v4"]["body_profile"] == "forward")
	assert(sprite_manifest["atlases"]["real_enroque"]["body_profile"] == "defender")
	assert(sprite_manifest["atlases"]["real_enroque_v3"]["body_profile"] == "wing")
	assert(sprite_manifest["atlases"]["fc_matthias"]["motion_profile"] == "grounded")
	assert(sprite_manifest["atlases"]["fc_matthias_v2"]["motion_profile"] == "balanced")
	assert(sprite_manifest["atlases"]["fc_matthias_v3"]["motion_profile"] == "explosive")
	assert(sprite_manifest["atlases"]["fc_matthias_v4"]["motion_profile"] == "driven")
	assert(sprite_manifest["atlases"]["real_enroque"]["motion_profile"] == "grounded")
	assert(sprite_manifest["atlases"]["real_enroque_v3"]["motion_profile"] == "explosive")
	assert(sprite_manifest["atlases"]["fc_matthias"]["face_profile"] == "square-balanced")
	assert(sprite_manifest["atlases"]["fc_matthias_v3"]["face_profile"] == "broad-fade")
	assert(sprite_manifest["atlases"]["fc_matthias_v3"]["hair_style"] == "fade")
	assert(sprite_manifest["atlases"]["fc_matthias_v4"]["hair_style"] == "textured")
	assert(sprite_manifest["atlases"]["real_enroque_v2"]["hair_style"] == "textured")
	assert(sprite_manifest["atlases"]["real_enroque_v3"]["face_profile"] == "square-fade")
	assert(sprite_manifest["atlases"]["fc_matthias"]["kit_profile"] == "organic-v19")
	assert(sprite_manifest["atlases"]["fc_matthias_v3"]["kit_profile"] == "organic-v19")
	assert(sprite_manifest["atlases"]["real_enroque"]["kit_profile"] == "organic-v19")
	assert(sprite_manifest["atlases"]["fc_matthias"]["silhouette_profile"] == "athletic-v23")
	assert(sprite_manifest["atlases"]["fc_matthias_keeper"]["silhouette_profile"] == "athletic-v23")
	assert(sprite_manifest["atlases"]["real_enroque"]["silhouette_profile"] == "athletic-v23")
	assert(sprite_manifest["atlases"]["real_enroque_keeper"]["silhouette_profile"] == "athletic-v23")
	assert(sprite_manifest["atlases"]["fc_matthias"]["joint_profile"] == "organic-joints-v24")
	assert(sprite_manifest["atlases"]["fc_matthias_keeper"]["joint_profile"] == "organic-joints-v24")
	assert(sprite_manifest["atlases"]["real_enroque"]["joint_profile"] == "organic-joints-v24")
	assert(sprite_manifest["atlases"]["real_enroque_keeper"]["joint_profile"] == "organic-joints-v24")
	assert(sprite_manifest["atlases"]["fc_matthias"]["limb_outline_profile"] == "tonal-limbs-v25")
	assert(sprite_manifest["atlases"]["fc_matthias_keeper"]["limb_outline_profile"] == "tonal-limbs-v25")
	assert(sprite_manifest["atlases"]["real_enroque"]["limb_outline_profile"] == "tonal-limbs-v25")
	assert(sprite_manifest["atlases"]["real_enroque_keeper"]["limb_outline_profile"] == "tonal-limbs-v25")
	assert(sprite_manifest["atlases"]["fc_matthias"]["limb_geometry_profile"] == "anatomical-contour-v27")
	assert(sprite_manifest["atlases"]["fc_matthias_keeper"]["limb_geometry_profile"] == "anatomical-contour-v27")
	assert(sprite_manifest["atlases"]["real_enroque"]["limb_geometry_profile"] == "anatomical-contour-v27")
	assert(sprite_manifest["atlases"]["real_enroque_keeper"]["limb_geometry_profile"] == "anatomical-contour-v27")
	assert(sprite_manifest["atlases"]["fc_matthias"]["kinetics_profile"] == "weight-transfer-v21")
	assert(sprite_manifest["atlases"]["fc_matthias_keeper"]["kinetics_profile"] == "weight-transfer-v21")
	assert(sprite_manifest["atlases"]["real_enroque"]["kinetics_profile"] == "weight-transfer-v21")
	assert(sprite_manifest["atlases"]["real_enroque_keeper"]["kinetics_profile"] == "weight-transfer-v21")
	assert(match_node.teams[0][0].debug_loop_phase_frame(&"idle") == 0)
	assert(match_node.teams[0][1].debug_loop_phase_frame(&"idle") == 3)
	assert(
		match_node.teams[0][0].debug_loop_phase_frame(&"run")
		!= match_node.teams[0][1].debug_loop_phase_frame(&"run")
	)
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
	var human_home_spread := absf(
		match_node.teams[0][3].home_position.y
		- match_node.teams[0][1].home_position.y
	)
	assert(human_home_spread > 500.0)
	print("SMOKE_STAGE=kickoff")

	# Universal stamina: sprint drains, exhaustion disables the speed boost,
	# and rest recovers enough to sprint again. No per-player stats yet.
	var stamina_runner: Footballer = match_node.controlled
	stamina_runner.debug_set_stamina(100.0)
	var stamina_start: float = stamina_runner.debug_stamina_ratio()
	for _sprint_step in range(40):
		stamina_runner.move_human(0.10, Vector2.RIGHT, true)
	assert(stamina_runner.debug_stamina_ratio() < stamina_start * 0.10)
	assert(stamina_runner.debug_stamina_exhausted())
	var exhausted_speed: float = stamina_runner.velocity.length()
	assert(exhausted_speed <= stamina_runner.base_speed * 1.06)
	for _recover_step in range(10):
		stamina_runner.move_human(0.10, Vector2.ZERO, false)
	assert(stamina_runner.debug_stamina_ratio() >= 0.24)
	assert(not stamina_runner.debug_stamina_exhausted())
	stamina_runner.debug_set_stamina(100.0)
	print("SMOKE_STAGE=stamina")

	# Context dribble: with possession the tackle key becomes a short directional
	# touch/burst. It keeps possession, changes direction immediately and cannot
	# be spammed while its cooldown is active.
	var dribbler: Footballer = match_node.teams[0][3]
	match_node._select_player(dribbler)
	dribbler.global_position = ChessFootballMath.PITCH_RECT.get_center()
	dribbler.velocity = Vector2.ZERO
	match_node.ball.attach_to(dribbler)
	assert(dribbler.debug_dribble_ready())
	var dribble_before := dribbler.global_position
	assert(match_node.debug_try_dribble(Vector2(0.35, -1.0)))
	assert(dribbler.debug_dribble_active())
	assert(dribbler.debug_dribble_direction().y < -0.90)
	assert(not match_node.debug_try_dribble(Vector2.DOWN))
	dribbler._process(0.10)
	dribbler.move_human(0.10, Vector2.ZERO, false)
	match_node.ball.tick_ball(0.0)
	assert(dribbler.velocity.y < -dribbler.base_speed * 1.20)
	assert(dribbler.global_position.y < dribble_before.y)
	assert(match_node.ball.carrier == dribbler)
	assert(match_node.ball.global_position.distance_to(dribbler.global_position) > 28.0)
	dribbler._process(0.70)
	assert(dribbler.debug_dribble_ready())

	# No-input desktop dribble should choose the safer diagonal when a rival is
	# pressing. Explicit directional dribbles above remain authoritative.
	for opponent in match_node.teams[1]:
		opponent.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.end.x - 120.0,
			ChessFootballMath.PITCH_RECT.end.y - 120.0,
		)
	var press_defender: Footballer = match_node.teams[1][1]
	dribbler.global_position = ChessFootballMath.PITCH_RECT.get_center()
	dribbler.velocity = Vector2.ZERO
	press_defender.global_position = dribbler.global_position + Vector2(72.0, -42.0)
	match_node.ball.attach_to(dribbler)
	var auto_lane: Vector2 = match_node.debug_auto_dribble_direction(dribbler)
	assert(auto_lane.x > 0.60)
	assert(auto_lane.y > 0.45)
	assert(match_node.debug_try_dribble(Vector2.ZERO))
	assert(dribbler.debug_dribble_direction().y > 0.45)
	dribbler._process(0.70)

	# With no nearby pressure, the same no-input action should stay simple and
	# carry the player straight toward the attacking goal.
	for opponent in match_node.teams[1]:
		opponent.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.end.x - 120.0,
			ChessFootballMath.PITCH_RECT.position.y + 100.0 + opponent.squad_index * 180.0,
		)
	match_node.ball.attach_to(dribbler)
	assert(dribbler.debug_dribble_ready())
	auto_lane = match_node.debug_auto_dribble_direction(dribbler)
	assert(auto_lane.x > 0.99)
	assert(absf(auto_lane.y) < 0.01)
	print("SMOKE_STAGE=dribble")

	# Keeper distribution should not donate the ball back to a nearby attacker:
	# wait briefly when no safe outlet exists, use a short pass once a teammate
	# is genuinely free, and clear long when pressed or the waiting window expires.
	var ai_keeper: Footballer = match_node.teams[1][0]
	ai_keeper.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x - 110.0,
		ChessFootballMath.PITCH_RECT.get_center().y,
	)
	for teammate in match_node.teams[1]:
		if teammate == ai_keeper:
			continue
		teammate.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.get_center().x,
			ChessFootballMath.PITCH_RECT.position.y + 140.0 + teammate.squad_index * 180.0,
		)
	for opponent in match_node.teams[0]:
		opponent.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.position.x + 140.0,
			ChessFootballMath.PITCH_RECT.position.y + 120.0 + opponent.squad_index * 190.0,
		)
	var outlet_candidate: Footballer = match_node.teams[1][1]
	outlet_candidate.global_position = ai_keeper.global_position + Vector2(-250.0, 40.0)
	var outlet_marker: Footballer = match_node.teams[0][1]
	outlet_marker.global_position = outlet_candidate.global_position + Vector2(38.0, 0.0)
	var keeper_plan: Dictionary = match_node.debug_keeper_distribution_plan(ai_keeper, 0.8)
	assert(String(keeper_plan["kind"]) == "hold")

	outlet_marker.global_position = ChessFootballMath.PITCH_RECT.position + Vector2(180.0, 180.0)
	keeper_plan = match_node.debug_keeper_distribution_plan(ai_keeper, 0.8)
	assert(String(keeper_plan["kind"]) == "short")
	assert(keeper_plan["target"] == outlet_candidate)

	for teammate in match_node.teams[1]:
		if teammate == ai_keeper:
			continue
		teammate.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.get_center().x - 160.0,
			ChessFootballMath.PITCH_RECT.position.y + 120.0 + teammate.squad_index * 210.0,
		)
	var keeper_presser: Footballer = match_node.teams[0][4]
	keeper_presser.global_position = ai_keeper.global_position + Vector2(-120.0, 10.0)
	keeper_plan = match_node.debug_keeper_distribution_plan(ai_keeper, 0.4)
	assert(String(keeper_plan["kind"]) == "clear")
	keeper_presser.global_position = ChessFootballMath.PITCH_RECT.position + Vector2(160.0, 120.0)
	keeper_plan = match_node.debug_keeper_distribution_plan(ai_keeper, 2.3)
	assert(String(keeper_plan["kind"]) == "clear")
	print("SMOKE_STAGE=keeper-distribution")

	# Layered pressing: one AI player attacks the carrier, a second takes the
	# goal-side cover lane, while supporting runners advance beyond possession.
	var press_carrier: Footballer = match_node.teams[0][4]
	press_carrier.global_position = ChessFootballMath.PITCH_RECT.get_center()
	match_node.ball.attach_to(press_carrier)
	var rival_defender: Footballer = match_node.teams[1][1]
	var rival_midfielder: Footballer = match_node.teams[1][2]
	var rival_wing: Footballer = match_node.teams[1][3]
	var rival_forward: Footballer = match_node.teams[1][4]
	rival_defender.global_position = press_carrier.global_position + Vector2(210.0, 25.0)
	rival_midfielder.global_position = press_carrier.global_position + Vector2(255.0, -85.0)
	rival_wing.global_position = press_carrier.global_position + Vector2(470.0, 180.0)
	rival_forward.global_position = press_carrier.global_position + Vector2(610.0, -210.0)
	var primary_presser: Footballer = match_node.debug_ai_primary_presser(1)
	var secondary_presser: Footballer = match_node.debug_ai_secondary_presser(1)
	assert(primary_presser == rival_defender)
	assert(secondary_presser == rival_midfielder)
	var cover_target: Vector2 = match_node.debug_ai_cover_target(
		secondary_presser,
		press_carrier.global_position,
	)
	var rival_own_goal: Vector2 = ChessFootballMath.goal_center(0)
	assert(cover_target.distance_to(rival_own_goal) < press_carrier.global_position.distance_to(rival_own_goal))

	var ai_ball_carrier: Footballer = rival_forward
	ai_ball_carrier.global_position = ChessFootballMath.PITCH_RECT.get_center()
	match_node.ball.attach_to(ai_ball_carrier)
	rival_wing.home_position = ai_ball_carrier.global_position + Vector2(120.0, 220.0)
	var support_target: Vector2 = match_node.debug_ai_support_target(rival_wing)
	assert(support_target.x < ai_ball_carrier.global_position.x - 180.0)
	assert(absf(support_target.y - ai_ball_carrier.global_position.y) > 40.0)
	print("SMOKE_STAGE=ai-pressure-support")

	# Adaptive difficulty is bounded and changes intelligence rather than physics.
	# Human dominance can raise the CPU by one notch, opposite dominance walks it
	# back through neutral, and it never jumps beyond the [-1, +1] band.
	assert(match_node.debug_ai_adaptive_level() == 0)
	var normal_decision_interval: float = match_node.debug_ai_adaptive_decision_interval()
	match_node.debug_set_ai_adaptation_window(8.0, 0.0)
	match_node.debug_evaluate_ai_adaptation()
	assert(match_node.debug_ai_adaptive_level() == 1)
	assert(match_node.debug_ai_adaptive_decision_interval() < normal_decision_interval)
	match_node.debug_set_ai_adaptation_window(0.0, 8.0)
	match_node.debug_evaluate_ai_adaptation()
	assert(match_node.debug_ai_adaptive_level() == 0)
	match_node.debug_set_ai_adaptation_window(0.0, 8.0)
	match_node.debug_evaluate_ai_adaptation()
	assert(match_node.debug_ai_adaptive_level() == -1)
	assert(match_node.debug_ai_adaptive_decision_interval() > normal_decision_interval)
	match_node.debug_set_ai_adaptation_window(0.0, 0.0)
	match_node.debug_evaluate_ai_adaptation()
	assert(match_node.debug_ai_adaptive_level() == 0)
	print("SMOKE_STAGE=ai-adaptive")

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
	# Tackle assertions are a separate contract from the goal-frame block above.
	# Clear any action/cooldown residue so this section never depends on which
	# player happened to be controlled by an earlier restart.
	tackler._process(2.0)
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
	var glancing_hitbox: Dictionary = match_node.debug_tackle_hitbox(tackler, Vector2(680.0, 530.0))
	assert(bool(glancing_hitbox["contact"]))
	assert(not bool(glancing_hitbox["inside"]))
	assert(not bool(glancing_hitbox["foul"]))

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

	match_node.ball.release(Vector2.LEFT, 760.0)
	match_node.ball.global_position = keeper.global_position + Vector2(52.0, 30.0)
	match_node.ball.flight_height = 16.0
	assert(not match_node.debug_try_keeper_save(keeper))
	assert(match_node.ball.carrier == null)

	match_node.ball.global_position = keeper.global_position + Vector2(38.0, 20.0)
	match_node.ball.velocity = Vector2.LEFT * 920.0
	match_node.ball.flight_height = 48.0
	assert(not match_node.debug_try_keeper_save(keeper))
	assert(match_node.ball.carrier == null)

	match_node.ball.global_position = keeper.global_position + Vector2(42.0, 26.0)
	match_node.ball.velocity = Vector2.LEFT * 760.0
	match_node.ball.flight_height = 18.0
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
	var rival_keeper_outlet: Footballer = match_node.teams[1][1]
	rival_keeper_outlet.global_position = rival_keeper.global_position + Vector2(-250.0, 55.0)
	for human_player in match_node.teams[0]:
		human_player.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.position.x + 140.0,
			ChessFootballMath.PITCH_RECT.position.y + 120.0 + human_player.squad_index * 190.0,
		)
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

	rival.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.position.x + 590.0,
		ChessFootballMath.PITCH_RECT.get_center().y
	)
	match_node.ball.attach_to(rival)
	match_node.debug_force_ai_attack(rival)
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.x < 0.0)
	assert(match_node.ball.velocity.length() >= 700.0)
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
	assert(safe_span >= 100.0)
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
	# Desktop parity: the real Space action charges pass power just like touch.
	# Press starts the meter, hold increases power, release executes the pass,
	# and desktop keeps control on the passer as before.
	var desktop_passer: Footballer = match_node.teams[0][2]
	desktop_passer.global_position = Vector2(980.0, 620.0)
	match_node._select_player(desktop_passer)
	match_node.ball.attach_to(desktop_passer)
	Input.action_release("pass_ball")
	Input.action_press("pass_ball")
	match_node._handle_human(0.01)
	assert(match_node.debug_pass_charge_ratio() > 0.0)
	var desktop_target: Footballer = match_node.debug_pass_target()
	assert(desktop_target != null)
	assert(desktop_target.team_id == 0)
	assert(desktop_target != desktop_passer)
	match_node._handle_human(0.68)
	assert(match_node.debug_pass_charge_ratio() > 0.70)
	match_node.debug_refresh_hud()
	assert(match_node.shot_meter.visible)
	assert(match_node.shot_meter_label.text == "PASE LARGO")
	var desktop_passer_before: Footballer = match_node.controlled
	Input.action_release("pass_ball")
	match_node._handle_human(0.01)
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 900.0)
	assert(match_node.ball.velocity.x > 0.0)
	assert(match_node.controlled == desktop_passer_before)
	print("SMOKE_STAGE=desktop-pass-charge")

	assert(not match_node.debug_pause_menu_open())
	assert(match_node.debug_pause_button_text() == "MENÚ")
	assert(match_node.debug_pause_first_option() == "SALIR")
	assert(match_node.pause_menu_button.anchor_left == 1.0)
	assert(match_node.pause_menu_button.anchor_right == 1.0)
	assert(match_node.pause_menu_button.offset_left < 0.0)
	assert(match_node.pause_menu_button.offset_right <= 0.0)
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

	# Broadcast follow must absorb a sudden ball relocation instead of snapping
	# its focal target in a single frame.
	var presenter: ChessFootball3DPresenter = match_node.presentation_3d
	var previous_focus_x := presenter.debug_camera_smoothed_focus_x()
	var camera_probe_world_x := (
		ChessFootballMath.PITCH_RECT.end.x - 80.0
		if previous_focus_x <= 0.0
		else ChessFootballMath.PITCH_RECT.position.x + 80.0
	)
	match_node.ball.global_position = Vector2(
		camera_probe_world_x,
		ChessFootballMath.PITCH_RECT.get_center().y,
	)
	match_node.ball.velocity = Vector2.ZERO
	var raw_focus_x := presenter.world_to_stage(match_node.ball.global_position).x
	presenter.sync_presentation(1.0 / 60.0, "broadcast")
	var smoothed_focus_step := absf(presenter.debug_camera_smoothed_focus_x() - previous_focus_x)
	var raw_focus_step := absf(raw_focus_x - previous_focus_x)
	assert(raw_focus_step > 1.0)
	assert(smoothed_focus_step < raw_focus_step * 0.20)

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
