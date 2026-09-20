extends Node2D

# Lightweight, deterministic 2D world dressing for Pawn Slug. This deliberately
# stays procedural so the browser export gets depth and atmosphere without
# pulling heavy scene art into the critical runtime bundle.

var _world_size := Vector2(5200.0, 720.0)
var _floor_y := 610.0
var _platforms: Array[Rect2] = []
var _obstacles: Array[Rect2] = []
var _theme := "night_front"
var _platform_specs: Array[Dictionary] = []
var _dressing_specs: Array[Dictionary] = []
var _story_prop_specs: Array[Dictionary] = []

func configure(world_size: Vector2, floor_y: float, platforms: Array[Rect2], obstacles: Array[Rect2] = [], theme: String = "night_front", platform_specs: Array[Dictionary] = [], dressing_specs: Array[Dictionary] = [], story_prop_specs: Array[Dictionary] = []) -> void:
    _world_size = world_size
    _floor_y = floor_y
    _platforms = platforms.duplicate()
    _obstacles = obstacles.duplicate()
    _theme = theme
    _platform_specs = platform_specs.duplicate(true)
    _dressing_specs = dressing_specs.duplicate(true)
    _story_prop_specs = story_prop_specs.duplicate(true)
    queue_redraw()

func _ready() -> void:
    queue_redraw()

func _detail_noise(index: int, salt: float = 0.0) -> float:
    var raw := sin(float(index) * 17.173 + salt * 91.731) * 43821.113
    return raw - floor(raw)

func _draw() -> void:
    # Sky, distant skyline and midground now live in real Parallax2D layers.
    # This node owns only world-locked ground/traversal/foreground dressing.
    _draw_ground()
    _draw_platforms()
    _draw_obstacles()
    _draw_map_architecture()
    _draw_platform_authored_dressing()
    _draw_foreground_props()
    _draw_foreground_story_props()
    _draw_near_depth_dressing()

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

    _draw_ground_texture(edge)

func _draw_ground_texture(edge: Color) -> void:
    var fleck_count := maxi(48, int(_world_size.x / 38.0))
    for index in range(fleck_count):
        var x := _detail_noise(index, 1.3) * _world_size.x
        var y := _floor_y + 12.0 + _detail_noise(index, 2.1) * 78.0
        var size := 0.8 + _detail_noise(index, 2.8) * 2.2
        var alpha := 0.08 + _detail_noise(index, 3.4) * 0.12
        var fleck := Color(edge.r, edge.g, edge.b, alpha)
        draw_circle(Vector2(x, y), size, fleck)

    for index in range(9):
        var x := 180.0 + float(index) * 610.0
        var width := 130.0 + _detail_noise(index, 4.2) * 150.0
        var y := _floor_y + 76.0 + _detail_noise(index, 4.8) * 14.0
        draw_line(
            Vector2(x, y),
            Vector2(minf(_world_size.x, x + width), y + _detail_noise(index, 5.3) * 3.0),
            Color(0.05, 0.06, 0.06, 0.24),
            4.0 + _detail_noise(index, 5.9) * 3.0,
        )

    if _theme in ["night_front", "harbor_dusk", "jungle_storm"]:
        var reflection := Color(0.48, 0.60, 0.66, 0.13)
        if _theme == "harbor_dusk":
            reflection = Color(0.58, 0.71, 0.74, 0.17)
        elif _theme == "jungle_storm":
            reflection = Color(0.38, 0.52, 0.40, 0.13)
        for index in range(7):
            var x := 310.0 + float(index) * 760.0
            var y := _floor_y + 29.0 + float(index % 3) * 11.0
            var width := 74.0 + _detail_noise(index, 6.4) * 70.0
            draw_line(Vector2(x, y), Vector2(x + width, y), Color(0.03, 0.05, 0.06, 0.38), 9.0)
            draw_line(Vector2(x + 9.0, y - 1.0), Vector2(x + width * 0.68, y - 1.0), reflection, 2.0)

func _draw_platforms() -> void:
    for index in range(_platforms.size()):
        var platform := _platforms[index]
        var spec: Dictionary = _platform_specs[index] if index < _platform_specs.size() else {}
        var material := String(spec.get("material", "metal"))

        var top_color := Color("303b42")
        var body_color := Color("252e34")
        var trim := Color("b08a48")
        var rivet := Color("69747a")
        var support := Color("242c31")

        match material:
            "wood":
                top_color = Color("5b4630")
                body_color = Color("3c3124")
                trim = Color("a47c49")
                rivet = Color("786248")
                support = Color("342b22")
            "stone":
                top_color = Color("545958")
                body_color = Color("393e3d")
                trim = Color("8b9492")
                rivet = Color("707876")
                support = Color("343938")
            "concrete":
                top_color = Color("5b5f60")
                body_color = Color("404446")
                trim = Color("9aa0a1")
                rivet = Color("747b7d")
                support = Color("353a3c")
            "metal":
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

        if material == "wood":
            for seam_x in range(int(platform.position.x) + 28, int(platform.end.x) - 8, 42):
                draw_line(
                    Vector2(float(seam_x), platform.position.y + 4.0),
                    Vector2(float(seam_x), platform.end.y - 3.0),
                    Color(0.12, 0.10, 0.07, 0.42),
                    2.0,
                )
        elif material in ["stone", "concrete"]:
            for seam_x in range(int(platform.position.x) + 52, int(platform.end.x) - 8, 74):
                draw_line(
                    Vector2(float(seam_x), platform.position.y + 3.0),
                    Vector2(float(seam_x), platform.end.y - 3.0),
                    Color(0.14, 0.15, 0.15, 0.34),
                    1.5,
                )
        else:
            for rivet_x in range(int(platform.position.x) + 18, int(platform.end.x) - 10, 34):
                draw_circle(Vector2(float(rivet_x), platform.position.y + 8.0), 2.2, rivet)

        _draw_platform_wear(platform, material, trim, index)
        _draw_platform_material_texture(platform, material, index)

        var support_y := platform.end.y
        var left_support_x := platform.position.x + 20.0
        var right_support_x := platform.end.x - 20.0
        var left_anchor_y := _platform_support_anchor_y(left_support_x, support_y, index)
        var right_anchor_y := _platform_support_anchor_y(right_support_x, support_y, index)
        draw_line(
            Vector2(left_support_x, support_y),
            Vector2(left_support_x, left_anchor_y),
            support,
            7.0
        )
        draw_line(
            Vector2(right_support_x, support_y),
            Vector2(right_support_x, right_anchor_y),
            support,
            7.0
        )

        if support_y + 30.0 < _floor_y and platform.size.x >= 110.0:
            var brace_bottom := minf(left_anchor_y, right_anchor_y)
            var segment_top := support_y + 8.0
            while segment_top + 22.0 < brace_bottom:
                var segment_bottom := minf(brace_bottom, segment_top + 54.0)
                draw_line(
                    Vector2(left_support_x, segment_top),
                    Vector2(right_support_x, segment_bottom),
                    Color(support.r, support.g, support.b, 0.58),
                    3.0,
                )
                draw_line(
                    Vector2(right_support_x, segment_top),
                    Vector2(left_support_x, segment_bottom),
                    Color(support.r, support.g, support.b, 0.42),
                    2.5,
                )
                draw_line(
                    Vector2(left_support_x, segment_bottom),
                    Vector2(right_support_x, segment_bottom),
                    Color(support.r, support.g, support.b, 0.30),
                    1.8,
                )
                segment_top = segment_bottom

func _draw_platform_material_texture(platform: Rect2, material: String, platform_index: int) -> void:
    var usable_w := maxf(1.0, platform.size.x - 18.0)
    var usable_h := maxf(1.0, platform.size.y - 10.0)
    match material:
        "wood":
            var grain_count := maxi(2, int(platform.size.x / 46.0))
            for grain in range(grain_count):
                var x := platform.position.x + 9.0 + _detail_noise(platform_index * 41 + grain, 20.1) * usable_w
                var y := platform.position.y + 6.0 + _detail_noise(platform_index * 43 + grain, 20.7) * usable_h
                var length := 16.0 + _detail_noise(platform_index * 47 + grain, 21.3) * 34.0
                draw_line(
                    Vector2(x, y),
                    Vector2(minf(platform.end.x - 6.0, x + length), y + (_detail_noise(grain, 21.9) - 0.5) * 2.0),
                    Color(0.82, 0.62, 0.38, 0.12),
                    1.2,
                )
                if grain % 2 == 0:
                    draw_circle(Vector2(x, minf(platform.end.y - 4.0, y + 4.0)), 1.4, Color(0.10, 0.08, 0.055, 0.58))
        "stone":
            var chip_count := maxi(2, int(platform.size.x / 58.0))
            for chip in range(chip_count):
                var x := platform.position.x + 10.0 + _detail_noise(platform_index * 53 + chip, 22.6) * usable_w
                var y := platform.position.y + 6.0 + _detail_noise(platform_index * 59 + chip, 23.2) * usable_h
                var radius := 1.2 + _detail_noise(platform_index * 61 + chip, 23.8) * 2.0
                draw_circle(Vector2(x, y), radius, Color(0.78, 0.81, 0.80, 0.10))
                draw_line(
                    Vector2(x - radius, y + radius * 0.7),
                    Vector2(x + radius * 1.8, y - radius * 0.5),
                    Color(0.12, 0.13, 0.13, 0.24),
                    1.0,
                )
        "concrete":
            var aggregate_count := maxi(3, int(platform.size.x / 44.0))
            for pebble in range(aggregate_count):
                var x := platform.position.x + 8.0 + _detail_noise(platform_index * 67 + pebble, 24.4) * usable_w
                var y := platform.position.y + 6.0 + _detail_noise(platform_index * 71 + pebble, 25.0) * usable_h
                var radius := 0.9 + _detail_noise(platform_index * 73 + pebble, 25.6) * 1.6
                draw_circle(Vector2(x, y), radius, Color(0.84, 0.86, 0.85, 0.11))
            if platform.size.x >= 120.0:
                var joint_x := platform.position.x + platform.size.x * (0.42 + _detail_noise(platform_index, 26.2) * 0.16)
                draw_line(
                    Vector2(joint_x, platform.position.y + 4.0),
                    Vector2(joint_x, platform.end.y - 3.0),
                    Color(0.12, 0.13, 0.13, 0.30),
                    1.6,
                )
        _:
            var panel_x := platform.position.x + 54.0
            while panel_x < platform.end.x - 18.0:
                draw_line(
                    Vector2(panel_x, platform.position.y + 4.0),
                    Vector2(panel_x, platform.end.y - 3.0),
                    Color(0.08, 0.10, 0.11, 0.34),
                    1.3,
                )
                panel_x += 58.0
            var grime_count := maxi(2, int(platform.size.x / 76.0))
            for stain in range(grime_count):
                var x := platform.position.x + 12.0 + _detail_noise(platform_index * 79 + stain, 27.0) * usable_w
                var y0 := platform.position.y + 8.0
                var y1 := minf(platform.end.y - 2.0, y0 + 5.0 + _detail_noise(stain, 27.6) * 9.0)
                draw_line(Vector2(x, y0), Vector2(x + 1.0, y1), Color(0.03, 0.045, 0.05, 0.28), 1.4)

func _platform_support_anchor_y(x: float, start_y: float, current_index: int) -> float:
    var anchor_y := _floor_y
    for other_index in range(_platforms.size()):
        if other_index == current_index:
            continue
        var other := _platforms[other_index]
        if other.position.y <= start_y + 2.0:
            continue
        if x < other.position.x + 4.0 or x > other.end.x - 4.0:
            continue
        anchor_y = minf(anchor_y, other.position.y)
    return anchor_y

func _draw_platform_wear(platform: Rect2, material: String, trim: Color, platform_index: int) -> void:
    draw_rect(
        Rect2(platform.position + Vector2(5.0, platform.size.y - 5.0), Vector2(maxf(0.0, platform.size.x - 10.0), 4.0)),
        Color(0.04, 0.05, 0.05, 0.34),
        true,
    )
    var mark_count := maxi(2, int(platform.size.x / 62.0))
    for mark in range(mark_count):
        var local_x := 12.0 + _detail_noise(platform_index * 23 + mark, 7.1) * maxf(1.0, platform.size.x - 28.0)
        var x := platform.position.x + local_x
        var y := platform.position.y + 6.0 + _detail_noise(platform_index * 29 + mark, 7.8) * maxf(1.0, platform.size.y - 10.0)
        var length := 5.0 + _detail_noise(platform_index * 31 + mark, 8.2) * 13.0
        var wear := Color(trim.r, trim.g, trim.b, 0.14)
        if material == "wood":
            wear = Color(0.84, 0.68, 0.44, 0.14)
        elif material in ["stone", "concrete"]:
            wear = Color(0.84, 0.88, 0.87, 0.10)
        draw_line(Vector2(x, y), Vector2(minf(platform.end.x - 5.0, x + length), y - 1.5), wear, 1.2)

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

func _draw_map_architecture() -> void:
    for spec in _story_prop_specs:
        if String(spec.get("layer", "foreground")) != "architecture":
            continue
        _draw_story_prop(spec)

func _draw_platform_authored_dressing() -> void:
    for index in range(_platforms.size()):
        if index >= _platform_specs.size():
            continue
        var spec: Dictionary = _platform_specs[index]
        var visual = spec.get("visual", {})
        if typeof(visual) != TYPE_DICTIONARY:
            continue
        var platform := _platforms[index]

        if bool(visual.get("rail", false)) and platform.size.x >= 110.0:
            var rail_color := Color(0.26, 0.29, 0.29, 0.78)
            var rail_highlight := Color(0.58, 0.45, 0.27, 0.34)
            var rail_y := platform.position.y - 27.0
            var left := platform.position.x + 8.0
            var right := platform.end.x - 8.0
            draw_line(Vector2(left, rail_y), Vector2(right, rail_y), rail_color, 3.0)
            draw_line(
                Vector2(left, rail_y + 12.0),
                Vector2(right, rail_y + 12.0),
                Color(rail_color.r, rail_color.g, rail_color.b, 0.52),
                2.0,
            )
            var post_count := maxi(2, int(platform.size.x / 64.0))
            for post in range(post_count + 1):
                var t := float(post) / float(post_count)
                var px := lerpf(left, right, t)
                draw_line(Vector2(px, platform.position.y - 2.0), Vector2(px, rail_y), rail_color, 2.0)
                draw_circle(Vector2(px, rail_y), 1.8, rail_highlight)

        if bool(visual.get("lamp", false)) and platform.size.x >= 140.0:
            var lamp_x := platform.get_center().x
            var lamp_y := platform.end.y + 20.0
            draw_line(
                Vector2(lamp_x, platform.end.y),
                Vector2(lamp_x, lamp_y - 5.0),
                Color(0.14, 0.16, 0.16, 0.72),
                2.0,
            )
            _draw_warm_lamp_pool(
                Vector2(lamp_x, lamp_y),
                minf(_floor_y - 4.0, lamp_y + 104.0),
                14.0,
            )

        var sandbag_count := int(visual.get("sandbags", 0))
        if sandbag_count > 0 and platform.size.x >= 145.0:
            _draw_sandbags(
                Vector2(platform.position.x + 18.0, platform.position.y - 3.0),
                sandbag_count,
            )

func _draw_warm_lamp_pool(origin: Vector2, bottom_y: float, radius: float = 16.0) -> void:
    var reach := maxf(36.0, bottom_y - origin.y)
    var half_width := minf(94.0, 24.0 + reach * 0.30)
    var beam := PackedVector2Array([
        origin + Vector2(-3.5, 3.0),
        Vector2(origin.x - half_width, bottom_y),
        Vector2(origin.x + half_width, bottom_y),
        origin + Vector2(3.5, 3.0),
    ])
    draw_colored_polygon(beam, Color(0.96, 0.66, 0.28, 0.030))
    draw_circle(origin, radius + 22.0, Color(0.98, 0.62, 0.20, 0.018))
    draw_circle(origin, radius + 10.0, Color(0.98, 0.64, 0.22, 0.034))
    draw_circle(origin, radius, Color(0.98, 0.68, 0.28, 0.070))
    draw_circle(origin, 4.5, Color(1.0, 0.76, 0.38, 0.86))

    if bottom_y > origin.y + 44.0:
        var reflection_w := minf(68.0, half_width * 0.64)
        draw_line(
            Vector2(origin.x - reflection_w, bottom_y + 2.0),
            Vector2(origin.x + reflection_w, bottom_y + 2.0),
            Color(0.92, 0.54, 0.18, 0.10),
            3.0,
        )
        draw_line(
            Vector2(origin.x - reflection_w * 0.54, bottom_y + 6.0),
            Vector2(origin.x + reflection_w * 0.42, bottom_y + 6.0),
            Color(1.0, 0.72, 0.30, 0.075),
            1.5,
        )

func _draw_foreground_props() -> void:
    for spec in _dressing_specs:
        var kind := String(spec.get("kind", ""))
        var x := float(spec.get("x", 0.0))
        var y := float(spec.get("y", _floor_y - 3.0))
        match kind:
            "crate":
                _draw_crate(Vector2(x, y), float(spec.get("size", 32.0)))
            "barrel":
                _draw_barrel(Vector2(x, y))
            "sandbags":
                _draw_sandbags(Vector2(x, y), int(spec.get("count", 5)))
            _:
                push_warning("Pawn Slug dressing kind not rendered: %s" % kind)

func _draw_foreground_story_props() -> void:
    for spec in _story_prop_specs:
        if String(spec.get("layer", "foreground")) == "architecture":
            continue
        _draw_story_prop(spec)

func _draw_story_prop(spec: Dictionary) -> void:
    var kind := String(spec.get("kind", ""))
    var origin := Vector2(
        float(spec.get("x", 0.0)),
        float(spec.get("y", _floor_y)),
    )
    match kind:
        "front_wreck":
            _draw_front_story_prop(origin)
        "harbor_lamp":
            _draw_harbor_lamp(origin)
        "harbor_bollard":
            _draw_harbor_bollard(origin)
        "alpine_tripod":
            _draw_alpine_tripod(origin)
        "snowbank":
            _draw_snowbank(origin)
        "jungle_tree":
            _draw_jungle_tree(origin)
        "fallen_trunk":
            _draw_fallen_trunk(origin)
        "jungle_hut":
            _draw_jungle_hut(origin)
        "industrial_bunker":
            _draw_industrial_bunker(spec)
        "industrial_watch_post":
            _draw_industrial_watch_post(spec)
        "industrial_drain":
            _draw_industrial_drain(spec)
        "industrial_rubble_field":
            _draw_industrial_rubble_field(spec)
        _:
            push_warning("Pawn Slug story prop kind not rendered: %s" % kind)

func _draw_near_depth_dressing() -> void:
    var silhouette := Color(0.035, 0.045, 0.047, 0.46)
    var accent := Color(0.35, 0.31, 0.23, 0.20)
    if _theme == "harbor_dusk":
        silhouette = Color(0.025, 0.055, 0.063, 0.50)
        accent = Color(0.31, 0.48, 0.52, 0.20)
    elif _theme == "alpine_night":
        silhouette = Color(0.05, 0.065, 0.072, 0.48)
        accent = Color(0.58, 0.66, 0.69, 0.18)
    elif _theme == "jungle_storm":
        silhouette = Color(0.025, 0.065, 0.038, 0.52)
        accent = Color(0.27, 0.39, 0.24, 0.20)

    for index in range(8):
        var x := 300.0 + float(index) * 690.0
        var post_h := 62.0 + float((index * 19) % 45)
        draw_line(Vector2(x, _floor_y), Vector2(x, _floor_y - post_h), silhouette, 6.0)
        draw_line(Vector2(x + 126.0, _floor_y), Vector2(x + 126.0, _floor_y - post_h * 0.82), silhouette, 5.0)
        draw_line(
            Vector2(x, _floor_y - post_h * 0.72),
            Vector2(x + 126.0, _floor_y - post_h * 0.60),
            silhouette,
            2.0,
        )
        for barb in range(4):
            var bx := x + 18.0 + float(barb) * 28.0
            var by := _floor_y - post_h * 0.67 + float(barb % 2) * 4.0
            draw_line(Vector2(bx - 4.0, by - 4.0), Vector2(bx + 4.0, by + 4.0), accent, 1.5)
            draw_line(Vector2(bx - 4.0, by + 4.0), Vector2(bx + 4.0, by - 4.0), accent, 1.5)

    for index in range(18):
        var x := 120.0 + float(index) * 294.0
        var height := 10.0 + _detail_noise(index, 10.1) * 18.0
        var lean := (_detail_noise(index, 10.7) - 0.5) * 12.0
        draw_line(
            Vector2(x, _floor_y),
            Vector2(x + lean, _floor_y - height),
            Color(accent.r, accent.g, accent.b, 0.42),
            2.0,
        )

func _draw_industrial_bunker(spec: Dictionary) -> void:
    var x := float(spec.get("x", 150.0))
    var y := float(spec.get("y", _floor_y - 142.0))
    var w := float(spec.get("w", 190.0))
    var h := float(spec.get("h", 142.0))
    var bunker := Rect2(x, y, w, h)
    draw_rect(bunker, Color(0.115, 0.125, 0.125, 0.96), true)
    draw_rect(
        Rect2(bunker.position + Vector2(8.0, 9.0), Vector2(bunker.size.x - 16.0, 11.0)),
        Color(0.20, 0.17, 0.12, 0.58),
        true,
    )
    draw_line(
        Vector2(bunker.position.x, bunker.position.y),
        Vector2(bunker.end.x, bunker.position.y),
        Color(0.56, 0.43, 0.24, 0.62),
        3.0,
    )
    draw_rect(Rect2(Vector2(x + 32.0, y + 54.0), Vector2(54.0, h - 54.0)), Color(0.055, 0.062, 0.064, 0.88), true)
    draw_rect(Rect2(Vector2(x + 40.0, y + 63.0), Vector2(38.0, 52.0)), Color(0.025, 0.031, 0.033, 0.92), true)
    draw_line(Vector2(x + 48.0, y + 68.0), Vector2(x + 70.0, y + 68.0), Color(0.76, 0.60, 0.32, 0.40), 2.0)

    var lamp := Vector2(
        float(spec.get("lamp_x", x + 102.0)),
        float(spec.get("lamp_y", y + 30.0)),
    )
    _draw_warm_lamp_pool(lamp, bunker.end.y - 4.0, 17.0)
    draw_line(lamp + Vector2(0.0, 5.0), lamp + Vector2(0.0, 30.0), Color(0.76, 0.60, 0.32, 0.30), 2.0)

    for mark in range(13):
        var px := bunker.position.x + 16.0 + _detail_noise(mark, 61.1) * (bunker.size.x - 32.0)
        var py := bunker.position.y + 28.0 + _detail_noise(mark, 61.7) * (bunker.size.y - 40.0)
        var radius := 1.2 + _detail_noise(mark, 62.3) * 2.4
        draw_circle(Vector2(px, py), radius, Color(0.035, 0.040, 0.040, 0.34))
        if mark % 4 == 0:
            draw_line(Vector2(px - 8.0, py + 4.0), Vector2(px + 6.0, py - 2.0), Color(0.34, 0.28, 0.20, 0.16), 1.4)

    var sandbag_count := int(spec.get("sandbags", 0))
    if sandbag_count > 0:
        _draw_sandbags(Vector2(x + 16.0, y - 3.0), sandbag_count)

func _draw_industrial_watch_post(spec: Dictionary) -> void:
    var tower_x := float(spec.get("x", 1038.0))
    var tower_base := float(spec.get("base_y", _floor_y))
    var tower_top := float(spec.get("top_y", 346.0))
    var leg_span := float(spec.get("leg_span", 82.0))
    var hut_w := float(spec.get("hut_w", 106.0))
    var hut_h := float(spec.get("hut_h", 62.0))
    var hut_x := tower_x - 12.0

    draw_line(Vector2(tower_x, tower_base), Vector2(tower_x, tower_top + hut_h - 4.0), Color(0.10, 0.12, 0.13, 0.88), 8.0)
    draw_line(Vector2(tower_x + leg_span, tower_base), Vector2(tower_x + leg_span, tower_top + hut_h - 4.0), Color(0.10, 0.12, 0.13, 0.88), 8.0)
    draw_line(Vector2(tower_x, tower_base), Vector2(tower_x + leg_span, tower_top + hut_h - 4.0), Color(0.14, 0.16, 0.16, 0.70), 4.0)
    draw_line(Vector2(tower_x + leg_span, tower_base), Vector2(tower_x, tower_top + hut_h - 4.0), Color(0.14, 0.16, 0.16, 0.58), 3.0)
    draw_rect(Rect2(Vector2(hut_x, tower_top), Vector2(hut_w, hut_h)), Color(0.095, 0.11, 0.115, 0.96), true)
    draw_rect(Rect2(Vector2(tower_x - 4.0, tower_top + 10.0), Vector2(90.0, 30.0)), Color(0.045, 0.055, 0.058, 0.92), true)
    draw_rect(Rect2(Vector2(tower_x + 4.0, tower_top + 13.0), Vector2(78.0, 23.0)), Color(0.95, 0.62, 0.24, 0.055), true)
    draw_rect(Rect2(Vector2(tower_x + 8.0, tower_top + 17.0), Vector2(22.0, 14.0)), Color(0.92, 0.63, 0.28, 0.46), true)
    draw_rect(Rect2(Vector2(tower_x + 55.0, tower_top + 17.0), Vector2(22.0, 14.0)), Color(0.92, 0.63, 0.28, 0.38), true)
    draw_line(Vector2(tower_x - 18.0, tower_top), Vector2(tower_x + 100.0, tower_top), Color(0.61, 0.47, 0.25, 0.55), 3.0)
    _draw_warm_lamp_pool(Vector2(tower_x + 43.0, tower_top + 36.0), tower_base - 8.0, 18.0)

func _draw_industrial_drain(spec: Dictionary) -> void:
    var center := Vector2(
        float(spec.get("x", 420.0)),
        float(spec.get("y", _floor_y + 64.0)),
    )
    var radius := float(spec.get("radius", 25.0))
    draw_circle(center, radius, Color(0.075, 0.080, 0.078, 0.90))
    draw_arc(center, radius, PI, TAU, 18, Color(0.48, 0.40, 0.28, 0.36), 3.0)
    draw_line(
        center + Vector2(-radius * 0.72, 5.0),
        center + Vector2(radius * 0.72, 5.0),
        Color(0.02, 0.03, 0.03, 0.70),
        3.0,
    )

func _draw_industrial_rubble_field(spec: Dictionary) -> void:
    var start_x := float(spec.get("x", 90.0))
    var base_y := float(spec.get("y", _floor_y - 2.0))
    var count := int(spec.get("count", 18))
    var spacing := float(spec.get("spacing", 83.0))
    for index in range(count):
        var rubble_x := start_x + float(index) * spacing
        var rubble_w := 5.0 + _detail_noise(index, 13.1) * 12.0
        var rubble_h := 3.0 + _detail_noise(index, 13.7) * 8.0
        draw_rect(
            Rect2(Vector2(rubble_x, base_y - rubble_h), Vector2(rubble_w, rubble_h)),
            Color(0.20, 0.19, 0.16, 0.44),
            true,
        )

func _draw_front_story_prop(base: Vector2) -> void:
    draw_line(base + Vector2(-42.0, 0.0), base + Vector2(38.0, -25.0), Color(0.18, 0.20, 0.20, 0.72), 7.0)
    draw_line(base + Vector2(-18.0, -14.0), base + Vector2(12.0, -52.0), Color(0.20, 0.22, 0.22, 0.68), 6.0)
    draw_circle(base + Vector2(-30.0, -3.0), 12.0, Color(0.11, 0.13, 0.13, 0.88))
    draw_circle(base + Vector2(28.0, -12.0), 10.0, Color(0.11, 0.13, 0.13, 0.88))

func _draw_harbor_lamp(base: Vector2) -> void:
    draw_line(base, base + Vector2(0.0, -78.0), Color("24363a"), 7.0)
    draw_line(base + Vector2(-18.0, -66.0), base + Vector2(28.0, -66.0), Color("71898f"), 4.0)
    draw_circle(base + Vector2(30.0, -66.0), 5.0, Color(0.88, 0.67, 0.32, 0.52))

func _draw_harbor_bollard(base: Vector2) -> void:
    draw_arc(base + Vector2(0.0, -10.0), 28.0, PI, TAU, 18, Color(0.20, 0.30, 0.34, 0.68), 4.0)
    draw_line(base + Vector2(-24.0, -8.0), base + Vector2(24.0, -8.0), Color("405a60"), 4.0)

func _draw_alpine_tripod(base: Vector2) -> void:
    draw_line(base + Vector2(-18.0, 0.0), base + Vector2(0.0, -34.0), Color("5a666a"), 5.0)
    draw_line(base + Vector2(18.0, 0.0), base + Vector2(0.0, -34.0), Color("5a666a"), 5.0)
    draw_line(base + Vector2(-18.0, 0.0), base + Vector2(18.0, 0.0), Color("aab6b8"), 3.0)

func _draw_snowbank(base: Vector2) -> void:
    draw_circle(base, 24.0, Color(0.50, 0.56, 0.58, 0.16))
    draw_circle(base + Vector2(18.0, 1.0), 18.0, Color(0.67, 0.72, 0.73, 0.12))

func _draw_jungle_tree(base: Vector2) -> void:
    var trunk := Color("3c3022")
    draw_line(base, base + Vector2(8.0, -92.0), trunk, 10.0)
    draw_circle(base + Vector2(-18.0, -88.0), 26.0, Color(0.13, 0.24, 0.14, 0.74))
    draw_circle(base + Vector2(18.0, -104.0), 30.0, Color(0.15, 0.28, 0.16, 0.70))
    draw_circle(base + Vector2(34.0, -82.0), 22.0, Color(0.11, 0.22, 0.13, 0.68))

func _draw_fallen_trunk(base: Vector2) -> void:
    draw_line(base + Vector2(-42.0, 0.0), base + Vector2(42.0, -26.0), Color("5a4930"), 8.0)
    draw_line(base + Vector2(-30.0, -8.0), base + Vector2(-2.0, -38.0), Color("4b3d2b"), 5.0)

func _draw_jungle_hut(base: Vector2) -> void:
    var top := base.y - 104.0
    draw_rect(Rect2(Vector2(base.x, top), Vector2(74.0, 104.0)), Color(0.20, 0.24, 0.18, 0.78), true)
    draw_rect(Rect2(Vector2(base.x + 12.0, top + 18.0), Vector2(18.0, 30.0)), Color(0.08, 0.11, 0.08, 0.75), true)
    draw_line(Vector2(base.x - 8.0, top), Vector2(base.x + 82.0, top), Color(0.45, 0.49, 0.34, 0.42), 3.0)

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
