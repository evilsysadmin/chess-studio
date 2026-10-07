extends SceneTree

func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var match_node = packed.instantiate()
	root.add_child(match_node)

	for _frame in range(8):
		await process_frame
		await physics_frame

	# Pin a real pre-kickoff tableau: both teams in their own halves and the
	# selected team standing over the centre spot.
	match_node.debug_prepare_kickoff(0)
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "kickoff", "VISUAL_CAPTURE_KICKOFF")
	match_node.debug_force_kickoff_ready()
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.length() > 0.0)
	var mobile_controls = match_node.get_node_or_null("MobileControls")
	assert(mobile_controls != null)
	mobile_controls.debug_force_controls_visible(true)
	var joystick_origin := Vector2(135.0, 605.0)
	assert(mobile_controls.debug_touch_down(91, joystick_origin))
	mobile_controls.debug_touch_move(91, joystick_origin + Vector2(52.0, -18.0))
	match_node.controlled.debug_set_stamina(55.0)
	await process_frame
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "kickoff-touch", "VISUAL_CAPTURE_KICKOFF_TOUCH")
	match_node.controlled.debug_set_stamina(100.0)
	mobile_controls.debug_touch_up(91, joystick_origin + Vector2(52.0, -18.0))

	# Pin the peak of a real contextual dribble: possession remains attached but
	# the ball is visibly touched outside the ordinary running anchor.
	var review_dribbler: Footballer = match_node.teams[0][3]
	match_node._select_player(review_dribbler)
	review_dribbler.global_position = ChessFootballMath.PITCH_RECT.get_center()
	review_dribbler.velocity = Vector2.ZERO
	match_node.ball.attach_to(review_dribbler)
	assert(match_node.debug_try_dribble(Vector2(1.0, -0.55)))
	review_dribbler._process(0.10)
	review_dribbler.move_human(0.08, Vector2.ZERO, false)
	match_node.ball.tick_ball(0.0)
	assert(review_dribbler.debug_dribble_active())
	assert(match_node.ball.carrier == review_dribbler)
	match_node.debug_focus_presentation()
	await _save_capture(match_node, "dribble", "VISUAL_CAPTURE_DRIBBLE")
	review_dribbler._process(0.70)

	var pass_passer: Footballer = match_node.teams[0][2]
	var pass_receiver: Footballer = match_node.teams[0][3]
	match_node._select_player(pass_passer)
	match_node.ball.attach_to(pass_passer)
	match_node.debug_sync_presentation()
	var pass_target_screen: Vector2 = match_node.mobile_player_screen_position(pass_receiver)
	assert(mobile_controls.debug_touch_down(92, pass_target_screen))
	match_node._handle_human(0.68)
	match_node.debug_refresh_hud()
	assert(match_node.shot_meter.visible)
	assert(match_node.shot_meter_label.text == "PASE LARGO")
	await _save_capture(match_node, "pass-charge", "VISUAL_CAPTURE_PASS_CHARGE")
	mobile_controls.debug_touch_up(92, pass_target_screen)

	mobile_controls.debug_force_controls_visible(false)
	await process_frame
	# Keep the shot-review tableau deterministic. The dribble review leaves the
	# selected attacker near midfield; without isolating opponents here, a real
	# AI tackle may legitimately cancel the charged shot during _save_capture's
	# process frame and make visual evidence timing-dependent.
	for opponent in match_node.teams[1]:
		opponent.global_position = Vector2(
			ChessFootballMath.PITCH_RECT.end.x - 180.0,
			ChessFootballMath.PITCH_RECT.position.y + 150.0 + opponent.squad_index * 190.0,
		)
		opponent.velocity = Vector2.ZERO
	match_node.controlled.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.get_center().x - 420.0,
		ChessFootballMath.PITCH_RECT.get_center().y,
	)
	match_node.controlled.velocity = Vector2.ZERO
	match_node.ball.attach_to(match_node.controlled)
	match_node.debug_force_shot_charge(0.68)
	await process_frame
	await _save_capture(match_node, "broadcast", "VISUAL_CAPTURE_BROADCAST")

	match_node.debug_release_charged_shot()
	# Advance the real ball simulation deterministically instead of letting the
	# surrounding AI/claim loop race the review capture.
	match_node.ball.tick_ball(0.10)
	assert(match_node.ball.flight_height > 0.0)
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "airborne", "VISUAL_CAPTURE_AIRBORNE")

	# Explicitly review both extremes: a near-ground driven shot and a fully
	# charged blast. The old single airborne frame could hide profile collapse.
	match_node.ball.attach_to(match_node.controlled)
	match_node.debug_force_shot_charge(0.12)
	match_node.debug_release_charged_shot()
	match_node.ball.tick_ball(0.08)
	assert(match_node.ball.flight_height < 8.0)
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "drive", "VISUAL_CAPTURE_DRIVE")

	match_node.ball.attach_to(match_node.controlled)
	match_node.debug_force_shot_charge(1.0)
	match_node.debug_release_charged_shot()
	match_node.ball.tick_ball(0.10)
	assert(match_node.ball.flight_height > 30.0)
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "blast", "VISUAL_CAPTURE_BLAST")

	# Goal-frame review: pin the ball immediately after real collision response,
	# then snap the broadcast camera to the goal so the rebound is legible.
	var frame_goal_x: float = ChessFootballMath.PITCH_RECT.end.x
	var frame_center_y: float = ChessFootballMath.PITCH_RECT.get_center().y
	var frame_post_y: float = frame_center_y - ChessFootballMath.GOAL_HALF_HEIGHT

	match_node.ball.attach_to(match_node.controlled)
	match_node.ball.release(Vector2.RIGHT, 980.0)
	var post_previous := Vector2(frame_goal_x - 18.0, frame_post_y)
	match_node.ball.global_position = Vector2(frame_goal_x + 12.0, frame_post_y)
	match_node.ball.flight_height = 18.0
	assert(match_node.debug_resolve_goal_frame_collision(post_previous, 18.0) == "post")
	assert(match_node.ball.velocity.x < 0.0)
	match_node.debug_focus_presentation()
	await _save_capture(match_node, "post", "VISUAL_CAPTURE_POST")

	match_node.ball.attach_to(match_node.controlled)
	match_node.ball.release(Vector2.RIGHT, 1080.0, 190.0)
	var crossbar_previous := Vector2(frame_goal_x - 18.0, frame_center_y)
	match_node.ball.global_position = Vector2(frame_goal_x + 12.0, frame_center_y)
	match_node.ball.flight_height = ChessFootballMath.GOAL_FRAME_CROSSBAR_HEIGHT
	match_node.ball.vertical_velocity = 55.0
	assert(
		match_node.debug_resolve_goal_frame_collision(
			crossbar_previous,
			ChessFootballMath.GOAL_FRAME_CROSSBAR_HEIGHT,
		) == "crossbar"
	)
	assert(match_node.ball.velocity.x < 0.0)
	assert(match_node.ball.vertical_velocity < 0.0)
	match_node.debug_focus_presentation()
	await _save_capture(match_node, "crossbar", "VISUAL_CAPTURE_CROSSBAR")

	# Keeper review: drive a save to one side, advance the save state to its
	# strongest silhouette and keep the caught ball anchored to the keeper.
	var review_keeper: Footballer = match_node.teams[1][0]
	review_keeper.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x - 110.0,
		ChessFootballMath.PITCH_RECT.get_center().y,
	)
	match_node.ball.release(Vector2.RIGHT, 760.0)
	match_node.ball.global_position = review_keeper.global_position + Vector2(-42.0, 26.0)
	match_node.ball.velocity = Vector2.RIGHT * 760.0
	assert(match_node.debug_try_keeper_save(review_keeper))
	assert(review_keeper.debug_keeper_save_active())
	assert(review_keeper.debug_keeper_save_direction() > 0.0)
	review_keeper._process(0.29)
	if review_keeper.visual != null and String(review_keeper.visual.animation) == "tackle":
		review_keeper.visual.pause()
		review_keeper.visual.frame = 4
	match_node.debug_focus_presentation()
	await _save_capture(match_node, "keeper-save", "VISUAL_CAPTURE_KEEPER_SAVE")

	match_node.debug_toggle_camera_mode()
	for _frame in range(10):
		await process_frame
		await physics_frame
	await _save_capture(match_node, "tactical", "VISUAL_CAPTURE_TACTICAL")

	# Freeze a readable tackle-contact beat: victim recoils, ball is loose, then
	# the normal delayed claim resolves in gameplay.
	match_node.debug_toggle_camera_mode()
	var tackler: Footballer = match_node.teams[0][1]
	var victim: Footballer = match_node.teams[1][2]
	# Earlier visual states may leave the controlled player action-locked by a
	# shot. Use a dedicated defender and clear any incidental animation lock so
	# this capture proves tackle contact, not prior-state timing.
	tackler._process(2.0)
	tackler.global_position = Vector2(640.0, 500.0)
	victim.global_position = Vector2(668.0, 500.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	match_node.ball.attach_to(victim)
	assert(match_node.debug_try_tackle(tackler))
	assert(match_node.ball.carrier == null)
	assert(victim.contact_stun_active())
	# Freeze the players at the impact pose, but advance only the loose ball so
	# the deflection is visible outside both silhouettes.
	tackler.velocity = Vector2.ZERO
	victim.velocity = Vector2.ZERO
	assert(tackler.global_position.distance_to(victim.global_position) > 50.0)
	if tackler.visual != null and String(tackler.visual.animation) == "tackle":
		tackler.visual.pause()
		tackler.visual.frame = 4
	# Runtime smoke owns the real deflection timing contract. For the visual
	# review, pin the already-loose ball just outside the silhouettes so render
	# timing cannot make the screenshot flaky on main.
	var visual_ball_direction: Vector2 = match_node.ball.velocity.normalized()
	if visual_ball_direction.length_squared() < 0.001:
		visual_ball_direction = Vector2.RIGHT
	match_node.ball.global_position = tackler.global_position + visual_ball_direction * 30.0
	assert(match_node.ball.carrier == null)
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "contact", "VISUAL_CAPTURE_CONTACT")

	# Shift+E uses the same authored tackle atlas but a much lower, longer
	# runtime silhouette so the risky slide reads immediately.
	tackler._process(2.0)
	tackler.global_position = Vector2(760.0, 620.0)
	victim.global_position = Vector2(798.0, 620.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	match_node.ball.attach_to(victim)
	assert(match_node.debug_try_tackle(tackler, true))
	assert(tackler.debug_tackle_aggressive())
	if tackler.visual != null and String(tackler.visual.animation) == "tackle":
		tackler.visual.pause()
		tackler.visual.frame = 4
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "slide-tackle", "VISUAL_CAPTURE_SLIDE_TACKLE")

	# A reckless Shift+E challenge inside the box produces both the booking
	# notice and a penalty. Use a lateral, forward contact so it is yellow, not
	# the straight-red "from behind" case.
	match_node.debug_force_set_piece_ready()
	var penalty_tackler: Footballer = match_node.teams[1][1]
	var penalty_victim: Footballer = match_node.teams[0][4]
	var penalty_goal := ChessFootballMath.goal_center(0)
	var penalty_foul_spot := Vector2(penalty_goal.x - 120.0, penalty_goal.y)
	penalty_tackler._process(2.0)
	penalty_tackler.global_position = penalty_foul_spot + Vector2(-24.0, -28.0)
	penalty_tackler.velocity = Vector2.RIGHT * penalty_tackler.base_speed
	penalty_victim.global_position = penalty_foul_spot
	match_node.ball.attach_to(penalty_victim)
	assert(match_node.debug_try_tackle(penalty_tackler, true))
	assert(penalty_tackler.debug_yellow_cards() == 1)
	assert(not penalty_tackler.debug_sent_off())
	assert(match_node.debug_set_piece_kind() == "PENALTI")
	match_node.debug_refresh_hud()
	match_node.debug_focus_presentation()
	await _save_capture(match_node, "penalty", "VISUAL_CAPTURE_PENALTY")

	# Once the whistle freeze ends, the human penalty remains live instead of
	# auto-firing. The amber goal marker must track the chosen W/S aim.
	match_node.debug_force_set_piece_ready()
	assert(match_node.debug_set_piece_active())
	assert(match_node.debug_human_penalty_ready())
	match_node.debug_set_penalty_aim(-0.72)
	match_node.debug_refresh_hud()
	match_node.debug_sync_presentation()
	assert(match_node.debug_penalty_aim_visible())
	await _save_capture(match_node, "penalty-aim", "VISUAL_CAPTURE_PENALTY_AIM")

	# Build a readable goal tableau instead of reusing the tackle setup.
	match_node.debug_prepare_kickoff(0)
	match_node.debug_force_kickoff_ready()
	var scorer: Footballer = match_node.teams[0][4]
	scorer.global_position = ChessFootballMath.goal_center(0) - Vector2(130.0, 0.0)
	match_node.ball.release(Vector2.RIGHT, 0.0)
	match_node.ball.global_position = ChessFootballMath.goal_center(0) + Vector2(28.0, 0.0)
	match_node.debug_score_goal(0)
	assert(match_node.debug_goal_restart_active())
	# Pin a readable mid-pose directly. Visual review must not depend on wall
	# clock/frame duration or sprite import/render cost.
	for player in match_node.teams[0]:
		if player.visual != null and String(player.visual.animation) == "celebrate":
			player.visual.pause()
			player.visual.frame = 4
	assert(match_node.debug_goal_restart_active())
	match_node.debug_refresh_hud()
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "goal", "VISUAL_CAPTURE_GOAL")
	match_node.debug_force_goal_restart_ready()
	assert(match_node.debug_kickoff_active())
	assert(match_node.debug_kickoff_team() == 1)
	match_node.debug_refresh_hud()
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "restart", "VISUAL_CAPTURE_RESTART")
	match_node.debug_force_kickoff_ready()

	# Review real out-of-play restarts instead of letting the ball disappear
	# beyond the pitch forever.
	match_node.ball.attach_to(match_node.teams[0][3])
	match_node.ball.release(Vector2.UP, 420.0)
	match_node.ball.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.get_center().x + 210.0,
		ChessFootballMath.PITCH_RECT.position.y - 24.0
	)
	match_node.debug_check_ball_out()
	assert(match_node.debug_set_piece_kind() == "SAQUE DE BANDA")
	match_node.debug_refresh_hud()
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "throw-in", "VISUAL_CAPTURE_THROW_IN")
	match_node.debug_force_set_piece_ready()

	match_node.ball.attach_to(match_node.teams[1][1])
	match_node.ball.release(Vector2.RIGHT, 520.0)
	match_node.ball.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x + 24.0,
		ChessFootballMath.PITCH_RECT.position.y + 44.0
	)
	match_node.debug_check_ball_out()
	assert(match_node.debug_set_piece_kind() == "CÓRNER")
	match_node.debug_refresh_hud()
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "corner", "VISUAL_CAPTURE_CORNER")

	match_node.debug_toggle_pause_menu()
	for _frame in range(4):
		await process_frame
	await _save_capture(match_node, "menu", "VISUAL_CAPTURE_MENU")

	# Full source atlases are review evidence too: every animation and every
	# authored frame must remain inspectable instead of trusting one runtime pose.
	await _save_texture_preview(
		"res://assets/players/fc_matthias_atlas.svg",
		"atlas-fc-matthias",
		"VISUAL_CAPTURE_ATLAS_FC_MATTHIAS",
	)
	await _save_texture_preview(
		"res://assets/players/real_enroque_atlas.svg",
		"atlas-real-enroque",
		"VISUAL_CAPTURE_ATLAS_REAL_ENROQUE",
	)
	for variant_index in range(2, 5):
		await _save_texture_preview(
			"res://assets/players/fc_matthias_v%d_atlas.svg" % variant_index,
			"atlas-fc-matthias-v%d" % variant_index,
			"VISUAL_CAPTURE_ATLAS_FC_MATTHIAS_V%d" % variant_index,
		)
		await _save_texture_preview(
			"res://assets/players/real_enroque_v%d_atlas.svg" % variant_index,
			"atlas-real-enroque-v%d" % variant_index,
			"VISUAL_CAPTURE_ATLAS_REAL_ENROQUE_V%d" % variant_index,
		)
	await _save_texture_preview(
		"res://assets/players/fc_matthias_keeper_atlas.svg",
		"atlas-fc-matthias-keeper",
		"VISUAL_CAPTURE_ATLAS_FC_MATTHIAS_KEEPER",
	)
	await _save_texture_preview(
		"res://assets/players/real_enroque_keeper_atlas.svg",
		"atlas-real-enroque-keeper",
		"VISUAL_CAPTURE_ATLAS_REAL_ENROQUE_KEEPER",
	)
	quit(0)

func _save_texture_preview(source_path: String, filename: String, marker: String) -> void:
	var texture := load(source_path) as Texture2D
	assert(texture != null, "No se pudo cargar atlas de Chess Football")
	var image := texture.get_image()
	assert(image != null and not image.is_empty(), "Atlas de Chess Football vacío")
	var path := "user://chess-football-%s.png" % filename
	var error := image.save_png(path)
	assert(error == OK, "No se pudo escribir preview de atlas")
	print("%s=%s" % [marker, ProjectSettings.globalize_path(path)])
	await process_frame

func _save_capture(match_node: Node, filename: String, marker: String) -> void:
	await process_frame
	var image := match_node.get_viewport().get_texture().get_image()
	assert(image != null and not image.is_empty(), "No se pudo capturar Chess Football")
	var path := "user://chess-football-%s.png" % filename
	var error := image.save_png(path)
	assert(error == OK, "No se pudo escribir la captura de Chess Football")
	print("%s=%s" % [marker, ProjectSettings.globalize_path(path)])
