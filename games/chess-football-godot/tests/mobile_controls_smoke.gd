extends SceneTree

func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var match_node = packed.instantiate()
	root.add_child(match_node)

	for _frame in range(4):
		await process_frame
		await physics_frame

	var controls = match_node.get_node_or_null("MobileControls")
	assert(controls != null)
	controls.debug_force_controls_visible(true)
	await process_frame
	assert(controls.debug_controls_visible())

	var names: Array[String] = controls.debug_action_names()
	assert(names == ["change_player", "pass_ball", "shoot_ball", "sprint", "tackle"])
	assert(controls.debug_joystick_rect().size.x >= 180.0)
	assert(controls.debug_joystick_rect().size.y >= 180.0)
	for action in names:
		var rect: Rect2 = controls.debug_action_rect(action)
		assert(rect.size.x >= 100.0)
		assert(rect.size.y >= 52.0)

	match_node.debug_prepare_kickoff(0)
	match_node.debug_force_kickoff_ready()
	match_node.controlled._process(2.0)

	var before: Vector2 = match_node.controlled.global_position
	var joystick_center: Vector2 = controls.debug_joystick_center()
	controls.debug_touch_down(11, joystick_center + Vector2(72.0, 0.0))
	assert(Input.get_action_strength("move_right") > 0.70)
	assert(Input.get_action_strength("move_left") < 0.01)
	match_node._handle_human(0.12)
	assert(match_node.controlled.global_position.x > before.x)

	# Multi-touch is essential: the player must keep moving while charging a shot.
	controls.debug_touch_down(12, controls.debug_action_center("shoot_ball"))
	assert(Input.is_action_pressed("shoot_ball"))
	assert(Input.get_action_strength("move_right") > 0.70)
	controls.debug_touch_up(12, controls.debug_action_center("shoot_ball"))
	assert(not Input.is_action_pressed("shoot_ball"))
	assert(Input.get_action_strength("move_right") > 0.70)

	controls.debug_touch_up(11, joystick_center)
	assert(Input.get_action_strength("move_right") < 0.01)

	for action in ["sprint", "pass_ball", "tackle", "change_player"]:
		var center: Vector2 = controls.debug_action_center(action)
		controls.debug_touch_down(20, center)
		assert(Input.is_action_pressed(action))
		controls.debug_touch_up(20, center)
		assert(not Input.is_action_pressed(action))

	# Penalty aim uses the same move_up/move_down actions, so the joystick must
	# remain the single input authority for both open play and set pieces.
	controls.debug_touch_down(30, joystick_center + Vector2(0.0, -78.0))
	assert(Input.get_action_strength("move_up") > 0.80)
	controls.debug_touch_up(30, joystick_center)
	assert(Input.get_action_strength("move_up") < 0.01)

	controls.debug_force_controls_visible(false)
	assert(not controls.debug_controls_visible())
	print("chess-football mobile touch smoke: OK")
	quit(0)
