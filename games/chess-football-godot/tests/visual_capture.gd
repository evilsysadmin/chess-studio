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
	match_node.debug_sync_presentation()
	await _save_capture(match_node, "kickoff-touch", "VISUAL_CAPTURE_KICKOFF_TOUCH")
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

	match_node.debug_toggle_camera_mode()
	for _frame in range(10):
		await process_frame
		await physics_frame
	await _save_capture(match_node, "tactical", "VISUAL_CAPTURE_TACTICAL")

	# Freeze a readable tackle-contact beat: victim recoils, ball is loose, then
	# the normal delayed claim resolves in gameplay.
	match_node.debug_toggle_camera_mode()
	var tackler: Footballer = match_node.controlled
	var victim: Footballer = match_node.teams[1][2]
	tackler.global_position = Vector2(640.0, 500.0)
	victim.global_position = Vector2(668.0, 500.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	match_node.ball.attach_to(victim)
	assert(match_node.debug_try_tackle(tackler))
	assert(match_node.ball.carrier == null)
	for _frame in range(2):
		await process_frame
	assert(victim.contact_stun_active())
	await _save_capture(match_node, "contact", "VISUAL_CAPTURE_CONTACT")

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
	# clock/frame duration: heavier sprite banks can otherwise consume the whole
	# celebration before the screenshot is taken.
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

	match_node.debug_toggle_pause_menu()
	for _frame in range(4):
		await process_frame
	await _save_capture(match_node, "menu", "VISUAL_CAPTURE_MENU")
	quit(0)

func _save_capture(match_node: Node, filename: String, marker: String) -> void:
	await process_frame
	var image := match_node.get_viewport().get_texture().get_image()
	assert(image != null and not image.is_empty(), "No se pudo capturar Chess Football")
	var path := "user://chess-football-%s.png" % filename
	var error := image.save_png(path)
	assert(error == OK, "No se pudo escribir la captura de Chess Football")
	print("%s=%s" % [marker, ProjectSettings.globalize_path(path)])
