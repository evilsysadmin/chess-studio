extends Node2D

# Lightweight original 2D visuals for data-driven Pawn Slug set pieces.
# Mechanics live in main.gd; this node only renders their current state.

var _kind := ""
var _size := Vector2(120.0, 36.0)
var _theme := "night_front"
var _health_ratio := 1.0
var _fire_flash := 0.0
var _destroyed := false
var _warning := false
var _elapsed := 0.0

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

func set_warning(value: bool) -> void:
    _warning = value
    queue_redraw()

func _process(delta: float) -> void:
    _elapsed += delta
    if _fire_flash > 0.0:
        _fire_flash = maxf(0.0, _fire_flash - delta)
    if _fire_flash > 0.0 or _warning or _kind in ["waterfall", "artillery_barrage"]:
        queue_redraw()

func _draw() -> void:
    match _kind:
        "moving_platform":
            _draw_moving_platform()
        "bunker_turret":
            _draw_bunker_turret()
        "convoy":
            _draw_convoy()
        "collapse_bridge":
            _draw_collapse_bridge()
        "waterfall":
            _draw_waterfall()
        "tunnel_portal":
            _draw_tunnel_portal()
        "destructible_barricade":
            _draw_destructible_barricade()
        "destructible_platform":
            _draw_destructible_platform()
        "artillery_barrage":
            _draw_artillery_barrage()

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
    draw_rect(
        Rect2(Vector2(-_size.x * 0.5 + 6.0, _size.y * 0.18), Vector2(_size.x - 12.0, _size.y * 0.22)),
        Color(0.035, 0.045, 0.050, 0.72),
        true,
    )
    draw_line(
        Vector2(-_size.x * 0.5, -_size.y * 0.18),
        Vector2(_size.x * 0.5, -_size.y * 0.18),
        Color(0.05, 0.07, 0.08, 0.65),
        3.0,
    )
    for x in range(int(-_size.x * 0.5) + 14, int(_size.x * 0.5) - 6, 28):
        draw_circle(Vector2(float(x), 0.0), 2.0, Color("818b8f"))
    var hazard := _theme_trim().lightened(0.08)
    var hazard_y := -_size.y * 0.33
    for index in range(maxi(2, int(_size.x / 34.0))):
        var x0 := -_size.x * 0.44 + float(index) * 34.0
        draw_line(
            Vector2(x0, hazard_y + 5.0),
            Vector2(minf(_size.x * 0.44, x0 + 14.0), hazard_y - 5.0),
            Color(hazard.r, hazard.g, hazard.b, 0.62),
            2.0,
        )

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
    var roof := PackedVector2Array([
        Vector2(-w * 0.50, -h),
        Vector2(-w * 0.34, -h * 1.12),
        Vector2(w * 0.34, -h * 1.12),
        Vector2(w * 0.50, -h),
    ])
    draw_colored_polygon(roof, body.lightened(0.08))
    draw_line(Vector2(-w * 0.34, -h * 1.12), Vector2(w * 0.34, -h * 1.12), Color(_theme_trim(), 0.62), 2.0)
    draw_rect(
        Rect2(Vector2(-w * 0.40, -h * 0.72), Vector2(w * 0.47, h * 0.22)),
        Color("0c1113"),
        true,
    )
    draw_line(
        Vector2(-w * 0.34, -h * 0.61),
        Vector2(w * 0.02, -h * 0.61),
        Color(0.55, 0.64, 0.66, 0.22),
        2.0,
    )
    for rivet_x in [-0.38, -0.22, 0.24, 0.39]:
        draw_circle(Vector2(w * rivet_x, -h * 0.16), 2.2, Color(0.48, 0.52, 0.53, 0.58))
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
    draw_line(Vector2(-w * 0.42, -h * 0.78), Vector2(w * 0.12, -h * 0.78), Color(0.72, 0.74, 0.66, 0.15), 1.5)
    for seam in range(3):
        var seam_x := -w * 0.30 + float(seam) * w * 0.16
        draw_line(Vector2(seam_x, -h * 0.92), Vector2(seam_x + w * 0.03, -h * 0.60), Color(0.10, 0.12, 0.11, 0.34), 1.5)
    draw_rect(Rect2(Vector2(w * 0.23, -h * 0.42), Vector2(w * 0.13, h * 0.16)), Color("152126"), true)
    draw_line(Vector2(-w * 0.48, -h * 0.10), Vector2(w * 0.46, -h * 0.10), _theme_trim(), 2.0)
    draw_rect(Rect2(Vector2(w * 0.38, -h * 0.20), Vector2(w * 0.08, h * 0.08)), Color(0.82, 0.72, 0.42, 0.34), true)
    draw_rect(Rect2(Vector2(-w * 0.50, -h * 0.16), Vector2(w, h * 0.07)), Color(0.06, 0.08, 0.08, 0.66), true)
    draw_circle(Vector2(-w * 0.28, 0.0), h * 0.18, Color("111517"))
    draw_circle(Vector2(w * 0.27, 0.0), h * 0.18, Color("111517"))
    draw_circle(Vector2(-w * 0.28, 0.0), h * 0.08, Color("626b6d"))
    draw_circle(Vector2(w * 0.27, 0.0), h * 0.08, Color("626b6d"))


func _draw_collapse_bridge() -> void:
    var rect := Rect2(-_size * 0.5, _size)
    var timber := Color("58442d")
    var edge := Color("9b7b4d")
    if _theme == "harbor_dusk":
        timber = Color("34464a")
        edge = Color("73929a")
    elif _theme == "alpine_night":
        timber = Color("454c4f")
        edge = Color("a9b5b8")
    elif _theme == "jungle_storm":
        timber = Color("4b3b26")
        edge = Color("8b7548")
    if _warning and int(_elapsed * 12.0) % 2 == 0:
        edge = Color("d18a3c")
    draw_rect(rect, timber, true)
    draw_rect(rect, edge, false, 2.0)
    var segment_w := 28.0
    var x := -_size.x * 0.5 + segment_w
    while x < _size.x * 0.5:
        draw_line(Vector2(x, -_size.y * 0.5), Vector2(x, _size.y * 0.5), Color(0.10, 0.10, 0.09, 0.55), 2.0)
        x += segment_w
    draw_line(Vector2(-_size.x * 0.42, -_size.y * 0.15), Vector2(-_size.x * 0.10, _size.y * 0.22), Color(0.11, 0.09, 0.07, 0.72), 3.0)
    draw_line(Vector2(_size.x * 0.08, -_size.y * 0.24), Vector2(_size.x * 0.31, _size.y * 0.18), Color(0.11, 0.09, 0.07, 0.72), 3.0)

func _draw_waterfall() -> void:
    var w := _size.x
    var h := _size.y
    draw_rect(Rect2(Vector2(-w * 0.5, 0.0), Vector2(w, h)), Color(0.28, 0.54, 0.58, 0.12), true)
    for lane in range(9):
        var base_x := -w * 0.46 + float(lane) * w / 8.5
        var sway := sin(_elapsed * (1.7 + float(lane) * 0.05) + float(lane) * 0.7) * 5.0
        draw_line(
            Vector2(base_x, 0.0),
            Vector2(base_x + sway, h),
            Color(0.58, 0.82, 0.84, 0.20 + float(lane % 3) * 0.035),
            3.0 + float(lane % 2),
        )
    for puff in range(7):
        var px := -w * 0.42 + float(puff) * w / 6.2
        var radius := 13.0 + float((puff * 7) % 9)
        draw_circle(Vector2(px, h - 3.0), radius, Color(0.72, 0.87, 0.85, 0.10))

func _draw_tunnel_portal() -> void:
    var w := _size.x
    var h := _size.y
    var stone := Color("242b2d")
    var trim := _theme_trim()
    if _theme == "jungle_storm":
        stone = Color("263126")
    elif _theme == "alpine_night":
        stone = Color("30383b")
    elif _theme == "harbor_dusk":
        stone = Color("24383d")
    draw_rect(Rect2(Vector2(-w * 0.5, -h), Vector2(w * 0.16, h)), stone, true)
    draw_rect(Rect2(Vector2(w * 0.34, -h), Vector2(w * 0.16, h)), stone, true)
    draw_rect(Rect2(Vector2(-w * 0.5, -h), Vector2(w, h * 0.22)), stone, true)
    draw_rect(Rect2(Vector2(-w * 0.43, -h * 0.92), Vector2(w * 0.86, h * 0.08)), stone.lightened(0.08), true)
    for block in range(7):
        var bx := -w * 0.46 + float(block) * w * 0.145
        draw_line(
            Vector2(bx, -h * 0.98),
            Vector2(bx + w * 0.035, -h * 0.78),
            Color(0.07, 0.08, 0.08, 0.56),
            2.0,
        )
    draw_line(Vector2(-w * 0.5, -h * 0.78), Vector2(w * 0.5, -h * 0.78), trim, 3.0)
    draw_rect(
        Rect2(Vector2(-w * 0.34, -h * 0.78), Vector2(w * 0.68, h * 0.78)),
        Color(0.010, 0.018, 0.020, 0.42),
        true,
    )
    draw_line(Vector2(-w * 0.31, -h * 0.74), Vector2(-w * 0.31, -h * 0.08), Color(0.34, 0.40, 0.40, 0.13), 2.0)
    draw_line(Vector2(w * 0.31, -h * 0.74), Vector2(w * 0.31, -h * 0.08), Color(0.34, 0.40, 0.40, 0.13), 2.0)


func _draw_destructible_barricade() -> void:
    var w := _size.x
    var h := _size.y
    var damage := 1.0 - _health_ratio
    var body := Color("4a4337").lerp(Color("272624"), damage * 0.55)
    var trim := _theme_trim()
    if _theme == "harbor_dusk":
        body = Color("35515a").lerp(Color("263338"), damage * 0.55)
    elif _theme == "alpine_night":
        body = Color("52595b").lerp(Color("303638"), damage * 0.55)
    elif _theme == "jungle_storm":
        body = Color("4b3a26").lerp(Color("2b291f"), damage * 0.55)

    if _destroyed:
        draw_line(Vector2(-w * 0.44, 0.0), Vector2(w * 0.20, -h * 0.26), body, 12.0)
        draw_line(Vector2(-w * 0.12, 0.0), Vector2(w * 0.42, -h * 0.18), trim, 4.0)
        return

    draw_rect(Rect2(Vector2(-w * 0.5, -h), Vector2(w, h)), body, true)
    draw_rect(Rect2(Vector2(-w * 0.5, -h), Vector2(w, h)), trim, false, 2.0)
    for plank in range(3):
        var y := -h + 12.0 + float(plank) * maxf(16.0, (h - 24.0) / 2.0)
        draw_line(Vector2(-w * 0.44, y), Vector2(w * 0.44, y + float((plank % 2) * 6)), Color(0.10, 0.10, 0.09, 0.42), 4.0)
    draw_line(Vector2(-w * 0.40, -h * 0.88), Vector2(w * 0.36, -h * 0.12), Color(0.12, 0.11, 0.09, 0.55), 6.0)
    draw_line(Vector2(w * 0.34, -h * 0.88), Vector2(-w * 0.34, -h * 0.12), Color(0.12, 0.11, 0.09, 0.55), 6.0)

func _draw_artillery_barrage() -> void:
    if not _warning:
        return
    var radius := maxf(36.0, _size.x * 0.5)
    var pulse := 0.72 + sin(_elapsed * 12.0) * 0.18
    var warning_color := Color(0.95, 0.34, 0.16, pulse)
    draw_arc(Vector2.ZERO, radius, 0.0, TAU, 40, warning_color, 3.0)
    draw_arc(Vector2.ZERO, radius * 0.58, 0.0, TAU, 32, Color(1.0, 0.72, 0.24, pulse * 0.72), 2.0)
    draw_line(Vector2(-radius, 0.0), Vector2(radius, 0.0), warning_color, 2.0)
    draw_line(Vector2(0.0, -radius * 0.34), Vector2(0.0, radius * 0.34), warning_color, 2.0)
    draw_circle(Vector2.ZERO, 4.0 + sin(_elapsed * 18.0) * 1.5, Color(1.0, 0.86, 0.38, 0.86))


func _draw_destructible_platform() -> void:
    var w := _size.x
    var h := _size.y
    var damage := 1.0 - _health_ratio
    var body := Color("4a4337")
    var trim := _theme_trim()
    if _theme == "harbor_dusk":
        body = Color("35515a")
    elif _theme == "alpine_night":
        body = Color("50585b")
    elif _theme == "jungle_storm":
        body = Color("4b3b26")
    body = body.lerp(Color("232425"), damage * 0.48)

    if _destroyed:
        draw_line(Vector2(-w * 0.46, 0.0), Vector2(-w * 0.08, -h * 0.24), body, 8.0)
        draw_line(Vector2(w * 0.04, -h * 0.12), Vector2(w * 0.40, h * 0.06), trim, 5.0)
        return

    var rect := Rect2(Vector2(-w * 0.5, -h * 0.5), Vector2(w, h))
    draw_rect(rect, body, true)
    draw_rect(rect, trim, false, 2.0)
    draw_line(Vector2(-w * 0.5, -h * 0.34), Vector2(w * 0.5, -h * 0.34), Color(0.10, 0.10, 0.09, 0.44), 2.0)
    for x in range(int(-w * 0.5) + 18, int(w * 0.5) - 8, 34):
        draw_circle(Vector2(float(x), 0.0), 2.0, Color(0.70, 0.66, 0.54, 0.72))
