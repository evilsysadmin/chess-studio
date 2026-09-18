extends Node2D

var _world_size := Vector2(5200.0, 720.0)
var _floor_y := 610.0
var _kind := "far_ridge"
var _seed := 1
var _intensity := 1.0
var _preset := "night_front"

func configure(world_size: Vector2, floor_y: float, kind: String, seed: int, intensity: float = 1.0, preset: String = "night_front") -> void:
    _world_size = world_size
    _floor_y = floor_y
    _kind = kind
    _seed = seed
    _intensity = clampf(intensity, 0.0, 2.0)
    _preset = preset
    queue_redraw()

func _ready() -> void:
    queue_redraw()

func _draw() -> void:
    match _kind:
        "sky":
            _draw_sky()
        "far_ridge":
            _draw_far_ridge()
        "ruined_city":
            _draw_ruined_city()
        "mid_defence":
            _draw_mid_defence()

func _noise(index: int, salt: float = 0.0) -> float:
    var raw := sin(float(index) * 12.9898 + float(_seed) * 41.137 + salt * 78.233) * 43758.5453
    return raw - floor(raw)

func _draw_sky() -> void:
    var top := Color("061019")
    var bottom := Color("26323b")
    if _preset == "harbor_dusk":
        top = Color("102334")
        bottom = Color("714b45")
    elif _preset == "alpine_night":
        top = Color("050d18")
        bottom = Color("23313c")
    var bands := 18
    var band_h := _floor_y / float(bands)
    for band in range(bands):
        var t := float(band) / float(maxi(1, bands - 1))
        draw_rect(
            Rect2(Vector2(0.0, band_h * band), Vector2(_world_size.x, band_h + 1.0)),
            top.lerp(bottom, t),
            true,
        )

    for index in range(80):
        var x := _noise(index, 0.17) * _world_size.x
        var y := 34.0 + _noise(index, 0.63) * 250.0
        var radius := 0.8 + _noise(index, 0.91) * 1.5
        var alpha := 0.16 + _noise(index, 1.21) * 0.36
        draw_circle(Vector2(x, y), radius, Color(0.78, 0.84, 0.88, alpha * _intensity))

    if _preset == "harbor_dusk":
        var sun := Vector2(820.0, 178.0)
        draw_circle(sun, 62.0, Color(1.0, 0.48, 0.24, 0.08 * _intensity))
        draw_circle(sun, 34.0, Color(1.0, 0.66, 0.37, 0.62 * _intensity))
    else:
        var moon := Vector2(690.0, 132.0)
        draw_circle(moon, 58.0, Color(0.76, 0.83, 0.87, 0.10 * _intensity))
        draw_circle(moon, 39.0, Color(0.81, 0.87, 0.89, 0.58 * _intensity))
        draw_circle(moon + Vector2(-14.0, -11.0), 9.0, Color(0.47, 0.54, 0.59, 0.22))
        draw_circle(moon + Vector2(17.0, 13.0), 6.0, Color(0.47, 0.54, 0.59, 0.18))

    draw_rect(
        Rect2(Vector2(0.0, 250.0), Vector2(_world_size.x, 118.0)),
        Color(0.34, 0.39, 0.42, 0.055 * _intensity),
        true,
    )
    draw_rect(
        Rect2(Vector2(0.0, 365.0), Vector2(_world_size.x, 88.0)),
        Color(0.50, 0.43, 0.34, 0.032 * _intensity),
        true,
    )

func _draw_far_ridge() -> void:
    if _preset == "harbor_dusk":
        _draw_harbor_horizon()
        return
    if _preset == "alpine_night":
        _draw_alpine_peaks()
        return

    var rear := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 161, 160):
        var xf := float(x)
        var noise := (_noise(x / 160, 2.1) - 0.5) * 34.0
        var y := 360.0 + sin(xf * 0.0037) * 38.0 + noise
        rear.append(Vector2(xf, y))
    rear.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(rear, Color(0.055, 0.085, 0.105, 0.96))

    var front := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 121, 120):
        var xf := float(x)
        var noise := (_noise(x / 120, 3.4) - 0.5) * 24.0
        var y := 432.0 + sin(xf * 0.0061 + 0.8) * 26.0 + noise
        front.append(Vector2(xf, y))
    front.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(front, Color(0.082, 0.12, 0.14, 0.98))

func _draw_ruined_city() -> void:
    if _preset == "harbor_dusk":
        _draw_harbor_skyline()
        return
    if _preset == "alpine_night":
        _draw_alpine_fortress()
        return

    for index in range(34):
        var x := 30.0 + float(index) * 160.0
        var w := 70.0 + _noise(index, 4.2) * 70.0
        var h := 70.0 + _noise(index, 4.8) * 150.0
        var y := _floor_y - 126.0 - h
        var building := Color(0.067, 0.083, 0.095, 0.94)
        draw_rect(Rect2(Vector2(x, y), Vector2(w, h)), building, true)

        if index % 3 == 0:
            var chimney_h := 22.0 + _noise(index, 5.1) * 34.0
            draw_rect(
                Rect2(Vector2(x + w * 0.62, y - chimney_h), Vector2(11.0, chimney_h + 2.0)),
                building,
                true,
            )
        if index % 4 == 1:
            draw_line(
                Vector2(x + 8.0, y + 20.0),
                Vector2(x + w - 9.0, y + 7.0),
                Color(0.23, 0.24, 0.24, 0.34),
                3.0,
            )

        for row in range(3):
            for col in range(3):
                if (index + row + col) % 5 != 0:
                    continue
                var wx := x + 12.0 + float(col) * minf(20.0, w / 4.0)
                var wy := y + 18.0 + float(row) * 24.0
                draw_rect(
                    Rect2(Vector2(wx, wy), Vector2(5.0, 8.0)),
                    Color(0.80, 0.48, 0.20, 0.18 * _intensity),
                    true,
                )

    for index in range(8):
        var smoke_x := 520.0 + float(index) * 640.0
        var base_y := 250.0 + _noise(index, 6.3) * 80.0
        for puff in range(5):
            var drift := float(puff) * 18.0
            var radius := 18.0 + float(puff) * 7.0
            draw_circle(
                Vector2(smoke_x + drift, base_y - float(puff) * 22.0),
                radius,
                Color(0.22, 0.25, 0.26, (0.07 - float(puff) * 0.008) * _intensity),
            )

    for origin_x in [1180.0, 3180.0, 4520.0]:
        var origin := Vector2(origin_x, _floor_y - 154.0)
        var beam_tip := Vector2(origin_x + 420.0, 118.0)
        var beam := PackedVector2Array([
            origin + Vector2(-8.0, 0.0),
            beam_tip + Vector2(-78.0, 0.0),
            beam_tip + Vector2(78.0, 0.0),
            origin + Vector2(8.0, 0.0),
        ])
        draw_colored_polygon(beam, Color(0.77, 0.72, 0.53, 0.034 * _intensity))
        draw_circle(origin, 8.0, Color(0.84, 0.70, 0.36, 0.58))

func _draw_harbor_horizon() -> void:
    draw_rect(Rect2(Vector2(0.0, 390.0), Vector2(_world_size.x, _floor_y - 390.0)), Color("102a33"), true)
    draw_line(Vector2(0.0, 390.0), Vector2(_world_size.x, 390.0), Color(0.52, 0.66, 0.69, 0.18), 2.0)
    for index in range(12):
        var x := 120.0 + float(index) * 470.0
        var hull_w := 90.0 + _noise(index, 11.2) * 100.0
        var y := 420.0 + _noise(index, 11.8) * 36.0
        draw_rect(Rect2(Vector2(x, y), Vector2(hull_w, 10.0)), Color(0.06, 0.11, 0.13, 0.78), true)
        draw_line(Vector2(x + hull_w * 0.55, y), Vector2(x + hull_w * 0.55, y - 38.0), Color(0.12, 0.18, 0.20, 0.72), 3.0)

func _draw_alpine_peaks() -> void:
    var rear := PackedVector2Array([Vector2(0.0, _floor_y)])
    for index in range(18):
        var x := float(index) * 360.0
        var peak_y := 190.0 + _noise(index, 12.4) * 130.0
        rear.append(Vector2(x, 430.0))
        rear.append(Vector2(x + 180.0, peak_y))
        rear.append(Vector2(x + 360.0, 430.0))
    rear.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(rear, Color(0.08, 0.12, 0.16, 0.98))
    for index in range(16):
        var x := float(index) * 380.0 + 90.0
        var peak_y := 245.0 + _noise(index, 13.1) * 110.0
        var snow := PackedVector2Array([
            Vector2(x, peak_y),
            Vector2(x - 42.0, peak_y + 58.0),
            Vector2(x, peak_y + 42.0),
            Vector2(x + 42.0, peak_y + 58.0),
        ])
        draw_colored_polygon(snow, Color(0.48, 0.56, 0.62, 0.20))

func _draw_harbor_skyline() -> void:
    for index in range(12):
        var x := 170.0 + float(index) * 450.0
        var base_y := _floor_y - 148.0
        var mast_h := 140.0 + _noise(index, 14.3) * 90.0
        draw_line(Vector2(x, base_y), Vector2(x, base_y - mast_h), Color("17272c"), 8.0)
        draw_line(Vector2(x, base_y - mast_h + 16.0), Vector2(x + 125.0, base_y - mast_h + 42.0), Color("22363c"), 6.0)
        draw_line(Vector2(x + 120.0, base_y - mast_h + 42.0), Vector2(x + 120.0, base_y - 42.0), Color("23373d"), 4.0)
        draw_rect(Rect2(Vector2(x - 42.0, base_y), Vector2(120.0, 42.0)), Color("15252a"), true)
    for index in range(18):
        var x := 40.0 + float(index) * 305.0
        draw_rect(Rect2(Vector2(x, _floor_y - 92.0), Vector2(180.0, 54.0)), Color(0.07, 0.13, 0.15, 0.92), true)

func _draw_alpine_fortress() -> void:
    for index in range(8):
        var x := 220.0 + float(index) * 680.0
        var base_y := _floor_y - 120.0
        draw_rect(Rect2(Vector2(x, base_y - 88.0), Vector2(240.0, 88.0)), Color("12191e"), true)
        draw_rect(Rect2(Vector2(x + 30.0, base_y - 150.0), Vector2(54.0, 62.0)), Color("10171c"), true)
        draw_rect(Rect2(Vector2(x + 156.0, base_y - 138.0), Vector2(48.0, 50.0)), Color("10171c"), true)
        draw_line(Vector2(x, base_y - 88.0), Vector2(x + 240.0, base_y - 88.0), Color(0.53, 0.61, 0.64, 0.18), 3.0)
        if index % 2 == 0:
            var beam := PackedVector2Array([
                Vector2(x + 54.0, base_y - 150.0),
                Vector2(x + 360.0, 110.0),
                Vector2(x + 440.0, 110.0),
                Vector2(x + 70.0, base_y - 148.0),
            ])
            draw_colored_polygon(beam, Color(0.75, 0.82, 0.85, 0.025))

func _draw_harbor_midground() -> void:
    for index in range(14):
        var x := 120.0 + float(index) * 390.0
        var y := _floor_y - 54.0
        var container := Color("304c53") if index % 3 == 0 else Color("594433")
        draw_rect(Rect2(Vector2(x, y), Vector2(110.0, 54.0)), container, true)
        draw_rect(Rect2(Vector2(x + 10.0, y + 8.0), Vector2(90.0, 3.0)), Color(0.66, 0.78, 0.80, 0.20), true)
    for index in range(9):
        var x := 300.0 + float(index) * 620.0
        draw_line(Vector2(x, _floor_y), Vector2(x, _floor_y - 84.0), Color("263c41"), 7.0)
        draw_circle(Vector2(x, _floor_y - 86.0), 8.0, Color(0.93, 0.70, 0.31, 0.42))

func _draw_alpine_midground() -> void:
    for index in range(11):
        var x := 150.0 + float(index) * 520.0
        var y := _floor_y - 58.0
        draw_rect(Rect2(Vector2(x, y), Vector2(124.0, 58.0)), Color("303a3f"), true)
        draw_rect(Rect2(Vector2(x + 14.0, y + 12.0), Vector2(96.0, 8.0)), Color("1f282c"), true)
        draw_line(Vector2(x, y), Vector2(x + 124.0, y), Color(0.67, 0.74, 0.76, 0.30), 3.0)
    for index in range(10):
        var x := 420.0 + float(index) * 560.0
        draw_line(Vector2(x - 18.0, _floor_y), Vector2(x, _floor_y - 36.0), Color("596468"), 4.0)
        draw_line(Vector2(x + 18.0, _floor_y), Vector2(x, _floor_y - 36.0), Color("596468"), 4.0)

func _draw_mid_defence() -> void:
    if _preset == "harbor_dusk":
        _draw_harbor_midground()
        return
    if _preset == "alpine_night":
        _draw_alpine_midground()
        return

    for index in range(10):
        var x := 180.0 + float(index) * 560.0
        var y := _floor_y - 52.0
        var bunker_w := 88.0 + _noise(index, 7.1) * 42.0
        draw_rect(Rect2(Vector2(x, y), Vector2(bunker_w, 52.0)), Color("202a2f"), true)
        draw_rect(Rect2(Vector2(x + 9.0, y + 8.0), Vector2(bunker_w - 18.0, 7.0)), Color("303a3e"), true)
        draw_line(Vector2(x + 12.0, y), Vector2(x + bunker_w - 12.0, y), Color(0.55, 0.42, 0.24, 0.45), 2.5)

        if index % 2 == 0:
            for bag in range(5):
                var bx := x - 18.0 + float(bag) * 20.0
                draw_rect(Rect2(Vector2(bx, _floor_y - 12.0), Vector2(22.0, 12.0)), Color("605843"), true)

    for index in range(9):
        var pole_x := 350.0 + float(index) * 620.0
        draw_line(
            Vector2(pole_x, _floor_y - 150.0),
            Vector2(pole_x, _floor_y - 5.0),
            Color("30383b"),
            6.0,
        )
        draw_circle(Vector2(pole_x, _floor_y - 152.0), 7.0, Color(0.82, 0.67, 0.38, 0.44))
        if pole_x + 620.0 <= _world_size.x:
            draw_line(
                Vector2(pole_x, _floor_y - 140.0),
                Vector2(pole_x + 620.0, _floor_y - 126.0),
                Color(0.08, 0.10, 0.11, 0.72),
                2.0,
            )

    for index in range(6):
        var fence_x := 780.0 + float(index) * 820.0
        draw_line(
            Vector2(fence_x, _floor_y - 4.0),
            Vector2(fence_x + 120.0, _floor_y - 58.0),
            Color(0.26, 0.30, 0.31, 0.55),
            3.0,
        )
        draw_line(
            Vector2(fence_x + 24.0, _floor_y - 4.0),
            Vector2(fence_x + 144.0, _floor_y - 58.0),
            Color(0.26, 0.30, 0.31, 0.45),
            2.0,
        )
