extends CanvasLayer

signal resume_requested
signal exit_requested

var _root: Control
var _resume_button: Button
var _mute_button: Button
var _volume_slider: HSlider
var _volume_label: Label
var _master_bus := -1

func _ready() -> void:
    layer = 120
    process_mode = Node.PROCESS_MODE_ALWAYS
    _master_bus = AudioServer.get_bus_index("Master")
    _build_ui()
    _sync_audio_from_bus()
    close_menu()

func open_menu() -> void:
    _root.visible = true
    _resume_button.grab_focus()

func close_menu() -> void:
    _root.visible = false

func _build_ui() -> void:
    _root = Control.new()
    _root.name = "PauseRoot"
    _root.process_mode = Node.PROCESS_MODE_ALWAYS
    _root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    add_child(_root)

    var shade := ColorRect.new()
    shade.name = "Backdrop"
    shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    shade.color = Color(0.015, 0.02, 0.027, 0.88)
    shade.mouse_filter = Control.MOUSE_FILTER_STOP
    _root.add_child(shade)

    var center := CenterContainer.new()
    center.name = "Center"
    center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _root.add_child(center)

    var panel := PanelContainer.new()
    panel.custom_minimum_size = Vector2(430.0, 0.0)
    var panel_style := StyleBoxFlat.new()
    panel_style.bg_color = Color(0.045, 0.055, 0.065, 0.97)
    panel_style.border_color = Color(0.69, 0.54, 0.28, 0.72)
    panel_style.border_width_left = 1
    panel_style.border_width_top = 1
    panel_style.border_width_right = 1
    panel_style.border_width_bottom = 1
    panel_style.corner_radius_top_left = 16
    panel_style.corner_radius_top_right = 16
    panel_style.corner_radius_bottom_left = 16
    panel_style.corner_radius_bottom_right = 16
    panel_style.content_margin_left = 34.0
    panel_style.content_margin_top = 30.0
    panel_style.content_margin_right = 34.0
    panel_style.content_margin_bottom = 30.0
    panel.add_theme_stylebox_override("panel", panel_style)
    center.add_child(panel)

    var stack := VBoxContainer.new()
    stack.add_theme_constant_override("separation", 14)
    panel.add_child(stack)

    var kicker := Label.new()
    kicker.text = "PAWN SLUG · PAUSA"
    kicker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    kicker.add_theme_font_size_override("font_size", 13)
    kicker.add_theme_color_override("font_color", Color("b99656"))
    stack.add_child(kicker)

    var title := Label.new()
    title.text = "Matthias espera órdenes."
    title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    title.add_theme_font_size_override("font_size", 25)
    stack.add_child(title)

    var hint := Label.new()
    hint.text = "ESC continúa la partida"
    hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    hint.add_theme_font_size_override("font_size", 12)
    hint.add_theme_color_override("font_color", Color(0.72, 0.75, 0.77, 0.82))
    stack.add_child(hint)

    var rule := HSeparator.new()
    stack.add_child(rule)

    _resume_button = _menu_button("Continuar")
    _resume_button.pressed.connect(func(): resume_requested.emit())
    stack.add_child(_resume_button)

    _volume_label = Label.new()
    _volume_label.text = "Audio"
    _volume_label.add_theme_font_size_override("font_size", 13)
    stack.add_child(_volume_label)

    _volume_slider = HSlider.new()
    _volume_slider.min_value = 0.0
    _volume_slider.max_value = 1.0
    _volume_slider.step = 0.05
    _volume_slider.custom_minimum_size = Vector2(0.0, 34.0)
    _volume_slider.value_changed.connect(_on_volume_changed)
    stack.add_child(_volume_slider)

    _mute_button = _menu_button("Silenciar audio")
    _mute_button.toggle_mode = true
    _mute_button.toggled.connect(_on_mute_toggled)
    stack.add_child(_mute_button)

    var exit_button := _menu_button("Salir del juego")
    exit_button.pressed.connect(func(): exit_requested.emit())
    stack.add_child(exit_button)

func _menu_button(label: String) -> Button:
    var button := Button.new()
    button.text = label
    button.custom_minimum_size = Vector2(0.0, 48.0)
    button.add_theme_font_size_override("font_size", 15)
    return button

func _sync_audio_from_bus() -> void:
    if _master_bus < 0:
        _volume_slider.value = 1.0
        _mute_button.disabled = true
        _volume_slider.editable = false
        _refresh_audio_copy()
        return
    var db := AudioServer.get_bus_volume_db(_master_bus)
    var volume := 0.0 if db <= -79.0 else clampf(db_to_linear(db), 0.0, 1.0)
    _volume_slider.set_value_no_signal(volume)
    _mute_button.set_pressed_no_signal(AudioServer.is_bus_mute(_master_bus))
    _refresh_audio_copy()

func _on_volume_changed(value: float) -> void:
    if _master_bus < 0:
        return
    var safe := maxf(0.0001, value)
    AudioServer.set_bus_volume_db(_master_bus, linear_to_db(safe))
    if value > 0.0 and AudioServer.is_bus_mute(_master_bus):
        AudioServer.set_bus_mute(_master_bus, false)
        _mute_button.set_pressed_no_signal(false)
    _refresh_audio_copy()

func _on_mute_toggled(muted: bool) -> void:
    if _master_bus >= 0:
        AudioServer.set_bus_mute(_master_bus, muted)
    _refresh_audio_copy()

func _refresh_audio_copy() -> void:
    var percent := int(round(_volume_slider.value * 100.0))
    var muted := _mute_button.button_pressed if not _mute_button.disabled else false
    _volume_label.text = "Audio · %d%%" % percent
    _mute_button.text = "Activar audio" if muted else "Silenciar audio"
