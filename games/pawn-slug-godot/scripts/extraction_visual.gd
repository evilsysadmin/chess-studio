extends Node2D

var unlocked := false
var complete := false
var _time := 0.0

func set_unlocked(value: bool) -> void:
    if unlocked == value:
        return
    unlocked = value
    queue_redraw()

func set_complete(value: bool) -> void:
    if complete == value:
        return
    complete = value
    queue_redraw()

func _process(delta: float) -> void:
    _time += delta
    queue_redraw()

func _draw() -> void:
    var pulse := 0.5 + 0.5 * sin(_time * 4.0)
    var frame_color := Color("8d7550")
    var signal_color := Color("61d18a") if unlocked else Color("d45745")
    if complete:
        signal_color = Color("f0d57b")

    draw_rect(Rect2(Vector2(-34.0, -130.0), Vector2(68.0, 130.0)), Color(0.07, 0.09, 0.10, 0.92), true)
    draw_rect(Rect2(Vector2(-38.0, -134.0), Vector2(76.0, 136.0)), frame_color, false, 5.0)
    draw_line(Vector2(-24.0, -112.0), Vector2(-24.0, -12.0), Color("313a3f"), 5.0)
    draw_line(Vector2(24.0, -112.0), Vector2(24.0, -12.0), Color("313a3f"), 5.0)

    var glow_alpha := 0.30 + pulse * 0.28
    draw_circle(Vector2(0.0, -154.0), 20.0 + pulse * 3.0, Color(signal_color.r, signal_color.g, signal_color.b, glow_alpha))
    draw_circle(Vector2(0.0, -154.0), 9.0, signal_color)

    if not unlocked:
        draw_line(Vector2(-29.0, -96.0), Vector2(29.0, -20.0), Color(signal_color.r, signal_color.g, signal_color.b, 0.72), 6.0)
        draw_line(Vector2(29.0, -96.0), Vector2(-29.0, -20.0), Color(signal_color.r, signal_color.g, signal_color.b, 0.72), 6.0)
    elif not complete:
        draw_polyline(PackedVector2Array([
            Vector2(-12.0, -58.0),
            Vector2(-2.0, -45.0),
            Vector2(17.0, -72.0),
        ]), signal_color, 6.0)
    else:
        draw_circle(Vector2.ZERO + Vector2(0.0, -60.0), 19.0, Color(signal_color.r, signal_color.g, signal_color.b, 0.22))
        draw_circle(Vector2(0.0, -60.0), 8.0, signal_color)
