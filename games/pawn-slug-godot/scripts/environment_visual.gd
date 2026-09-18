extends Node2D

# Lightweight, deterministic 2D world dressing for Pawn Slug. This deliberately
# stays procedural so the browser export gets depth and atmosphere without
# pulling heavy scene art into the critical runtime bundle.

var _world_size := Vector2(5200.0, 720.0)
var _floor_y := 610.0
var _platforms: Array[Rect2] = []

func configure(world_size: Vector2, floor_y: float, platforms: Array[Rect2]) -> void:
    _world_size = world_size
    _floor_y = floor_y
    _platforms = platforms.duplicate()
    queue_redraw()

func _ready() -> void:
    queue_redraw()

func _draw() -> void:
    _draw_sky()
    _draw_haze()
    _draw_far_ridge()
    _draw_ruined_skyline()
    _draw_searchlights()
    _draw_midground_defences()
    _draw_ground()
    _draw_platforms()
    _draw_foreground_props()

func _draw_sky() -> void:
    var top := Color("071018")
    var bottom := Color("25303a")
    var bands := 14
    var band_h := _floor_y / float(bands)
    for band in range(bands):
        var t := float(band) / float(maxi(1, bands - 1))
        var color := top.lerp(bottom, t)
        draw_rect(Rect2(Vector2(0.0, band_h * band), Vector2(_world_size.x, band_h + 1.0)), color, true)

    # A cold moon near the opening gives the first screen a focal point.
    draw_circle(Vector2(690.0, 132.0), 54.0, Color(0.75, 0.82, 0.86, 0.12))
    draw_circle(Vector2(690.0, 132.0), 38.0, Color(0.80, 0.86, 0.88, 0.56))
    draw_circle(Vector2(676.0, 120.0), 9.0, Color(0.48, 0.55, 0.59, 0.22))
    draw_circle(Vector2(707.0, 144.0), 6.0, Color(0.48, 0.55, 0.59, 0.18))

func _draw_haze() -> void:
    draw_rect(Rect2(Vector2(0.0, 250.0), Vector2(_world_size.x, 110.0)), Color(0.28, 0.34, 0.38, 0.055), true)
    draw_rect(Rect2(Vector2(0.0, 365.0), Vector2(_world_size.x, 78.0)), Color(0.52, 0.44, 0.34, 0.035), true)

func _draw_far_ridge() -> void:
    var points := PackedVector2Array()
    points.append(Vector2(0.0, _floor_y))
    for x in range(0, int(_world_size.x) + 161, 160):
        var xf := float(x)
        var ridge_y := 388.0 + sin(xf * 0.0048) * 34.0 + cos(xf * 0.0107) * 18.0
        points.append(Vector2(xf, ridge_y))
    points.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(points, Color("111a21"))

    var near_points := PackedVector2Array()
    near_points.append(Vector2(0.0, _floor_y))
    for x in range(0, int(_world_size.x) + 121, 120):
        var xf := float(x)
        var ridge_y := 448.0 + sin(xf * 0.0072 + 0.8) * 24.0 + cos(xf * 0.015) * 10.0
        near_points.append(Vector2(xf, ridge_y))
    near_points.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(near_points, Color("182229"))

func _draw_ruined_skyline() -> void:
    for index in range(30):
        var x := 70.0 + float(index) * 178.0
        var h := 58.0 + float((index * 47) % 118)
        var w := 72.0 + float((index * 31) % 46)
        var y := _floor_y - 158.0 - h
        var building := Color(0.075, 0.095, 0.11, 0.92)
        draw_rect(Rect2(Vector2(x, y), Vector2(w, h)), building, true)
        if index % 3 == 0:
            draw_rect(Rect2(Vector2(x + w * 0.62, y - 26.0), Vector2(12.0, 28.0)), building, true)
        if index % 4 == 1:
            draw_line(Vector2(x + 10.0, y + 18.0), Vector2(x + w - 8.0, y + 7.0), Color(0.22, 0.24, 0.24, 0.35), 3.0)

        for window_row in range(2):
            for window_col in range(3):
                if (index + window_row + window_col) % 4 != 0:
                    continue
                var wx := x + 13.0 + float(window_col) * 18.0
                var wy := y + 18.0 + float(window_row) * 22.0
                draw_rect(Rect2(Vector2(wx, wy), Vector2(5.0, 8.0)), Color(0.78, 0.48, 0.19, 0.20), true)

func _draw_searchlights() -> void:
    for origin_x in [1180.0, 3180.0, 4520.0]:
        var origin := Vector2(origin_x, _floor_y - 154.0)
        var beam_tip := Vector2(origin_x + 420.0, 120.0)
        var beam := PackedVector2Array([
            origin + Vector2(-8.0, 0.0),
            beam_tip + Vector2(-78.0, 0.0),
            beam_tip + Vector2(78.0, 0.0),
            origin + Vector2(8.0, 0.0),
        ])
        draw_colored_polygon(beam, Color(0.77, 0.72, 0.53, 0.035))
        draw_circle(origin, 8.0, Color(0.84, 0.70, 0.36, 0.62))

func _draw_midground_defences() -> void:
    for index in range(9):
        var x := 250.0 + float(index) * 610.0
        var y := _floor_y - 58.0
        draw_rect(Rect2(Vector2(x, y), Vector2(104.0, 58.0)), Color("242d31"), true)
        draw_rect(Rect2(Vector2(x + 10.0, y + 9.0), Vector2(84.0, 8.0)), Color("313b3f"), true)
        draw_line(Vector2(x + 15.0, y), Vector2(x + 88.0, y), Color(0.55, 0.43, 0.25, 0.55), 3.0)
        if index % 2 == 0:
            _draw_sandbags(Vector2(x - 18.0, _floor_y - 5.0), 5)

    for index in range(7):
        var pole_x := 430.0 + float(index) * 760.0
        draw_line(Vector2(pole_x, _floor_y - 152.0), Vector2(pole_x, _floor_y - 4.0), Color("313a3d"), 7.0)
        draw_circle(Vector2(pole_x, _floor_y - 154.0), 9.0, Color(0.82, 0.68, 0.38, 0.50))
        draw_line(
            Vector2(pole_x, _floor_y - 142.0),
            Vector2(pole_x + 760.0, _floor_y - 128.0),
            Color(0.10, 0.12, 0.13, 0.80),
            2.0
        )

func _draw_ground() -> void:
    draw_rect(
        Rect2(Vector2(0.0, _floor_y), Vector2(_world_size.x, _world_size.y - _floor_y)),
        Color("1b2226"),
        true
    )
    draw_rect(Rect2(Vector2(0.0, _floor_y + 24.0), Vector2(_world_size.x, 74.0)), Color("151b1e"), true)
    draw_line(Vector2(0.0, _floor_y), Vector2(_world_size.x, _floor_y), Color("8c7145"), 4.0)
    draw_line(Vector2(0.0, _floor_y + 5.0), Vector2(_world_size.x, _floor_y + 5.0), Color(0.78, 0.63, 0.34, 0.18), 1.5)

    for index in range(44):
        var x := 38.0 + float(index) * 119.0
        var crack_len := 12.0 + float((index * 13) % 28)
        draw_line(
            Vector2(x, _floor_y + 34.0 + float((index * 9) % 34)),
            Vector2(x + crack_len, _floor_y + 27.0 + float((index * 5) % 28)),
            Color(0.36, 0.34, 0.30, 0.26),
            2.0
        )

func _draw_platforms() -> void:
    for platform in _platforms:
        draw_rect(platform, Color("303b42"), true)
        draw_rect(
            Rect2(platform.position + Vector2(0.0, 4.0), Vector2(platform.size.x, platform.size.y - 4.0)),
            Color("252e34"),
            true
        )
        draw_line(platform.position, platform.position + Vector2(platform.size.x, 0.0), Color("b08a48"), 3.0)
        draw_line(
            platform.position + Vector2(0.0, platform.size.y),
            platform.position + platform.size,
            Color(0.06, 0.08, 0.09, 0.75),
            3.0
        )
        for rivet_x in range(int(platform.position.x) + 18, int(platform.end.x) - 10, 34):
            draw_circle(Vector2(float(rivet_x), platform.position.y + 8.0), 2.2, Color("69747a"))

        var support_y := platform.end.y
        draw_line(
            Vector2(platform.position.x + 20.0, support_y),
            Vector2(platform.position.x + 20.0, minf(_floor_y, support_y + 72.0)),
            Color("242c31"),
            7.0
        )
        draw_line(
            Vector2(platform.end.x - 20.0, support_y),
            Vector2(platform.end.x - 20.0, minf(_floor_y, support_y + 72.0)),
            Color("242c31"),
            7.0
        )

func _draw_foreground_props() -> void:
    for index in range(8):
        var x := 540.0 + float(index) * 640.0
        _draw_crate(Vector2(x, _floor_y - 3.0), 32.0 + float((index % 3) * 4))
        if index % 2 == 1:
            _draw_barrel(Vector2(x + 78.0, _floor_y - 2.0))

    for index in range(6):
        var x := 940.0 + float(index) * 820.0
        _draw_sandbags(Vector2(x, _floor_y - 3.0), 6)

func _draw_crate(origin: Vector2, size: float) -> void:
    var rect := Rect2(origin + Vector2(-size * 0.5, -size), Vector2(size, size))
    draw_rect(rect, Color("55422f"), true)
    draw_rect(rect, Color("9a7446"), false, 2.0)
    draw_line(rect.position, rect.end, Color(0.73, 0.53, 0.30, 0.55), 2.0)
    draw_line(Vector2(rect.end.x, rect.position.y), Vector2(rect.position.x, rect.end.y), Color(0.31, 0.23, 0.17, 0.75), 2.0)

func _draw_barrel(origin: Vector2) -> void:
    draw_rect(Rect2(origin + Vector2(-14.0, -38.0), Vector2(28.0, 38.0)), Color("38484b"), true)
    draw_line(origin + Vector2(-14.0, -30.0), origin + Vector2(14.0, -30.0), Color("728083"), 2.0)
    draw_line(origin + Vector2(-14.0, -10.0), origin + Vector2(14.0, -10.0), Color("728083"), 2.0)
    draw_circle(origin + Vector2(0.0, -38.0), 14.0, Color("46585c"))

func _draw_sandbags(origin: Vector2, count: int) -> void:
    for index in range(count):
        var row := 0 if index < 4 else 1
        var column := index if row == 0 else index - 4
        var x := origin.x + float(column) * 22.0 - (11.0 if row == 1 else 0.0)
        var y := origin.y - float(row) * 12.0
        draw_rect(Rect2(Vector2(x, y - 12.0), Vector2(24.0, 12.0)), Color("655b45"), true)
        draw_line(Vector2(x + 4.0, y - 7.0), Vector2(x + 20.0, y - 7.0), Color(0.74, 0.67, 0.50, 0.35), 1.0)
