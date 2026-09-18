extends Node2D

# Lightweight original 2D visuals for data-driven Pawn Slug set pieces.
# Mechanics live in main.gd; this node only renders their current state.

var _kind := ""
var _size := Vector2(120.0, 36.0)
var _theme := "night_front"
var _health_ratio := 1.0
var _fire_flash := 0.0
var _destroyed := false

func configure(kind: String, size: Vector2, theme: String) -> void:
    _kind = kind
    _size = size
    _theme = theme
    queue_redraw()

func set_health_ratio(value: float) -> void:
    _health_ratio = clampf(value, 0.0, 1.0)
    queue_redraw()

func pulse_fire() -> void:
    _fire_flash = 0.11
    queue_redraw()

func set_destroyed(value: bool) -> void:
    _destroyed = value
    queue_redraw()

func _process(delta: float) -> void:
    if _fire_flash <= 0.0:
        return
    _fire_flash = maxf(0.0, _fire_flash - delta)
    queue_redraw()

func _draw() -> void:
    match _kind:
        "moving_platform":
            _draw_moving_platform()
        "bunker_turret":
            _draw_bunker_turret()
        "convoy":
            _draw_convoy()

func _theme_trim() -> Color:
    match _theme:
        "harbor_dusk":
            return Color("77a4ad")
        "alpine_night":
            return Color("b6c3c6")
        "jungle_storm":
            return Color("9a8152")
        _:
            return Color("b08a48")

func _draw_moving_platform() -> void:
    var rect := Rect2(-_size * 0.5, _size)
    var body := Color("303b42")
    if _theme == "harbor_dusk":
        body = Color("294047")
    elif _theme == "alpine_night":
        body = Color("3b454a")
    elif _theme == "jungle_storm":
        body = Color("4b4732")
    draw_rect(rect, body, true)
    draw_rect(rect, _theme_trim(), false, 2.0)
    draw_line(
        Vector2(-_size.x * 0.5, -_size.y * 0.18),
        Vector2(_size.x * 0.5, -_size.y * 0.18),
        Color(0.05, 0.07, 0.08, 0.65),
        3.0,
    )
    for x in range(int(-_size.x * 0.5) + 14, int(_size.x * 0.5) - 6, 28):
        draw_circle(Vector2(float(x), 0.0), 2.0, Color("818b8f"))

func _draw_bunker_turret() -> void:
    var w := _size.x
    var h := _size.y
    var damage := 1.0 - _health_ratio
    var body := Color("30373a").lerp(Color("1c2021"), damage * 0.55)
    if _destroyed:
        body = Color("202325")
    var body_rect := Rect2(Vector2(-w * 0.5, -h), Vector2(w, h))
    draw_rect(body_rect, body, true)
    draw_rect(body_rect, _theme_trim(), false, 2.0)
    draw_rect(
        Rect2(Vector2(-w * 0.40, -h * 0.72), Vector2(w * 0.47, h * 0.22)),
        Color("0c1113"),
        true,
    )
    draw_line(
        Vector2(-w * 0.10, -h * 0.61),
        Vector2(-w * 0.62, -h * 0.66),
        Color("151b1e"),
        8.0,
    )
    draw_line(
        Vector2(-w * 0.10, -h * 0.61),
        Vector2(-w * 0.62, -h * 0.66),
        Color("657176"),
        2.0,
    )
    if _fire_flash > 0.0 and not _destroyed:
        var muzzle := Vector2(-w * 0.66, -h * 0.67)
        draw_circle(muzzle, 12.0, Color(1.0, 0.68, 0.18, 0.72))
        draw_circle(muzzle + Vector2(-8.0, 0.0), 6.0, Color(1.0, 0.88, 0.45, 0.88))
    if _destroyed:
        draw_line(Vector2(-w * 0.34, -h * 0.82), Vector2(w * 0.28, -h * 0.18), Color(0.08, 0.08, 0.08, 0.80), 6.0)
        draw_line(Vector2(w * 0.18, -h * 0.88), Vector2(-w * 0.20, -h * 0.20), Color(0.08, 0.08, 0.08, 0.70), 4.0)

func _draw_convoy() -> void:
    var w := _size.x
    var h := _size.y
    var chassis := Color("31413b")
    var canvas := Color("4d5945")
    if _theme == "harbor_dusk":
        chassis = Color("29434a")
        canvas = Color("4b5752")
    elif _theme == "alpine_night":
        chassis = Color("3c4548")
        canvas = Color("596166")
    elif _theme == "jungle_storm":
        chassis = Color("334333")
        canvas = Color("46533c")

    draw_rect(Rect2(Vector2(-w * 0.5, -h * 0.58), Vector2(w * 0.68, h * 0.48)), chassis, true)
    draw_rect(Rect2(Vector2(w * 0.15, -h * 0.48), Vector2(w * 0.30, h * 0.38)), chassis.lightened(0.08), true)
    draw_rect(Rect2(Vector2(-w * 0.42, -h * 0.94), Vector2(w * 0.54, h * 0.36)), canvas, true)
    draw_rect(Rect2(Vector2(w * 0.23, -h * 0.42), Vector2(w * 0.13, h * 0.16)), Color("152126"), true)
    draw_line(Vector2(-w * 0.48, -h * 0.10), Vector2(w * 0.46, -h * 0.10), _theme_trim(), 2.0)
    draw_circle(Vector2(-w * 0.28, 0.0), h * 0.18, Color("111517"))
    draw_circle(Vector2(w * 0.27, 0.0), h * 0.18, Color("111517"))
    draw_circle(Vector2(-w * 0.28, 0.0), h * 0.08, Color("626b6d"))
    draw_circle(Vector2(w * 0.27, 0.0), h * 0.08, Color("626b6d"))
