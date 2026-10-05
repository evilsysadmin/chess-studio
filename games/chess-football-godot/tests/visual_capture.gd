extends SceneTree

func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var match_node = packed.instantiate()
	root.add_child(match_node)

	for _frame in range(8):
		await process_frame
		await physics_frame
	await _save_capture(match_node, "broadcast", "VISUAL_CAPTURE_BROADCAST")

	match_node.debug_toggle_camera_mode()
	for _frame in range(36):
		await process_frame
		await physics_frame
	await _save_capture(match_node, "tactical", "VISUAL_CAPTURE_TACTICAL")

	match_node.debug_toggle_camera_mode()
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
