extends SceneTree

func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var match_node = packed.instantiate()
	root.add_child(match_node)

	for _frame in range(6):
		await process_frame
		await physics_frame

	var controls = match_node.get_node_or_null("MobileControls")
	assert(controls != null)
	controls.debug_force_controls_visible(true)
	await process_frame
	assert(controls.debug_controls_visible())
	assert(controls.debug_fixed_action_count() == 0)
	assert(not controls.debug_joystick_visible())

	match_node.debug_prepare_kickoff(0)
	match_node.debug_force_kickoff_ready()
	match_node.controlled._process(2.0)
	match_node.debug_sync_presentation()

	# Floating joystick appears under the left thumb and auto-sprints near the rim.
	var joystick_start := Vector2(132.0, 600.0)
	assert(controls.debug_touch_down(11, joystick_start))
	assert(controls.debug_joystick_visible())
	assert(controls.debug_joystick_origin().distance_to(joystick_start) < 4.0)
	controls.debug_touch_move(11, joystick_start + Vector2(68.0, 0.0))
	assert(Input.get_action_strength("move_right") > 0.80)
	assert(Input.is_action_pressed("sprint"))
	var before: Vector2 = match_node.controlled.global_position
	match_node._handle_human(0.12)
	assert(match_node.controlled.global_position.x > before.x)
	controls.debug_touch_up(11, joystick_start + Vector2(68.0, 0.0))
	assert(not controls.debug_joystick_visible())
	assert(Input.get_action_strength("move_right") < 0.01)
	assert(not Input.is_action_pressed("sprint"))

	# Tap a teammate while carrying the ball: direct contextual pass + control switch.
	var passer: Footballer = match_node.teams[0][2]
	var receiver: Footballer = match_node.teams[0][3]
	match_node._select_player(passer)
	match_node.ball.attach_to(passer)
	match_node.debug_sync_presentation()
	var receiver_screen: Vector2 = match_node.mobile_player_screen_position(receiver)
	assert(receiver_screen.x >= 0.0)
	assert(controls.debug_touch_down(20, receiver_screen))
	assert(controls.debug_touch_up(20, receiver_screen))
	assert(match_node.ball.carrier == null)
	assert(match_node.controlled == receiver)
	assert(match_node.ball.velocity.length() > 0.0)
	assert(match_node.ball.velocity.dot(receiver.global_position - passer.global_position) > 0.0)

	# Without possession, tapping a teammate simply selects them.
	match_node.ball.attach_to(match_node.teams[1][3])
	match_node.debug_sync_presentation()
	var defender: Footballer = match_node.teams[0][1]
	var defender_screen: Vector2 = match_node.mobile_player_screen_position(defender)
	assert(controls.debug_touch_down(21, defender_screen))
	assert(controls.debug_touch_up(21, defender_screen))
	assert(match_node.controlled == defender)

	# Tap the rival ball-carrier: choose the best nearby defender and attempt a tackle.
	var victim: Footballer = match_node.teams[1][2]
	var tackler: Footballer = match_node.teams[0][1]
	tackler._process(2.0)
	tackler.global_position = Vector2(640.0, 520.0)
	tackler.velocity = Vector2.RIGHT * tackler.base_speed
	victim.global_position = Vector2(690.0, 520.0)
	match_node.ball.attach_to(victim)
	match_node._select_player(tackler)
	match_node.debug_sync_presentation()
	var victim_screen: Vector2 = match_node.mobile_player_screen_position(victim)
	assert(controls.debug_touch_down(22, victim_screen))
	assert(controls.debug_touch_up(22, victim_screen))
	assert(match_node.ball.carrier == null or match_node.debug_set_piece_active())

	# Touch/hold the attacking goal: charge and release a real shot.
	match_node.debug_force_set_piece_ready()
	var shooter: Footballer = match_node.teams[0][4]
	shooter._process(2.0)
	shooter.global_position = Vector2(
		ChessFootballMath.PITCH_RECT.end.x - 480.0,
		ChessFootballMath.PITCH_RECT.get_center().y,
	)
	match_node._select_player(shooter)
	match_node.ball.attach_to(shooter)
	match_node.debug_sync_presentation()
	var goal_screen: Vector2 = match_node.mobile_attack_goal_screen_position()
	assert(goal_screen.x >= 0.0)
	assert(controls.debug_touch_down(23, goal_screen))
	match_node._handle_human(0.42)
	assert(match_node.debug_shot_charge_ratio() > 0.35)
	controls.debug_touch_move(23, goal_screen + Vector2(0.0, -70.0))
	assert(controls.debug_touch_up(23, goal_screen + Vector2(0.0, -70.0)))
	assert(match_node.ball.carrier == null)
	assert(match_node.ball.velocity.x > 0.0)

	# Rival penalty still uses the same floating joystick for keeper movement.
	match_node.debug_prepare_penalty(1)
	var keeper_y_before: float = match_node.teams[0][0].global_position.y
	assert(controls.debug_touch_down(30, joystick_start))
	controls.debug_touch_move(30, joystick_start + Vector2(0.0, -64.0))
	match_node._update_set_piece(0.16)
	assert(match_node.teams[0][0].global_position.y < keeper_y_before)
	controls.debug_touch_up(30, joystick_start + Vector2(0.0, -64.0))

	controls.debug_force_controls_visible(false)
	assert(not controls.debug_controls_visible())
	print("chess-football mobile touch smoke: OK")
	quit(0)
