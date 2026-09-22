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
	assert(match_node.controlled != null)
	assert(match_node.ball.carrier == match_node.controlled)
	var initial_result: Dictionary = match_node.match_result_snapshot()
	assert(initial_result["schema"] == 1)
	assert(initial_result["resolution"] == "played")
	assert(initial_result["score"] == {"home": 0, "away": 0})
	assert(initial_result["events"].is_empty())

	match_node.match_seconds = 42.5
	match_node._score_goal(0)
	var after_goal: Dictionary = match_node.match_result_snapshot()
	assert(after_goal["score"] == {"home": 1, "away": 0})
	assert(after_goal["events"].size() == 1)
	assert(after_goal["events"][0]["type"] == "goal")
	assert(after_goal["events"][0]["second"] == 42)
	assert(after_goal["events"][0]["team_id"] == "fc-matthias")
	print("chess-football godot smoke: OK")
	quit(0)
