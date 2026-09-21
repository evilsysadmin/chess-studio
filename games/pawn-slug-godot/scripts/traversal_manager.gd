extends Node2D

# Data-driven traversal layer for Pawn Slug stages.
# The canonical stage manifest owns ladders and floor gaps; this node turns
# those authored specs into runtime collision plus lightweight 2D dressing.

const PLAYER_HALF_HEIGHT := 42.0
const LADDER_ENTRY_X_PAD := 18.0
const LADDER_ENTRY_Y_PAD := 18.0

var _ladders: Array[Dictionary] = []
var _pits: Array[Dictionary] = []
var _floor_y := 610.0
var _world_size := Vector2(1280.0, 720.0)
var _theme := "night_front"

func _ready() -> void:
    call_deferred("_install_stage")

func _install_stage() -> void:
    var stage = get_parent()
    if stage == null:
        return
    var manifest_variant = stage.get("_stage_manifest")
    if typeof(manifest_variant) != TYPE_DICTIONARY or Dictionary(manifest_variant).is_empty():
        call_deferred("_install_stage")
        return
    var manifest: Dictionary = Dictionary(manifest_variant)
    var world: Dictionary = manifest.get("world", {})
    _floor_y = float(world.get("floor_y", 610.0))
    _world_size = Vector2(
        float(world.get("width", 1280.0)),
        float(world.get("height", 720.0))
    )
    _theme = String(manifest.get("theme", "night_front"))
    _ladders = _validated_ladders(manifest.get("ladders", []))
    _pits = _validated_pits(manifest.get("pits", []))
    _rebuild_floor_with_pits()
    queue_redraw()

func _validated_ladders(raw: Array) -> Array[Dictionary]:
    var result: Array[Dictionary] = []
    for entry in raw:
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var spec := Dictionary(entry).duplicate(true)
        var x := float(spec.get("x", -1.0))
        var top_y := float(spec.get("top_y", -1.0))
        var bottom_y := float(spec.get("bottom_y", _floor_y))
        var width := float(spec.get("w", 28.0))
        if x < 0.0 or width <= 8.0 or top_y < 0.0 or bottom_y <= top_y:
            continue
        spec["x"] = x
        spec["top_y"] = top_y
        spec["bottom_y"] = bottom_y
        spec["w"] = width
        spec["exit_dir"] = signf(float(spec.get("exit_dir", 1.0)))
        result.append(spec)
    return result

func _validated_pits(raw: Array) -> Array[Dictionary]:
    var result: Array[Dictionary] = []
    for entry in raw:
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var spec := Dictionary(entry).duplicate(true)
        var x := float(spec.get("x", -1.0))
        var width := float(spec.get("w", 0.0))
        if x < 0.0 or width < 48.0:
            continue
        spec["x"] = clampf(x, 0.0, _world_size.x)
        spec["w"] = minf(width, _world_size.x - float(spec["x"]))
        if float(spec["w"]) >= 48.0:
            result.append(spec)
    result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
        return float(a["x"]) < float(b["x"])
    )
    return result

func _rebuild_floor_with_pits() -> void:
    var stage = get_parent()
    if stage == null:
        return
    var geometry = stage.get_node_or_null("StageGeometry")
    if geometry == null:
        call_deferred("_install_stage")
        return
    var old_floor = geometry.get_node_or_null("Floor")
    if old_floor != null:
        geometry.remove_child(old_floor)
        old_floor.queue_free()

    var cursor := 0.0
    var segment_index := 0
    for pit in _pits:
        var pit_x := float(pit["x"])
        var pit_end := pit_x + float(pit["w"])
        if pit_x > cursor:
            _add_floor_segment(geometry, cursor, pit_x - cursor, segment_index)
            segment_index += 1
        cursor = maxf(cursor, pit_end)
    if cursor < _world_size.x:
        _add_floor_segment(geometry, cursor, _world_size.x - cursor, segment_index)

func _add_floor_segment(geometry: Node, x: float, width: float, index: int) -> void:
    if width <= 1.0:
        return
    var body := StaticBody2D.new()
    body.name = "FloorSegment_%02d" % index
    body.position = Vector2(x + width * 0.5, _floor_y + maxf(1.0, (_world_size.y - _floor_y) * 0.5))
    var collision := CollisionShape2D.new()
    var shape := RectangleShape2D.new()
    shape.size = Vector2(width, maxf(1.0, _world_size.y - _floor_y))
    collision.shape = shape
    body.add_child(collision)
    geometry.add_child(body)

func ladder_for_player(position: Vector2) -> Dictionary:
    for ladder in _ladders:
        var half_w := float(ladder["w"]) * 0.5 + LADDER_ENTRY_X_PAD
        if absf(position.x - float(ladder["x"])) > half_w:
            continue
        var top_center := float(ladder["top_y"]) - PLAYER_HALF_HEIGHT
        var bottom_center := float(ladder["bottom_y"]) - PLAYER_HALF_HEIGHT
        if position.y < top_center - LADDER_ENTRY_Y_PAD or position.y > bottom_center + LADDER_ENTRY_Y_PAD:
            continue
        return ladder.duplicate(true)
    return {}

func pit_below_x(x: float) -> bool:
    for pit in _pits:
        if x >= float(pit["x"]) and x <= float(pit["x"]) + float(pit["w"]):
            return true
    return false

func _draw() -> void:
    _draw_pits()
    _draw_ladders()

func _draw_pits() -> void:
    for pit in _pits:
        var x := float(pit["x"])
        var width := float(pit["w"])
        var mouth := Rect2(Vector2(x, _floor_y - 3.0), Vector2(width, _world_size.y - _floor_y + 6.0))
        var void_color := Color(0.025, 0.03, 0.032, 0.98)
        var rim_color := Color(0.32, 0.28, 0.21, 0.86)
        if _theme == "harbor_dusk":
            void_color = Color(0.025, 0.11, 0.14, 0.96)
            rim_color = Color(0.24, 0.48, 0.54, 0.82)
        elif _theme == "alpine_night":
            void_color = Color(0.035, 0.055, 0.07, 0.99)
            rim_color = Color(0.58, 0.66, 0.68, 0.78)
        elif _theme == "jungle_storm":
            void_color = Color(0.035, 0.075, 0.045, 0.98)
            rim_color = Color(0.34, 0.42, 0.24, 0.82)
        draw_rect(mouth, void_color, true)
        draw_line(Vector2(x, _floor_y), Vector2(x + width, _floor_y), rim_color, 4.0)
        for notch in range(int(x) + 18, int(x + width) - 10, 34):
            draw_line(
                Vector2(float(notch), _floor_y - 1.0),
                Vector2(float(notch) + 9.0, _floor_y + 8.0),
                Color(rim_color.r, rim_color.g, rim_color.b, 0.46),
                2.0
            )

func _draw_ladders() -> void:
    for ladder in _ladders:
        var x := float(ladder["x"])
        var top_y := float(ladder["top_y"])
        var bottom_y := float(ladder["bottom_y"])
        var width := float(ladder["w"])
        var left := x - width * 0.5
        var right := x + width * 0.5
        var rail := Color(0.50, 0.45, 0.31, 0.96)
        var rung := Color(0.72, 0.62, 0.39, 0.92)
        if _theme == "harbor_dusk":
            rail = Color(0.36, 0.55, 0.59, 0.96)
            rung = Color(0.55, 0.72, 0.74, 0.92)
        elif _theme == "alpine_night":
            rail = Color(0.58, 0.63, 0.64, 0.96)
            rung = Color(0.76, 0.80, 0.81, 0.92)
        elif _theme == "jungle_storm":
            rail = Color(0.38, 0.34, 0.21, 0.98)
            rung = Color(0.62, 0.52, 0.28, 0.94)
        draw_line(Vector2(left, top_y - 12.0), Vector2(left, bottom_y), rail, 5.0)
        draw_line(Vector2(right, top_y - 12.0), Vector2(right, bottom_y), rail, 5.0)
        var rung_y := top_y + 8.0
        while rung_y < bottom_y - 8.0:
            draw_line(Vector2(left + 2.0, rung_y), Vector2(right - 2.0, rung_y), rung, 3.0)
            rung_y += 24.0
