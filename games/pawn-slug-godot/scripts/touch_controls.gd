extends CanvasLayer

signal pause_requested
signal weapon_cycle_requested(step: int)

const BASE_MARGIN := 22.0
const BUTTON_SIZE := Vector2(76.0, 76.0)
const SMALL_BUTTON_SIZE := Vector2(68.0, 54.0)

var _root: Control
var _left_group: Control
var _right_group: Control
var _move_left := false
var _move_right := false
var _crouch := false
var _aim_up := false
var _jump := false
var _fire := false
var _grenade := false
var _touch_enabled := false
var _orientation_blocked := false
var _rotate_notice: PanelContainer

func _ready() -> void:
    layer = 80
    _touch_enabled = _detect_touch_device()
    if not _touch_enabled:
        visible = false
        return

    _build_ui()
    get_viewport().size_changed.connect(_layout_controls)
    _layout_controls()

func move_axis() -> float:
    var axis := 0.0
    if _move_left:
        axis -= 1.0
    if _move_right:
        axis += 1.0
    return axis

func aim_vector() -> Vector2:
    var vertical := -1.0 if _aim_up else (1.0 if _crouch else 0.0)
    if absf(vertical) <= 0.01:
        return Vector2.ZERO
    return Vector2(move_axis(), vertical).normalized()

func crouch_pressed() -> bool:
    return _crouch

func jump_pressed() -> bool:
    return _jump

func fire_pressed() -> bool:
    return _fire

func grenade_pressed() -> bool:
    return _grenade

func is_touch_enabled() -> bool:
    return _touch_enabled

func orientation_blocked() -> bool:
    return _touch_enabled and _orientation_blocked

func release_all() -> void:
    _move_left = false
    _move_right = false
    _crouch = false
    _aim_up = false
    _jump = false
    _fire = false
    _grenade = false

func _detect_touch_device() -> bool:
    if DisplayServer.is_touchscreen_available():
        return true
    if OS.has_feature("web"):
        return bool(JavaScriptBridge.eval(
            "Boolean((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0)",
            true,
        ))
    return false

func _build_ui() -> void:
    _root = Control.new()
    _root.name = "TouchRoot"
    _root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _root.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_root)

    _left_group = Control.new()
    _left_group.name = "MoveCluster"
    _left_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _left_group.size = Vector2(268.0, 172.0)
    _root.add_child(_left_group)

    _right_group = Control.new()
    _right_group.name = "ActionCluster"
    _right_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _right_group.size = Vector2(300.0, 190.0)
    _root.add_child(_right_group)

    _rotate_notice = PanelContainer.new()
    _rotate_notice.name = "RotateNotice"
    _rotate_notice.visible = false
    _rotate_notice.mouse_filter = Control.MOUSE_FILTER_IGNORE
    var notice_style := StyleBoxFlat.new()
    notice_style.bg_color = Color(0.018, 0.022, 0.026, 0.92)
    notice_style.border_color = Color(0.80, 0.67, 0.38, 0.72)
    notice_style.set_border_width_all(2)
    notice_style.corner_radius_top_left = 12
    notice_style.corner_radius_top_right = 12
    notice_style.corner_radius_bottom_left = 12
    notice_style.corner_radius_bottom_right = 12
    notice_style.content_margin_left = 24.0
    notice_style.content_margin_right = 24.0
    notice_style.content_margin_top = 20.0
    notice_style.content_margin_bottom = 20.0
    _rotate_notice.add_theme_stylebox_override("panel", notice_style)
    _root.add_child(_rotate_notice)

    var notice_box := VBoxContainer.new()
    notice_box.add_theme_constant_override("separation", 8)
    _rotate_notice.add_child(notice_box)
    var notice_title := Label.new()
    notice_title.text = "GIRA EL MÓVIL"
    notice_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    notice_title.add_theme_font_size_override("font_size", 24)
    notice_title.add_theme_color_override("font_color", Color("f1e7cf"))
    notice_box.add_child(notice_title)
    var notice_copy := Label.new()
    notice_copy.text = "Pawn Slug está diseñado para jugar en horizontal."
    notice_copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    notice_copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    notice_copy.add_theme_font_size_override("font_size", 15)
    notice_copy.add_theme_color_override("font_color", Color("c8c1b0"))
    notice_box.add_child(notice_copy)

    var aim_up := _make_button("↑", BUTTON_SIZE)
    aim_up.position = Vector2(92.0, 0.0)
    _bind_hold(aim_up, func(value: bool): _aim_up = value)
    _left_group.add_child(aim_up)

    var left := _make_button("←", BUTTON_SIZE)
    left.position = Vector2(0.0, 88.0)
    _bind_hold(left, func(value: bool): _move_left = value)
    _left_group.add_child(left)

    var right := _make_button("→", BUTTON_SIZE)
    right.position = Vector2(92.0, 88.0)
    _bind_hold(right, func(value: bool): _move_right = value)
    _left_group.add_child(right)

    var crouch := _make_button("↓", BUTTON_SIZE)
    crouch.position = Vector2(184.0, 88.0)
    _bind_hold(crouch, func(value: bool): _crouch = value)
    _left_group.add_child(crouch)

    var fire := _make_button("FIRE", Vector2(88.0, 88.0), true)
    fire.position = Vector2(188.0, 80.0)
    _bind_hold(fire, func(value: bool): _fire = value)
    _right_group.add_child(fire)

    var jump := _make_button("JUMP", BUTTON_SIZE)
    jump.position = Vector2(100.0, 104.0)
    _bind_hold(jump, func(value: bool): _jump = value)
    _right_group.add_child(jump)

    var grenade := _make_button("GR", SMALL_BUTTON_SIZE)
    grenade.position = Vector2(204.0, 12.0)
    _bind_hold(grenade, func(value: bool): _grenade = value)
    _right_group.add_child(grenade)

    var weapon := _make_button("ARMA", SMALL_BUTTON_SIZE)
    weapon.position = Vector2(120.0, 20.0)
    weapon.pressed.connect(func(): weapon_cycle_requested.emit(1))
    _right_group.add_child(weapon)

    var pause := _make_button("Ⅱ", Vector2(54.0, 46.0))
    pause.position = Vector2(44.0, 24.0)
    pause.pressed.connect(func(): pause_requested.emit())
    _right_group.add_child(pause)

func _bind_hold(button: Button, setter: Callable) -> void:
    button.button_down.connect(func(): setter.call(true))
    button.button_up.connect(func(): setter.call(false))
    button.mouse_exited.connect(func():
        if not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
            setter.call(false)
    )

func _make_button(text: String, size: Vector2, accent := false) -> Button:
    var button := Button.new()
    button.text = text
    button.custom_minimum_size = size
    button.size = size
    button.focus_mode = Control.FOCUS_NONE
    button.add_theme_font_size_override("font_size", 18 if size.x >= 70.0 else 15)

    var normal := StyleBoxFlat.new()
    normal.bg_color = Color(0.025, 0.03, 0.035, 0.54 if not accent else 0.66)
    normal.border_color = Color(0.80, 0.67, 0.38, 0.54 if not accent else 0.78)
    normal.set_border_width_all(2)
    normal.corner_radius_top_left = int(size.y * 0.45)
    normal.corner_radius_top_right = int(size.y * 0.45)
    normal.corner_radius_bottom_left = int(size.y * 0.45)
    normal.corner_radius_bottom_right = int(size.y * 0.45)
    button.add_theme_stylebox_override("normal", normal)

    var pressed := normal.duplicate() as StyleBoxFlat
    pressed.bg_color = Color(0.63, 0.44, 0.15, 0.78)
    pressed.border_color = Color(1.0, 0.84, 0.48, 0.92)
    button.add_theme_stylebox_override("pressed", pressed)
    button.add_theme_stylebox_override("hover", normal)
    button.add_theme_color_override("font_color", Color(0.94, 0.90, 0.79, 0.92))
    button.add_theme_color_override("font_pressed_color", Color.WHITE)
    return button

func _layout_controls() -> void:
    if _root == null:
        return
    var view := get_viewport().get_visible_rect().size
    _orientation_blocked = view.y > view.x
    if _orientation_blocked:
        release_all()
    if _left_group != null:
        _left_group.visible = not _orientation_blocked
    if _right_group != null:
        _right_group.visible = not _orientation_blocked
    if _rotate_notice != null:
        _rotate_notice.visible = _orientation_blocked
        _rotate_notice.custom_minimum_size = Vector2(minf(340.0, view.x - 32.0), 0.0)
        _rotate_notice.position = Vector2(
            maxf(16.0, (view.x - _rotate_notice.size.x) * 0.5),
            maxf(16.0, (view.y - _rotate_notice.size.y) * 0.5),
        )

    var safe := _safe_margins(view)
    _left_group.position = Vector2(
        BASE_MARGIN + safe.x,
        view.y - _left_group.size.y - BASE_MARGIN - safe.w,
    )
    _right_group.position = Vector2(
        view.x - _right_group.size.x - BASE_MARGIN - safe.z,
        view.y - _right_group.size.y - BASE_MARGIN - safe.w,
    )

func _safe_margins(view: Vector2) -> Vector4:
    var screen := DisplayServer.screen_get_size()
    var safe := DisplayServer.get_display_safe_area()
    if screen.x <= 0 or screen.y <= 0 or safe.size.x <= 0 or safe.size.y <= 0:
        return Vector4.ZERO
    var sx := view.x / float(screen.x)
    var sy := view.y / float(screen.y)
    return Vector4(
        float(safe.position.x) * sx,
        float(safe.position.y) * sy,
        float(screen.x - safe.end.x) * sx,
        float(screen.y - safe.end.y) * sy,
    )
