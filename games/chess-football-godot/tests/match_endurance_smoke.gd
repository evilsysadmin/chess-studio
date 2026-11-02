extends SceneTree

# Drive the actual match physics/AI through 90 seconds of simulated play, not
# isolated calls to individual helpers. This is deliberately headless and
# deterministic: no screenshot assertions or fake rendering timings.
const DELTA := 1.0 / 60.0
const TICKS := 5400

func _initialize() -> void:
	seed(44129)
	var scene := load("res://main.tscn") as PackedScene
	assert(scene != null)
	var match_node = scene.instantiate()
	root.add_child(match_node)
	await process_frame
	await process_frame
	match_node.set_process(false)
	match_node.set_physics_process(false)

	assert(match_node.teams.size() == 2)
	assert(match_node.debug_team_counts() == [5, 5])
	var pitch: Rect2 = ChessFootballMath.PITCH_RECT
	var initial_time: float = match_node.match_seconds
	var active_ticks := 0
	var loose_ticks := 0
	var cpu_carrier_ticks := 0
	var controlled_carrier_ticks := 0
	var goalie_ticks := 0
	var restart_ticks := 0
	var goal_seen := false
	var kickoff_after_goal := false
	var play_after_goal := false
	var goal_triggered := false
	var throw_triggered := false

	for tick in range(TICKS):
		# Controlled interventions exercise realistic match transitions. The
		# AI, ball, out-of-bounds, keeper and restart logic run on every tick.
		if tick == 900:
			var passer: Footballer = match_node.teams[0][4]
			match_node._select_player(passer)
			match_node.ball.attach_to(passer)
			match_node.ball.release(Vector2(1.0, 0.25), 800.0)
		if tick == 1800:
			match_node.ball.attach_to(match_node.teams[1][4])
		if tick == 2700:
			# Exercise a genuine touchline exit and its subsequent restart.
			var thrower: Footballer = match_node.teams[1][3]
			match_node.ball.attach_to(thrower)
			match_node.ball.release(Vector2.UP, 450.0)
			match_node.ball.global_position = Vector2(
				pitch.get_center().x, pitch.position.y - 25.0
			)
		if tick == 3900:
			# Inject a scoreboard event without depending on AI shot accuracy.
			# The actual celebration, kickoff and play recovery are simulated.
			match_node.goal_restart_active = false
			match_node.kickoff_active = false
			match_node.set_piece_active = false
			match_node._score_goal(0)
			goal_triggered = match_node.goal_restart_active
			assert(goal_triggered)
		match_node._physics_process(DELTA)

		if match_node.goal_restart_active and tick >= 3900:
			goal_seen = true
		if goal_seen and match_node.kickoff_active:
			kickoff_after_goal = true
		if kickoff_after_goal and not (
			match_node.kickoff_active or match_node.goal_restart_active
			or match_node.set_piece_active
		):
			play_after_goal = true
		if match_node.set_piece_active:
			restart_ticks += 1
			if tick >= 2700 and tick < 3900:
				throw_triggered = true
		if not (
			match_node.kickoff_active or match_node.goal_restart_active
			or match_node.set_piece_active
		):
			active_ticks += 1

		if match_node.ball.carrier == null:
			loose_ticks += 1
		elif match_node.ball.carrier.team_id == 1:
			cpu_carrier_ticks += 1
		else:
			controlled_carrier_ticks += 1
		if match_node.ball.carrier != null and match_node.ball.carrier.role == "keeper":
			goalie_ticks += 1

		# Check state at fixed intervals to keep the endurance job cheap.
		if tick % 60 == 0 or tick == TICKS - 1:
			assert(match_node.teams[0].size() == 5)
			assert(match_node.teams[1].size() == 5)
			assert(match_node.score[0] >= 0 and match_node.score[1] >= 0)
			assert(not is_nan(match_node.match_seconds))
			assert(match_node.ball.last_touch_team_id in [-1, 0, 1])
			assert(match_node.ball.flight_height >= 0.0)
			assert(not is_nan(match_node.ball.global_position.x))
			assert(not is_nan(match_node.ball.global_position.y))
			assert(not is_inf(match_node.ball.global_position.x))
			assert(not is_inf(match_node.ball.global_position.y))
			assert(not is_nan(match_node.ball.velocity.x))
			assert(not is_nan(match_node.ball.velocity.y))
			var holding := 0
			for side in range(2):
				for actor: Footballer in match_node.teams[side]:
					assert(not is_nan(actor.global_position.x))
					assert(not is_nan(actor.global_position.y))
					assert(not is_inf(actor.global_position.x))
					assert(not is_inf(actor.global_position.y))
					assert(actor.stamina >= 0.0 and actor.stamina <= actor.STAMINA_MAX)
					if actor.has_ball:
						holding += 1
						assert(actor == match_node.ball.carrier)
			assert(holding == (1 if match_node.ball.carrier != null else 0))
			if match_node.controlled != null:
				assert(not match_node.controlled.sent_off)
		if tick > 0 and tick % 1800 == 0:
			print("ENDURANCE_CHECKPOINT seconds=%d active=%d loose=%d" % [
				tick / 60, active_ticks, loose_ticks
			])

	assert(match_node.match_seconds >= initial_time + float(TICKS) * DELTA - 0.01)
	assert(active_ticks >= 900)
	assert(loose_ticks > 0)
	assert(cpu_carrier_ticks > 0)
	assert(controlled_carrier_ticks > 0)
	assert(throw_triggered)
	assert(restart_ticks > 0)
	assert(goal_triggered and goal_seen and kickoff_after_goal and play_after_goal)
	assert(match_node.score[0] >= 1)
	print("MATCH_ENDURANCE_90S_OK ticks=%d active=%d loose=%d cpu=%d human=%d keeper=%d restarts=%d goals=%d:%d" % [
		TICKS, active_ticks, loose_ticks, cpu_carrier_ticks, controlled_carrier_ticks,
		goalie_ticks, restart_ticks, match_node.score[0], match_node.score[1]
	])
	quit(0)
