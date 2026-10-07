extends CanvasLayer

const JOYSTICK_SIZE := Vector2(184.0, 184.0)
const JOYSTICK_RADIUS := 72.0
const JOYSTICK_KNOB_RADIUS := 31.0
const JOYSTICK_LEFT_ZONE_RATIO := 0.48
const JOYSTICK_TOP_GUARD := 118.0
const AUTO_SPRINT_THRESHOLD := 0.84
const SPRINT_DOUBLE_TAP_MSEC := 300
const SPRINT_QUICK_TAP_MSEC := 190
const SPRINT_TAP_MAX_TRAVEL := 24.0
const SPRINT_DOUBLE_TAP_MAX_DISTANCE := 56.0
const PLAYER_TOUCH_RADIUS := 76.0
const PLAYER_TOUCH_RADIUS_LEFT_ZONE := 58.0
const GOAL_TOUCH_HALF_WIDTH := 118.0
const GOAL_TOUCH_HALF_HEIGHT := 150.0
const AGGRESSIVE_TACKLE_HOLD_SECONDS := 0.34
const SHOT_AIM_SCREEN_SPAN := 132.0
const MOBILE_HELP := "TÁCTIL · joystick mueve · doble toque+mantén sprint · césped libre regate · compañero pase · rival entrada · portería tiro"

var touch_root: Control
var joystick_base: Panel
var joystick_knob: Panel
var joystick_touch_index: int = -1
var joystick_origin: Vector2 = Vector2.ZERO
var joystick_vector: Vector2 = Vector2.ZERO
var joystick_started_msec: int = 0
var joystick_start_position: Vector2 = Vector2.ZERO
var joystick_max_travel: float = 0.0
var last_quick_tap_msec: int = -10000
var last_quick_tap_position: Vector2 = Vector2.ZERO
var joystick_sprint_latched: bool = false
var context_touches: Dictionary = {}
var touch_capable: bool = false
var debug_force_visible: bool = false
var last_controls_active: bool = false

func _ready() -> void:
	layer = 19
	touch_capable = _detect_touch_capability()
	_build_touch_hud()
	_sync_visibility()

func _process(_delta: float) -> void:
	_sync_visibility()
	if touch_root.visible:
		var match_node = get_parent()
		if match_node != null and match_node.help_label != null:
			match_node.help_label.text = MOBILE_HELP

func _exit_tree() -> void:
	_release_all_inputs()

func _unhandled_input(event: InputEvent) -> void:
	if touch_root == null or not touch_root.visible:
		return
	var handled := false
	if event is InputEventScreenTouch:
		handled = (
			_touch_down(event.index, event.position)
			if event.pressed
			else _touch_up(event.index, event.position)
		)
	elif event is InputEventScreenDrag:
		handled = _touch_drag(event.index, event.position)
	if handled:
		get_viewport().set_input_as_handled()

func _detect_touch_capability() -> bool:
	if DisplayServer.is_touchscreen_available():
		return true
	if OS.has_feature("web"):
		var result = JavaScriptBridge.eval(
			"Boolean(('ontouchstart' in window) || (navigator.maxTouchPoints > 0))",
			true
		)
		return bool(result)
	return false

func _build_touch_hud() -> void:
	touch_root = Control.new()
	touch_root.name = "TouchHUD"
	touch_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(touch_root)

	joystick_base = Panel.new()
	joystick_base.name = "FloatingJoystick"
	joystick_base.size = JOYSTICK_SIZE
	joystick_base.visible = false
	joystick_base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	joystick_base.add_theme_stylebox_override(
		"panel",
		_circle_style(Color(0.03, 0.07, 0.10, 0.34), Color(0.86, 0.76, 0.42, 0.48), 2)
	)
	touch_root.add_child(joystick_base)

	joystick_knob = Panel.new()
	joystick_knob.name = "FloatingJoystickKnob"
	var knob_size := JOYSTICK_KNOB_RADIUS * 2.0
	joystick_knob.size = Vector2(knob_size, knob_size)
	joystick_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE
	joystick_knob.add_theme_stylebox_override(
		"panel",
		_circle_style(Color(0.89, 0.76, 0.32, 0.70), Color(1.0, 0.93, 0.68, 0.78), 2)
	)
	joystick_base.add_child(joystick_knob)
	_reset_joystick_visual()

func _circle_style(fill: Color, border: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(border_width)
	style.corner_radius_top_left = 120
	style.corner_radius_top_right = 120
	style.corner_radius_bottom_left = 120
	style.corner_radius_bottom_right = 120
	return style

func _sync_visibility() -> void:
	if touch_root == null:
		return
	var match_node = get_parent()
	var pause_open := false
	if match_node != null:
		pause_open = bool(match_node.get("pause_menu_open"))
	var should_show := (touch_capable or debug_force_visible) and not pause_open
	if last_controls_active and not should_show:
		_release_all_inputs()
	touch_root.visible = should_show
	last_controls_active = should_show

func _touch_down(index: int, position: Vector2) -> bool:
	var match_node = get_parent()
	if match_node == null:
		return false

	var left_zone := _in_joystick_zone(position)
	var player_radius := PLAYER_TOUCH_RADIUS_LEFT_ZONE if left_zone else PLAYER_TOUCH_RADIUS
	var target: Dictionary = match_node.mobile_touch_target(
		position,
		player_radius,
		GOAL_TOUCH_HALF_WIDTH,
		GOAL_TOUCH_HALF_HEIGHT,
	)
	if not target.is_empty():
		var kind := String(target.get("kind", ""))
		if kind == "goal":
			var aim_y := _shot_aim_from_position(position)
			if match_node.mobile_begin_context_shot(aim_y):
				context_touches[index] = {
					"kind": "goal",
					"started_msec": Time.get_ticks_msec(),
				}
				return true
		elif kind == "teammate":
			var player = target.get("player")
			if match_node.mobile_begin_context_pass(player):
				context_touches[index] = {
					"kind": "pass",
					"player": player,
					"started_msec": Time.get_ticks_msec(),
				}
			else:
				context_touches[index] = {
					"kind": "teammate",
					"player": player,
					"started_msec": Time.get_ticks_msec(),
				}
			return true
		elif kind == "opponent":
			context_touches[index] = {
				"kind": "opponent",
				"player": target.get("player"),
				"started_msec": Time.get_ticks_msec(),
			}
			return true

	if not left_zone and match_node.mobile_activate_dribble(position):
		context_touches[index] = {"kind": "dribble"}
		return true
	if joystick_touch_index == -1 and left_zone:
		_begin_joystick(index, position)
		return true
	return false

func _touch_drag(index: int, position: Vector2) -> bool:
	if index == joystick_touch_index:
		_update_joystick(position)
		return true
	if not context_touches.has(index):
		return false
	var context: Dictionary = context_touches[index]
	if String(context.get("kind", "")) == "goal":
		var match_node = get_parent()
		if match_node != null:
			match_node.mobile_update_context_shot(_shot_aim_from_position(position))
		return true
	return true

func _touch_up(index: int, position: Vector2) -> bool:
	if index == joystick_touch_index:
		_release_joystick()
		return true
	if not context_touches.has(index):
		return false

	var context: Dictionary = context_touches[index]
	context_touches.erase(index)
	var match_node = get_parent()
	if match_node == null:
		return true

	var kind := String(context.get("kind", ""))
	if kind == "goal":
		match_node.mobile_update_context_shot(_shot_aim_from_position(position))
		match_node.mobile_release_context_shot()
		return true
	if kind == "pass":
		match_node.mobile_release_context_pass()
		return true

	var player = context.get("player")
	if not is_instance_valid(player):
		return true
	if kind == "teammate":
		match_node.mobile_activate_teammate(player)
		return true
	if kind == "opponent":
		var held_seconds := (
			float(Time.get_ticks_msec() - int(context.get("started_msec", Time.get_ticks_msec())))
			/ 1000.0
		)
		match_node.mobile_activate_opponent(
			player,
			held_seconds >= AGGRESSIVE_TACKLE_HOLD_SECONDS,
		)
		return true
	return true

func _in_joystick_zone(position: Vector2) -> bool:
	var viewport_size := get_viewport().get_visible_rect().size
	return (
		position.x <= viewport_size.x * JOYSTICK_LEFT_ZONE_RATIO
		and position.y >= JOYSTICK_TOP_GUARD
	)

func _begin_joystick(index: int, position: Vector2) -> void:
	joystick_touch_index = index
	var now := Time.get_ticks_msec()
	joystick_sprint_latched = (
		now - last_quick_tap_msec <= SPRINT_DOUBLE_TAP_MSEC
		and position.distance_to(last_quick_tap_position) <= SPRINT_DOUBLE_TAP_MAX_DISTANCE
	)
	if joystick_sprint_latched:
		last_quick_tap_msec = -10000
	joystick_started_msec = now
	joystick_start_position = position
	joystick_max_travel = 0.0
	var viewport_size := get_viewport().get_visible_rect().size
	var wanted := position - JOYSTICK_SIZE * 0.5
	joystick_base.position = Vector2(
		clampf(wanted.x, 10.0, maxf(10.0, viewport_size.x - JOYSTICK_SIZE.x - 10.0)),
		clampf(wanted.y, 10.0, maxf(10.0, viewport_size.y - JOYSTICK_SIZE.y - 10.0)),
	)
	joystick_origin = joystick_base.position + JOYSTICK_SIZE * 0.5
	joystick_base.visible = true
	_apply_joystick(Vector2.ZERO)

func _update_joystick(position: Vector2) -> void:
	joystick_max_travel = maxf(joystick_max_travel, position.distance_to(joystick_start_position))
	var offset := position - joystick_origin
	if offset.length() > JOYSTICK_RADIUS:
		offset = offset.normalized() * JOYSTICK_RADIUS
	_apply_joystick(offset / JOYSTICK_RADIUS)

func _apply_joystick(value: Vector2) -> void:
	joystick_vector = value.limit_length(1.0)
	_set_action_strength("move_left", maxf(0.0, -joystick_vector.x))
	_set_action_strength("move_right", maxf(0.0, joystick_vector.x))
	_set_action_strength("move_up", maxf(0.0, -joystick_vector.y))
	_set_action_strength("move_down", maxf(0.0, joystick_vector.y))
	if joystick_sprint_latched or joystick_vector.length() >= AUTO_SPRINT_THRESHOLD:
		Input.action_press("sprint")
	else:
		Input.action_release("sprint")
	if joystick_knob != null:
		var base_center := JOYSTICK_SIZE * 0.5
		joystick_knob.position = (
			base_center
			+ joystick_vector * JOYSTICK_RADIUS
			- joystick_knob.size * 0.5
		)

func _set_action_strength(action: String, strength: float) -> void:
	if strength > 0.01:
		Input.action_press(action, strength)
	else:
		Input.action_release(action)

func _release_joystick() -> void:
	var now := Time.get_ticks_msec()
	var held_msec := now - joystick_started_msec
	if (
		not joystick_sprint_latched
		and held_msec <= SPRINT_QUICK_TAP_MSEC
		and joystick_max_travel <= SPRINT_TAP_MAX_TRAVEL
	):
		last_quick_tap_msec = now
		last_quick_tap_position = joystick_start_position
	joystick_touch_index = -1
	joystick_vector = Vector2.ZERO
	joystick_sprint_latched = false
	joystick_started_msec = 0
	joystick_max_travel = 0.0
	for action in ["move_left", "move_right", "move_up", "move_down", "sprint"]:
		Input.action_release(action)
	_reset_joystick_visual()
	if joystick_base != null:
		joystick_base.visible = false

func _reset_joystick_visual() -> void:
	if joystick_knob == null:
		return
	var base_center := JOYSTICK_SIZE * 0.5
	joystick_knob.position = base_center - joystick_knob.size * 0.5

func _shot_aim_from_position(position: Vector2) -> float:
	var match_node = get_parent()
	if match_node == null:
		return 0.0
	var goal_position: Vector2 = match_node.mobile_attack_goal_screen_position()
	if goal_position.x < 0.0:
		return 0.0
	return clampf((position.y - goal_position.y) / SHOT_AIM_SCREEN_SPAN, -1.0, 1.0)

func _release_all_inputs() -> void:
	if context_touches.size() > 0:
		var match_node = get_parent()
		if match_node != null:
			for context in context_touches.values():
				var kind := String(context.get("kind", ""))
				if kind == "goal":
					match_node.mobile_cancel_context_shot()
				elif kind == "pass":
					match_node.mobile_cancel_context_pass()
	context_touches.clear()
	_release_joystick()

func debug_force_controls_visible(enabled: bool) -> void:
	debug_force_visible = enabled
	_sync_visibility()

func debug_controls_visible() -> bool:
	return touch_root != null and touch_root.visible

func debug_fixed_action_count() -> int:
	return 0

func debug_joystick_visible() -> bool:
	return joystick_base != null and joystick_base.visible

func debug_joystick_origin() -> Vector2:
	return joystick_origin

func debug_sprint_latched() -> bool:
	return joystick_sprint_latched

func debug_touch_down(index: int, position: Vector2) -> bool:
	return _touch_down(index, position)

func debug_touch_move(index: int, position: Vector2) -> bool:
	return _touch_drag(index, position)

func debug_touch_up(index: int, position: Vector2) -> bool:
	return _touch_up(index, position)
