extends SceneTree

func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var match_node = packed.instantiate()
	root.add_child(match_node)

	for _frame in range(8):
		await process_frame
		await physics_frame

	# Make the visual contract deterministic even though real matches randomise
	# kickoff ownership.
	match_node.debug_force_kickoff_ready()
	match_node.ball.attach_to(match_node.controlled)
	match_node.debug_force_shot_charge(0.68)
	await process_frame
	await _save_capture(match_node, "broadcast", "VISUAL_CAPTURE_BROADCAST")

	match_node.debug_release_charged_shot()
	for _frame in range(8):
		await process_frame
		await physics_frame
	assert(match_node.ball.flight_height > 0.0)
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
