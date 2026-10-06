extends CanvasLayer

const JOYSTICK_RECT := Rect2(28.0, 486.0, 204.0, 204.0)
const JOYSTICK_RADIUS := 88.0
const JOYSTICK_KNOB_RADIUS := 34.0
const MOBILE_HELP := "TÁCTIL · joystick mueve · SPRINT · PASE · mantén TIRO · ENTRADA · CAMBIO · MENÚ arriba"

var touch_root: Control
var joystick_base: Panel
var joystick_knob: Panel
var action_buttons: Dictionary = {}
var action_rects: Dictionary = {}
var joystick_touch_index: int = -1
var action_touches: Dictionary = {}
var joystick_vector: Vector2 = Vector2.ZERO
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
	_sync_button_feedback()

func _exit_tree() -> void:
	_release_all_inputs()

func _unhandled_input(event: InputEvent) -> void:
	if touch_root == null or not touch_root.visible:
		return
	if event is InputEventScreenTouch:
		_handle_touch(event.index, event.position, event.pressed)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag and event.index == joystick_touch_index:
		_update_joystick(event.position)
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
	joystick_base.name = "JoystickBase"
	joystick_base.position = JOYSTICK_RECT.position
	joystick_base.size = JOYSTICK_RECT.size
	joystick_base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	joystick_base.add_theme_stylebox_override(
		"panel",
		_circle_style(Color(0.03, 0.07, 0.10, 0.42), Color(0.86, 0.76, 0.42, 0.58), 2)
	)
	touch_root.add_child(joystick_base)

	joystick_knob = Panel.new()
	joystick_knob.name = "JoystickKnob"
	var knob_size := JOYSTICK_KNOB_RADIUS * 2.0
	joystick_knob.size = Vector2(knob_size, knob_size)
	joystick_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE
	joystick_knob.add_theme_stylebox_override(
		"panel",
		_circle_style(Color(0.89, 0.76, 0.32, 0.78), Color(1.0, 0.93, 0.68, 0.82), 2)
	)
	joystick_base.add_child(joystick_knob)
	_reset_joystick_visual()

	_add_action_button("sprint", "SPRINT", Rect2(910.0, 500.0, 116.0, 58.0))
	_add_action_button("pass_ball", "PASE", Rect2(910.0, 568.0, 116.0, 58.0))
	_add_action_button("shoot_ball", "TIRO", Rect2(1040.0, 486.0, 126.0, 66.0), true)
	_add_action_button("tackle", "ENTRADA", Rect2(1040.0, 564.0, 126.0, 58.0))
	_add_action_button("change_player", "CAMBIO", Rect2(965.0, 636.0, 126.0, 56.0))

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

func _button_style(fill: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(2)
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_left = 14
	style.corner_radius_bottom_right = 14
	return style

func _add_action_button(action: String, label: String, rect: Rect2, primary: bool = false) -> void:
	var button := Button.new()
	button.name = "Touch_" + action
	button.text = label
	button.position = rect.position
	button.size = rect.size
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_theme_font_size_override("font_size", 17 if not primary else 19)
	var fill := Color(0.06, 0.09, 0.12, 0.72)
	var border := Color(0.80, 0.72, 0.48, 0.68)
	if primary:
		fill = Color(0.29, 0.18, 0.03, 0.78)
		border = Color(1.0, 0.74, 0.20, 0.92)
	button.add_theme_stylebox_override("normal", _button_style(fill, border))
	button.add_theme_stylebox_override(
		"pressed",
		_button_style(fill.lightened(0.15), border.lightened(0.06))
	)
	button.add_theme_stylebox_override(
		"hover",
		_button_style(fill.lightened(0.08), border)
	)
	touch_root.add_child(button)
	action_buttons[action] = button
	action_rects[action] = rect

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

func _handle_touch(index: int, position: Vector2, pressed: bool) -> void:
	if pressed:
		if joystick_touch_index == -1 and JOYSTICK_RECT.has_point(position):
			joystick_touch_index = index
			_update_joystick(position)
			return
		var action := _action_at(position)
		if action != "":
			action_touches[index] = action
			Input.action_press(action)
			return
	if index == joystick_touch_index:
		joystick_touch_index = -1
		_apply_joystick(Vector2.ZERO)
		return
	if action_touches.has(index):
		var action := String(action_touches[index])
		action_touches.erase(index)
		Input.action_release(action)

func _action_at(position: Vector2) -> String:
	for action in action_rects:
		var rect: Rect2 = action_rects[action]
		if rect.has_point(position):
			return String(action)
	return ""

func _update_joystick(position: Vector2) -> void:
	var center := JOYSTICK_RECT.get_center()
	var offset := position - center
	if offset.length() > JOYSTICK_RADIUS:
		offset = offset.normalized() * JOYSTICK_RADIUS
	_apply_joystick(offset / JOYSTICK_RADIUS)

func _apply_joystick(value: Vector2) -> void:
	joystick_vector = value.limit_length(1.0)
	_set_action_strength("move_left", maxf(0.0, -joystick_vector.x))
	_set_action_strength("move_right", maxf(0.0, joystick_vector.x))
	_set_action_strength("move_up", maxf(0.0, -joystick_vector.y))
	_set_action_strength("move_down", maxf(0.0, joystick_vector.y))
	if joystick_knob != null:
		var base_center := JOYSTICK_RECT.size * 0.5
		var knob_size := joystick_knob.size
		joystick_knob.position = (
			base_center
			+ joystick_vector * JOYSTICK_RADIUS
			- knob_size * 0.5
		)

func _set_action_strength(action: String, strength: float) -> void:
	if strength > 0.01:
		Input.action_press(action, strength)
	else:
		Input.action_release(action)

func _reset_joystick_visual() -> void:
	if joystick_knob == null:
		return
	var base_center := JOYSTICK_RECT.size * 0.5
	joystick_knob.position = base_center - joystick_knob.size * 0.5

func _release_all_inputs() -> void:
	joystick_touch_index = -1
	action_touches.clear()
	joystick_vector = Vector2.ZERO
	for action in ["move_left", "move_right", "move_up", "move_down"]:
		Input.action_release(action)
	for action in action_buttons:
		Input.action_release(String(action))
	_reset_joystick_visual()

func _sync_button_feedback() -> void:
	for action in action_buttons:
		var button: Button = action_buttons[action]
		button.modulate = (
			Color(1.0, 0.92, 0.70, 1.0)
			if Input.is_action_pressed(String(action))
			else Color.WHITE
		)

func debug_force_controls_visible(enabled: bool) -> void:
	debug_force_visible = enabled
	_sync_visibility()

func debug_controls_visible() -> bool:
	return touch_root != null and touch_root.visible

func debug_joystick_rect() -> Rect2:
	return JOYSTICK_RECT

func debug_joystick_center() -> Vector2:
	return JOYSTICK_RECT.get_center()

func debug_action_names() -> Array[String]:
	var names: Array[String] = []
	for action in action_rects:
		names.append(String(action))
	names.sort()
	return names

func debug_action_rect(action: String) -> Rect2:
	return action_rects.get(action, Rect2())

func debug_action_center(action: String) -> Vector2:
	return debug_action_rect(action).get_center()

func debug_touch_down(index: int, position: Vector2) -> void:
	_handle_touch(index, position, true)

func debug_touch_move(index: int, position: Vector2) -> void:
	if index == joystick_touch_index:
		_update_joystick(position)

func debug_touch_up(index: int, position: Vector2) -> void:
	_handle_touch(index, position, false)
