extends Node2D

const Presenter3D = preload("res://scripts/football_3d_presenter.gd")
const FootballAudio = preload("res://scripts/football_audio.gd")
const TEAM_SIZE := 5
const ROLES := ["keeper", "defender", "midfielder", "wing", "forward"]
const TEAM_COLORS := [Color(0.12, 0.42, 0.92), Color(0.86, 0.18, 0.2)]

const CAMERA_MODE_BROADCAST := "broadcast"
const CAMERA_MODE_TACTICAL := "tactical"

const TACKLE_ATTEMPT_RANGE := 94.0
const TACKLE_HITBOX_FORWARD := 48.0
const TACKLE_HITBOX_FORWARD_BONUS := 16.0
const TACKLE_HITBOX_BACK := 12.0
const TACKLE_HITBOX_HALF_WIDTH := 27.0
const TACKLE_CONTACT_FORWARD_BONUS := 8.0
const TACKLE_FOUL_BACK := 28.0
const TACKLE_FOUL_HALF_WIDTH := 36.0
const TACKLE_RECKLESS_SPEED_RATIO := 1.05
const TACKLE_CLEAN_FORWARD := 40.0
const TACKLE_CLEAN_HALF_WIDTH := 18.0
const TACKLE_STEAL_DELAY := 0.20
const TACKLE_STEAL_POKE_POWER := 220.0
const TACKLE_LOOSE_POKE_POWER := 310.0
const SLIDE_TACKLE_FORWARD_BONUS := 26.0
const SLIDE_TACKLE_HALF_WIDTH_BONUS := 4.0
const PENALTY_SHOT_POWER := 930.0
const PENALTY_SHOT_LIFT := 150.0
const PENALTY_KEEPER_MOVE_SPEED := 310.0
const PENALTY_TARGET_MARGIN := 22.0
const RED_CARD_BEHIND_THRESHOLD := -10.0

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
const KICKOFF_RECEIVER_INDEX := 3
const KICKOFF_TEAM_HALF_GAP := 120.0
const KICKOFF_RIVAL_HALF_GAP := 250.0
const GOAL_CELEBRATION_SECONDS := 1.35
const RESTART_FREEZE_SECONDS := 0.95
const RESTART_OUT_MARGIN := 10.0
const RESTART_TOUCHLINE_INSET := 28.0
const RESTART_GOAL_LINE_INSET := 34.0
const RESTART_THROW_POWER := 500.0
const RESTART_GOAL_KICK_POWER := 620.0
const RESTART_CORNER_POWER := 650.0
const RESTART_CORNER_LIFT := 230.0
const GOAL_FRAME_REBOUND_OFFSET := 20.0
const GOAL_POST_RESTITUTION := 0.76
const GOAL_CROSSBAR_RESTITUTION := 0.68
const GOAL_CROSSBAR_DROP_SPEED := 125.0

const SHOT_CHARGE_SECONDS := 0.90
const SHOT_MIN_POWER := 430.0
const SHOT_MAX_POWER := 1260.0
const SHOT_DRIVE_MAX_RATIO := 0.24
const SHOT_BLAST_MIN_RATIO := 0.72
const SHOT_DRIVE_MIN_LIFT := 24.0
const SHOT_DRIVE_MAX_LIFT := 70.0
const SHOT_NORMAL_MIN_LIFT := 150.0
const SHOT_NORMAL_MAX_LIFT := 280.0
const SHOT_BLAST_MIN_LIFT := 320.0
const SHOT_BLAST_MAX_LIFT := 460.0
const SHOT_GOAL_POST_MARGIN := 26.0
const SHOT_SAFE_CROSSBAR_HEIGHT := 50.0
const SHOT_KEEPER_AVOID_RATIO := 0.72
const SHOT_TRAVEL_SPEED_FACTOR := 0.90
const AI_SHOT_MIN_POWER := 720.0
const AI_SHOT_MAX_POWER := 1100.0

var teams: Array[Array] = [[], []]
var ball: FootballBall
var controlled: Footballer
var score := [0, 0]
var match_seconds: float = 0.0
var camera_mode: String = CAMERA_MODE_BROADCAST
var last_goal_text: String = ""
var camera_hint_seconds: float = 4.5
var presentation_3d: ChessFootball3DPresenter
var audio_fx: ChessFootballAudio
var ai_next_decision: Dictionary = {}
var pause_menu_open: bool = false
var kickoff_team_id: int = 0
var kickoff_active: bool = false
var kickoff_seconds_remaining: float = 0.0
var goal_restart_active: bool = false
var goal_restart_seconds_remaining: float = 0.0
var pending_restart_team_id: int = 0
var set_piece_active: bool = false
var set_piece_seconds_remaining: float = 0.0
var set_piece_team_id: int = 0
var set_piece_kind: String = ""
var set_piece_spot: Vector2 = Vector2.ZERO
var set_piece_player: Footballer = null
var penalty_human_ready: bool = false
var penalty_aim_y: float = 0.0
var card_notice: String = ""
var shot_charging: bool = false
var shot_charge_seconds: float = 0.0
var shot_aim_y_input: float = 0.0
var pending_tackle_player: Footballer = null
var pending_tackle_seconds: float = 0.0

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
	_create_audio()
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
	if goal_restart_active:
		_update_goal_restart(delta)
		_update_3d_presentation(delta)
		_refresh_hud()
		return
	if kickoff_active:
		_update_kickoff(delta)
		ball.tick_ball(delta)
		_update_3d_presentation(delta)
		_refresh_hud()
		return
	if set_piece_active:
		_update_set_piece(delta)
		_update_3d_presentation(delta)
		_refresh_hud()
		return
	_handle_human(delta)
	_update_ai(delta)
	_update_active_tackle_contacts()
	var previous_ball_position: Vector2 = ball.global_position
	var previous_ball_height: float = ball.flight_height
	ball.tick_ball(delta)
	_resolve_goal_frame_collision(previous_ball_position, previous_ball_height)
	_update_keeper_saves()
	_update_pending_tackle_claim(delta)
	_try_claim_loose_ball()
	_check_goal()
	_check_ball_out()
	_update_3d_presentation(delta)
	_refresh_hud()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		_toggle_pause_menu()
		get_viewport().set_input_as_handled()

func _create_audio() -> void:
	audio_fx = FootballAudio.new()
	add_child(audio_fx)

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
	if set_piece_active and set_piece_kind == "PENALTI":
		if set_piece_team_id == 0:
			help_label.text = "PENALTI · W/S apunta · mantén Enter para cargar y suelta para tirar"
		else:
			help_label.text = "PENALTI RIVAL · W/S mueve al portero antes del disparo"
	else:
		help_label.text = "WASD · Shift sprint · Space pase · Mantén Enter tiro · E entrada · Shift+E segada · Tab cambia · V vista · ESC menú"
	if shot_meter != null:
		shot_meter.visible = shot_charging
		shot_meter.value = _shot_charge_ratio()
	if shot_meter_label != null:
		shot_meter_label.visible = shot_charging
		shot_meter_label.text = _shot_profile_name(_shot_charge_ratio()) if shot_charging else "POTENCIA DE TIRO"
	var view_name := "BROADCAST 3D" if camera_mode == CAMERA_MODE_BROADCAST else "TÁCTICA AÉREA"
	view_label.text = "VISTA · %s" % view_name if camera_hint_seconds > 0.0 else ""
	goal_label.text = last_goal_text

func _handle_human(delta: float) -> void:
	if Input.is_action_just_pressed("toggle_view"):
		_toggle_camera_mode()
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	controlled.move_human(delta, direction, Input.is_action_pressed("sprint"))

	if ball.carrier != controlled:
		_cancel_shot_charge()

	if Input.is_action_just_pressed("change_player"):
		_cancel_shot_charge()
		_select_player(_best_switch_candidate())
	if Input.is_action_just_pressed("tackle") and not controlled.has_ball:
		_try_tackle(controlled, Input.is_action_pressed("sprint"))
	if Input.is_action_just_pressed("pass_ball") and ball.carrier == controlled:
		_cancel_shot_charge()
		_pass_from(controlled, direction)

	if Input.is_action_just_pressed("shoot_ball") and ball.carrier == controlled:
		_begin_shot_charge(direction.y)
	if shot_charging:
		shot_charge_seconds = minf(SHOT_CHARGE_SECONDS, shot_charge_seconds + delta)
		if absf(direction.y) > 0.18:
			shot_aim_y_input = clampf(direction.y, -1.0, 1.0)
		if Input.is_action_just_released("shoot_ball"):
			_release_charged_shot()

func _begin_shot_charge(initial_aim_y: float = 0.0) -> void:
	shot_charging = true
	shot_charge_seconds = 0.0
	shot_aim_y_input = clampf(initial_aim_y, -1.0, 1.0)

func _cancel_shot_charge() -> void:
	shot_charging = false
	shot_charge_seconds = 0.0
	shot_aim_y_input = 0.0

func _shot_charge_ratio() -> float:
	if not shot_charging:
		return 0.0
	return clampf(shot_charge_seconds / SHOT_CHARGE_SECONDS, 0.0, 1.0)

func _shot_power_from_ratio(ratio: float) -> float:
	var shaped := pow(clampf(ratio, 0.0, 1.0), 1.25)
	return lerpf(SHOT_MIN_POWER, SHOT_MAX_POWER, shaped)

func _shot_lift_from_ratio(ratio: float) -> float:
	var r := clampf(ratio, 0.0, 1.0)
	if r < SHOT_DRIVE_MAX_RATIO:
		return lerpf(SHOT_DRIVE_MIN_LIFT, SHOT_DRIVE_MAX_LIFT, r / SHOT_DRIVE_MAX_RATIO)
	if r < SHOT_BLAST_MIN_RATIO:
		var normal_ratio := (r - SHOT_DRIVE_MAX_RATIO) / (SHOT_BLAST_MIN_RATIO - SHOT_DRIVE_MAX_RATIO)
		return lerpf(SHOT_NORMAL_MIN_LIFT, SHOT_NORMAL_MAX_LIFT, normal_ratio)
	var blast_ratio := (r - SHOT_BLAST_MIN_RATIO) / (1.0 - SHOT_BLAST_MIN_RATIO)
	return lerpf(SHOT_BLAST_MIN_LIFT, SHOT_BLAST_MAX_LIFT, blast_ratio)

func _shot_profile_name(ratio: float) -> String:
	var r := clampf(ratio, 0.0, 1.0)
	if r < SHOT_DRIVE_MAX_RATIO:
		return "TIRO RASO"
	if r < SHOT_BLAST_MIN_RATIO:
		return "TIRO"
	return "PEPINAZO"

func _assisted_shot_target(player: Footballer, aim_y: float) -> Vector2:
	var goal := ChessFootballMath.goal_center(player.team_id)
	var safe_half_span := maxf(
		12.0,
		ChessFootballMath.GOAL_HALF_HEIGHT
			- ChessFootballMath.GOAL_FRAME_POST_RADIUS
			- SHOT_GOAL_POST_MARGIN
	)
	var wanted_y := clampf(aim_y, -1.0, 1.0)
	if absf(wanted_y) <= 0.18:
		var keeper: Footballer = teams[1 - player.team_id][0]
		var keeper_side := signf(keeper.global_position.y - goal.y)
		if absf(keeper.global_position.y - goal.y) < 8.0:
			keeper_side = signf(player.global_position.y - goal.y)
			if keeper_side == 0.0:
				keeper_side = 1.0
		wanted_y = -keeper_side * SHOT_KEEPER_AVOID_RATIO
	return Vector2(goal.x, goal.y + wanted_y * safe_half_span)

func _safe_shot_lift(
	player: Footballer,
	target: Vector2,
	power: float,
	requested_lift: float,
) -> float:
	var offset := target - player.global_position
	var direction := offset.normalized() if offset.length_squared() > 0.001 else Vector2.RIGHT
	var horizontal_speed := maxf(1.0, power * absf(direction.x) * SHOT_TRAVEL_SPEED_FACTOR)
	var travel_seconds := clampf(absf(offset.x) / horizontal_speed, 0.08, 1.60)
	var max_safe_lift := (
		SHOT_SAFE_CROSSBAR_HEIGHT
		+ 0.5 * FootballBall.BALL_GRAVITY * travel_seconds * travel_seconds
	) / travel_seconds
	return minf(requested_lift, max_safe_lift)

func _predicted_shot_height_at_goal(
	player: Footballer,
	target: Vector2,
	power: float,
	lift: float,
) -> float:
	var offset := target - player.global_position
	var direction := offset.normalized() if offset.length_squared() > 0.001 else Vector2.RIGHT
	var horizontal_speed := maxf(1.0, power * absf(direction.x) * SHOT_TRAVEL_SPEED_FACTOR)
	var travel_seconds := clampf(absf(offset.x) / horizontal_speed, 0.08, 1.60)
	return maxf(
		0.0,
		lift * travel_seconds
			- 0.5 * FootballBall.BALL_GRAVITY * travel_seconds * travel_seconds
	)

func _release_charged_shot() -> void:
	if not shot_charging:
		return
	var ratio := _shot_charge_ratio()
	var aim_y := shot_aim_y_input
	shot_charging = false
	shot_charge_seconds = 0.0
	shot_aim_y_input = 0.0
	if ball.carrier != controlled:
		return
	var target := _assisted_shot_target(controlled, aim_y)
	var power := _shot_power_from_ratio(ratio)
	var lift := _safe_shot_lift(
		controlled,
		target,
		power,
		_shot_lift_from_ratio(ratio)
	)
	controlled.play_action("shoot", lerpf(0.58, 0.82, ratio))
	if audio_fx != null:
		audio_fx.play_shot(ratio)
	ball.release(target - controlled.global_position, power, lift)

func _update_ai(delta: float) -> void:
	for team_id in range(2):
		var team_has_ball := ball.carrier != null and ball.carrier.team_id == team_id
		var presser: Footballer = _nearest_player_to_ball(team_id)
		for player in teams[team_id]:
			if player.sent_off:
				continue
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
		if opponent.sent_off:
			continue
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
		if audio_fx != null:
			audio_fx.play_pass()
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
	if keeper.sent_off or keeper.role != "keeper" or ball.carrier != null:
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

	var dive_direction := signf(ball.global_position.y - keeper.global_position.y)
	if absf(dive_direction) < 0.01:
		dive_direction = 1.0
	keeper.begin_keeper_save(dive_direction, 0.58)
	if audio_fx != null:
		audio_fx.play_keeper_save()
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
		var profile_ratio := lerpf(0.18, 0.82, distance_ratio)
		var shot_lift := _shot_lift_from_ratio(profile_ratio)
		if audio_fx != null:
			audio_fx.play_shot(profile_ratio)
		ball.release(shot_target - player.global_position, shot_power, shot_lift)
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
		if audio_fx != null:
			audio_fx.play_pass()
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
	if audio_fx != null:
		audio_fx.play_pass()
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
		if teammate.sent_off or teammate == player:
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

func _tackle_forward(tackler: Footballer) -> Vector2:
	if tackler.velocity.length_squared() > 64.0:
		return tackler.velocity.normalized()
	var facing_x := -1.0 if tackler.visual != null and tackler.visual.flip_h else 1.0
	return Vector2(facing_x, 0.0)

func _tackle_hitbox(
	tackler: Footballer,
	target_position: Vector2,
	aggressive_override: bool = false,
) -> Dictionary:
	var forward := _tackle_forward(tackler)
	var lateral_axis := Vector2(-forward.y, forward.x)
	var offset := target_position - tackler.global_position
	var forward_distance := offset.dot(forward)
	var lateral_distance := absf(offset.dot(lateral_axis))
	var aggressive := aggressive_override or tackler.tackle_aggressive_active()
	var speed_ratio := maxf(
		clampf(tackler.velocity.length() / maxf(tackler.base_speed, 1.0), 0.0, 1.35),
		tackler.tackle_momentum_ratio(),
	)
	var forward_reach := (
		TACKLE_HITBOX_FORWARD
		+ TACKLE_HITBOX_FORWARD_BONUS * speed_ratio
		+ (SLIDE_TACKLE_FORWARD_BONUS if aggressive else 0.0)
	)
	var legal_half_width := TACKLE_HITBOX_HALF_WIDTH + (SLIDE_TACKLE_HALF_WIDTH_BONUS if aggressive else 0.0)
	var inside := (
		forward_distance >= -TACKLE_HITBOX_BACK
		and forward_distance <= forward_reach
		and lateral_distance <= legal_half_width
	)
	var contact := (
		forward_distance >= -TACKLE_FOUL_BACK
		and forward_distance <= forward_reach + TACKLE_CONTACT_FORWARD_BONUS
		and lateral_distance <= TACKLE_FOUL_HALF_WIDTH + (SLIDE_TACKLE_HALF_WIDTH_BONUS if aggressive else 0.0)
	)
	var clean := (
		inside
		and forward_distance >= -4.0
		and forward_distance <= TACKLE_CLEAN_FORWARD + TACKLE_HITBOX_FORWARD_BONUS * speed_ratio * 0.5
		and lateral_distance <= TACKLE_CLEAN_HALF_WIDTH
	)
	var foul := (
		contact
		and (
			not inside
			or forward_distance < -4.0
			or (aggressive and not clean)
			or (
				not clean
				and speed_ratio >= TACKLE_RECKLESS_SPEED_RATIO
				and lateral_distance > TACKLE_CLEAN_HALF_WIDTH
			)
		)
	)
	return {
		"aggressive": aggressive,
		"contact": contact,
		"inside": inside,
		"clean": clean,
		"foul": foul,
		"forward_distance": forward_distance,
		"lateral_distance": lateral_distance,
		"forward_reach": forward_reach,
	}

func _tackle_attempt_range(tackler: Footballer, aggressive_override: bool = false) -> float:
	var aggressive := aggressive_override or tackler.tackle_aggressive_active()
	return TACKLE_ATTEMPT_RANGE + (SLIDE_TACKLE_FORWARD_BONUS if aggressive else 0.0)

func _try_tackle(tackler: Footballer, aggressive: bool = false) -> bool:
	if ball.carrier == null or ball.carrier == tackler:
		return false
	var victim: Footballer = ball.carrier
	if victim.team_id == tackler.team_id or not tackler.can_tackle():
		return false

	var offset: Vector2 = victim.global_position - tackler.global_position
	if offset.length() > _tackle_attempt_range(tackler, aggressive):
		return false

	var hitbox := _tackle_hitbox(tackler, victim.global_position, aggressive)
	if not tackler.start_tackle(aggressive):
		return false
	if not bool(hitbox.get("contact", hitbox.get("inside", false))):
		return false
	return _resolve_tackle_contact(tackler, victim, hitbox)

func _resolve_tackle_contact(
	tackler: Footballer,
	victim: Footballer,
	hitbox: Dictionary = {},
) -> bool:
	if not tackler.tackle_active() or ball.carrier != victim:
		return false
	if victim.team_id == tackler.team_id:
		return false

	var offset: Vector2 = victim.global_position - tackler.global_position
	if offset.length() > _tackle_attempt_range(tackler):
		return false
	var resolved_hitbox := hitbox if not hitbox.is_empty() else _tackle_hitbox(tackler, victim.global_position)
	if not bool(resolved_hitbox.get("contact", resolved_hitbox.get("inside", false))):
		return false

	var push_direction := offset.normalized() if offset.length_squared() > 0.001 else _tackle_forward(tackler)
	var foul_spot := victim.global_position
	victim.receive_tackle_contact(push_direction)
	if audio_fx != null:
		audio_fx.play_tackle()

	if bool(resolved_hitbox.get("foul", false)):
		tackler.tackle_recovery_seconds = maxf(tackler.tackle_recovery_seconds, 0.85)
		_apply_foul_card(tackler, resolved_hitbox)
		pending_tackle_player = null
		pending_tackle_seconds = 0.0
		if audio_fx != null:
			audio_fx.play_whistle()
		var restart_kind := "PENALTI" if _in_penalty_area(victim.team_id, foul_spot) else "FALTA"
		var restart_spot := _penalty_spot(victim.team_id) if restart_kind == "PENALTI" else foul_spot
		_prepare_set_piece(restart_kind, victim.team_id, restart_spot)
		return true

	if bool(resolved_hitbox.get("clean", false)):
		# Deflect the ball out of the collision instead of straight underneath
		# the tackler. The short diagonal loose-ball beat makes a clean steal
		# readable before possession is consolidated.
		var lateral_sign := 1.0 if tackler.team_id == 0 else -1.0
		var lateral := Vector2(-push_direction.y, push_direction.x) * lateral_sign
		var steal_direction := (-push_direction * 0.72 + lateral * 0.69).normalized()
		ball.release(steal_direction, TACKLE_STEAL_POKE_POWER)
		pending_tackle_player = tackler
		pending_tackle_seconds = TACKLE_STEAL_DELAY
		return true

	var lateral := Vector2(-push_direction.y, push_direction.x)
	if tackler.velocity.length_squared() > 16.0:
		lateral = (tackler.velocity.normalized() * 0.70 + lateral * 0.30).normalized()
	ball.release(lateral, TACKLE_LOOSE_POKE_POWER)
	return true

func _foul_card_for(hitbox: Dictionary) -> String:
	if not bool(hitbox.get("aggressive", false)):
		return ""
	if float(hitbox.get("forward_distance", 0.0)) < RED_CARD_BEHIND_THRESHOLD:
		return "ROJA"
	return "AMARILLA"

func _apply_foul_card(tackler: Footballer, hitbox: Dictionary) -> String:
	var card := _foul_card_for(hitbox)
	if card == "":
		return ""
	if card == "ROJA":
		tackler.receive_red_card()
		card_notice = "ROJA · %s" % _team_name(tackler.team_id)
	else:
		var dismissed := tackler.receive_yellow_card()
		card_notice = (
			"SEGUNDA AMARILLA · ROJA · %s" % _team_name(tackler.team_id)
			if dismissed
			else "AMARILLA · %s" % _team_name(tackler.team_id)
		)
	if tackler.sent_off and tackler == controlled:
		_select_player(_nearest_player_to_ball(tackler.team_id))
	return card_notice

func _update_active_tackle_contacts() -> void:
	if ball.carrier == null:
		return
	var victim: Footballer = ball.carrier
	for team in teams:
		for tackler in team:
			if tackler.sent_off:
				continue
			if tackler == victim or not tackler.tackle_active():
				continue
			if tackler.team_id == victim.team_id:
				continue
			if _resolve_tackle_contact(tackler, victim):
				return

func _update_pending_tackle_claim(delta: float) -> void:
	if pending_tackle_player == null:
		return
	if ball.carrier != null:
		pending_tackle_player = null
		pending_tackle_seconds = 0.0
		return
	pending_tackle_seconds = maxf(0.0, pending_tackle_seconds - delta)
	if pending_tackle_seconds > 0.0:
		return
	var winner := pending_tackle_player
	pending_tackle_player = null
	if is_instance_valid(winner) and winner.global_position.distance_to(ball.global_position) <= 72.0:
		ball.attach_to(winner)
		if winner.team_id == 0:
			_select_player(winner)

func _try_claim_loose_ball() -> void:
	if pending_tackle_player != null:
		return
	if ball.carrier != null or ball.velocity.length() > 560.0 or ball.flight_height > 24.0:
		return
	var best: Footballer = null
	var best_distance := 31.0
	for team in teams:
		for player in team:
			if player.sent_off:
				continue
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
	if (
		ball.carrier != null
		and ball.carrier.team_id == 0
		and not ball.carrier.sent_off
	):
		return ball.carrier
	return _nearest_player_to_ball(0)

func _nearest_player_to_ball(team_id: int) -> Footballer:
	var best: Footballer = null
	var best_distance := INF
	for player in teams[team_id]:
		if player.sent_off:
			continue
		var distance: float = player.global_position.distance_squared_to(ball.global_position)
		if distance < best_distance:
			best_distance = distance
			best = player
	return best

func _select_player(player: Footballer) -> void:
	if player == null or player.sent_off:
		return
	if controlled != null:
		controlled.set_active(false)
	controlled = player
	controlled.set_active(true)

func _resolve_goal_frame_collision(
	previous_position: Vector2,
	previous_height: float,
) -> String:
	if ball.carrier != null:
		return ""
	var hit := ChessFootballMath.goal_frame_collision(
		previous_position,
		ball.global_position,
		previous_height,
		ball.flight_height,
	)
	if hit.is_empty():
		return ""

	var kind := String(hit["kind"])
	var goal_x := float(hit["goal_x"])
	var incoming := ball.velocity
	var travel_sign := signf(incoming.x)
	if absf(travel_sign) < 0.01:
		travel_sign = signf(ball.global_position.x - previous_position.x)
	if absf(travel_sign) < 0.01:
		travel_sign = 1.0

	var impact_speed := incoming.length()
	ball.global_position.x = goal_x - travel_sign * GOAL_FRAME_REBOUND_OFFSET
	if kind == "post":
		var center_y := ChessFootballMath.PITCH_RECT.get_center().y
		var post_y := center_y + (
			ChessFootballMath.GOAL_HALF_HEIGHT
			if float(hit["contact_y"]) >= center_y
			else -ChessFootballMath.GOAL_HALF_HEIGHT
		)
		var glancing_sign := signf(float(hit["contact_y"]) - post_y)
		if absf(glancing_sign) < 0.01:
			glancing_sign = signf(incoming.y)
		ball.velocity = Vector2(
			-incoming.x * GOAL_POST_RESTITUTION,
			incoming.y * 0.72 + glancing_sign * 70.0,
		)
	elif kind == "crossbar":
		ball.velocity = Vector2(
			-incoming.x * GOAL_CROSSBAR_RESTITUTION,
			incoming.y * 0.82,
		)
		ball.flight_height = minf(
			ball.flight_height,
			ChessFootballMath.GOAL_FRAME_CROSSBAR_HEIGHT
			- ChessFootballMath.GOAL_FRAME_CROSSBAR_RADIUS
			- 1.0,
		)
		ball.vertical_velocity = -maxf(
			absf(ball.vertical_velocity) * 0.55,
			GOAL_CROSSBAR_DROP_SPEED,
		)

	if audio_fx != null:
		audio_fx.play_goal_frame(impact_speed)
	return kind

func _check_goal() -> void:
	if not ChessFootballMath.in_goal_mouth(ball.global_position):
		return
	if not ChessFootballMath.ball_fits_under_crossbar(ball.flight_height):
		return
	if ball.global_position.x > ChessFootballMath.PITCH_RECT.end.x + 8.0:
		_score_goal(0)
	elif ball.global_position.x < ChessFootballMath.PITCH_RECT.position.x - 8.0:
		_score_goal(1)

func _score_goal(team_id: int) -> void:
	if goal_restart_active or kickoff_active or set_piece_active:
		return
	score[team_id] += 1
	last_goal_text = "GOAL · FC Matthias" if team_id == 0 else "GOAL · Real Enroque"
	if audio_fx != null:
		audio_fx.play_goal()
	for player in teams[team_id]:
		player.velocity = Vector2.ZERO
		player.play_action("celebrate", GOAL_CELEBRATION_SECONDS)
	for player in teams[1 - team_id]:
		player.velocity = Vector2.ZERO
	if ball.carrier != null:
		ball.release(Vector2.ZERO, 0.0)
	ball.velocity = Vector2.ZERO
	ball.vertical_velocity = 0.0
	ball.flight_height = 0.0
	goal_restart_active = true
	goal_restart_seconds_remaining = GOAL_CELEBRATION_SECONDS
	pending_restart_team_id = 1 - team_id

func _update_goal_restart(delta: float) -> void:
	goal_restart_seconds_remaining = maxf(0.0, goal_restart_seconds_remaining - delta)
	for id in range(2):
		for player in teams[id]:
			player.velocity = Vector2.ZERO
	if goal_restart_seconds_remaining > 0.0:
		return
	goal_restart_active = false
	_prepare_kickoff(pending_restart_team_id, false)

func _team_name(team_id: int) -> String:
	return "FC Matthias" if team_id == 0 else "Real Enroque"

func _in_penalty_area(attacking_team_id: int, point: Vector2) -> bool:
	var pitch := ChessFootballMath.PITCH_RECT
	var center_y := pitch.get_center().y
	var inside_depth := (
		point.x >= pitch.end.x - ChessFootballMath.PENALTY_AREA_DEPTH
		if attacking_team_id == 0
		else point.x <= pitch.position.x + ChessFootballMath.PENALTY_AREA_DEPTH
	)
	return inside_depth and absf(point.y - center_y) <= ChessFootballMath.PENALTY_AREA_HALF_WIDTH

func _penalty_spot(attacking_team_id: int) -> Vector2:
	var pitch := ChessFootballMath.PITCH_RECT
	var x := (
		pitch.end.x - ChessFootballMath.PENALTY_SPOT_DEPTH
		if attacking_team_id == 0
		else pitch.position.x + ChessFootballMath.PENALTY_SPOT_DEPTH
	)
	return Vector2(x, pitch.get_center().y)

func _nearest_outfield_player_to_point(team_id: int, point: Vector2) -> Footballer:
	var best: Footballer = null
	var best_distance := INF
	for player in teams[team_id]:
		if player.sent_off or player.role == "keeper":
			continue
		var distance: float = player.global_position.distance_squared_to(point)
		if distance < best_distance:
			best_distance = distance
			best = player
	return best

func _restart_receiver(team_id: int, restarter: Footballer, kind: String) -> Footballer:
	var best: Footballer = null
	var best_score := INF
	var target_goal := ChessFootballMath.goal_center(team_id)
	for teammate in teams[team_id]:
		if teammate.sent_off or teammate == restarter:
			continue
		var score_value: float = teammate.global_position.distance_squared_to(set_piece_spot)
		if kind == "CÓRNER":
			score_value = teammate.global_position.distance_squared_to(target_goal)
		elif kind == "SAQUE DE PUERTA":
			score_value = teammate.global_position.distance_squared_to(ChessFootballMath.PITCH_RECT.get_center())
		if score_value < best_score:
			best_score = score_value
			best = teammate
	return best

func _place_restart_player(player: Footballer, position: Vector2) -> void:
	if player == null or player.sent_off:
		return
	player.global_position = ChessFootballMath.clamp_to_pitch(position)
	player.velocity = Vector2.ZERO

func _arrange_set_piece_formation(kind: String) -> void:
	var pitch := ChessFootballMath.PITCH_RECT
	var center := pitch.get_center()
	var direction := 1.0 if set_piece_team_id == 0 else -1.0
	var opponent_id := 1 - set_piece_team_id

	if kind == "PENALTI":
		var target_goal := ChessFootballMath.goal_center(set_piece_team_id)
		var defending_keeper: Footballer = teams[opponent_id][0]
		_place_restart_player(
			defending_keeper,
			Vector2(target_goal.x - direction * 42.0, target_goal.y),
		)
		var outside_x := target_goal.x - direction * (ChessFootballMath.PENALTY_AREA_DEPTH + 145.0)
		var attack_slots: Array[Vector2] = [
			Vector2(outside_x - direction * 45.0, center.y - 260.0),
			Vector2(outside_x - direction * 95.0, center.y),
			Vector2(outside_x - direction * 45.0, center.y + 260.0),
		]
		var defend_slots: Array[Vector2] = [
			Vector2(outside_x + direction * 25.0, center.y - 285.0),
			Vector2(outside_x - direction * 15.0, center.y - 90.0),
			Vector2(outside_x - direction * 15.0, center.y + 90.0),
			Vector2(outside_x + direction * 25.0, center.y + 285.0),
		]
		var attack_slot_index := 0
		for teammate in teams[set_piece_team_id]:
			if teammate == set_piece_player:
				continue
			if teammate.role == "keeper":
				_place_restart_player(teammate, teammate.home_position)
				continue
			var attack_slot: Vector2 = attack_slots[mini(attack_slot_index, attack_slots.size() - 1)]
			_place_restart_player(teammate, attack_slot)
			attack_slot_index += 1
		var defend_slot_index := 0
		for opponent in teams[opponent_id]:
			if opponent == defending_keeper:
				continue
			var defend_slot: Vector2 = defend_slots[mini(defend_slot_index, defend_slots.size() - 1)]
			_place_restart_player(opponent, defend_slot)
			defend_slot_index += 1
		return

	if kind == "CÓRNER":
		var target_goal := ChessFootballMath.goal_center(set_piece_team_id)
		for player in teams[set_piece_team_id]:
			if player == set_piece_player:
				continue
			if player.role == "keeper":
				_place_restart_player(player, player.home_position)
				continue
			var offset_y: float = float([-150.0, -70.0, 70.0, 145.0][clampi(player.squad_index - 1, 0, 3)])
			var depth: float = float([330.0, 190.0, 120.0, 90.0][clampi(player.squad_index - 1, 0, 3)])
			_place_restart_player(
				player,
				Vector2(target_goal.x - direction * depth, target_goal.y + offset_y)
			)
		for defender in teams[opponent_id]:
			if defender.role == "keeper":
				_place_restart_player(
					defender,
					Vector2(target_goal.x - direction * 72.0, target_goal.y)
				)
				continue
			var mark_y: float = float([-125.0, -45.0, 50.0, 130.0][clampi(defender.squad_index - 1, 0, 3)])
			var mark_depth: float = float([115.0, 135.0, 150.0, 205.0][clampi(defender.squad_index - 1, 0, 3)])
			_place_restart_player(
				defender,
				Vector2(target_goal.x - direction * mark_depth, target_goal.y + mark_y)
			)
		return

	if kind == "FALTA":
		# Keep the free kick close to the real foul spot. Teammates only clear
		# enough room for the taker while opponents must retreat from the ball.
		for teammate in teams[set_piece_team_id]:
			if teammate == set_piece_player or teammate.role == "keeper":
				continue
			var teammate_offset: Vector2 = teammate.global_position - set_piece_spot
			if teammate_offset.length() < 105.0:
				var teammate_away: Vector2 = teammate_offset.normalized() if teammate_offset.length_squared() > 0.001 else Vector2(-direction, 0.0)
				_place_restart_player(teammate, set_piece_spot + teammate_away * 105.0)
		for opponent in teams[opponent_id]:
			if opponent.role == "keeper":
				continue
			var opponent_offset: Vector2 = opponent.global_position - set_piece_spot
			if opponent_offset.length() < 165.0:
				var opponent_away: Vector2 = opponent_offset.normalized() if opponent_offset.length_squared() > 0.001 else Vector2(-direction, 0.0)
				_place_restart_player(opponent, set_piece_spot + opponent_away * 165.0)
		return

	if kind == "SAQUE DE PUERTA":
		var own_goal := ChessFootballMath.goal_center(opponent_id)
		for player in teams[set_piece_team_id]:
			if player == set_piece_player:
				continue
			var lane_y: float = float([-190.0, -70.0, 90.0, 190.0][clampi(player.squad_index - 1, 0, 3)])
			var advance: float = float([250.0, 390.0, 520.0, 650.0][clampi(player.squad_index - 1, 0, 3)])
			_place_restart_player(
				player,
				Vector2(own_goal.x + direction * advance, center.y + lane_y)
			)
		for opponent in teams[opponent_id]:
			if opponent.role == "keeper":
				_place_restart_player(opponent, opponent.home_position)
				continue
			var opponent_y: float = float([-180.0, -60.0, 70.0, 175.0][clampi(opponent.squad_index - 1, 0, 3)])
			_place_restart_player(
				opponent,
				Vector2(center.x + direction * 90.0, center.y + opponent_y)
			)
		return

	# Throw-ins keep the broad match shape but create nearby passing options and
	# a small defending buffer so the restart reads instead of becoming a scrum.
	var inward_y := 1.0 if set_piece_spot.y < center.y else -1.0
	var receiver_slots: Array[Vector2] = [
		Vector2(-120.0 * direction, 115.0 * inward_y),
		Vector2(115.0 * direction, 145.0 * inward_y),
		Vector2(250.0 * direction, 80.0 * inward_y),
	]
	var receiver_index := 0
	for player in teams[set_piece_team_id]:
		if player == set_piece_player or player.role == "keeper":
			continue
		var slot: Vector2 = receiver_slots[mini(receiver_index, receiver_slots.size() - 1)]
		_place_restart_player(player, set_piece_spot + slot)
		receiver_index += 1
	for opponent in teams[opponent_id]:
		if opponent.role == "keeper":
			continue
		var offset: Vector2 = opponent.global_position - set_piece_spot
		if offset.length() < 130.0:
			var away: Vector2 = offset.normalized() if offset.length_squared() > 0.001 else Vector2(0.0, inward_y)
			_place_restart_player(opponent, set_piece_spot + away * 130.0)

func _prepare_set_piece(kind: String, team_id: int, spot: Vector2) -> void:
	_cancel_shot_charge()
	penalty_human_ready = false
	penalty_aim_y = 0.0
	pending_tackle_player = null
	pending_tackle_seconds = 0.0
	set_piece_active = true
	set_piece_seconds_remaining = RESTART_FREEZE_SECONDS
	set_piece_team_id = clampi(team_id, 0, 1)
	set_piece_kind = kind
	set_piece_spot = ChessFootballMath.clamp_to_pitch(spot)

	for id in range(2):
		for player in teams[id]:
			player.velocity = Vector2.ZERO

	if kind == "SAQUE DE PUERTA":
		set_piece_player = teams[set_piece_team_id][0]
	else:
		set_piece_player = _nearest_outfield_player_to_point(set_piece_team_id, set_piece_spot)
	_arrange_set_piece_formation(kind)
	set_piece_player.global_position = set_piece_spot - set_piece_player.ball_anchor()
	set_piece_player.velocity = Vector2.ZERO
	ball.attach_to(set_piece_player)
	var restart_notice := "%s · %s" % [kind, _team_name(set_piece_team_id)]
	last_goal_text = (
		"%s · %s" % [card_notice, restart_notice]
		if card_notice != ""
		else restart_notice
	)
	card_notice = ""

	if set_piece_team_id == 0:
		_select_player(set_piece_player)
	elif kind == "PENALTI":
		_select_player(teams[0][0])
	else:
		_select_player(_nearest_player_to_ball(0))

func _update_set_piece(delta: float) -> void:
	set_piece_seconds_remaining = maxf(0.0, set_piece_seconds_remaining - delta)
	for id in range(2):
		for player in teams[id]:
			player.velocity = Vector2.ZERO

	if set_piece_kind == "PENALTI" and set_piece_team_id == 1:
		var keeper_axis := Input.get_axis("move_up", "move_down")
		_move_human_penalty_keeper(keeper_axis, delta)

	if set_piece_seconds_remaining > 0.0:
		return

	if set_piece_kind == "PENALTI":
		if set_piece_team_id == 0:
			penalty_human_ready = true
			last_goal_text = "PENALTI · W/S APUNTA · ENTER CARGA"
			_update_human_penalty_input(delta)
			return
		set_piece_active = false
		last_goal_text = ""
		if audio_fx != null:
			audio_fx.play_whistle()
		_release_ai_penalty()
		return

	set_piece_active = false
	last_goal_text = ""
	if audio_fx != null:
		audio_fx.play_whistle()
	var restarter := set_piece_player
	var receiver := _restart_receiver(set_piece_team_id, restarter, set_piece_kind)
	var direction := ChessFootballMath.PITCH_RECT.get_center() - restarter.global_position
	var power := RESTART_THROW_POWER
	var lift := 0.0
	if receiver != null:
		direction = receiver.global_position - restarter.global_position
	if set_piece_kind == "CÓRNER":
		power = RESTART_CORNER_POWER
		lift = RESTART_CORNER_LIFT
	elif set_piece_kind == "SAQUE DE PUERTA":
		power = RESTART_GOAL_KICK_POWER
		lift = 70.0
	restarter.play_action("pass", 0.66)
	if audio_fx != null:
		audio_fx.play_pass()
	ball.release(direction, power, lift)
	if set_piece_team_id == 0 and receiver != null:
		_select_player(receiver)
	set_piece_player = null

func _penalty_target(team_id: int, aim_y: float) -> Vector2:
	var goal := ChessFootballMath.goal_center(team_id)
	var safe_half_span := maxf(
		12.0,
		ChessFootballMath.GOAL_HALF_HEIGHT
			- ChessFootballMath.GOAL_FRAME_POST_RADIUS
			- PENALTY_TARGET_MARGIN
	)
	return Vector2(
		goal.x,
		goal.y + clampf(aim_y, -1.0, 1.0) * safe_half_span,
	)

func _update_human_penalty_input(delta: float) -> void:
	var aim_axis := Input.get_axis("move_up", "move_down")
	if absf(aim_axis) > 0.05:
		penalty_aim_y = clampf(penalty_aim_y + aim_axis * delta * 1.45, -1.0, 1.0)
	if Input.is_action_just_pressed("shoot_ball") and not shot_charging:
		_begin_shot_charge(penalty_aim_y)
	if shot_charging:
		shot_charge_seconds = minf(SHOT_CHARGE_SECONDS, shot_charge_seconds + delta)
		shot_aim_y_input = penalty_aim_y
		if Input.is_action_just_released("shoot_ball"):
			_release_human_penalty()

func _release_human_penalty() -> void:
	if not set_piece_active or set_piece_kind != "PENALTI" or set_piece_team_id != 0:
		return
	if not penalty_human_ready or set_piece_player == null:
		return
	var ratio := _shot_charge_ratio()
	var restarter := set_piece_player
	var target := _penalty_target(0, penalty_aim_y)
	var power := _shot_power_from_ratio(ratio)
	var lift := _safe_shot_lift(
		restarter,
		target,
		power,
		_shot_lift_from_ratio(ratio),
	)
	shot_charging = false
	shot_charge_seconds = 0.0
	shot_aim_y_input = 0.0
	penalty_human_ready = false
	set_piece_active = false
	last_goal_text = ""
	restarter.play_action("shoot", lerpf(0.58, 0.82, ratio))
	if audio_fx != null:
		audio_fx.play_whistle()
		audio_fx.play_shot(ratio)
	ball.release(target - restarter.global_position, power, lift)
	set_piece_player = null

func _release_ai_penalty() -> void:
	var restarter := set_piece_player
	if restarter == null:
		return
	var penalty_goal := ChessFootballMath.goal_center(set_piece_team_id)
	var defending_keeper: Footballer = teams[1 - set_piece_team_id][0]
	var keeper_side := signf(defending_keeper.global_position.y - penalty_goal.y)
	if absf(keeper_side) < 0.01:
		keeper_side = 1.0
	var penalty_target := _penalty_target(set_piece_team_id, -keeper_side * 0.78)
	var penalty_lift := _safe_shot_lift(
		restarter,
		penalty_target,
		PENALTY_SHOT_POWER,
		PENALTY_SHOT_LIFT,
	)
	restarter.play_action("shoot", 0.78)
	if audio_fx != null:
		audio_fx.play_shot(0.68)
	ball.release(penalty_target - restarter.global_position, PENALTY_SHOT_POWER, penalty_lift)
	set_piece_player = null

func _move_human_penalty_keeper(axis: float, delta: float) -> void:
	var keeper: Footballer = teams[0][0]
	if keeper == null or keeper.sent_off:
		return
	var goal := ChessFootballMath.goal_center(1)
	var y_limit := ChessFootballMath.GOAL_HALF_HEIGHT - 14.0
	keeper.global_position.y = clampf(
		keeper.global_position.y + clampf(axis, -1.0, 1.0) * PENALTY_KEEPER_MOVE_SPEED * delta,
		goal.y - y_limit,
		goal.y + y_limit,
	)
	keeper.velocity = Vector2.ZERO

func penalty_preview_visible() -> bool:
	return (
		set_piece_active
		and set_piece_kind == "PENALTI"
		and set_piece_team_id == 0
		and penalty_human_ready
	)

func penalty_preview_target() -> Vector2:
	return _penalty_target(0, penalty_aim_y)

func _check_ball_out() -> void:
	if goal_restart_active or kickoff_active or set_piece_active or ball.carrier != null:
		return
	var pitch := ChessFootballMath.PITCH_RECT
	var point := ball.global_position
	var last_touch := ball.last_touch_team_id

	if point.y < pitch.position.y - RESTART_OUT_MARGIN or point.y > pitch.end.y + RESTART_OUT_MARGIN:
		var restart_team := 1 - last_touch if last_touch in [0, 1] else 0
		var restart_y := pitch.position.y + RESTART_TOUCHLINE_INSET if point.y < pitch.position.y else pitch.end.y - RESTART_TOUCHLINE_INSET
		var restart_x := clampf(point.x, pitch.position.x + 90.0, pitch.end.x - 90.0)
		_prepare_set_piece("SAQUE DE BANDA", restart_team, Vector2(restart_x, restart_y))
		return

	var beyond_right := point.x > pitch.end.x + RESTART_OUT_MARGIN
	var beyond_left := point.x < pitch.position.x - RESTART_OUT_MARGIN
	if not beyond_right and not beyond_left:
		return
	if ChessFootballMath.in_goal_mouth(point) and ChessFootballMath.ball_fits_under_crossbar(ball.flight_height):
		return

	var attacking_team := 0 if beyond_right else 1
	var defending_team := 1 - attacking_team
	if last_touch == defending_team:
		var corner_y := pitch.position.y + RESTART_GOAL_LINE_INSET if point.y < pitch.get_center().y else pitch.end.y - RESTART_GOAL_LINE_INSET
		var corner_x := pitch.end.x - RESTART_GOAL_LINE_INSET if beyond_right else pitch.position.x + RESTART_GOAL_LINE_INSET
		_prepare_set_piece("CÓRNER", attacking_team, Vector2(corner_x, corner_y))
	else:
		var goal_kick_x := pitch.end.x - 120.0 if beyond_right else pitch.position.x + 120.0
		_prepare_set_piece("SAQUE DE PUERTA", defending_team, Vector2(goal_kick_x, pitch.get_center().y))

func _kickoff_position(team_id: int, player: Footballer) -> Vector2:
	var center := ChessFootballMath.PITCH_RECT.get_center()
	var side := -1.0 if team_id == 0 else 1.0
	var gap := KICKOFF_TEAM_HALF_GAP if team_id == kickoff_team_id else KICKOFF_RIVAL_HALF_GAP
	match player.squad_index:
		0:
			return player.home_position
		1:
			return Vector2(center.x + side * 390.0, center.y - 170.0)
		2:
			return Vector2(center.x + side * (gap + 80.0), center.y)
		3:
			return Vector2(center.x + side * (gap + 230.0), center.y + 180.0)
		4:
			return Vector2(center.x + side * gap, center.y - 150.0)
	return player.home_position

func _prepare_kickoff(team_id: int, is_initial: bool) -> void:
	_cancel_shot_charge()
	penalty_human_ready = false
	penalty_aim_y = 0.0
	pending_tackle_player = null
	pending_tackle_seconds = 0.0
	goal_restart_active = false
	goal_restart_seconds_remaining = 0.0
	set_piece_active = false
	set_piece_player = null
	kickoff_team_id = clampi(team_id, 0, 1)
	kickoff_active = true
	kickoff_seconds_remaining = KICKOFF_FREEZE_SECONDS

	for id in range(2):
		for player in teams[id]:
			player.global_position = _kickoff_position(id, player)
			player.velocity = Vector2.ZERO

	var center := ChessFootballMath.PITCH_RECT.get_center()
	var starter: Footballer = teams[kickoff_team_id][2]
	if starter.sent_off:
		starter = _nearest_outfield_player_to_point(kickoff_team_id, center)
	starter.global_position = center - starter.ball_anchor()
	starter.velocity = Vector2.ZERO
	ball.attach_to(starter)
	ball.velocity = Vector2.ZERO

	if kickoff_team_id == 0:
		_select_player(starter)
	else:
		_select_player(_nearest_player_to_ball(0))

	var team_name := "FC Matthias" if kickoff_team_id == 0 else "Real Enroque"
	last_goal_text = ("SACA · " if is_initial else "REANUDA · ") + team_name

func _update_kickoff(delta: float) -> void:
	kickoff_seconds_remaining = maxf(0.0, kickoff_seconds_remaining - delta)
	for id in range(2):
		for player in teams[id]:
			player.velocity = Vector2.ZERO
	if kickoff_seconds_remaining > 0.0:
		return

	kickoff_active = false
	last_goal_text = ""
	if audio_fx != null:
		audio_fx.play_whistle()
	var starter: Footballer = teams[kickoff_team_id][2]
	var receiver: Footballer = teams[kickoff_team_id][KICKOFF_RECEIVER_INDEX]
	starter.play_action("pass", 0.60)
	if audio_fx != null:
		audio_fx.play_pass()
	ball.release(receiver.global_position - starter.global_position, KICKOFF_AI_PASS_POWER)
	if kickoff_team_id == 0:
		_select_player(receiver)

func _toggle_camera_mode() -> void:
	camera_mode = CAMERA_MODE_TACTICAL if camera_mode == CAMERA_MODE_BROADCAST else CAMERA_MODE_BROADCAST
	camera_hint_seconds = 4.5

func _update_3d_presentation(delta: float) -> void:
	if presentation_3d != null:
		presentation_3d.sync_presentation(delta, camera_mode)

func _spawn_match() -> void:
	var pitch := ChessFootballMath.PITCH_RECT
	# Formation is stored in normalized pitch coordinates so enlarging the field
	# creates actual playable space instead of leaving both teams clustered in
	# the old 1640x860 footprint.
	var home_x_ratio := [0.09, 0.26, 0.40, 0.46, 0.58]
	var home_y_ratio := [0.48, 0.29, 0.48, 0.67, 0.48]
	for team_id in range(2):
		for index in range(TEAM_SIZE):
			var x: float = pitch.position.x + pitch.size.x * float(home_x_ratio[index])
			if team_id == 1:
				x = pitch.end.x - pitch.size.x * float(home_x_ratio[index])
			var position := Vector2(
				x,
				pitch.position.y + pitch.size.y * float(home_y_ratio[index]),
			)
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

func debug_audio_ready() -> bool:
	return audio_fx != null

func debug_audio_stream_names() -> Array[String]:
	return audio_fx.debug_stream_names() if audio_fx != null else []

func debug_3d_animated_players() -> int:
	return presentation_3d.debug_animated_players() if presentation_3d != null else 0

func debug_3d_visible_players() -> int:
	return presentation_3d.debug_visible_players() if presentation_3d != null else 0

func debug_penalty_aim_visible() -> bool:
	return presentation_3d.debug_penalty_aim_visible() if presentation_3d != null else false

func debug_3d_ball_height() -> float:
	return presentation_3d.debug_ball_render_height() if presentation_3d != null else -1.0

func debug_sync_presentation() -> void:
	_update_3d_presentation(0.0)

func debug_focus_presentation() -> void:
	_update_3d_presentation(1.0)

func debug_refresh_hud() -> void:
	_refresh_hud()

func debug_try_tackle(player: Footballer, aggressive: bool = false) -> bool:
	return _try_tackle(player, aggressive)

func debug_penalty_area_contains(attacking_team_id: int, point: Vector2) -> bool:
	return _in_penalty_area(attacking_team_id, point)

func debug_penalty_spot(attacking_team_id: int) -> Vector2:
	return _penalty_spot(attacking_team_id)

func debug_set_piece_spot() -> Vector2:
	return set_piece_spot

func debug_prepare_penalty(team_id: int) -> void:
	_prepare_set_piece("PENALTI", team_id, _penalty_spot(team_id))

func debug_human_penalty_ready() -> bool:
	return penalty_human_ready

func debug_penalty_target(aim_y: float) -> Vector2:
	return _penalty_target(0, aim_y)

func debug_set_penalty_aim(aim_y: float) -> void:
	penalty_aim_y = clampf(aim_y, -1.0, 1.0)

func debug_force_human_penalty_shot(ratio: float, aim_y: float) -> void:
	penalty_human_ready = true
	penalty_aim_y = clampf(aim_y, -1.0, 1.0)
	_begin_shot_charge(penalty_aim_y)
	shot_charge_seconds = SHOT_CHARGE_SECONDS * clampf(ratio, 0.0, 1.0)
	_release_human_penalty()

func debug_move_penalty_keeper(axis: float, delta: float) -> void:
	_move_human_penalty_keeper(axis, delta)

func debug_apply_foul_card(
	player: Footballer,
	aggressive: bool = true,
	forward_distance: float = 20.0,
) -> String:
	return _apply_foul_card(
		player,
		{
			"aggressive": aggressive,
			"forward_distance": forward_distance,
		},
	)

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

func debug_goal_restart_active() -> bool:
	return goal_restart_active

func debug_set_piece_active() -> bool:
	return set_piece_active

func debug_set_piece_kind() -> String:
	return set_piece_kind

func debug_set_piece_team() -> int:
	return set_piece_team_id

func debug_check_ball_out() -> void:
	_check_ball_out()

func debug_force_set_piece_ready() -> void:
	if set_piece_active:
		for team in teams:
			for player in team:
				player._process(RESTART_FREEZE_SECONDS)
		_update_set_piece(RESTART_FREEZE_SECONDS)

func debug_force_goal_restart_ready() -> void:
	if goal_restart_active:
		for team in teams:
			for player in team:
				player._process(GOAL_CELEBRATION_SECONDS)
		_update_goal_restart(GOAL_CELEBRATION_SECONDS)

func debug_prepare_kickoff(team_id: int) -> void:
	_prepare_kickoff(team_id, true)

func debug_force_kickoff_ready() -> void:
	if kickoff_active:
		for team in teams:
			for player in team:
				player._process(KICKOFF_FREEZE_SECONDS)
		_update_kickoff(KICKOFF_FREEZE_SECONDS)

func debug_score_goal(team_id: int) -> void:
	_score_goal(team_id)

func debug_check_goal() -> void:
	_check_goal()

func debug_resolve_goal_frame_collision(
	previous_position: Vector2,
	previous_height: float,
) -> String:
	return _resolve_goal_frame_collision(previous_position, previous_height)

func debug_shot_power_for_ratio(ratio: float) -> float:
	return _shot_power_from_ratio(ratio)

func debug_shot_lift_for_ratio(ratio: float) -> float:
	return _shot_lift_from_ratio(ratio)

func debug_shot_profile_for_ratio(ratio: float) -> String:
	return _shot_profile_name(ratio)

func debug_assisted_shot_target(player: Footballer, aim_y: float) -> Vector2:
	return _assisted_shot_target(player, aim_y)

func debug_safe_shot_lift(
	player: Footballer,
	target: Vector2,
	power: float,
	requested_lift: float,
) -> float:
	return _safe_shot_lift(player, target, power, requested_lift)

func debug_predicted_shot_height_at_goal(
	player: Footballer,
	target: Vector2,
	power: float,
	lift: float,
) -> float:
	return _predicted_shot_height_at_goal(player, target, power, lift)

func debug_tackle_hitbox(player: Footballer, target_position: Vector2) -> Dictionary:
	return _tackle_hitbox(player, target_position)

func debug_update_active_tackle_contacts() -> void:
	_update_active_tackle_contacts()

func debug_step_pending_tackle(delta: float) -> void:
	_update_pending_tackle_claim(delta)

func debug_force_shot_charge(ratio: float, aim_y: float = 0.0) -> void:
	shot_charging = true
	shot_charge_seconds = SHOT_CHARGE_SECONDS * clampf(ratio, 0.0, 1.0)
	shot_aim_y_input = clampf(aim_y, -1.0, 1.0)

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
