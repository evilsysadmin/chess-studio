extends Node2D

# Lightweight, deterministic 2D world dressing for Pawn Slug. This deliberately
# stays procedural so the browser export gets depth and atmosphere without
# pulling heavy scene art into the critical runtime bundle.

var _world_size := Vector2(5200.0, 720.0)
var _floor_y := 610.0
var _platforms: Array[Rect2] = []
var _obstacles: Array[Rect2] = []
var _theme := "night_front"

func configure(world_size: Vector2, floor_y: float, platforms: Array[Rect2], obstacles: Array[Rect2] = [], theme: String = "night_front") -> void:
    _world_size = world_size
    _floor_y = floor_y
    _platforms = platforms.duplicate()
    _obstacles = obstacles.duplicate()
    _theme = theme
    queue_redraw()

func _ready() -> void:
    queue_redraw()

func _draw() -> void:
    # Sky, distant skyline and midground now live in real Parallax2D layers.
    # This node owns only world-locked ground/traversal/foreground dressing.
    _draw_ground()
    _draw_platforms()
    _draw_obstacles()
    _draw_foreground_props()
    _draw_foreground_story_props()

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
    var ground_main := Color("1b2226")
    var ground_deep := Color("151b1e")
    var edge := Color("8c7145")
    var crack := Color(0.36, 0.34, 0.30, 0.26)
    match _theme:
        "harbor_dusk":
            ground_main = Color("17262b")
            ground_deep = Color("101a1e")
            edge = Color("6d8790")
            crack = Color(0.30, 0.42, 0.45, 0.24)
        "alpine_night":
            ground_main = Color("20272b")
            ground_deep = Color("171d20")
            edge = Color("a7b4b8")
            crack = Color(0.56, 0.61, 0.62, 0.22)
        "jungle_storm":
            ground_main = Color("1c2922")
            ground_deep = Color("121b16")
            edge = Color("7a6b43")
            crack = Color(0.28, 0.38, 0.25, 0.28)

    draw_rect(
        Rect2(Vector2(0.0, _floor_y), Vector2(_world_size.x, _world_size.y - _floor_y)),
        ground_main,
        true
    )
    draw_rect(Rect2(Vector2(0.0, _floor_y + 24.0), Vector2(_world_size.x, 74.0)), ground_deep, true)
    draw_line(Vector2(0.0, _floor_y), Vector2(_world_size.x, _floor_y), edge, 4.0)
    draw_line(Vector2(0.0, _floor_y + 5.0), Vector2(_world_size.x, _floor_y + 5.0), Color(edge.r, edge.g, edge.b, 0.20), 1.5)

    for index in range(44):
        var x := 38.0 + float(index) * 119.0
        var crack_len := 12.0 + float((index * 13) % 28)
        draw_line(
            Vector2(x, _floor_y + 34.0 + float((index * 9) % 34)),
            Vector2(x + crack_len, _floor_y + 27.0 + float((index * 5) % 28)),
            crack,
            2.0
        )

func _draw_platforms() -> void:
    var top_color := Color("303b42")
    var body_color := Color("252e34")
    var trim := Color("b08a48")
    var rivet := Color("69747a")
    var support := Color("242c31")
    match _theme:
        "harbor_dusk":
            top_color = Color("294047")
            body_color = Color("1e3137")
            trim = Color("6f98a4")
            rivet = Color("8ba4aa")
            support = Color("203237")
        "alpine_night":
            top_color = Color("3b454a")
            body_color = Color("2b3438")
            trim = Color("aab9bd")
            rivet = Color("c1c9cb")
            support = Color("30393d")
        "jungle_storm":
            top_color = Color("4b4732")
            body_color = Color("302f22")
            trim = Color("9a7f4d")
            rivet = Color("776a4b")
            support = Color("28342b")

    for platform in _platforms:
        draw_rect(platform, top_color, true)
        draw_rect(
            Rect2(platform.position + Vector2(0.0, 4.0), Vector2(platform.size.x, platform.size.y - 4.0)),
            body_color,
            true
        )
        draw_line(platform.position, platform.position + Vector2(platform.size.x, 0.0), trim, 3.0)
        draw_line(
            platform.position + Vector2(0.0, platform.size.y),
            platform.position + platform.size,
            Color(0.06, 0.08, 0.09, 0.75),
            3.0
        )
        for rivet_x in range(int(platform.position.x) + 18, int(platform.end.x) - 10, 34):
            draw_circle(Vector2(float(rivet_x), platform.position.y + 8.0), 2.2, rivet)

        var support_y := platform.end.y
        draw_line(
            Vector2(platform.position.x + 20.0, support_y),
            Vector2(platform.position.x + 20.0, minf(_floor_y, support_y + 72.0)),
            support,
            7.0
        )
        draw_line(
            Vector2(platform.end.x - 20.0, support_y),
            Vector2(platform.end.x - 20.0, minf(_floor_y, support_y + 72.0)),
            support,
            7.0
        )

func _draw_obstacles() -> void:
    for index in range(_obstacles.size()):
        var obstacle := _obstacles[index]
        var body := Color("4a4134") if index % 2 == 0 else Color("384549")
        var edge := Color("b18b50") if index % 2 == 0 else Color("7b888a")
        if _theme == "harbor_dusk":
            body = Color("31484f") if index % 2 == 0 else Color("4b3e31")
            edge = Color("7297a0") if index % 2 == 0 else Color("a47a4e")
        elif _theme == "alpine_night":
            body = Color("4a5051") if index % 2 == 0 else Color("343c40")
            edge = Color("b7c1c3") if index % 2 == 0 else Color("7f8d92")
        elif _theme == "jungle_storm":
            body = Color("43513a") if index % 2 == 0 else Color("4b4030")
            edge = Color("74845e") if index % 2 == 0 else Color("9a7b4d")
        draw_rect(obstacle, body, true)
        draw_rect(obstacle, edge, false, 2.0)
        if obstacle.size.x >= 58.0:
            draw_line(
                obstacle.position + Vector2(8.0, 8.0),
                obstacle.end - Vector2(8.0, 8.0),
                Color(edge.r, edge.g, edge.b, 0.38),
                2.0,
            )
            draw_line(
                Vector2(obstacle.end.x - 8.0, obstacle.position.y + 8.0),
                Vector2(obstacle.position.x + 8.0, obstacle.end.y - 8.0),
                Color(0.10, 0.11, 0.10, 0.48),
                2.0,
            )
        draw_rect(
            Rect2(obstacle.position + Vector2(0.0, obstacle.size.y - 7.0), Vector2(obstacle.size.x, 7.0)),
            Color(0.08, 0.09, 0.09, 0.46),
            true,
        )

func _draw_foreground_props() -> void:
    match _theme:
        "harbor_dusk":
            for index in range(10):
                var x := 460.0 + float(index) * 560.0
                _draw_crate(Vector2(x, _floor_y - 3.0), 34.0 + float((index % 2) * 6))
                _draw_barrel(Vector2(x + 64.0, _floor_y - 2.0))
        "alpine_night":
            for index in range(8):
                var x := 520.0 + float(index) * 650.0
                _draw_sandbags(Vector2(x, _floor_y - 3.0), 6)
                if index % 2 == 0:
                    _draw_crate(Vector2(x + 105.0, _floor_y - 3.0), 30.0)
        "jungle_storm":
            for index in range(9):
                var x := 500.0 + float(index) * 590.0
                _draw_crate(Vector2(x, _floor_y - 3.0), 30.0 + float((index % 3) * 3))
                if index % 2 == 0:
                    _draw_sandbags(Vector2(x + 82.0, _floor_y - 3.0), 5)
        _:
            for index in range(8):
                var x := 540.0 + float(index) * 640.0
                _draw_crate(Vector2(x, _floor_y - 3.0), 32.0 + float((index % 3) * 4))
                if index % 2 == 1:
                    _draw_barrel(Vector2(x + 78.0, _floor_y - 2.0))

            for index in range(6):
                var x := 940.0 + float(index) * 820.0
                _draw_sandbags(Vector2(x, _floor_y - 3.0), 6)

func _draw_foreground_story_props() -> void:
    match _theme:
        "harbor_dusk":
            _draw_harbor_story_props()
        "alpine_night":
            _draw_alpine_story_props()
        "jungle_storm":
            _draw_jungle_story_props()
        _:
            _draw_front_story_props()

func _draw_front_story_props() -> void:
    for index in range(5):
        var x := 760.0 + float(index) * 980.0
        var base := Vector2(x, _floor_y - 2.0)
        draw_line(base + Vector2(-42.0, 0.0), base + Vector2(38.0, -25.0), Color(0.18, 0.20, 0.20, 0.72), 7.0)
        draw_line(base + Vector2(-18.0, -14.0), base + Vector2(12.0, -52.0), Color(0.20, 0.22, 0.22, 0.68), 6.0)
        draw_circle(base + Vector2(-30.0, -3.0), 12.0, Color(0.11, 0.13, 0.13, 0.88))
        draw_circle(base + Vector2(28.0, -12.0), 10.0, Color(0.11, 0.13, 0.13, 0.88))

func _draw_harbor_story_props() -> void:
    for index in range(6):
        var x := 620.0 + float(index) * 860.0
        draw_line(Vector2(x, _floor_y), Vector2(x, _floor_y - 78.0), Color("24363a"), 7.0)
        draw_line(Vector2(x - 18.0, _floor_y - 66.0), Vector2(x + 28.0, _floor_y - 66.0), Color("71898f"), 4.0)
        draw_circle(Vector2(x + 30.0, _floor_y - 66.0), 5.0, Color(0.88, 0.67, 0.32, 0.52))
    for index in range(5):
        var x := 980.0 + float(index) * 940.0
        var base := Vector2(x, _floor_y - 3.0)
        draw_arc(base + Vector2(0.0, -10.0), 28.0, PI, TAU, 18, Color(0.20, 0.30, 0.34, 0.68), 4.0)
        draw_line(base + Vector2(-24.0, -8.0), base + Vector2(24.0, -8.0), Color("405a60"), 4.0)

func _draw_alpine_story_props() -> void:
    for index in range(8):
        var x := 430.0 + float(index) * 690.0
        var base := Vector2(x, _floor_y)
        draw_line(base + Vector2(-18.0, 0.0), base + Vector2(0.0, -34.0), Color("5a666a"), 5.0)
        draw_line(base + Vector2(18.0, 0.0), base + Vector2(0.0, -34.0), Color("5a666a"), 5.0)
        draw_line(base + Vector2(-18.0, 0.0), base + Vector2(18.0, 0.0), Color("aab6b8"), 3.0)
    for index in range(6):
        var x := 850.0 + float(index) * 840.0
        draw_circle(Vector2(x, _floor_y - 4.0), 24.0, Color(0.50, 0.56, 0.58, 0.16))
        draw_circle(Vector2(x + 18.0, _floor_y - 3.0), 18.0, Color(0.67, 0.72, 0.73, 0.12))

func _draw_jungle_story_props() -> void:
    for index in range(9):
        var x := 360.0 + float(index) * 610.0
        var base := Vector2(x, _floor_y)
        var trunk := Color("3c3022")
        draw_line(base, base + Vector2(8.0, -92.0), trunk, 10.0)
        draw_circle(base + Vector2(-18.0, -88.0), 26.0, Color(0.13, 0.24, 0.14, 0.74))
        draw_circle(base + Vector2(18.0, -104.0), 30.0, Color(0.15, 0.28, 0.16, 0.70))
        draw_circle(base + Vector2(34.0, -82.0), 22.0, Color(0.11, 0.22, 0.13, 0.68))

    for index in range(6):
        var x := 840.0 + float(index) * 820.0
        var y := _floor_y - 4.0
        draw_line(Vector2(x - 42.0, y), Vector2(x + 42.0, y - 26.0), Color("5a4930"), 8.0)
        draw_line(Vector2(x - 30.0, y - 8.0), Vector2(x - 2.0, y - 38.0), Color("4b3d2b"), 5.0)

    for index in range(5):
        var x := 1180.0 + float(index) * 920.0
        var top := _floor_y - 104.0
        draw_rect(Rect2(Vector2(x, top), Vector2(74.0, 104.0)), Color(0.20, 0.24, 0.18, 0.78), true)
        draw_rect(Rect2(Vector2(x + 12.0, top + 18.0), Vector2(18.0, 30.0)), Color(0.08, 0.11, 0.08, 0.75), true)
        draw_line(Vector2(x - 8.0, top), Vector2(x + 82.0, top), Color(0.45, 0.49, 0.34, 0.42), 3.0)

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
