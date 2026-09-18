extends Node2D

const ATMOSPHERE_REDRAW_INTERVAL := 0.05

var _world_size := Vector2(5200.0, 720.0)
var _floor_y := 610.0
var _kind := "far_ridge"
var _seed := 1
var _intensity := 1.0
var _preset := "night_front"
var _atmosphere_time := 0.0
var _redraw_accumulator := 0.0

func configure(world_size: Vector2, floor_y: float, kind: String, seed: int, intensity: float = 1.0, preset: String = "night_front") -> void:
    _world_size = world_size
    _floor_y = floor_y
    _kind = kind
    _seed = seed
    _intensity = clampf(intensity, 0.0, 2.0)
    _preset = preset
    set_process(_kind in ["sky", "ruined_city", "mid_defence", "near_weather"])
    queue_redraw()

func _ready() -> void:
    queue_redraw()

func _process(delta: float) -> void:
    if not is_processing():
        return
    _atmosphere_time += delta
    _redraw_accumulator += delta
    if _redraw_accumulator < ATMOSPHERE_REDRAW_INTERVAL:
        return
    _redraw_accumulator = 0.0
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
        "near_weather":
            _draw_near_weather()

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
    elif _preset == "jungle_storm":
        top = Color("07130f")
        bottom = Color("26372a")
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
        var twinkle := 0.78 + sin(_atmosphere_time * (0.7 + _noise(index, 1.73)) + float(index)) * 0.22
        draw_circle(Vector2(x, y), radius, Color(0.78, 0.84, 0.88, alpha * twinkle * _intensity))

    if _preset == "harbor_dusk":
        var sun := Vector2(820.0, 178.0)
        draw_circle(sun, 62.0, Color(1.0, 0.48, 0.24, 0.08 * _intensity))
        draw_circle(sun, 34.0, Color(1.0, 0.66, 0.37, 0.62 * _intensity))
    elif _preset == "jungle_storm":
        var storm_glow := Vector2(760.0, 128.0)
        draw_circle(storm_glow, 74.0, Color(0.46, 0.67, 0.52, 0.05 * _intensity))
        draw_circle(storm_glow, 28.0, Color(0.66, 0.78, 0.62, 0.20 * _intensity))
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
    _draw_cloud_bands()

func _draw_cloud_bands() -> void:
    var cloud_color := Color(0.34, 0.39, 0.43, 0.055 * _intensity)
    var glow_color := Color(0.62, 0.64, 0.61, 0.025 * _intensity)
    if _preset == "harbor_dusk":
        cloud_color = Color(0.30, 0.34, 0.40, 0.075 * _intensity)
        glow_color = Color(0.82, 0.50, 0.38, 0.030 * _intensity)
    elif _preset == "alpine_night":
        cloud_color = Color(0.34, 0.42, 0.48, 0.050 * _intensity)
        glow_color = Color(0.68, 0.76, 0.80, 0.022 * _intensity)
    elif _preset == "jungle_storm":
        cloud_color = Color(0.18, 0.28, 0.21, 0.090 * _intensity)
        glow_color = Color(0.42, 0.58, 0.43, 0.026 * _intensity)

    for index in range(9):
        var speed := 2.0 + _noise(index, 20.1) * 4.0
        var track_width := _world_size.x + 900.0
        var base_x := fposmod(
            _noise(index, 20.8) * track_width + _atmosphere_time * speed,
            track_width
        ) - 450.0
        var base_y := 78.0 + _noise(index, 21.4) * 210.0
        var scale := 0.75 + _noise(index, 22.0) * 0.85
        for puff in range(5):
            var puff_x := base_x + float(puff) * 54.0 * scale
            var puff_y := base_y + sin(float(puff) * 1.4 + float(index)) * 10.0
            var radius := (28.0 + _noise(index * 7 + puff, 22.7) * 34.0) * scale
            draw_circle(Vector2(puff_x, puff_y), radius, cloud_color)
            draw_line(
                Vector2(puff_x - radius * 0.70, puff_y + radius * 0.34),
                Vector2(puff_x + radius * 0.72, puff_y + radius * 0.30),
                glow_color,
                maxf(1.0, 2.0 * scale),
            )

func _draw_far_ridge() -> void:
    if _preset == "harbor_dusk":
        _draw_harbor_horizon()
        return
    if _preset == "alpine_night":
        _draw_alpine_peaks()
        return
    if _preset == "jungle_storm":
        _draw_jungle_canopy()
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
    if _preset == "jungle_storm":
        _draw_jungle_ruins()
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
            var drift := float(puff) * 18.0 + sin(_atmosphere_time * 0.55 + float(index) * 0.9 + float(puff) * 0.4) * (6.0 + float(puff) * 2.0)
            var radius := 18.0 + float(puff) * 7.0
            draw_circle(
                Vector2(smoke_x + drift, base_y - float(puff) * 22.0),
                radius,
                Color(0.22, 0.25, 0.26, (0.07 - float(puff) * 0.008) * _intensity),
            )

    for origin_x in [1180.0, 3180.0, 4520.0]:
        var origin := Vector2(origin_x, _floor_y - 154.0)
        var sweep := sin(_atmosphere_time * 0.42 + origin_x * 0.0017) * 245.0
        var beam_tip := Vector2(origin_x + 300.0 + sweep, 118.0)
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

func _draw_jungle_canopy() -> void:
    var rear := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 141, 140):
        var xf := float(x)
        var y := 334.0 + sin(xf * 0.0041) * 30.0 + (_noise(x / 140, 16.2) - 0.5) * 46.0
        rear.append(Vector2(xf, y))
    rear.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(rear, Color(0.045, 0.11, 0.07, 0.98))

    var front := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 101, 100):
        var xf := float(x)
        var y := 418.0 + sin(xf * 0.0074 + 0.7) * 22.0 + (_noise(x / 100, 16.9) - 0.5) * 28.0
        front.append(Vector2(xf, y))
    front.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(front, Color(0.07, 0.16, 0.09, 0.98))

func _draw_jungle_ruins() -> void:
    for index in range(13):
        var x := 120.0 + float(index) * 420.0
        var base_y := _floor_y - 130.0
        var tower_h := 96.0 + _noise(index, 17.4) * 90.0
        draw_rect(Rect2(Vector2(x, base_y - tower_h), Vector2(96.0, tower_h)), Color(0.09, 0.13, 0.09, 0.92), true)
        draw_rect(Rect2(Vector2(x + 14.0, base_y - tower_h + 22.0), Vector2(20.0, 30.0)), Color(0.035, 0.055, 0.04, 0.76), true)
        draw_line(Vector2(x - 12.0, base_y - tower_h), Vector2(x + 108.0, base_y - tower_h), Color(0.34, 0.40, 0.26, 0.28), 3.0)
        if index % 2 == 0:
            draw_line(Vector2(x + 72.0, base_y - tower_h), Vector2(x + 120.0, base_y - tower_h - 52.0), Color(0.16, 0.26, 0.14, 0.45), 4.0)

    for index in range(18):
        var x := 60.0 + float(index) * 310.0
        var y := 250.0 + _noise(index, 18.1) * 130.0
        draw_circle(Vector2(x, y), 24.0 + _noise(index, 18.7) * 22.0, Color(0.08, 0.20, 0.10, 0.18))

func _draw_jungle_midground() -> void:
    for index in range(12):
        var x := 100.0 + float(index) * 450.0
        var y := _floor_y - 50.0
        draw_rect(Rect2(Vector2(x, y), Vector2(110.0, 50.0)), Color("283326"), true)
        draw_line(Vector2(x + 8.0, y + 12.0), Vector2(x + 102.0, y + 12.0), Color(0.53, 0.49, 0.30, 0.32), 3.0)
        if index % 3 == 0:
            draw_line(Vector2(x + 54.0, y), Vector2(x + 54.0, y - 68.0), Color("3d4937"), 5.0)
            draw_line(Vector2(x + 54.0, y - 68.0), Vector2(x + 94.0, y - 94.0), Color("3d4937"), 4.0)

    for index in range(8):
        var x := 340.0 + float(index) * 650.0
        var base := Vector2(x, _floor_y - 4.0)
        draw_line(base + Vector2(-24.0, 0.0), base + Vector2(0.0, -34.0), Color(0.31, 0.36, 0.26, 0.68), 4.0)
        draw_line(base + Vector2(24.0, 0.0), base + Vector2(0.0, -34.0), Color(0.31, 0.36, 0.26, 0.68), 4.0)

func _draw_near_weather() -> void:
    var particle_count := 56
    if _preset == "alpine_night":
        particle_count = 74
    elif _preset == "jungle_storm":
        particle_count = 64

    for index in range(particle_count):
        var depth := 0.45 + _noise(index, 30.2) * 0.75
        var base_x := _noise(index, 30.8) * _world_size.x
        var base_y := 36.0 + _noise(index, 31.4) * maxf(120.0, _floor_y - 76.0)

        if _preset == "harbor_dusk":
            var rain_speed := 178.0 + _noise(index, 32.0) * 110.0
            var x := fposmod(base_x - _atmosphere_time * 34.0 * depth, _world_size.x)
            var y := fposmod(base_y + _atmosphere_time * rain_speed * depth, _floor_y - 24.0)
            var length := 8.0 + depth * 14.0
            draw_line(
                Vector2(x, y),
                Vector2(x - 5.0 * depth, y + length),
                Color(0.58, 0.72, 0.76, 0.11 + depth * 0.05),
                maxf(1.0, depth * 1.4),
            )
        elif _preset == "alpine_night":
            var snow_speed := 18.0 + _noise(index, 32.7) * 26.0
            var sway := sin(_atmosphere_time * (0.65 + depth * 0.45) + float(index) * 1.7) * (14.0 + depth * 14.0)
            var x := fposmod(base_x + sway, _world_size.x)
            var y := fposmod(base_y + _atmosphere_time * snow_speed * depth, _floor_y - 20.0)
            var radius := 1.1 + depth * 1.7
            draw_circle(Vector2(x, y), radius, Color(0.84, 0.90, 0.93, 0.16 + depth * 0.12))
        elif _preset == "jungle_storm":
            var rain_speed := 220.0 + _noise(index, 33.4) * 150.0
            var x := fposmod(base_x - _atmosphere_time * 58.0 * depth, _world_size.x)
            var y := fposmod(base_y + _atmosphere_time * rain_speed * depth, _floor_y - 18.0)
            var length := 10.0 + depth * 18.0
            draw_line(
                Vector2(x, y),
                Vector2(x - 8.0 * depth, y + length),
                Color(0.50, 0.66, 0.52, 0.10 + depth * 0.06),
                maxf(1.0, depth * 1.5),
            )
            if index % 11 == 0:
                var leaf_phase := _atmosphere_time * (0.8 + depth * 0.3) + float(index)
                draw_line(
                    Vector2(x + sin(leaf_phase) * 18.0, y - 26.0),
                    Vector2(x + sin(leaf_phase) * 18.0 + 7.0, y - 19.0),
                    Color(0.34, 0.47, 0.24, 0.26),
                    2.0,
                )
        else:
            var drift_speed := 14.0 + _noise(index, 34.1) * 24.0
            var x := fposmod(base_x + _atmosphere_time * drift_speed * depth, _world_size.x)
            var y := base_y + sin(_atmosphere_time * (0.4 + depth * 0.35) + float(index)) * (12.0 + depth * 8.0)
            var ember := index % 13 == 0
            var mote_color := Color(0.56, 0.55, 0.51, 0.08 + depth * 0.06)
            if ember:
                mote_color = Color(0.92, 0.48, 0.18, 0.14 + depth * 0.08)
            draw_circle(Vector2(x, y), 0.9 + depth * 1.2, mote_color)

func _draw_mid_defence() -> void:
    if _preset == "harbor_dusk":
        _draw_harbor_midground()
        return
    if _preset == "alpine_night":
        _draw_alpine_midground()
        return
    if _preset == "jungle_storm":
        _draw_jungle_midground()
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
        var lamp_pulse := 0.38 + sin(_atmosphere_time * 2.2 + float(index) * 0.8) * 0.06
        draw_circle(Vector2(pole_x, _floor_y - 152.0), 11.0, Color(0.88, 0.69, 0.34, lamp_pulse * 0.20))
        draw_circle(Vector2(pole_x, _floor_y - 152.0), 7.0, Color(0.82, 0.67, 0.38, lamp_pulse))
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
