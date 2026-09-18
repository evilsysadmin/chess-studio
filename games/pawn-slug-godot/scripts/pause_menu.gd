extends CanvasLayer

signal exit_requested

const SETTINGS_PATH := "user://pawn_slug_settings.cfg"
const DEFAULT_VOLUME := 0.85
const DEFAULT_NATIVE_FULLSCREEN := false
const WINDOWED_SIZE := Vector2i(1280, 720)

var _overlay: ColorRect
var _content: VBoxContainer
var _fullscreen_enabled := DEFAULT_NATIVE_FULLSCREEN
var _master_volume := DEFAULT_VOLUME
var _last_nonzero_volume := DEFAULT_VOLUME

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    _load_settings()
    _build_ui()
    _overlay.visible = false
    _apply_audio()

    # The React host already fills the app viewport. Native browser fullscreen
    # remains an explicit menu choice so ESC is reserved for pause by default.
    if not OS.has_feature("web"):
        _apply_display_mode(_fullscreen_enabled)

func _input(event: InputEvent) -> void:
    if not _is_pause_event(event):
        return

    toggle_pause()
    get_viewport().set_input_as_handled()

func _is_escape(event: InputEvent) -> bool:
    return (
        event is InputEventKey
        and event.pressed
        and not event.echo
        and event.keycode == KEY_ESCAPE
    )

func _is_pause_event(event: InputEvent) -> bool:
    if _is_escape(event):
        return true
    return (
        event is InputEventJoypadButton
        and event.pressed
        and event.button_index == JOY_BUTTON_START
    )

func toggle_pause() -> void:
    if _overlay.visible:
        _resume_game()
    else:
        _open_pause_menu()

func _open_pause_menu() -> void:
    _overlay.visible = true
    _render_main()
    get_tree().paused = true

func _resume_game() -> void:
    get_tree().paused = false
    _overlay.visible = false

func _build_ui() -> void:
    _overlay = ColorRect.new()
    _overlay.name = "PauseOverlay"
    _overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _overlay.mouse_filter = Control.MOUSE_FILTER_STOP
    _overlay.color = Color(0.008, 0.011, 0.014, 0.88)
    add_child(_overlay)

    var center := CenterContainer.new()
    center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _overlay.add_child(center)

    var panel := PanelContainer.new()
    panel.custom_minimum_size = Vector2(540.0, 0.0)
    var panel_style := StyleBoxFlat.new()
    panel_style.bg_color = Color(0.055, 0.061, 0.064, 0.98)
    panel_style.border_color = Color(0.54, 0.44, 0.26, 0.78)
    panel_style.set_border_width_all(1)
    panel_style.corner_radius_top_left = 8
    panel_style.corner_radius_top_right = 8
    panel_style.corner_radius_bottom_left = 8
    panel_style.corner_radius_bottom_right = 8
    panel_style.content_margin_left = 30.0
    panel_style.content_margin_right = 30.0
    panel_style.content_margin_top = 26.0
    panel_style.content_margin_bottom = 28.0
    panel.add_theme_stylebox_override("panel", panel_style)
    center.add_child(panel)

    var shell := VBoxContainer.new()
    shell.add_theme_constant_override("separation", 14)
    panel.add_child(shell)

    var eyebrow := Label.new()
    eyebrow.text = "PAWN SLUG · PAUSA"
    eyebrow.add_theme_font_size_override("font_size", 13)
    eyebrow.add_theme_color_override("font_color", Color("b99a59"))
    shell.add_child(eyebrow)

    var title := Label.new()
    title.text = "MENÚ DE OPERACIÓN"
    title.add_theme_font_size_override("font_size", 28)
    title.add_theme_color_override("font_color", Color("f1e7cf"))
    shell.add_child(title)

    var rule := HSeparator.new()
    shell.add_child(rule)

    _content = VBoxContainer.new()
    _content.add_theme_constant_override("separation", 10)
    shell.add_child(_content)

func _clear_content() -> void:
    var focus_owner := get_viewport().gui_get_focus_owner()
    if focus_owner != null and _content.is_ancestor_of(focus_owner):
        focus_owner.release_focus()
    for child in _content.get_children():
        _content.remove_child(child)
        child.queue_free()

func _render_main() -> void:
    _clear_content()
    var resume := _make_button("Continuar", _resume_game)
    _content.add_child(resume)
    _content.add_child(_make_button("Opciones", _render_options))
    _content.add_child(_make_button("Audio", _render_audio))
    _content.add_child(_make_button("Controles", _render_controls))
    _content.add_child(_make_button("Salir del juego", _request_exit, true))
    resume.grab_focus()

func _render_options() -> void:
    _clear_content()
    _content.add_child(_section_title("OPCIONES"))
    var mode_label := "Pantalla completa del navegador: ACTIVADA" if _fullscreen_enabled else "Pantalla completa del navegador: DESACTIVADA"
    if not OS.has_feature("web"):
        mode_label = "Pantalla completa: ACTIVADA" if _fullscreen_enabled else "Pantalla completa: DESACTIVADA"
    var mode_button := _make_button(mode_label, _toggle_display_mode)
    _content.add_child(mode_button)
    mode_button.grab_focus()

    var hint := Label.new()
    hint.text = "Pawn Slug ya ocupa todo el viewport. El fullscreen nativo del navegador es opcional y sólo se activa desde aquí."
    hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    hint.add_theme_font_size_override("font_size", 13)
    hint.add_theme_color_override("font_color", Color("aeb6b8"))
    _content.add_child(hint)
    _content.add_child(_make_button("← Volver", _render_main))

func _render_audio() -> void:
    _clear_content()
    _content.add_child(_section_title("AUDIO"))

    var row := HBoxContainer.new()
    row.add_theme_constant_override("separation", 12)
    var label := Label.new()
    label.text = "Volumen maestro"
    label.custom_minimum_size = Vector2(150.0, 0.0)
    label.add_theme_color_override("font_color", Color("d8d0bd"))
    row.add_child(label)

    var slider := HSlider.new()
    slider.name = "MasterVolume"
    slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    slider.min_value = 0.0
    slider.max_value = 1.0
    slider.step = 0.05
    slider.value = _master_volume
    slider.value_changed.connect(_on_master_volume_changed)
    row.add_child(slider)
    _content.add_child(row)
    slider.grab_focus()

    var mute_label := "Restaurar sonido" if _master_volume <= 0.001 else "Silenciar"
    _content.add_child(_make_button(mute_label, _toggle_mute))
    _content.add_child(_make_button("← Volver", _render_main))

func _render_controls() -> void:
    _clear_content()
    _content.add_child(_section_title("CONTROLES"))

    var controls := Label.new()
    controls.text = "A / D o ← / →    Mover\nS o ↓            Agacharse\nW / ↑ / Espacio  Saltar\nZ / J / Enter     Disparar\nX / K             Granada\n1–4               Seleccionar arma\nQ / E             Cambiar arma\nESC               Pausa\n\nMando: stick/D-pad · A saltar · X disparar · Y granada · Start pausa"
    controls.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    controls.add_theme_font_size_override("font_size", 15)
    controls.add_theme_color_override("font_color", Color("d8d0bd"))
    _content.add_child(controls)
    var back := _make_button("← Volver", _render_main)
    _content.add_child(back)
    back.grab_focus()

func _section_title(text: String) -> Label:
    var label := Label.new()
    label.text = text
    label.add_theme_font_size_override("font_size", 19)
    label.add_theme_color_override("font_color", Color("e9d59f"))
    return label

func _make_button(text: String, callback: Callable, danger: bool = false) -> Button:
    var button := Button.new()
    button.text = text
    button.custom_minimum_size = Vector2(0.0, 46.0)
    button.focus_mode = Control.FOCUS_ALL
    button.add_theme_font_size_override("font_size", 16)
    if danger:
        button.add_theme_color_override("font_color", Color("e9a18f"))
    button.pressed.connect(callback)
    return button

func _toggle_display_mode() -> void:
    _fullscreen_enabled = not _fullscreen_enabled
    _apply_display_mode(_fullscreen_enabled)
    _save_settings()
    _render_options()

func _apply_display_mode(fullscreen: bool) -> void:
    if OS.has_feature("web"):
        if fullscreen:
            JavaScriptBridge.eval("""
                (function () {
                    var target = document.querySelector('canvas') || document.documentElement;
                    if (!document.fullscreenElement && target && target.requestFullscreen) {
                        var promise = target.requestFullscreen();
                        if (promise && promise.then) {
                            promise.then(function () {
                                if (screen.orientation && screen.orientation.lock) {
                                    screen.orientation.lock('landscape').catch(function () {});
                                }
                            }).catch(function () {});
                        } else if (promise && promise.catch) {
                            promise.catch(function () {});
                        }
                    }
                })();
            """)
        else:
            JavaScriptBridge.eval("""
                (function () {
                    if (screen.orientation && screen.orientation.unlock) {
                        try { screen.orientation.unlock(); } catch (_) {}
                    }
                    if (document.fullscreenElement && document.exitFullscreen) {
                        var promise = document.exitFullscreen();
                        if (promise && promise.catch) promise.catch(function () {});
                    }
                })();
            """)
        return

    DisplayServer.window_set_mode(
        DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED
    )
    if not fullscreen:
        DisplayServer.window_set_size(WINDOWED_SIZE)

func _on_master_volume_changed(value: float) -> void:
    _master_volume = clampf(value, 0.0, 1.0)
    if _master_volume > 0.001:
        _last_nonzero_volume = _master_volume
    _apply_audio()
    _save_settings()

func _toggle_mute() -> void:
    if _master_volume <= 0.001:
        _master_volume = maxf(_last_nonzero_volume, DEFAULT_VOLUME)
    else:
        _last_nonzero_volume = _master_volume
        _master_volume = 0.0
    _apply_audio()
    _save_settings()
    _render_audio()

func _apply_audio() -> void:
    var master_bus := AudioServer.get_bus_index("Master")
    if master_bus < 0:
        return
    var muted := _master_volume <= 0.001
    AudioServer.set_bus_mute(master_bus, muted)
    AudioServer.set_bus_volume_db(master_bus, linear_to_db(maxf(_master_volume, 0.001)))

func _request_exit() -> void:
    get_tree().paused = false
    _overlay.visible = false
    exit_requested.emit()

func _load_settings() -> void:
    var config := ConfigFile.new()
    if config.load(SETTINGS_PATH) != OK:
        return
    _fullscreen_enabled = bool(config.get_value("display", "native_fullscreen", DEFAULT_NATIVE_FULLSCREEN))
    _master_volume = clampf(float(config.get_value("audio", "master_volume", DEFAULT_VOLUME)), 0.0, 1.0)
    if _master_volume > 0.001:
        _last_nonzero_volume = _master_volume

func _save_settings() -> void:
    var config := ConfigFile.new()
    config.set_value("display", "native_fullscreen", _fullscreen_enabled)
    config.set_value("audio", "master_volume", _master_volume)
    config.save(SETTINGS_PATH)
