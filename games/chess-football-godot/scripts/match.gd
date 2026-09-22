extends Node2D

const TEAM_SIZE := 5
const ROLES := ["keeper", "defender", "midfielder", "wing", "forward"]
const TEAM_COLORS := [Color(0.12, 0.42, 0.92), Color(0.86, 0.18, 0.2)]

var teams: Array[Array] = [[], []]
var ball: FootballBall
var controlled: Footballer
var score := [0, 0]
var match_seconds: float = 0.0
var camera: Camera2D
var last_goal_text: String = ""

func _ready() -> void:
	_spawn_match()
	_select_player(teams[0][2])
	ball.attach_to(controlled)
	camera = Camera2D.new()
	camera.zoom = Vector2(0.72, 0.72)
	add_child(camera)
	camera.global_position = ball.global_position
	queue_redraw()

func _physics_process(delta: float) -> void:
	match_seconds += delta
	_handle_human()
	_update_ai(delta)
	ball.tick_ball(delta)
	_try_claim_loose_ball()
	_check_goal()
	_update_camera(delta)
	queue_redraw()

func _handle_human() -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	controlled.move_human(direction, Input.is_action_pressed("sprint"))
	if Input.is_action_just_pressed("change_player"):
		_select_player(_best_switch_candidate())
	if Input.is_action_just_pressed("pass_ball") and ball.carrier == controlled:
		_pass_from(controlled, direction)
	if Input.is_action_just_pressed("shoot_ball") and ball.carrier == controlled:
		var target := ChessFootballMath.goal_center(0)
		ball.release(target - controlled.global_position, 820.0)

func _update_ai(delta: float) -> void:
	for team_id in range(2):
		var team_has_ball := ball.carrier != null and ball.carrier.team_id == team_id
		for player in teams[team_id]:
			if player == controlled:
				continue
			var target := player.home_position
			var intensity := 0.64
			if ball.carrier == null:
				if player == _nearest_player_to_ball(team_id):
					target = ball.global_position
					intensity = 0.95
			elif team_has_ball:
				var forward := 1.0 if team_id == 0 else -1.0
				target += Vector2(150.0 * forward, (player.squad_index - 2) * 18.0)
				intensity = 0.7
			else:
				if player == _nearest_player_to_ball(team_id):
					target = ball.carrier.global_position
					intensity = 0.92
			player.move_ai(delta, target, intensity)
			if ball.carrier == player and team_id == 1:
				_ai_attack(player)

func _ai_attack(player: Footballer) -> void:
	var goal := ChessFootballMath.goal_center(1)
	if player.global_position.distance_to(goal) < 380.0:
		ball.release(goal - player.global_position, 760.0)
		return
	var target := _best_teammate_ahead(player)
	if target != null and player.global_position.distance_to(target.global_position) > 150.0:
		ball.release(target.global_position - player.global_position, 520.0)

func _pass_from(player: Footballer, input_direction: Vector2) -> void:
	var target := _best_pass_target(player, input_direction)
	if target == null:
		var fallback := input_direction if input_direction.length_squared() > 0.001 else Vector2.RIGHT
		ball.release(fallback, 470.0)
		return
	ball.release(target.global_position - player.global_position, 540.0)

func _best_pass_target(player: Footballer, input_direction: Vector2) -> Footballer:
	var wanted := input_direction.normalized()
	if wanted.length_squared() < 0.001:
		wanted = Vector2.RIGHT if player.team_id == 0 else Vector2.LEFT
	var best: Footballer = null
	var best_score := -99999.0
	for teammate in teams[player.team_id]:
		if teammate == player:
			continue
		var delta := teammate.global_position - player.global_position
		var distance := maxf(delta.length(), 1.0)
		var alignment := wanted.dot(delta / distance)
		var score_value := alignment * 800.0 - distance * 0.35
		if score_value > best_score:
			best_score = score_value
			best = teammate
	return best

func _best_teammate_ahead(player: Footballer) -> Footballer:
	var direction := Vector2.RIGHT if player.team_id == 0 else Vector2.LEFT
	return _best_pass_target(player, direction)

func _try_claim_loose_ball() -> void:
	if ball.carrier != null or ball.velocity.length() > 560.0:
		return
	var best: Footballer = null
	var best_distance := 31.0
	for team in teams:
		for player in team:
			var distance := player.global_position.distance_to(ball.global_position)
			if distance < best_distance:
				best_distance = distance
				best = player
	if best != null:
		ball.attach_to(best)
		if best.team_id == 0:
			_select_player(best)

func _best_switch_candidate() -> Footballer:
	if ball.carrier != null and ball.carrier.team_id == 0:
		return ball.carrier
	return _nearest_player_to_ball(0)

func _nearest_player_to_ball(team_id: int) -> Footballer:
	var best: Footballer = teams[team_id][0]
	var best_distance := INF
	for player in teams[team_id]:
		var distance := player.global_position.distance_squared_to(ball.global_position)
		if distance < best_distance:
			best_distance = distance
			best = player
	return best

func _select_player(player: Footballer) -> void:
	if controlled != null:
		controlled.set_active(false)
	controlled = player
	controlled.set_active(true)

func _check_goal() -> void:
	if not ChessFootballMath.in_goal_mouth(ball.global_position):
		return
	if ball.global_position.x > ChessFootballMath.PITCH_RECT.end.x + 8.0:
		_score_goal(0)
	elif ball.global_position.x < ChessFootballMath.PITCH_RECT.position.x - 8.0:
		_score_goal(1)

func _score_goal(team_id: int) -> void:
	score[team_id] += 1
	last_goal_text = "GOAL · FC Matthias" if team_id == 0 else "GOAL · Real Enroque"
	_reset_kickoff(1 - team_id)

func _reset_kickoff(team_id: int) -> void:
	for id in range(2):
		for player in teams[id]:
			player.global_position = player.home_position
			player.velocity = Vector2.ZERO
	ball.global_position = ChessFootballMath.PITCH_RECT.get_center()
	ball.velocity = Vector2.ZERO
	var starter: Footballer = teams[team_id][2]
	ball.attach_to(starter)
	if team_id == 0:
		_select_player(starter)
	else:
		_select_player(_nearest_player_to_ball(0))

func _update_camera(delta: float) -> void:
	var target := ball.global_position
	camera.global_position = camera.global_position.lerp(target, clampf(delta * 3.5, 0.0, 1.0))

func _spawn_match() -> void:
	var left_x := [150.0, 420.0, 660.0, 760.0, 960.0]
	var lane_y := [500.0, 300.0, 500.0, 700.0, 500.0]
	for team_id in range(2):
		for index in range(TEAM_SIZE):
			var x := ChessFootballMath.PITCH_RECT.position.x + left_x[index]
			if team_id == 1:
				x = ChessFootballMath.PITCH_RECT.end.x - left_x[index]
			var position := Vector2(x, ChessFootballMath.PITCH_RECT.position.y + lane_y[index] * 0.82)
			var player := Footballer.new()
			add_child(player)
			player.configure(team_id, index, ROLES[index], position, TEAM_COLORS[team_id])
			teams[team_id].append(player)
	ball = FootballBall.new()
	ball.global_position = ChessFootballMath.PITCH_RECT.get_center()
	add_child(ball)

func debug_team_counts() -> Array[int]:
	return [teams[0].size(), teams[1].size()]

func debug_ball_exists() -> bool:
	return is_instance_valid(ball)

func _draw() -> void:
	var pitch := ChessFootballMath.PITCH_RECT
	draw_rect(pitch, Color(0.09, 0.36, 0.15), true)
	draw_rect(pitch, Color(0.92, 0.94, 0.88, 0.9), false, 4.0)
	draw_line(Vector2(pitch.get_center().x, pitch.position.y), Vector2(pitch.get_center().x, pitch.end.y), Color(1, 1, 1, 0.8), 3.0)
	draw_circle(pitch.get_center(), 105.0, Color(1, 1, 1, 0.8), false, 3.0)
	draw_circle(pitch.get_center(), 5.0, Color.WHITE)
	var goal_top := pitch.get_center().y - ChessFootballMath.GOAL_HALF_HEIGHT
	var goal_height := ChessFootballMath.GOAL_HALF_HEIGHT * 2.0
	draw_rect(Rect2(pitch.position.x - 24.0, goal_top, 24.0, goal_height), Color(1, 1, 1, 0.7), false, 3.0)
	draw_rect(Rect2(pitch.end.x, goal_top, 24.0, goal_height), Color(1, 1, 1, 0.7), false, 3.0)
	var font := ThemeDB.fallback_font
	draw_string(font, camera.global_position + Vector2(-570, -300), "FC Matthias %d - %d Real Enroque" % [score[0], score[1]], HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color.WHITE)
	draw_string(font, camera.global_position + Vector2(-570, -268), "WASD · Shift sprint · Space pass · Enter shoot · Tab change", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1,1,1,0.8))
	if not last_goal_text.is_empty():
		draw_string(font, camera.global_position + Vector2(-85, -210), last_goal_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(1.0, 0.84, 0.28))
