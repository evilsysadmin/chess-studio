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

const AI_DECISION_INTERVAL := 0.42
const AI_SHOOT_DISTANCE := 430.0
const AI_PRESSURE_RADIUS := 165.0
const AI_FORWARD_PASS_GAIN := 170.0
const AI_DRIBBLE_LOOKAHEAD := 280.0
const AI_SUPPORT_FORWARD := 190.0

const KICKOFF_FREEZE_SECONDS := 1.10
const KICKOFF_AI_PASS_POWER := 430.0

const SHOT_CHARGE_SECONDS := 0.90
const SHOT_MIN_POWER := 650.0
const SHOT_MAX_POWER := 1220.0
const AI_SHOT_MIN_POWER := 760.0
const AI_SHOT_MAX_POWER := 1040.0

var teams: Array[Array] = [[], []]
var ball: FootballBall
var controlled: Footballer
var score := [0, 0]
var match_seconds: float = 0.0
var camera_mode: String = CAMERA_MODE_BROADCAST
var last_goal_text: String = ""
var camera_hint_seconds: float = 4.5
var presentation_3d: ChessFootball3DPresenter
var ai_next_decision: Dictionary = {}
var pause_menu_open: bool = false
var kickoff_team_id: int = 0
var kickoff_active: bool = false
var kickoff_seconds_remaining: float = 0.0
var shot_charging: bool = false
var shot_charge_seconds: float = 0.0

var score_label: Label
var help_label: Label
var view_label: Label
var goal_label: Label
var shot_meter: ProgressBar
var shot_meter_label: Label
var pause_overlay: ColorRect
var pause_exit_button: Button

func _ready() -> void:
	_spawn_match()
	_prepare_kickoff(randi_range(0, 1), true)
	_create_3d_presentation()
	_create_hud()
	_refresh_hud()

func _physics_process(delta: float) -> void:
	if pause_menu_open:
		_update_3d_presentation(0.0)
		return
	match_seconds += delta
	camera_hint_seconds = maxf(0.0, camera_hint_seconds - delta)
	if kickoff_active:
		_update_kickoff(delta)
		ball.tick_ball(delta)
		_update_3d_presentation(delta)
		_refresh_hud()
		return
	_handle_human(delta)
	_update_ai(delta)
	ball.tick_ball(delta)
	_update_keeper_saves()
	_try_claim_loose_ball()
	_check_goal()
	_update_3d_presentation(delta)
	_refresh_hud()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		_toggle_pause_menu()
		get_viewport().set_input_as_handled()

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

	shot_meter_label = Label.new()
	shot_meter_label.position = Vector2(470, 635)
	shot_meter_label.size = Vector2(340, 24)
	shot_meter_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	shot_meter_label.text = "POTENCIA DE TIRO"
	shot_meter_label.add_theme_font_size_override("font_size", 13)
	shot_meter_label.add_theme_color_override("font_color", Color(1.0, 0.84, 0.28, 0.92))
	shot_meter_label.visible = false
	hud.add_child(shot_meter_label)

	shot_meter = ProgressBar.new()
	shot_meter.position = Vector2(470, 662)
	shot_meter.size = Vector2(340, 16)
	shot_meter.min_value = 0.0
	shot_meter.max_value = 1.0
	shot_meter.show_percentage = false
	var meter_bg := StyleBoxFlat.new()
	meter_bg.bg_color = Color(0.01, 0.02, 0.03, 0.82)
	meter_bg.border_color = Color(0.78, 0.64, 0.28, 0.72)
	meter_bg.set_border_width_all(1)
	meter_bg.corner_radius_top_left = 4
	meter_bg.corner_radius_top_right = 4
	meter_bg.corner_radius_bottom_left = 4
	meter_bg.corner_radius_bottom_right = 4
	var meter_fill := StyleBoxFlat.new()
	meter_fill.bg_color = Color(0.96, 0.66, 0.16, 0.96)
	meter_fill.corner_radius_top_left = 3
	meter_fill.corner_radius_top_right = 3
	meter_fill.corner_radius_bottom_left = 3
	meter_fill.corner_radius_bottom_right = 3
	shot_meter.add_theme_stylebox_override("background", meter_bg)
	shot_meter.add_theme_stylebox_override("fill", meter_fill)
	shot_meter.visible = false
	hud.add_child(shot_meter)
	_create_pause_menu(hud)

func _create_pause_menu(hud: CanvasLayer) -> void:
	pause_overlay = ColorRect.new()
	pause_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pause_overlay.color = Color(0.008, 0.012, 0.020, 0.88)
	pause_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	pause_overlay.visible = false
	hud.add_child(pause_overlay)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pause_overlay.add_child(center)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(390.0, 360.0)
	center.add_child(panel)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	panel.add_child(box)

	var title := Label.new()
	title.text = "CHESS FOOTBALL"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 30)
	box.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "PARTIDO EN PAUSA"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 14)
	subtitle.add_theme_color_override("font_color", Color(1.0, 0.82, 0.28))
	box.add_child(subtitle)

	pause_exit_button = _menu_button("SALIR")
	pause_exit_button.pressed.connect(_exit_to_host)
	box.add_child(pause_exit_button)

	var continue_button := _menu_button("CONTINUAR")
	continue_button.pressed.connect(_toggle_pause_menu)
	box.add_child(continue_button)

	var view_button := _menu_button("CAMBIAR VISTA")
	view_button.pressed.connect(_menu_change_view)
	box.add_child(view_button)

	var restart_button := _menu_button("REINICIAR PARTIDO")
	restart_button.pressed.connect(_restart_match)
	box.add_child(restart_button)

	var hint := Label.new()
	hint.text = "ESC · cerrar menú"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_color_override("font_color", Color(1, 1, 1, 0.62))
	box.add_child(hint)

func _menu_button(text_value: String) -> Button:
	var button := Button.new()
	button.text = text_value
	button.custom_minimum_size = Vector2(0.0, 52.0)
	button.add_theme_font_size_override("font_size", 18)
	return button

func _toggle_pause_menu() -> void:
	pause_menu_open = not pause_menu_open
	pause_overlay.visible = pause_menu_open
	if pause_menu_open:
		pause_exit_button.grab_focus()
	else:
		pause_exit_button.release_focus()

func _menu_change_view() -> void:
	_toggle_camera_mode()
	_toggle_pause_menu()

func _restart_match() -> void:
	score = [0, 0]
	last_goal_text = ""
	_prepare_kickoff(randi_range(0, 1), true)
	_toggle_pause_menu()

func _exit_to_host() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage({source:'chess-football-godot', type:'exit'}, '*');")
		return
	get_tree().quit()

func _refresh_hud() -> void:
	score_label.text = "FC Matthias %d - %d Real Enroque" % [score[0], score[1]]
	help_label.text = "WASD · Shift sprint · Space pase · Mantén Enter para cargar tiro · E entrada · Tab cambia · V vista · ESC menú"
	if shot_meter != null:
		shot_meter.visible = shot_charging
		shot_meter.value = _shot_charge_ratio()
	if shot_meter_label != null:
		shot_meter_label.visible = shot_charging
	var view_name := "BROADCAST 3D" if camera_mode == CAMERA_MODE_BROADCAST else "TÁCTICA AÉREA"
	view_label.text = "VISTA · %s" % view_name if camera_hint_seconds > 0.0 else ""
	goal_label.text = last_goal_text

func _handle_human(delta: float) -> void:
	if Input.is_action_just_pressed("toggle_view"):
		_toggle_camera_mode()
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	controlled.move_human(direction, Input.is_action_pressed("sprint"))

	if ball.carrier != controlled:
		_cancel_shot_charge()

	if Input.is_action_just_pressed("change_player"):
		_cancel_shot_charge()
		_select_player(_best_switch_candidate())
	if Input.is_action_just_pressed("tackle") and not controlled.has_ball:
		_try_tackle(controlled)
	if Input.is_action_just_pressed("pass_ball") and ball.carrier == controlled:
		_cancel_shot_charge()
		_pass_from(controlled, direction)

	if Input.is_action_just_pressed("shoot_ball") and ball.carrier == controlled:
		_begin_shot_charge()
	if shot_charging:
		shot_charge_seconds = minf(SHOT_CHARGE_SECONDS, shot_charge_seconds + delta)
		if Input.is_action_just_released("shoot_ball"):
			_release_charged_shot()

func _begin_shot_charge() -> void:
	shot_charging = true
	shot_charge_seconds = 0.0

func _cancel_shot_charge() -> void:
	shot_charging = false
	shot_charge_seconds = 0.0

func _shot_charge_ratio() -> float:
	if not shot_charging:
		return 0.0
	return clampf(shot_charge_seconds / SHOT_CHARGE_SECONDS, 0.0, 1.0)

func _shot_power_from_ratio(ratio: float) -> float:
	var shaped := pow(clampf(ratio, 0.0, 1.0), 1.15)
	return lerpf(SHOT_MIN_POWER, SHOT_MAX_POWER, shaped)

func _release_charged_shot() -> void:
	if not shot_charging:
		return
	var ratio := _shot_charge_ratio()
	shot_charging = false
	shot_charge_seconds = 0.0
	if ball.carrier != controlled:
		return
	var target := ChessFootballMath.goal_center(0)
	controlled.play_action("shoot", lerpf(0.58, 0.82, ratio))
	ball.release(target - controlled.global_position, _shot_power_from_ratio(ratio))

func _update_ai(delta: float) -> void:
	for team_id in range(2):
		var team_has_ball := ball.carrier != null and ball.carrier.team_id == team_id
		var presser: Footballer = _nearest_player_to_ball(team_id)
		for player in teams[team_id]:
			if player == controlled:
				continue
			if player.role == "keeper":
				_update_keeper_ai(player, delta)
				continue

			var target: Vector2 = player.home_position
			var intensity := 0.64
			if ball.carrier == null:
				if player == presser:
					target = ball.global_position
					intensity = 0.98
			elif team_has_ball:
				if ball.carrier == player:
					target = _ai_dribble_target(player)
					intensity = 0.94
				else:
					target = _ai_support_target(player)
					intensity = 0.78
			else:
				if player == presser:
					target = ball.carrier.global_position
					intensity = 0.98
				else:
					target = player.home_position.lerp(ball.carrier.global_position, 0.18)
					intensity = 0.70

			player.move_ai(delta, target, intensity)

			if not team_has_ball and ball.carrier != null and ball.carrier.team_id != team_id and player == presser:
				_try_tackle(player)

			if ball.carrier == player and team_id == 1 and _ai_decision_ready(player):
				_ai_attack(player)

func _ai_decision_ready(player: Footballer) -> bool:
	var key: int = int(player.get_instance_id())
	var next_time := float(ai_next_decision.get(key, 0.0))
	if match_seconds < next_time:
		return false
	ai_next_decision[key] = match_seconds + AI_DECISION_INTERVAL
	return true

func _ai_dribble_target(player: Footballer) -> Vector2:
	var goal := ChessFootballMath.goal_center(player.team_id)
	var direction := (goal - player.global_position).normalized()
	var target := player.global_position + direction * AI_DRIBBLE_LOOKAHEAD
	var threat := _nearest_opponent_to(player)
	if threat != null:
		var distance := player.global_position.distance_to(threat.global_position)
		if distance < AI_PRESSURE_RADIUS:
			var escape := (player.global_position - threat.global_position).normalized()
			target += escape * (AI_PRESSURE_RADIUS - distance) * 0.9
	return ChessFootballMath.clamp_to_pitch(target)

func _ai_support_target(player: Footballer) -> Vector2:
	if ball.carrier == null:
		return player.home_position
	var forward := 1.0 if player.team_id == 0 else -1.0
	var lane_offset := float(player.squad_index - 2) * 72.0
	var target := Vector2(
		ball.carrier.global_position.x + forward * (AI_SUPPORT_FORWARD + absf(lane_offset) * 0.22),
		player.home_position.y + lane_offset * 0.35
	)
	return ChessFootballMath.clamp_to_pitch(target)

func _nearest_opponent_to(player: Footballer) -> Footballer:
	var opponents: Array = teams[1 - player.team_id]
	var best: Footballer = null
	var best_distance := INF
	for opponent in opponents:
		var distance := player.global_position.distance_squared_to(opponent.global_position)
		if distance < best_distance:
			best_distance = distance
			best = opponent
	return best

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
	if ball.carrier != player:
		return
	var goal := ChessFootballMath.goal_center(player.team_id)
	var goal_distance := player.global_position.distance_to(goal)
	if goal_distance < AI_SHOOT_DISTANCE:
		var defending_keeper: Footballer = teams[1 - player.team_id][0]
		var aim_y := goal.y + (-70.0 if defending_keeper.global_position.y > goal.y else 70.0)
		var shot_target := Vector2(goal.x, aim_y)
		player.play_action("shoot", 0.78)
		var distance_ratio := clampf(goal_distance / AI_SHOOT_DISTANCE, 0.0, 1.0)
		var shot_power := lerpf(AI_SHOT_MIN_POWER, AI_SHOT_MAX_POWER, distance_ratio)
		ball.release(shot_target - player.global_position, shot_power)
		return

	var threat := _nearest_opponent_to(player)
	var pressure_distance := INF
	if threat != null:
		pressure_distance = player.global_position.distance_to(threat.global_position)

	var target := _best_ai_pass_target(player)
	if target == null:
		return
	var forward := 1.0 if player.team_id == 0 else -1.0
	var forward_gain := (target.global_position.x - player.global_position.x) * forward
	if pressure_distance < AI_PRESSURE_RADIUS or forward_gain > AI_FORWARD_PASS_GAIN:
		player.play_action("pass", 0.72)
		ball.release(target.global_position - player.global_position, 540.0)

func _best_ai_pass_target(player: Footballer) -> Footballer:
	var forward: float = 1.0 if player.team_id == 0 else -1.0
	var best: Footballer = null
	var best_score: float = -INF
	for teammate in teams[player.team_id]:
		if teammate == player or teammate.role == "keeper":
			continue
		var offset: Vector2 = teammate.global_position - player.global_position
		var distance: float = offset.length()
		if distance < 90.0 or distance > 560.0:
			continue
		var progress: float = offset.x * forward
		var nearest_opponent: Footballer = _nearest_opponent_to(teammate)
		var separation: float = 240.0
		if nearest_opponent != null:
			separation = teammate.global_position.distance_to(nearest_opponent.global_position)
		var score_value: float = progress * 1.8 + separation * 0.55 - absf(offset.y) * 0.18 - distance * 0.12
		if score_value > best_score:
			best_score = score_value
			best = teammate
	return best

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
			if ball.reclaim_blocked_for(player):
				continue
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
	for player in teams[team_id]:
		player.play_action("celebrate", 1.15)
	_prepare_kickoff(1 - team_id, false)

func _prepare_kickoff(team_id: int, is_initial: bool) -> void:
	_cancel_shot_charge()
	kickoff_team_id = clampi(team_id, 0, 1)
	kickoff_active = true
	kickoff_seconds_remaining = KICKOFF_FREEZE_SECONDS

	for id in range(2):
		for player in teams[id]:
			player.global_position = player.home_position
			player.velocity = Vector2.ZERO

	var center := ChessFootballMath.PITCH_RECT.get_center()
	var starter: Footballer = teams[kickoff_team_id][2]
	var facing := 1.0 if kickoff_team_id == 0 else -1.0
	starter.global_position = center - Vector2(18.0 * facing, -2.0)
	starter.velocity = Vector2.ZERO
	ball.attach_to(starter)
	ball.global_position = center
	ball.velocity = Vector2.ZERO

	if kickoff_team_id == 0:
		_select_player(starter)
	else:
		_select_player(_nearest_player_to_ball(0))

	if is_initial:
		last_goal_text = "SACA · FC Matthias" if kickoff_team_id == 0 else "SACA · Real Enroque"

func _update_kickoff(delta: float) -> void:
	kickoff_seconds_remaining = maxf(0.0, kickoff_seconds_remaining - delta)
	for id in range(2):
		for player in teams[id]:
			player.velocity = Vector2.ZERO
	if kickoff_seconds_remaining > 0.0:
		return

	kickoff_active = false
	last_goal_text = ""
	if kickoff_team_id == 1:
		var starter: Footballer = teams[1][2]
		var receiver: Footballer = teams[1][3]
		starter.play_action("pass", 0.60)
		ball.release(receiver.global_position - starter.global_position, KICKOFF_AI_PASS_POWER)

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

func debug_try_claim_loose_ball() -> void:
	_try_claim_loose_ball()

func debug_ai_dribble_target(player: Footballer) -> Vector2:
	return _ai_dribble_target(player)

func debug_force_ai_attack(player: Footballer) -> void:
	_ai_attack(player)

func debug_step_ai(delta: float) -> void:
	_update_ai(delta)

func debug_kickoff_team() -> int:
	return kickoff_team_id

func debug_kickoff_active() -> bool:
	return kickoff_active

func debug_force_kickoff_ready() -> void:
	if kickoff_active:
		_update_kickoff(KICKOFF_FREEZE_SECONDS)

func debug_score_goal(team_id: int) -> void:
	_score_goal(team_id)

func debug_shot_power_for_ratio(ratio: float) -> float:
	return _shot_power_from_ratio(ratio)

func debug_force_shot_charge(ratio: float) -> void:
	shot_charging = true
	shot_charge_seconds = SHOT_CHARGE_SECONDS * clampf(ratio, 0.0, 1.0)

func debug_release_charged_shot() -> void:
	_release_charged_shot()

func debug_shot_charge_ratio() -> float:
	return _shot_charge_ratio()

func debug_pause_menu_open() -> bool:
	return pause_menu_open

func debug_toggle_pause_menu() -> void:
	_toggle_pause_menu()

func debug_pause_first_option() -> String:
	return pause_exit_button.text if pause_exit_button != null else ""
