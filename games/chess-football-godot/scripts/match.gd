extends Node2D

const Presenter3D = preload("res://scripts/football_3d_presenter.gd")
const TEAM_SIZE := 5
const ROLES := ["keeper", "defender", "midfielder", "wing", "forward"]
const TEAM_COLORS := [Color(0.12, 0.42, 0.92), Color(0.86, 0.18, 0.2)]

const CAMERA_MODE_BROADCAST := "broadcast"
const CAMERA_MODE_TACTICAL := "tactical"

const TACKLE_ATTEMPT_RANGE := 60.0
const TACKLE_CLEAN_STEAL_RANGE := 34.0
const TACKLE_BASE_SUCCESS_RANGE := 38.0
const TACKLE_APPROACH_BONUS := 13.0

const KEEPER_LINE_OFFSET := 96.0
const KEEPER_PRESS_MAX_OFFSET := 170.0
const KEEPER_PRESS_TRIGGER_DISTANCE := 360.0
const KEEPER_TRACK_Y_RATIO := 0.78
const KEEPER_SAVE_RANGE := 74.0
const KEEPER_SAVE_MIN_SPEED := 280.0
const KEEPER_SAVE_Y_MARGIN := 62.0
const KEEPER_HOLD_SECONDS := 0.72

var teams: Array[Array] = [[], []]
var ball: FootballBall
var controlled: Footballer
var score := [0, 0]
var match_seconds: float = 0.0
var camera_mode: String = CAMERA_MODE_BROADCAST
var last_goal_text: String = ""
var camera_hint_seconds: float = 4.5
var presentation_3d: ChessFootball3DPresenter

var score_label: Label
var help_label: Label
var view_label: Label
var goal_label: Label

func _ready() -> void:
	_spawn_match()
	_select_player(teams[0][2])
	ball.attach_to(controlled)
	_create_3d_presentation()
	_create_hud()
	_refresh_hud()

func _physics_process(delta: float) -> void:
	match_seconds += delta
	camera_hint_seconds = maxf(0.0, camera_hint_seconds - delta)
	_handle_human()
	_update_ai(delta)
	ball.tick_ball(delta)
	_update_keeper_saves()
	_try_claim_loose_ball()
	_check_goal()
	_update_3d_presentation(delta)
	_refresh_hud()

func _create_3d_presentation() -> void:
	presentation_3d = Presenter3D.new()
	add_child(presentation_3d)
	presentation_3d.setup(self)

func _create_hud() -> void:
	var hud := CanvasLayer.new()
	hud.layer = 20
	add_child(hud)

	score_label = Label.new()
	score_label.position = Vector2(24, 18)
	score_label.add_theme_font_size_override("font_size", 24)
	score_label.add_theme_color_override("font_color", Color.WHITE)
	hud.add_child(score_label)

	help_label = Label.new()
	help_label.position = Vector2(24, 52)
	help_label.add_theme_font_size_override("font_size", 15)
	help_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.78))
	hud.add_child(help_label)

	view_label = Label.new()
	view_label.position = Vector2(24, 82)
	view_label.add_theme_font_size_override("font_size", 14)
	view_label.add_theme_color_override("font_color", Color(1.0, 0.84, 0.28))
	hud.add_child(view_label)

	goal_label = Label.new()
	goal_label.position = Vector2(0, 126)
	goal_label.size = Vector2(1280, 42)
	goal_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	goal_label.add_theme_font_size_override("font_size", 27)
	goal_label.add_theme_color_override("font_color", Color(1.0, 0.84, 0.28))
	hud.add_child(goal_label)

func _refresh_hud() -> void:
	score_label.text = "FC Matthias %d - %d Real Enroque" % [score[0], score[1]]
	help_label.text = "WASD · Shift sprint · Space pase · Enter tiro · E entrada · Tab cambia · V vista"
	var view_name := "BROADCAST 3D" if camera_mode == CAMERA_MODE_BROADCAST else "TÁCTICA AÉREA"
	view_label.text = "VISTA · %s" % view_name if camera_hint_seconds > 0.0 else ""
	goal_label.text = last_goal_text

func _handle_human() -> void:
	if Input.is_action_just_pressed("toggle_view"):
		_toggle_camera_mode()
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	controlled.move_human(direction, Input.is_action_pressed("sprint"))
	if Input.is_action_just_pressed("change_player"):
		_select_player(_best_switch_candidate())
	if Input.is_action_just_pressed("tackle") and not controlled.has_ball:
		_try_tackle(controlled)
	if Input.is_action_just_pressed("pass_ball") and ball.carrier == controlled:
		_pass_from(controlled, direction)
	if Input.is_action_just_pressed("shoot_ball") and ball.carrier == controlled:
		var target := ChessFootballMath.goal_center(0)
		controlled.play_action("shoot", 0.78)
		ball.release(target - controlled.global_position, 820.0)

func _update_ai(delta: float) -> void:
	for team_id in range(2):
		var team_has_ball := ball.carrier != null and ball.carrier.team_id == team_id
		for player in teams[team_id]:
			if player == controlled:
				continue
			if player.role == "keeper":
				_update_keeper_ai(player, delta)
				continue
			var target: Vector2 = player.home_position
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
			if not team_has_ball and ball.carrier != null and ball.carrier.team_id != team_id:
				if player == _nearest_player_to_ball(team_id):
					_try_tackle(player)
			if ball.carrier == player and team_id == 1:
				_ai_attack(player)

func _update_keeper_ai(player: Footballer, delta: float) -> void:
	var own_goal := ChessFootballMath.goal_center(1 - player.team_id)
	var away_from_goal := Vector2.RIGHT if player.team_id == 0 else Vector2.LEFT

	if ball.carrier == player:
		player.move_ai(delta, player.global_position, 0.5)
		if player.keeper_hold_active():
			return
		var outlet := _best_teammate_ahead(player)
		player.play_action("pass", 0.72)
		if outlet != null:
			ball.release(outlet.global_position - player.global_position, 520.0)
		else:
			ball.release(away_from_goal, 500.0)
		return

	var reference_position := ball.global_position
	if ball.carrier != null:
		reference_position = ball.carrier.global_position

	var y_limit := ChessFootballMath.GOAL_HALF_HEIGHT * KEEPER_TRACK_Y_RATIO
	var wanted_y := clampf(reference_position.y, own_goal.y - y_limit, own_goal.y + y_limit)
	var line_offset := KEEPER_LINE_OFFSET
	var danger_distance := absf(reference_position.x - own_goal.x)
	if ball.carrier != null and ball.carrier.team_id != player.team_id and danger_distance < KEEPER_PRESS_TRIGGER_DISTANCE:
		var pressure := 1.0 - danger_distance / KEEPER_PRESS_TRIGGER_DISTANCE
		line_offset = lerpf(KEEPER_LINE_OFFSET, KEEPER_PRESS_MAX_OFFSET, clampf(pressure, 0.0, 1.0))

	var target := Vector2(own_goal.x + away_from_goal.x * line_offset, wanted_y)
	player.move_ai(delta, target, 0.78)

func _update_keeper_saves() -> void:
	if ball.carrier != null:
		return
	for team_id in range(2):
		var keeper: Footballer = teams[team_id][0]
		if _keeper_try_save(keeper):
			return

func _keeper_try_save(keeper: Footballer) -> bool:
	if keeper.role != "keeper" or ball.carrier != null:
		return false
	if ball.velocity.length() < KEEPER_SAVE_MIN_SPEED:
		return false

	var pitch := ChessFootballMath.PITCH_RECT
	if ball.global_position.x < pitch.position.x or ball.global_position.x > pitch.end.x:
		return false

	var moving_toward_goal := ball.velocity.x < -60.0 if keeper.team_id == 0 else ball.velocity.x > 60.0
	if not moving_toward_goal:
		return false

	var own_goal := ChessFootballMath.goal_center(1 - keeper.team_id)
	if absf(ball.global_position.y - own_goal.y) > ChessFootballMath.GOAL_HALF_HEIGHT + KEEPER_SAVE_Y_MARGIN:
		return false
	if keeper.global_position.distance_to(ball.global_position) > KEEPER_SAVE_RANGE:
		return false

	keeper.play_action("tackle", 0.58)
	keeper.begin_keeper_hold(KEEPER_HOLD_SECONDS)
	ball.attach_to(keeper)
	if keeper.team_id == 0:
		_select_player(keeper)
	return true

func _ai_attack(player: Footballer) -> void:
	var goal := ChessFootballMath.goal_center(1)
	if player.global_position.distance_to(goal) < 380.0:
		player.play_action("shoot", 0.78)
		ball.release(goal - player.global_position, 760.0)
		return
	var target := _best_teammate_ahead(player)
	if target != null and player.global_position.distance_to(target.global_position) > 150.0:
		player.play_action("pass", 0.72)
		ball.release(target.global_position - player.global_position, 520.0)

func _pass_from(player: Footballer, input_direction: Vector2) -> void:
	player.play_action("pass", 0.72)
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
		var offset: Vector2 = teammate.global_position - player.global_position
		var distance: float = maxf(offset.length(), 1.0)
		var alignment := wanted.dot(offset / distance)
		var score_value := alignment * 800.0 - distance * 0.35
		if score_value > best_score:
			best_score = score_value
			best = teammate
	return best

func _best_teammate_ahead(player: Footballer) -> Footballer:
	var direction := Vector2.RIGHT if player.team_id == 0 else Vector2.LEFT
	return _best_pass_target(player, direction)

func _try_tackle(tackler: Footballer) -> bool:
	if ball.carrier == null or ball.carrier == tackler:
		return false
	var victim: Footballer = ball.carrier
	if victim.team_id == tackler.team_id or not tackler.can_tackle():
		return false

	var offset: Vector2 = victim.global_position - tackler.global_position
	var distance := offset.length()
	if distance > TACKLE_ATTEMPT_RANGE:
		return false

	var approach := 0.0
	if tackler.velocity.length_squared() > 16.0 and offset.length_squared() > 0.001:
		approach = maxf(0.0, tackler.velocity.normalized().dot(offset.normalized()))
	var success_range := TACKLE_BASE_SUCCESS_RANGE + TACKLE_APPROACH_BONUS * approach

	if not tackler.start_tackle():
		return false
	if distance > success_range:
		return false

	if distance <= TACKLE_CLEAN_STEAL_RANGE:
		ball.attach_to(tackler)
		if tackler.team_id == 0:
			_select_player(tackler)
		return true

	var poke_direction := offset.normalized() if offset.length_squared() > 0.001 else Vector2.RIGHT
	ball.release(poke_direction, 220.0)
	return true

func _try_claim_loose_ball() -> void:
	if ball.carrier != null or ball.velocity.length() > 560.0:
		return
	var best: Footballer = null
	var best_distance := 31.0
	for team in teams:
		for player in team:
			var distance: float = player.global_position.distance_to(ball.global_position)
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
		var distance: float = player.global_position.distance_squared_to(ball.global_position)
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
	for player in teams[team_id]:
		player.play_action("celebrate", 1.15)

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

func _toggle_camera_mode() -> void:
	camera_mode = CAMERA_MODE_TACTICAL if camera_mode == CAMERA_MODE_BROADCAST else CAMERA_MODE_BROADCAST
	camera_hint_seconds = 4.5

func _update_3d_presentation(delta: float) -> void:
	if presentation_3d != null:
		presentation_3d.sync_presentation(delta, camera_mode)

func _spawn_match() -> void:
	var left_x := [150.0, 420.0, 660.0, 760.0, 960.0]
	var lane_y := [500.0, 300.0, 500.0, 700.0, 500.0]
	for team_id in range(2):
		for index in range(TEAM_SIZE):
			var x: float = ChessFootballMath.PITCH_RECT.position.x + float(left_x[index])
			if team_id == 1:
				x = ChessFootballMath.PITCH_RECT.end.x - left_x[index]
			var position := Vector2(x, ChessFootballMath.PITCH_RECT.position.y + lane_y[index] * 0.82)
			var player := Footballer.new()
			add_child(player)
			player.configure(team_id, index, ROLES[index], position, TEAM_COLORS[team_id])
			player.visible = false
			teams[team_id].append(player)
	ball = FootballBall.new()
	ball.global_position = ChessFootballMath.PITCH_RECT.get_center()
	add_child(ball)
	ball.visible = false

func debug_team_counts() -> Array[int]:
	return [teams[0].size(), teams[1].size()]

func debug_ball_exists() -> bool:
	return is_instance_valid(ball)

func debug_pitch_exists() -> bool:
	return presentation_3d != null

func debug_camera_mode() -> String:
	return camera_mode

func debug_toggle_camera_mode() -> void:
	_toggle_camera_mode()

func debug_3d_ready() -> bool:
	return presentation_3d != null and presentation_3d.debug_camera_is_3d()

func debug_3d_animated_players() -> int:
	return presentation_3d.debug_animated_players() if presentation_3d != null else 0

func debug_try_tackle(player: Footballer) -> bool:
	return _try_tackle(player)

func debug_try_keeper_save(player: Footballer) -> bool:
	return _keeper_try_save(player)
