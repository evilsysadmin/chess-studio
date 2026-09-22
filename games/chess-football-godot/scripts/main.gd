extends Node2D

const Model = preload("res://scripts/match_model.gd")

var home: Array[Vector2] = []
var away: Array[Vector2] = []
var ball := Vector2(640, 360)
var ball_velocity := Vector2.ZERO
var active_home := 3
var possession_team := 1
var possession_index := 3
var last_move_dir := Vector2.RIGHT
var home_score := 0
var away_score := 0
var match_seconds := 0.0

func _ready() -> void:
	home = Model.home_formation()
	away = Model.away_formation()
	queue_redraw()

func _process(delta: float) -> void:
	match_seconds += delta
	_update_user(delta)
	_update_ai(delta)
	_update_ball(delta)
	_check_goal()
	queue_redraw()

func _update_user(delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if direction != Vector2.ZERO:
		last_move_dir = direction.normalized()
		home[active_home] = Model.clamp_player(home[active_home] + direction * Model.PLAYER_SPEED * delta)
		if possession_team == 1 and possession_index == active_home:
			ball = home[active_home] + last_move_dir * 24.0

	if Input.is_action_just_pressed("switch_player"):
		active_home = _nearest_home_to_ball()

	if Input.is_action_just_pressed("pass_ball") and possession_team == 1 and possession_index == active_home:
		var target := Model.nearest_teammate_index(home, active_home, last_move_dir)
		if target >= 0:
			ball = home[active_home]
			ball_velocity = Model.kick_velocity(ball, home[target], Model.PASS_SPEED)
			possession_team = 0
			possession_index = -1

	if Input.is_action_just_pressed("shoot_ball") and possession_team == 1 and possession_index == active_home:
		var target := Vector2(Model.AWAY_GOAL.position.x + 15.0, Model.AWAY_GOAL.get_center().y)
		ball = home[active_home]
		ball_velocity = Model.kick_velocity(ball, target, Model.SHOT_SPEED)
		possession_team = 0
		possession_index = -1

func _update_ai(delta: float) -> void:
	for i in range(away.size()):
		var anchor := Model.away_formation()[i]
		var target := anchor
		if i == _nearest_away_to_ball():
			target = ball
		away[i] = Model.clamp_player(away[i].move_toward(target, 125.0 * delta))

	for i in range(home.size()):
		if i == active_home:
			continue
		var anchor := Model.home_formation()[i]
		var target := anchor
		if possession_team != 1 and i == _nearest_home_to_ball():
			target = ball
		home[i] = Model.clamp_player(home[i].move_toward(target, 105.0 * delta))

	if possession_team == -1 and possession_index >= 0:
		var carrier := away[possession_index]
		var target := Vector2(Model.HOME_GOAL.end.x, Model.HOME_GOAL.get_center().y)
		away[possession_index] = Model.clamp_player(carrier.move_toward(target, 92.0 * delta))
		ball = away[possession_index] + Vector2.LEFT * 22.0
		if away[possession_index].x < 360.0:
			ball_velocity = Model.kick_velocity(ball, Model.HOME_GOAL.get_center(), Model.SHOT_SPEED * 0.78)
			possession_team = 0
			possession_index = -1

func _update_ball(delta: float) -> void:
	if possession_team != 0:
		return
	ball += ball_velocity * delta
	ball_velocity *= pow(Model.BALL_FRICTION, delta * 60.0)
	if ball_velocity.length() < 18.0:
		ball_velocity = Vector2.ZERO
	ball.x = clampf(ball.x, 72.0, 1208.0)
	ball.y = clampf(ball.y, 62.0, 658.0)

	var hi := _nearest_home_to_ball()
	if home[hi].distance_to(ball) < 24.0 and ball_velocity.length() < 360.0:
		possession_team = 1
		possession_index = hi
		active_home = hi
		ball_velocity = Vector2.ZERO
		return
	var ai := _nearest_away_to_ball()
	if away[ai].distance_to(ball) < 24.0 and ball_velocity.length() < 360.0:
		possession_team = -1
		possession_index = ai
		ball_velocity = Vector2.ZERO

func _check_goal() -> void:
	var side := Model.goal_side(ball)
	if side == 1:
		home_score += 1
		_reset_kickoff(-1)
	elif side == -1:
		away_score += 1
		_reset_kickoff(1)

func _reset_kickoff(team: int) -> void:
	home = Model.home_formation()
	away = Model.away_formation()
	ball = Vector2(640, 360)
	ball_velocity = Vector2.ZERO
	possession_team = team
	possession_index = 3
	active_home = 3

func _nearest_home_to_ball() -> int:
	var best := 0
	var best_distance := INF
	for i in range(home.size()):
		var distance := home[i].distance_squared_to(ball)
		if distance < best_distance:
			best_distance = distance
			best = i
	return best

func _nearest_away_to_ball() -> int:
	var best := 0
	var best_distance := INF
	for i in range(away.size()):
		var distance := away[i].distance_squared_to(ball)
		if distance < best_distance:
			best_distance = distance
			best = i
	return best

func _draw() -> void:
	draw_rect(Rect2(0, 0, 1280, 720), Color("#10151c"))
	draw_rect(Model.FIELD, Color("#2d7147"), true)
	for stripe in range(8):
		if stripe % 2 == 0:
			draw_rect(Rect2(Model.FIELD.position.x + stripe * 130.0, Model.FIELD.position.y, 130.0, Model.FIELD.size.y), Color("#317a4c"), true)
	draw_rect(Model.FIELD, Color("#d9eadc"), false, 3.0)
	draw_line(Vector2(640, 80), Vector2(640, 640), Color("#d9eadc"), 3.0)
	draw_arc(Vector2(640, 360), 74.0, 0, TAU, 64, Color("#d9eadc"), 3.0)
	draw_rect(Model.HOME_GOAL, Color("#d9eadc"), false, 3.0)
	draw_rect(Model.AWAY_GOAL, Color("#d9eadc"), false, 3.0)

	for i in range(home.size()):
		_draw_player(home[i], Color("#e9ecef"), i == active_home, i)
	for i in range(away.size()):
		_draw_player(away[i], Color("#17191c"), false, i)

	draw_circle(ball, 10.0, Color("#f4f1de"))
	draw_circle(ball, 10.0, Color("#101010"), false, 2.0)

	var font := ThemeDB.fallback_font
	draw_string(font, Vector2(540, 42), "FC Matthias  %d  —  %d  Real Enroque" % [home_score, away_score], HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color.WHITE)
	draw_string(font, Vector2(28, 692), "WASD mover · J pase · K tiro · L cambiar jugador", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("#d6dde6"))

func _draw_player(position: Vector2, color: Color, selected: bool, index: int) -> void:
	if selected:
		draw_arc(position, 22.0, 0, TAU, 32, Color("#f5c451"), 4.0)
	draw_circle(position, 16.0, color)
	draw_circle(position, 16.0, Color("#0a0c0f"), false, 2.0)
	var font := ThemeDB.fallback_font
	draw_string(font, position + Vector2(-5, 6), str(index + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#8fb8ff") if color.r > 0.5 else Color("#ff9b9b"))
