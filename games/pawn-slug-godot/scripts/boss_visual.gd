extends Node2D

const ART_PATH := "res://assets/panzer_rook.svg"
const ART_SCALE := Vector2(0.42, 0.55)
const ART_FLOOR_OFFSET := Vector2(0.0, -62.0)
const MUZZLE_LOCAL := Vector2(98.0, -86.0)

var hp := 780
var max_hp := 780
var dead := false
var _last_hp := 780
var _flash_remaining := 0.0
var _shell_telegraph := 0.0

var _facing_root: Node2D
var _body: Sprite2D
var _muzzle: Marker2D
var _muzzle_flash: Polygon2D

func _ready() -> void:
    _facing_root = Node2D.new()
    _facing_root.name = "FacingRoot"
    add_child(_facing_root)

    _body = Sprite2D.new()
    _body.name = "Body"
    _body.texture = load(ART_PATH) as Texture2D
    _body.scale = ART_SCALE
    _body.position = ART_FLOOR_OFFSET
    _body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _facing_root.add_child(_body)

    _muzzle = Marker2D.new()
    _muzzle.name = "Muzzle"
    _muzzle.position = MUZZLE_LOCAL
    _facing_root.add_child(_muzzle)

    _muzzle_flash = Polygon2D.new()
    _muzzle_flash.name = "MuzzleFlash"
    _muzzle_flash.polygon = PackedVector2Array([
        Vector2.ZERO,
        Vector2(16.0, -6.0),
        Vector2(28.0, 0.0),
        Vector2(16.0, 6.0),
        Vector2.ZERO,
        Vector2(8.0, -12.0),
        Vector2(13.0, 0.0),
        Vector2(8.0, 12.0),
    ])
    _muzzle_flash.color = Color("ffb05f")
    _muzzle_flash.visible = false
    _muzzle.add_child(_muzzle_flash)
    queue_redraw()

func sync_state(world_x: float, floor_y: float, facing: float, current_hp: int, total_hp: int) -> void:
    position = Vector2(world_x, floor_y)
    if _facing_root != null:
        _facing_root.scale.x = -1.0 if facing < 0.0 else 1.0
    max_hp = maxi(1, total_hp)
    hp = maxi(0, current_hp)
    if hp < _last_hp and hp > 0:
        _play_hurt()
    if hp <= 0 and not dead:
        _play_death()
    _last_hp = hp
    queue_redraw()

func muzzle_global_position() -> Vector2:
    return _muzzle.global_position if _muzzle != null else global_position + Vector2(98.0, -86.0)

func set_shell_telegraph(strength: float) -> void:
    _shell_telegraph = clampf(strength, 0.0, 1.0)
    queue_redraw()

func play_fire(explosive := false) -> void:
    if dead or _facing_root == null:
        return
    _flash_remaining = 0.085 if explosive else 0.055
    if _muzzle_flash != null:
        _muzzle_flash.scale = Vector2(1.5, 1.5) if explosive else Vector2.ONE
    var base := _facing_root.position
    var kick := 12.0 if explosive else 5.0
    var tween := create_tween()
    tween.tween_property(_facing_root, "position", base + Vector2(-kick, 0.0), 0.045)
    tween.tween_property(_facing_root, "position", base, 0.10)

func _process(delta: float) -> void:
    _flash_remaining = maxf(0.0, _flash_remaining - delta)
    if _muzzle_flash != null:
        var telegraph_visible := _shell_telegraph > 0.0 and not dead
        _muzzle_flash.visible = (_flash_remaining > 0.0 or telegraph_visible) and not dead
        if telegraph_visible and _flash_remaining <= 0.0:
            var pulse := 1.0 + 0.22 * sin(Time.get_ticks_msec() * 0.018)
            _muzzle_flash.scale = Vector2.ONE * lerpf(0.75, 1.35, _shell_telegraph) * pulse
            _muzzle_flash.color = Color("ff6d3b")
        elif _flash_remaining > 0.0:
            _muzzle_flash.color = Color("ffb05f")
    if _shell_telegraph > 0.0:
        queue_redraw()

func _play_hurt() -> void:
    if _facing_root == null:
        return
    _facing_root.modulate = Color(1.0, 0.42, 0.34, 1.0)
    var tween := create_tween()
    tween.tween_property(_facing_root, "modulate", Color.WHITE, 0.15)

func _play_death() -> void:
    dead = true
    _shell_telegraph = 0.0
    if _muzzle_flash != null:
        _muzzle_flash.visible = false
    if _facing_root == null:
        return
    var tween := create_tween()
    tween.set_parallel(true)
    tween.tween_property(_facing_root, "rotation", deg_to_rad(11.0), 0.35)
    tween.tween_property(_facing_root, "position", Vector2(0.0, 14.0), 0.35)
    tween.tween_property(_facing_root, "modulate:a", 0.0, 0.55)

func _draw() -> void:
    if dead or hp <= 0:
        return
    var width := 190.0
    var ratio := clampf(float(hp) / float(max_hp), 0.0, 1.0)
    var y := -166.0
    draw_rect(Rect2(Vector2(-width * 0.5, y), Vector2(width, 10.0)), Color("2b3034"), true)
    draw_rect(Rect2(Vector2(-width * 0.5, y), Vector2(width * ratio, 10.0)), Color("d45745"), true)
    draw_string(ThemeDB.fallback_font, Vector2(-54.0, y - 8.0), "PANZER ROOK", HORIZONTAL_ALIGNMENT_LEFT, -1.0, 15, Color("e7d3a1"))
    if _shell_telegraph > 0.0:
        var pulse := 0.65 + 0.35 * sin(Time.get_ticks_msec() * 0.016)
        var warning := Color(1.0, 0.28, 0.12, lerpf(0.30, 0.92, _shell_telegraph) * pulse)
        var radius := lerpf(54.0, 78.0, _shell_telegraph)
        draw_arc(Vector2(0.0, -78.0), radius, -PI * 0.80, PI * 0.80, 28, warning, 4.0)
