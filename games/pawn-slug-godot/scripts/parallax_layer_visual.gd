extends Node2D

const ATMOSPHERE_REDRAW_INTERVAL := 0.05
const IndustrialFarPart0 := preload("res://art/industrial_front_far_v1_part0.gd")
const IndustrialFarPart1 := preload("res://art/industrial_front_far_v1_part1.gd")
const IndustrialFarPart2 := preload("res://art/industrial_front_far_v1_part2.gd")
const IndustrialFarPart3 := preload("res://art/industrial_front_far_v1_part3.gd")

var _world_size := Vector2(5200.0, 720.0)
var _floor_y := 610.0
var _kind := "far_ridge"
var _seed := 1
var _intensity := 1.0
var _preset := "night_front"
var _atmosphere_time := 0.0
var _redraw_accumulator := 0.0
var _industrial_far_art: ImageTexture

func configure(world_size: Vector2, floor_y: float, kind: String, seed: int, intensity: float = 1.0, preset: String = "night_front") -> void:
    _world_size = world_size
    _floor_y = floor_y
    _kind = kind
    _seed = seed
    _intensity = clampf(intensity, 0.0, 2.0)
    _preset = preset
    if _kind == "industrial_art":
        _ensure_industrial_far_art()
    set_process(_kind in ["sky", "industrial_landmark", "ruined_city", "mid_defence", "near_weather", "near_foreground"])
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
        "industrial_art":
            _draw_industrial_art()
        "far_ridge":
            _draw_far_ridge()
        "industrial_landmark":
            _draw_industrial_landmark()
        "ruined_city":
            _draw_ruined_city()
        "mid_defence":
            _draw_mid_defence()
        "near_weather":
            _draw_near_weather()
        "near_foreground":
            _draw_near_foreground()

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
    elif _preset == "night_front":
        var moon := Vector2(315.0, 98.0)
        draw_circle(moon, 96.0, Color(0.60, 0.72, 0.82, 0.025 * _intensity))
        draw_circle(moon, 70.0, Color(0.70, 0.80, 0.86, 0.045 * _intensity))
        draw_circle(moon, 43.0, Color(0.84, 0.89, 0.91, 0.78 * _intensity))
        draw_circle(moon + Vector2(-15.0, -10.0), 10.0, Color(0.47, 0.54, 0.59, 0.20))
        draw_circle(moon + Vector2(14.0, 12.0), 6.0, Color(0.47, 0.54, 0.59, 0.18))
        draw_circle(moon + Vector2(7.0, -18.0), 4.5, Color(0.47, 0.54, 0.59, 0.15))
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
    _draw_atmosphere_texture()

func _draw_atmosphere_texture() -> void:
    var tint := Color(0.52, 0.62, 0.68, 0.020 * _intensity)
    if _preset == "harbor_dusk":
        tint = Color(0.86, 0.55, 0.42, 0.024 * _intensity)
    elif _preset == "alpine_night":
        tint = Color(0.68, 0.78, 0.84, 0.020 * _intensity)
    elif _preset == "jungle_storm":
        tint = Color(0.42, 0.58, 0.43, 0.026 * _intensity)

    for index in range(26):
        var depth := 0.35 + _noise(index, 80.2) * 0.65
        var span := 90.0 + _noise(index, 80.9) * 290.0
        var track := _world_size.x + span + 420.0
        var drift := _atmosphere_time * (1.2 + depth * 2.8)
        var x := fposmod(_noise(index, 81.6) * track + drift, track) - span - 160.0
        var y := 38.0 + _noise(index, 82.3) * 330.0
        var width := maxf(1.0, 0.7 + depth * 1.4)
        draw_line(
            Vector2(x, y),
            Vector2(minf(_world_size.x + 180.0, x + span), y + (_noise(index, 83.0) - 0.5) * 5.0),
            Color(tint.r, tint.g, tint.b, tint.a * (0.65 + depth * 0.55)),
            width,
        )

func _draw_cloud_bands() -> void:
    if _preset == "night_front":
        _draw_industrial_cloud_deck()
        return

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

func _draw_industrial_cloud_deck() -> void:
    # Long horizontal decks avoid the old "bubble cloud" look and keep the
    # moon readable through broken gaps, matching the approved visual target.
    var drift := fposmod(_atmosphere_time * 3.2, 340.0)
    for band in range(6):
        var base_y := 42.0 + float(band) * 46.0
        var thickness := 26.0 + _noise(band, 51.2) * 34.0
        var top_points := PackedVector2Array()
        var bottom_points := PackedVector2Array()
        for step in range(72):
            var x := -440.0 + float(step) * 88.0 + drift * (0.32 + float(band) * 0.055)
            var wave := sin(float(step) * 0.72 + float(band) * 1.4) * 9.0
            var noise := (_noise(step + band * 73, 51.9) - 0.5) * 18.0
            var top_y := base_y + wave + noise
            var bottom_y := top_y + thickness + sin(float(step) * 0.38 + float(band)) * 7.0
            top_points.append(Vector2(x, top_y))
            bottom_points.append(Vector2(x, bottom_y))

        var cloud := PackedVector2Array()
        for point in top_points:
            cloud.append(point)
        for index in range(bottom_points.size() - 1, -1, -1):
            cloud.append(bottom_points[index])

        var alpha := 0.13 - float(band) * 0.010
        var cloud_color := Color(
            0.11 + float(band) * 0.012,
            0.15 + float(band) * 0.012,
            0.18 + float(band) * 0.013,
            alpha * _intensity
        )
        draw_colored_polygon(cloud, cloud_color)

        # Cold lower rim, strongest around upper cloud decks.
        for step in range(0, bottom_points.size() - 1, 4):
            var p0 := bottom_points[step]
            var p1 := bottom_points[step + 1]
            draw_line(
                p0,
                p1,
                Color(0.54, 0.62, 0.67, (0.045 - float(band) * 0.004) * _intensity),
                1.2,
            )

    # A softer low mist bank ties sky to ridge without flattening the horizon.
    var mist_points := PackedVector2Array([
        Vector2(-120.0, 286.0),
        Vector2(340.0, 268.0),
        Vector2(760.0, 282.0),
        Vector2(1180.0, 260.0),
        Vector2(1640.0, 278.0),
        Vector2(2100.0, 266.0),
        Vector2(2600.0, 284.0),
        Vector2(_world_size.x + 120.0, 272.0),
        Vector2(_world_size.x + 120.0, 338.0),
        Vector2(-120.0, 338.0),
    ])
    draw_colored_polygon(mist_points, Color(0.32, 0.39, 0.44, 0.040 * _intensity))

func _ensure_industrial_far_art() -> void:
    if _industrial_far_art != null:
        return
    var encoded := (
        IndustrialFarPart0.DATA
        + IndustrialFarPart1.DATA
        + IndustrialFarPart2.DATA
        + IndustrialFarPart3.DATA
    )
    var bytes := Marshalls.base64_to_raw(encoded)
    var image := Image.new()
    var error := image.load_webp_from_buffer(bytes)
    if error != OK:
        push_warning("Pawn Slug industrial far art could not be decoded")
        return
    _industrial_far_art = ImageTexture.create_from_image(image)

func _draw_industrial_art() -> void:
    if _preset != "night_front":
        return
    _ensure_industrial_far_art()
    if _industrial_far_art == null:
        return
    # Approved mock-derived far art: sky, mountains and distant factory only.
    # The lower edge fades to transparency and never defines traversal/collision.
    # Overscan past both viewport edges so slow parallax drift never exposes
    # the raster boundary. A small horizontal stretch is preferable to a hard
    # rectangular seam in the approved background art.
    draw_texture_rect(
        _industrial_far_art,
        Rect2(Vector2(-240.0, 0.0), Vector2(1960.0, 604.0)),
        false,
        Color(0.94, 0.96, 0.98, 0.94 * _intensity),
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
    if _preset == "night_front":
        _draw_industrial_low_ridge()
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

func _draw_industrial_low_ridge() -> void:
    # The approved raster already owns mountains and the high silhouette.
    # Keep this parallax plane low so it adds motion/depth without burying
    # the viaduct, water and factory frontage.
    var rear := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 181, 180):
        var xf := float(x)
        var noise := (_noise(x / 180, 52.1) - 0.5) * 14.0
        var y := 458.0 + sin(xf * 0.0042) * 13.0 + noise
        rear.append(Vector2(xf, y))
    rear.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(rear, Color(0.060, 0.082, 0.094, 0.72))

    var front := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 141, 140):
        var xf := float(x)
        var noise := (_noise(x / 140, 52.8) - 0.5) * 10.0
        var y := 504.0 + sin(xf * 0.0067 + 0.7) * 9.0 + noise
        front.append(Vector2(xf, y))
    front.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(front, Color(0.070, 0.094, 0.103, 0.78))

    # Sparse low treeline breaks the edge without recreating a giant mountain.
    for index in range(28):
        var x := 40.0 + float(index) * 190.0
        var base_y := 500.0 + (_noise(index, 53.4) - 0.5) * 16.0
        var h := 18.0 + _noise(index, 54.0) * 28.0
        var tree := PackedVector2Array([
            Vector2(x, base_y - h),
            Vector2(x - 8.0, base_y),
            Vector2(x + 8.0, base_y),
        ])
        draw_colored_polygon(tree, Color(0.045, 0.067, 0.074, 0.52))

func _draw_industrial_landmark() -> void:
    if _preset != "night_front":
        return

    var haze := Color(0.11, 0.15, 0.17, 0.11 * _intensity)
    var water := Color(0.030, 0.074, 0.096, 0.62 * _intensity)
    var far_structure := Color(0.090, 0.108, 0.120, 0.96)
    var factory_dark := Color(0.082, 0.094, 0.104, 0.98)
    var factory_mid := Color(0.112, 0.122, 0.128, 0.98)
    var warm_edge := Color(0.62, 0.30, 0.12, 0.70)
    var fire_glow := Color(1.0, 0.30, 0.055, 0.16 * _intensity)
    var hot_light := Color(1.0, 0.52, 0.16, 0.82 * _intensity)

    # Reflective valley / water plane.
    draw_rect(Rect2(Vector2(0.0, 402.0), Vector2(_world_size.x, 122.0)), water, true)
    draw_rect(Rect2(Vector2(0.0, 350.0), Vector2(_world_size.x, 92.0)), haze, true)
    for index in range(40):
        var water_x := float(index) * 146.0 + _noise(index, 40.1) * 88.0
        var water_y := 423.0 + _noise(index, 40.7) * 72.0
        var shimmer_w := 18.0 + _noise(index, 41.3) * 84.0
        var shimmer_a := 0.040 + _noise(index, 41.9) * 0.10
        draw_line(
            Vector2(water_x, water_y),
            Vector2(minf(_world_size.x, water_x + shimmer_w), water_y),
            Color(0.58, 0.73, 0.82, shimmer_a * _intensity),
            1.5,
        )

    # Viaduct: thin enough to remain background architecture, not fake gameplay.
    var viaduct_y := 338.0
    draw_rect(Rect2(Vector2(170.0, viaduct_y), Vector2(2290.0, 10.0)), far_structure, true)
    for index in range(12):
        var x := 220.0 + float(index) * 190.0
        var pier_h := 58.0 + float((index * 17) % 32)
        draw_rect(Rect2(Vector2(x, viaduct_y + 8.0), Vector2(13.0, pier_h)), far_structure, true)
        if index < 11:
            draw_arc(
                Vector2(x + 94.0, viaduct_y + 48.0),
                48.0,
                PI,
                TAU,
                16,
                Color(0.14, 0.15, 0.15, 0.52),
                3.0,
            )

    # Raised industrial ridge. Keep it low enough to leave sky around the skyline.
    var cliff := PackedVector2Array([
        Vector2(520.0, 414.0),
        Vector2(660.0, 350.0),
        Vector2(850.0, 318.0),
        Vector2(1070.0, 324.0),
        Vector2(1270.0, 300.0),
        Vector2(1510.0, 310.0),
        Vector2(1770.0, 328.0),
        Vector2(2030.0, 350.0),
        Vector2(2300.0, 397.0),
        Vector2(2470.0, 414.0),
    ])
    cliff.append(Vector2(520.0, 414.0))
    draw_colored_polygon(cliff, Color(0.060, 0.074, 0.082, 0.96))

    # Furnace backglow gives the factory internal light before its darker
    # structures are drawn on top.
    draw_circle(Vector2(1140.0, 248.0), 235.0, Color(0.94, 0.22, 0.045, 0.026 * _intensity))
    draw_circle(Vector2(1540.0, 252.0), 275.0, Color(0.98, 0.26, 0.045, 0.030 * _intensity))
    draw_circle(Vector2(1890.0, 278.0), 190.0, Color(0.90, 0.20, 0.035, 0.020 * _intensity))

    # Segmented terraces instead of one black slab.
    var terraces := [
        Rect2(680.0, 252.0, 310.0, 96.0),
        Rect2(1008.0, 228.0, 360.0, 120.0),
        Rect2(1396.0, 244.0, 430.0, 104.0),
        Rect2(1850.0, 262.0, 330.0, 86.0),
    ]
    for terrace_index in range(terraces.size()):
        var terrace: Rect2 = terraces[terrace_index]
        var terrace_color := factory_mid if terrace_index % 2 == 0 else factory_dark
        draw_rect(terrace, terrace_color, true)
        draw_line(terrace.position, Vector2(terrace.end.x, terrace.position.y), warm_edge, 2.4)
        draw_line(
            Vector2(terrace.position.x + 4.0, terrace.position.y + 4.0),
            Vector2(terrace.position.x + 4.0, terrace.end.y - 12.0),
            Color(0.40, 0.50, 0.56, 0.20),
            1.5,
        )
        draw_rect(
            Rect2(Vector2(terrace.position.x, terrace.end.y - 9.0), Vector2(terrace.size.x, 9.0)),
            Color(0.025, 0.030, 0.032, 0.58),
            true,
        )

    # Towers, stacks and broken roofline.
    for index in range(14):
        var tower_x := 706.0 + float(index) * 108.0
        var tower_w := 52.0 + _noise(index, 42.3) * 50.0
        var tower_h := 48.0 + _noise(index, 42.9) * 116.0
        var tower_y := 252.0 - tower_h + float(index % 3) * 8.0
        var tower_color := factory_mid if index % 3 == 0 else factory_dark
        draw_rect(Rect2(Vector2(tower_x, tower_y), Vector2(tower_w, tower_h)), tower_color, true)
        draw_line(
            Vector2(tower_x + 4.0, tower_y),
            Vector2(tower_x + tower_w - 4.0, tower_y),
            Color(0.48, 0.24, 0.10, 0.58),
            2.0,
        )
        draw_line(
            Vector2(tower_x + 3.0, tower_y + 4.0),
            Vector2(tower_x + 3.0, tower_y + tower_h - 5.0),
            Color(0.45, 0.57, 0.63, 0.22),
            1.4,
        )

        if index % 2 == 0:
            var stack_h := 66.0 + _noise(index, 43.5) * 112.0
            var stack_x := tower_x + tower_w * 0.62
            draw_rect(
                Rect2(Vector2(stack_x, tower_y - stack_h), Vector2(14.0, stack_h)),
                Color(0.038, 0.044, 0.048, 0.99),
                true,
            )
            draw_rect(
                Rect2(Vector2(stack_x - 3.0, tower_y - stack_h - 5.0), Vector2(20.0, 6.0)),
                Color(0.22, 0.12, 0.08, 0.92),
                true,
            )
            draw_line(
                Vector2(stack_x + 1.0, tower_y - stack_h + 4.0),
                Vector2(stack_x + 1.0, tower_y - 4.0),
                Color(0.47, 0.58, 0.62, 0.20),
                1.2,
            )

        if index < 13:
            var conveyor_y := 185.0 + float(index % 4) * 14.0
            draw_line(
                Vector2(tower_x + tower_w * 0.70, conveyor_y),
                Vector2(tower_x + 118.0, conveyor_y - 15.0),
                Color(0.12, 0.125, 0.125, 0.92),
                5.0,
            )
            draw_line(
                Vector2(tower_x + tower_w * 0.70, conveyor_y + 4.0),
                Vector2(tower_x + 118.0, conveyor_y - 11.0),
                Color(0.50, 0.24, 0.10, 0.42),
                1.3,
            )

    # Lit windows and furnaces: the mock reads because the factory has internal life.
    for index in range(34):
        var light_x := 716.0 + float(index) * 43.0
        var light_y := 248.0 + float((index * 19) % 88)
        var flicker := 0.56 + sin(_atmosphere_time * (1.35 + _noise(index, 44.2)) + float(index)) * 0.26
        if index % 5 == 0:
            draw_circle(Vector2(light_x, light_y), 14.0, Color(fire_glow.r, fire_glow.g, fire_glow.b, fire_glow.a * flicker))
            draw_rect(Rect2(Vector2(light_x - 5.0, light_y - 2.0), Vector2(10.0, 5.0)), Color(hot_light.r, hot_light.g, hot_light.b, hot_light.a * flicker), true)
        else:
            draw_rect(
                Rect2(Vector2(light_x - 2.0, light_y - 1.0), Vector2(4.0, 3.0)),
                Color(1.0, 0.43, 0.12, (0.28 + flicker * 0.28) * _intensity),
                true,
            )

    # A few larger furnace mouths break up the facade and cast local warmth.
    for furnace in range(5):
        var fx := 810.0 + float(furnace) * 290.0
        var fy := 300.0 + float(furnace % 2) * 18.0
        draw_circle(Vector2(fx, fy), 34.0, Color(1.0, 0.25, 0.045, 0.055 * _intensity))
        draw_rect(Rect2(Vector2(fx - 15.0, fy - 5.0), Vector2(30.0, 10.0)), Color(0.96, 0.39, 0.08, 0.34 * _intensity), true)
        draw_rect(Rect2(Vector2(fx - 9.0, fy - 3.0), Vector2(18.0, 6.0)), Color(1.0, 0.65, 0.20, 0.46 * _intensity), true)

    # Smoke columns are lighter than the architecture so stacks remain readable.
    for index in range(7):
        var smoke_x := 820.0 + float(index) * 202.0
        var stack_top := 88.0 + _noise(index, 45.4) * 66.0
        for puff in range(7):
            var age := float(puff)
            var drift := age * 28.0 + sin(_atmosphere_time * 0.40 + float(index) + age) * 10.0
            var radius := 20.0 + age * 7.0 + _noise(index * 7 + puff, 46.0) * 9.0
            draw_circle(
                Vector2(smoke_x + drift, stack_top - age * 22.0),
                radius,
                Color(0.23, 0.24, 0.25, maxf(0.018, 0.080 - age * 0.009) * _intensity),
            )

    # Moving searchlights, deliberately brighter than the old pass.
    for index in range(3):
        var origin_x := 850.0 + float(index) * 500.0
        var phase := _atmosphere_time * (0.22 + float(index) * 0.04) + float(index) * 1.7
        var sweep := sin(phase) * 240.0
        var origin := Vector2(origin_x, 214.0 + float(index % 2) * 30.0)
        var tip := Vector2(origin_x + sweep, 52.0)
        var beam := PackedVector2Array([
            origin + Vector2(-5.0, 0.0),
            tip + Vector2(-52.0, 0.0),
            tip + Vector2(52.0, 0.0),
            origin + Vector2(5.0, 0.0),
        ])
        draw_colored_polygon(beam, Color(0.78, 0.78, 0.70, 0.040 * _intensity))
        draw_circle(origin, 6.0, Color(0.94, 0.66, 0.28, 0.62))

    # Foreground-facing haze strip separates the landmark from playable geometry.
    draw_rect(
        Rect2(Vector2(0.0, 370.0), Vector2(_world_size.x, 62.0)),
        Color(0.24, 0.28, 0.30, 0.055 * _intensity),
        true,
    )

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

    # Mid-city must frame the distant megafactory, not bury it. Use fewer,
    # narrower silhouettes with gaps and higher tonal separation.
    for index in range(15):
        var x := 54.0 + float(index) * 346.0
        var w := 68.0 + _noise(index, 4.2) * 66.0
        var h := 46.0 + _noise(index, 4.8) * 92.0
        var y := _floor_y - 72.0 - h
        var building := Color(
            0.096 + _noise(index, 47.1) * 0.018,
            0.114 + _noise(index, 47.7) * 0.018,
            0.126 + _noise(index, 48.3) * 0.018,
            0.74
        )

        draw_rect(Rect2(Vector2(x, y), Vector2(w, h)), building, true)
        draw_line(
            Vector2(x + 4.0, y),
            Vector2(x + w - 4.0, y),
            Color(0.22, 0.25, 0.26, 0.22),
            2.0,
        )
        draw_rect(
            Rect2(Vector2(x, y + h - 8.0), Vector2(w, 8.0)),
            Color(0.035, 0.043, 0.047, 0.44),
            true,
        )

        if index % 3 == 0:
            var antenna_h := 18.0 + _noise(index, 49.1) * 42.0
            var antenna_x := x + w * (0.42 + _noise(index, 49.7) * 0.30)
            draw_line(
                Vector2(antenna_x, y),
                Vector2(antenna_x, y - antenna_h),
                Color(0.12, 0.14, 0.15, 0.74),
                3.0,
            )
            draw_line(
                Vector2(antenna_x - 7.0, y - antenna_h + 9.0),
                Vector2(antenna_x + 7.0, y - antenna_h + 9.0),
                Color(0.16, 0.17, 0.17, 0.56),
                1.5,
            )

        if index % 4 == 1:
            draw_line(
                Vector2(x + 7.0, y + 20.0),
                Vector2(x + w - 8.0, y + 8.0),
                Color(0.27, 0.29, 0.29, 0.30),
                2.0,
            )

        for row in range(3):
            for col in range(3):
                if (index * 2 + row + col) % 4 != 0:
                    continue
                var wx := x + 12.0 + float(col) * minf(22.0, w / 4.0)
                var wy := y + 16.0 + float(row) * 22.0
                var window_glow := 0.22 + _noise(index * 11 + row * 3 + col, 50.2) * 0.20
                draw_rect(
                    Rect2(Vector2(wx, wy), Vector2(5.0, 7.0)),
                    Color(0.90, 0.52, 0.20, window_glow * _intensity),
                    true,
                )

        if index < 14 and index % 2 == 0:
            var bridge_y := y + 32.0 + _noise(index, 50.9) * 24.0
            draw_line(
                Vector2(x + w, bridge_y),
                Vector2(x + 346.0, bridge_y - 5.0),
                Color(0.12, 0.14, 0.15, 0.34),
                2.5,
            )

    # Low ribbon of warm points helps separate this plane from the water and
    # echoes the long-lit industrial road in the mock.
    for index in range(28):
        var light_x := 70.0 + float(index) * 188.0
        var light_y := 430.0 + float(index % 3) * 5.0
        draw_circle(
            Vector2(light_x, light_y),
            2.2,
            Color(0.95, 0.53, 0.22, 0.22 * _intensity),
        )

    for index in range(7):
        var smoke_x := 430.0 + float(index) * 720.0
        var base_y := 278.0 + _noise(index, 6.3) * 76.0
        for puff in range(5):
            var drift := float(puff) * 18.0 + sin(_atmosphere_time * 0.55 + float(index) * 0.9 + float(puff) * 0.4) * (6.0 + float(puff) * 2.0)
            var radius := 16.0 + float(puff) * 6.0
            draw_circle(
                Vector2(smoke_x + drift, base_y - float(puff) * 21.0),
                radius,
                Color(0.26, 0.29, 0.30, (0.050 - float(puff) * 0.006) * _intensity),
            )

    for origin_x in [1080.0, 3040.0, 4580.0]:
        var origin := Vector2(origin_x, _floor_y - 150.0)
        var sweep := sin(_atmosphere_time * 0.40 + origin_x * 0.0017) * 225.0
        var beam_tip := Vector2(origin_x + 275.0 + sweep, 124.0)
        var beam := PackedVector2Array([
            origin + Vector2(-7.0, 0.0),
            beam_tip + Vector2(-64.0, 0.0),
            beam_tip + Vector2(64.0, 0.0),
            origin + Vector2(7.0, 0.0),
        ])
        draw_colored_polygon(beam, Color(0.76, 0.72, 0.56, 0.026 * _intensity))
        draw_circle(origin, 7.0, Color(0.88, 0.70, 0.36, 0.50))

    # Mist pocket between mid-city and playable plane.
    draw_rect(
        Rect2(Vector2(0.0, 402.0), Vector2(_world_size.x, 92.0)),
        Color(0.34, 0.39, 0.41, 0.040 * _intensity),
        true,
    )

func _draw_harbor_horizon() -> void:
    draw_rect(Rect2(Vector2(0.0, 390.0), Vector2(_world_size.x, _floor_y - 390.0)), Color("102a33"), true)
    draw_line(Vector2(0.0, 390.0), Vector2(_world_size.x, 390.0), Color(0.52, 0.66, 0.69, 0.18), 2.0)
    for band in range(9):
        var y := 404.0 + float(band) * 18.0
        var phase := sin(_atmosphere_time * 0.22 + float(band) * 0.8) * 22.0
        for glint in range(8):
            var x := float(glint) * 720.0 + float(band % 3) * 110.0 + phase
            var length := 42.0 + _noise(band * 11 + glint, 90.4) * 120.0
            draw_line(
                Vector2(x, y),
                Vector2(minf(_world_size.x, x + length), y),
                Color(0.48, 0.70, 0.76, (0.025 + float(band) * 0.003) * _intensity),
                1.5,
            )
    for index in range(12):
        var x := 120.0 + float(index) * 470.0
        var hull_w := 90.0 + _noise(index, 11.2) * 100.0
        var y := 420.0 + _noise(index, 11.8) * 36.0
        draw_rect(Rect2(Vector2(x, y), Vector2(hull_w, 10.0)), Color(0.06, 0.11, 0.13, 0.78), true)
        draw_line(Vector2(x + hull_w * 0.55, y), Vector2(x + hull_w * 0.55, y - 38.0), Color(0.12, 0.18, 0.20, 0.72), 3.0)
        if index % 3 == 0:
            var lamp := Vector2(x + hull_w * 0.22, y - 6.0)
            draw_circle(lamp, 7.0, Color(1.0, 0.56, 0.22, 0.05 * _intensity))
            draw_circle(lamp, 2.2, Color(1.0, 0.72, 0.36, 0.55 * _intensity))

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

    var middle := PackedVector2Array([Vector2(0.0, _floor_y)])
    for index in range(20):
        var x := float(index) * 300.0
        var peak_y := 300.0 + _noise(index, 91.2) * 92.0
        middle.append(Vector2(x, 472.0))
        middle.append(Vector2(x + 150.0, peak_y))
        middle.append(Vector2(x + 300.0, 472.0))
    middle.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(middle, Color(0.10, 0.15, 0.18, 0.72))

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
        draw_line(
            Vector2(x, peak_y + 2.0),
            Vector2(x + 28.0, peak_y + 48.0),
            Color(0.76, 0.84, 0.88, 0.12 * _intensity),
            1.5,
        )

    draw_rect(
        Rect2(Vector2(0.0, 360.0), Vector2(_world_size.x, 92.0)),
        Color(0.66, 0.75, 0.80, 0.028 * _intensity),
        true,
    )

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

    for index in range(22):
        var x := 40.0 + float(index) * 250.0
        var crown_y := 292.0 + _noise(index, 92.1) * 112.0
        var radius := 22.0 + _noise(index, 92.7) * 34.0
        draw_circle(
            Vector2(x, crown_y),
            radius,
            Color(0.08, 0.19, 0.105, (0.14 + _noise(index, 93.3) * 0.10) * _intensity),
        )

    var front := PackedVector2Array([Vector2(0.0, _floor_y)])
    for x in range(0, int(_world_size.x) + 101, 100):
        var xf := float(x)
        var y := 418.0 + sin(xf * 0.0074 + 0.7) * 22.0 + (_noise(x / 100, 16.9) - 0.5) * 28.0
        front.append(Vector2(xf, y))
    front.append(Vector2(_world_size.x, _floor_y))
    draw_colored_polygon(front, Color(0.07, 0.16, 0.09, 0.98))

    draw_rect(
        Rect2(Vector2(0.0, 365.0), Vector2(_world_size.x, 110.0)),
        Color(0.30, 0.44, 0.31, 0.032 * _intensity),
        true,
    )
    for index in range(14):
        var vine_x := 180.0 + float(index) * 410.0
        var length := 34.0 + _noise(index, 94.0) * 82.0
        draw_line(
            Vector2(vine_x, 322.0 + _noise(index, 94.7) * 60.0),
            Vector2(vine_x + sin(float(index)) * 12.0, 322.0 + length),
            Color(0.16, 0.28, 0.15, 0.24 * _intensity),
            2.0,
        )

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

func _draw_near_foreground() -> void:
    if _preset != "night_front":
        return

    # Camera-near framing only. It lives below the walk surface so it adds
    # depth without obscuring Matthias, enemies or projectile readability.
    var silhouette := Color(0.020, 0.027, 0.029, 0.78 * _intensity)
    var metal := Color(0.055, 0.065, 0.066, 0.82 * _intensity)
    var rust := Color(0.25, 0.13, 0.075, 0.34 * _intensity)
    var top_y := _floor_y + 55.0

    var rubble := PackedVector2Array([Vector2(0.0, _world_size.y)])
    for x in range(0, int(_world_size.x) + 101, 100):
        var xf := float(x)
        var y := top_y + (_noise(x / 100, 70.1) - 0.5) * 25.0
        rubble.append(Vector2(xf, y))
    rubble.append(Vector2(_world_size.x, _world_size.y))
    draw_colored_polygon(rubble, silhouette)

    # Bent posts + barbed wire, deliberately interrupted so the foreground
    # frames the view instead of becoming a continuous visual fence.
    for index in range(13):
        var x := 90.0 + float(index) * 420.0
        var base_y := _world_size.y + 8.0
        var post_top := top_y - 12.0 - _noise(index, 70.8) * 26.0
        var lean := (_noise(index, 71.4) - 0.5) * 26.0
        draw_line(Vector2(x, base_y), Vector2(x + lean, post_top), metal, 7.0)
        if index % 3 != 1:
            var wire_y := post_top + 18.0
            draw_line(
                Vector2(x + lean - 38.0, wire_y),
                Vector2(x + lean + 120.0, wire_y - 8.0),
                Color(0.10, 0.11, 0.105, 0.64 * _intensity),
                2.0,
            )
            for barb in range(4):
                var bx := x + lean - 18.0 + float(barb) * 34.0
                var by := wire_y - float(barb) * 1.7
                draw_line(Vector2(bx - 5.0, by - 5.0), Vector2(bx + 5.0, by + 5.0), rust, 1.5)
                draw_line(Vector2(bx - 5.0, by + 5.0), Vector2(bx + 5.0, by - 5.0), rust, 1.5)

    # Heavy pipe runs and braces create a readable camera-near industrial
    # texture without stealing contrast from the playable lane.
    for index in range(7):
        var pipe_x := 150.0 + float(index) * 790.0
        var pipe_y := top_y + 54.0 + float(index % 2) * 18.0
        draw_line(
            Vector2(pipe_x - 72.0, pipe_y),
            Vector2(pipe_x + 128.0, pipe_y - 12.0),
            Color(0.035, 0.043, 0.044, 0.84 * _intensity),
            14.0,
        )
        draw_line(
            Vector2(pipe_x - 62.0, pipe_y - 3.0),
            Vector2(pipe_x + 118.0, pipe_y - 15.0),
            Color(0.14, 0.16, 0.16, 0.20 * _intensity),
            2.0,
        )
        for collar in range(3):
            var collar_x := pipe_x - 28.0 + float(collar) * 62.0
            draw_line(
                Vector2(collar_x, pipe_y - 12.0),
                Vector2(collar_x + 2.0, pipe_y + 7.0),
                rust,
                3.0,
            )

    # Broken beams and drum silhouettes produce the shallow, near-camera frame
    # seen in the approved mock while remaining entirely non-collidable.
    for index in range(9):
        var x := 210.0 + float(index) * 575.0
        var y := top_y + 30.0 + float(index % 3) * 11.0
        var angle := -0.55 + _noise(index, 72.2) * 1.10
        var length := 54.0 + _noise(index, 72.8) * 52.0
        var direction := Vector2(cos(angle), sin(angle)) * length
        draw_line(Vector2(x, y), Vector2(x, y) + direction, metal, 10.0)
        if index % 2 == 0:
            draw_rect(
                Rect2(Vector2(x + 48.0, y + 8.0), Vector2(30.0, 46.0)),
                Color(0.040, 0.048, 0.048, 0.88 * _intensity),
                true,
            )
            draw_line(
                Vector2(x + 48.0, y + 20.0),
                Vector2(x + 78.0, y + 20.0),
                Color(0.22, 0.12, 0.07, 0.34 * _intensity),
                2.0,
            )

    # A handful of close embers gives the foreground its own motion plane.
    for index in range(18):
        var speed := 12.0 + _noise(index, 73.5) * 24.0
        var span := _world_size.x + 180.0
        var x := fposmod(_noise(index, 74.1) * span + _atmosphere_time * speed, span) - 90.0
        var y := top_y - 18.0 + _noise(index, 74.7) * 92.0
        y += sin(_atmosphere_time * 0.7 + float(index)) * 8.0
        var radius := 1.0 + _noise(index, 75.3) * 1.9
        var alpha := 0.08 + _noise(index, 75.9) * 0.15
        draw_circle(Vector2(x, y), radius, Color(0.96, 0.37, 0.10, alpha * _intensity))

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
