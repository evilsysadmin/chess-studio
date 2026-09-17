extends Node2D

const BODY_ATLAS_PATH := "res://assets/enemy_body_motion_atlas.svg"
const WEAPON_ATLAS_PATH := "res://assets/weapon_atlas.svg"
const FRAME_SIZE := Vector2(256.0, 256.0)
const FRAMES_PER_TYPE := 8
const TYPE_FRAME_BASE := {"pawn": 0, "knight": 8, "rook": 16}
const TYPE_SCALE := {"pawn": 0.39, "knight": 0.34, "rook": 0.43}
const TYPE_FPS := {"pawn": 6.0, "knight": 9.0, "rook": 4.0}
const WEAPON_FRAME := {"pistol": 0, "machinegun": 1, "shotgun": 2, "panzerfaust": 3}
const WEAPON_POSE := {
    "pistol": {"position": Vector2(18.0, -45.0), "rotation": -0.03, "scale": Vector2(0.20, 0.20), "muzzle": Vector2(38.0, 0.0)},
    "machinegun": {"position": Vector2(17.0, -44.0), "rotation": -0.04, "scale": Vector2(0.23, 0.23), "muzzle": Vector2(52.0, -1.0)},
    "shotgun": {"position": Vector2(18.0, -43.0), "rotation": -0.04, "scale": Vector2(0.24, 0.24), "muzzle": Vector2(57.0, -1.0)},
    "panzerfaust": {"position": Vector2(13.0, -45.0), "rotation": -0.07, "scale": Vector2(0.27, 0.27), "muzzle": Vector2(61.0, -2.0)},
}

var enemy_type := "pawn"
var weapon := "pistol"
var visual_height := 62.0
var hp := 1
var max_hp := 1
var moving := false
var dead := false
var _last_hp := 1
var _frame_time := 0.0
var _frame := 0
var _fire_flash := 0.0

var _facing_root: Node2D
var _body: Sprite2D
var _weapon_root: Marker2D
var _weapon_sprite: Sprite2D
var _muzzle: Marker2D
var _muzzle_flash: Polygon2D

func _ready() -> void:
    _build_nodes()
    _apply_type()
    _apply_weapon()
    queue_redraw()

func configure(kind: String, weapon_id: String, height: float, current_hp: int, total_hp: int) -> void:
    enemy_type = kind
    weapon = weapon_id
    visual_height = height
    hp = current_hp
    max_hp = maxi(1, total_hp)
    _last_hp = hp
    if is_node_ready():
        _apply_type()
        _apply_weapon()
        queue_redraw()

func sync_state(world_x: float, floor_y: float, facing: float, is_moving: bool, current_hp: int, total_hp: int) -> void:
    position = Vector2(world_x, floor_y)
    if _facing_root != null:
        _facing_root.scale.x = -1.0 if facing < 0.0 else 1.0
    moving = is_moving
    max_hp = maxi(1, total_hp)
    hp = maxi(0, current_hp)
    if hp < _last_hp and hp > 0:
        _play_hurt()
    if hp <= 0 and not dead:
        _play_death()
    _last_hp = hp
    queue_redraw()

func play_fire() -> void:
    if dead or _weapon_root == null:
        return
    _fire_flash = 0.06
    var base_position := _weapon_root.position
    var tween := create_tween()
    tween.tween_property(_weapon_root, "position", base_position + Vector2(-4.0, 0.0), 0.035)
    tween.tween_property(_weapon_root, "position", base_position, 0.075)

func muzzle_global_position() -> Vector2:
    return _muzzle.global_position if _muzzle != null else global_position + Vector2(36.0, -42.0)

func _process(delta: float) -> void:
    if dead:
        return
    _fire_flash = maxf(0.0, _fire_flash - delta)
    if _muzzle_flash != null:
        _muzzle_flash.visible = _fire_flash > 0.0

    if enemy_type == "bishop":
        return
    if moving:
        _frame_time += delta * float(TYPE_FPS.get(enemy_type, 6.0))
        _frame = int(floor(_frame_time)) % FRAMES_PER_TYPE
    else:
        _frame = 0
        _frame_time = 0.0
    _apply_body_frame()

func _build_nodes() -> void:
    _facing_root = Node2D.new()
    _facing_root.name = "FacingRoot"
    add_child(_facing_root)

    _body = Sprite2D.new()
    _body.name = "Body"
    _body.centered = true
    _body.region_enabled = true
    _body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _facing_root.add_child(_body)

    _weapon_root = Marker2D.new()
    _weapon_root.name = "WeaponRoot"
    _facing_root.add_child(_weapon_root)

    _weapon_sprite = Sprite2D.new()
    _weapon_sprite.name = "Weapon"
    _weapon_sprite.centered = true
    _weapon_sprite.region_enabled = true
    _weapon_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _weapon_root.add_child(_weapon_sprite)

    _muzzle = Marker2D.new()
    _muzzle.name = "Muzzle"
    _weapon_root.add_child(_muzzle)

    _muzzle_flash = Polygon2D.new()
    _muzzle_flash.name = "MuzzleFlash"
    _muzzle_flash.polygon = PackedVector2Array([
        Vector2.ZERO,
        Vector2(8.0, -3.0),
        Vector2(13.0, 0.0),
        Vector2(8.0, 3.0),
        Vector2.ZERO,
        Vector2(4.0, -6.0),
        Vector2(7.0, 0.0),
        Vector2(4.0, 6.0),
    ])
    _muzzle_flash.color = Color("ffb05f")
    _muzzle_flash.visible = false
    _muzzle.add_child(_muzzle_flash)

func _apply_type() -> void:
    if _body == null:
        return
    if enemy_type == "bishop":
        _body.visible = false
        queue_redraw()
        return
    var texture := load(BODY_ATLAS_PATH) as Texture2D
    if texture == null:
        _body.visible = false
        return
    _body.texture = texture
    _body.visible = true
    var body_scale := float(TYPE_SCALE.get(enemy_type, 0.39))
    _body.scale = Vector2(body_scale, body_scale)
    _body.position = Vector2(0.0, -98.0 * body_scale)
    _apply_body_frame()

func _apply_body_frame() -> void:
    if _body == null or not _body.visible:
        return
    var base := int(TYPE_FRAME_BASE.get(enemy_type, 0))
    _body.region_rect = Rect2(Vector2(float(base + _frame) * FRAME_SIZE.x, 0.0), FRAME_SIZE)

func _apply_weapon() -> void:
    if _weapon_sprite == null:
        return
    var texture := load(WEAPON_ATLAS_PATH) as Texture2D
    if texture == null:
        _weapon_sprite.visible = false
        return
    _weapon_sprite.texture = texture
    _weapon_sprite.visible = true
    var index := int(WEAPON_FRAME.get(weapon, 0))
    _weapon_sprite.region_rect = Rect2(Vector2(index * 256.0, 0.0), Vector2(256.0, 128.0))
    var pose: Dictionary = WEAPON_POSE.get(weapon, WEAPON_POSE["pistol"])
    var type_y_adjust := -7.0 if enemy_type == "bishop" else (2.0 if enemy_type == "rook" else 0.0)
    _weapon_root.position = pose["position"] + Vector2(0.0, type_y_adjust)
    _weapon_root.rotation = float(pose["rotation"])
    _weapon_sprite.scale = pose["scale"]
    _muzzle.position = pose["muzzle"]

func _play_hurt() -> void:
    if _facing_root == null:
        return
    _facing_root.modulate = Color(1.0, 0.48, 0.42, 1.0)
    var tween := create_tween()
    tween.tween_property(_facing_root, "modulate", Color.WHITE, 0.16)

func _play_death() -> void:
    dead = true
    if _facing_root == null:
        return
    _muzzle_flash.visible = false
    var tween := create_tween()
    tween.set_parallel(true)
    tween.tween_property(_facing_root, "rotation", deg_to_rad(76.0), 0.28)
    tween.tween_property(_facing_root, "position", Vector2(-8.0, 18.0), 0.28)
    tween.tween_property(_facing_root, "modulate:a", 0.0, 0.32)

func _draw() -> void:
    if dead:
        return
    if enemy_type == "bishop":
        _draw_bishop()
    if hp <= 0:
        return
    var hp_width := maxf(44.0, visual_height * 0.72)
    var hp_ratio := clampf(float(hp) / float(max_hp), 0.0, 1.0)
    var bar_y := -visual_height - 28.0
    draw_rect(Rect2(Vector2(-hp_width * 0.5, bar_y), Vector2(hp_width, 6.0)), Color("2f3438"), true)
    draw_rect(Rect2(Vector2(-hp_width * 0.5, bar_y), Vector2(hp_width * hp_ratio, 6.0)), Color("c7634e"), true)

func _draw_bishop() -> void:
    var h := visual_height
    var body_top := -h * 0.72
    var body_bottom := -4.0
    draw_ellipse_shadow(Vector2(0.0, -1.0), Vector2(h * 0.36, 7.0), Color(0.02, 0.02, 0.025, 0.48))
    draw_colored_polygon(PackedVector2Array([
        Vector2(-h * 0.28, body_bottom),
        Vector2(-h * 0.20, body_top),
        Vector2(h * 0.20, body_top),
        Vector2(h * 0.30, body_bottom),
    ]), Color("554462"))
    draw_circle(Vector2(0.0, -h * 0.82), h * 0.18, Color("9ba4aa"))
    draw_polyline(PackedVector2Array([
        Vector2(-h * 0.12, -h * 0.93),
        Vector2(0.0, -h * 1.05),
        Vector2(h * 0.12, -h * 0.93),
    ]), Color("c1a75f"), 5.0)
    draw_circle(Vector2(-h * 0.06, -h * 0.83), 3.0, Color("e36d5a"))
    draw_circle(Vector2(h * 0.06, -h * 0.83), 3.0, Color("e36d5a"))

func draw_ellipse_shadow(center: Vector2, radii: Vector2, color: Color) -> void:
    var points := PackedVector2Array()
    for i in range(24):
        var a := TAU * float(i) / 24.0
        points.append(center + Vector2(cos(a) * radii.x, sin(a) * radii.y))
    draw_colored_polygon(points, color)
