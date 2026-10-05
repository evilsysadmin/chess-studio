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
	assert(match_node.controlled != null)
	assert(match_node.controlled.debug_visual_ready())
	assert(match_node.controlled.debug_animation_names().size() == 7)
	assert(match_node.controlled.debug_animation_names().has("shoot"))
	assert(match_node.ball.carrier == match_node.controlled)
	assert(match_node.debug_camera_mode() == "broadcast")
	match_node.debug_toggle_camera_mode()
	assert(match_node.debug_camera_mode() == "tactical")
	match_node.debug_toggle_camera_mode()
	assert(match_node.debug_camera_mode() == "broadcast")
	print("chess-football godot smoke: OK")
	quit(0)
