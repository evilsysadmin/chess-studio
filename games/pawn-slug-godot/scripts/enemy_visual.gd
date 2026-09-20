extends Node2D

const BODY_FALLBACK_ATLAS_PATH := "res://assets/enemy_body_motion_atlas.svg"
const BODY_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/enemies/premium-raster/enemy_premium_raster_v5-7b62f19661e36c2c.webp"
const BODY_ATLAS_V2_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/enemies/cast-v2/enemy-cast-v2-3ebbf4a9c5180051.webp"
const WEAPON_ATLAS_PATH := "res://assets/weapon_atlas.svg"

const FALLBACK_FRAME_SIZE := Vector2(256.0, 256.0)
const REMOTE_FRAME_SIZE := Vector2(80.0, 80.0)
const REMOTE_ATLAS_ROWS := 8
const LEGACY_REMOTE_ATLAS_ROWS := 3
const FRAMES_PER_TYPE := 8
const FALLBACK_TYPE_FRAME_BASE := {"pawn": 0, "knight": 8, "rook": 16, "queen": 8, "grenadier": 0, "scout": 0, "commando": 0, "shield": 16}
const REMOTE_TYPE_ROW := {"pawn": 0, "knight": 1, "rook": 2, "queen": 3, "grenadier": 4, "scout": 5, "commando": 6, "shield": 7}
const LEGACY_REMOTE_TYPE_ROW := {"pawn": 0, "knight": 1, "rook": 2, "queen": 1, "grenadier": 0, "scout": 0, "commando": 0, "shield": 2}
const FALLBACK_TYPE_SCALE := {"pawn": 0.39, "knight": 0.34, "rook": 0.43, "queen": 0.37, "grenadier": 0.42, "scout": 0.38, "commando": 0.40, "shield": 0.45}
const REMOTE_TYPE_SCALE := {"pawn": 1.248, "knight": 1.088, "rook": 1.376, "queen": 1.18, "grenadier": 1.34, "scout": 1.22, "commando": 1.27, "shield": 1.43}
const REMOTE_BODY_CENTER_Y := 31.0
const INTEGRATED_MUZZLE_SOURCE_PX := {
    "pawn": Vector2(10.0, 26.0),
    "knight": Vector2(11.0, 31.0),
    "rook": Vector2(12.0, 38.0),
    "queen": Vector2(11.0, 31.0),
    "grenadier": Vector2(10.0, 26.0),
    "scout": Vector2(10.0, 26.0),
    "commando": Vector2(4.0, 27.0),
    "shield": Vector2(10.0, 38.0),
}
const ENEMY_VISUAL_SCALE := 1.18
const TYPE_FPS := {"pawn": 6.0, "knight": 9.0, "rook": 4.0, "queen": 8.0, "grenadier": 5.5, "scout": 8.5, "commando": 7.5, "shield": 3.6}
const TYPE_TINT := {
    "queen": Color(1.0, 0.76, 0.78, 1.0),
    "grenadier": Color(0.82, 0.92, 0.72, 1.0),
    "scout": Color(0.78, 0.90, 1.0, 1.0),
    "commando": Color(0.96, 0.84, 0.68, 1.0),
    "shield": Color(0.80, 0.84, 0.90, 1.0),
}
const WEAPON_FRAME := {"pistol": 0, "machinegun": 1, "shotgun": 2, "panzerfaust": 3}
const WEAPON_POSE := {
    "pistol": {"position": Vector2(18.0, -45.0), "rotation": -0.03, "scale": Vector2(0.20, 0.20), "muzzle": Vector2(38.0, 0.0)},
    "machinegun": {"position": Vector2(17.0, -44.0), "rotation": -0.04, "scale": Vector2(0.23, 0.23), "muzzle": Vector2(52.0, -1.0)},
    "shotgun": {"position": Vector2(18.0, -43.0), "rotation": -0.04, "scale": Vector2(0.24, 0.24), "muzzle": Vector2(57.0, -1.0)},
    "panzerfaust": {"position": Vector2(13.0, -45.0), "rotation": -0.07, "scale": Vector2(0.27, 0.27), "muzzle": Vector2(61.0, -2.0)},
}

static var _cached_body_texture: Texture2D
static var _cached_body_is_legacy := false
static var _body_texture_failed := false
static var _body_texture_loading := false
static var _body_texture_waiters: Array = []

var enemy_type := "pawn"
var weapon := "pistol"
var visual_height := 62.0
var hp := 1
var max_hp := 1
var moving := false
var movement_speed_scale := 1.0
var dead := false
var _last_hp := 1
var _frame_time := 0.0
var _frame := 0
var _fire_flash := 0.0
var _visual_time := 0.0
var _bishop_shell_telegraph := 0.0
var _bishop_suppression_telegraph := 0.0
var _using_remote_body := false
var _using_legacy_remote_body := false
var _idle_pose := ""
var _surprise_remaining := 0.0

var _facing_root: Node2D
var _body: Sprite2D
var _weapon_root: Marker2D
var _weapon_sprite: Sprite2D
var _muzzle: Marker2D
var _muzzle_flash: Polygon2D
var _body_request: HTTPRequest
var _body_request_url := ""

func _ready() -> void:
    _build_nodes()
    _apply_type()
    _apply_weapon()
    _request_body_atlas()
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
        _request_body_atlas()
        queue_redraw()

func sync_state(world_x: float, floor_y: float, facing: float, is_moving: bool, current_hp: int, total_hp: int, move_speed_scale: float = 1.0) -> void:
    position = Vector2(world_x, floor_y)
    if _facing_root != null:
        _facing_root.scale.x = -1.0 if facing < 0.0 else 1.0
    moving = is_moving
    movement_speed_scale = clampf(move_speed_scale, 0.35, 2.8) if moving else 1.0
    max_hp = maxi(1, total_hp)
    hp = maxi(0, current_hp)
    if hp < _last_hp and hp > 0:
        _play_hurt()
    if hp <= 0 and not dead:
        _play_death()
    _last_hp = hp
    queue_redraw()

func set_idle_state(pose: String, surprise_strength: float = 0.0) -> void:
    _idle_pose = pose
    _surprise_remaining = maxf(_surprise_remaining, surprise_strength)
    _apply_idle_pose()
    queue_redraw()

func _apply_idle_pose() -> void:
    if _facing_root == null or dead:
        return
    _facing_root.position = Vector2.ZERO
    _facing_root.rotation = 0.0
    if _weapon_root != null:
        var pose: Dictionary = WEAPON_POSE.get(weapon, WEAPON_POSE["pistol"])
        _weapon_root.position = pose["position"]
        _weapon_root.rotation = float(pose["rotation"])
    if _idle_pose == "sit":
        _facing_root.position.y = 14.0
        if _weapon_root != null:
            _weapon_root.position += Vector2(-6.0, 12.0)
            _weapon_root.rotation += 0.58
    elif _idle_pose == "lean":
        _facing_root.rotation = -0.07
        _facing_root.position.y = 5.0
        if _weapon_root != null:
            _weapon_root.position += Vector2(-4.0, 8.0)
            _weapon_root.rotation += 0.38
    elif _idle_pose == "rest":
        _facing_root.position.y = 9.0
        if _weapon_root != null:
            _weapon_root.position += Vector2(-7.0, 10.0)
            _weapon_root.rotation += 0.48

func set_bishop_telegraph(shell_strength: float, suppression_strength: float) -> void:
    if enemy_type != "bishop":
        return
    _bishop_shell_telegraph = clampf(shell_strength, 0.0, 1.0)
    _bishop_suppression_telegraph = clampf(suppression_strength, 0.0, 1.0)
    if _muzzle_flash != null:
        _muzzle_flash.color = Color("ff5b3d") if _bishop_suppression_telegraph > _bishop_shell_telegraph else Color("ffb347")
    queue_redraw()

func play_fire() -> void:
    if dead or _weapon_root == null:
        return
    if _uses_integrated_body_weapon():
        _fire_flash = 0.0
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
    _visual_time += delta
    _fire_flash = maxf(0.0, _fire_flash - delta)
    _surprise_remaining = maxf(0.0, _surprise_remaining - delta)
    if _muzzle_flash != null:
        # Cast-v2 already contains the authored weapon and its silhouette.
        # Do not flash at the legacy overlay socket underneath that weapon.
        _muzzle_flash.visible = _fire_flash > 0.0 and not _uses_integrated_body_weapon()

    if enemy_type == "bishop":
        queue_redraw()
        return
    if moving:
        _frame_time += delta * float(TYPE_FPS.get(enemy_type, 6.0)) * movement_speed_scale
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

    if _cached_body_texture != null:
        _install_remote_body_texture(_cached_body_texture)
        return

    if _body_texture_failed:
        _install_fallback_body_texture()
        return

    # A healthy cast-v2 request is still pending. Keep both body and the legacy
    # weapon overlay hidden; fallback art is reserved for a confirmed failure.
    _body.visible = false
    if _weapon_sprite != null:
        _weapon_sprite.visible = false

func _apply_body_frame() -> void:
    if _body == null or not _body.visible:
        return

    if _using_remote_body:
        var row_map: Dictionary = LEGACY_REMOTE_TYPE_ROW if _using_legacy_remote_body else REMOTE_TYPE_ROW
        var row := int(row_map.get(enemy_type, 0))
        _body.region_rect = Rect2(
            Vector2(float(_frame) * REMOTE_FRAME_SIZE.x, float(row) * REMOTE_FRAME_SIZE.y),
            REMOTE_FRAME_SIZE,
        )
        return

    var base := int(FALLBACK_TYPE_FRAME_BASE.get(enemy_type, 0))
    _body.region_rect = Rect2(
        Vector2(float(base + _frame) * FALLBACK_FRAME_SIZE.x, 0.0),
        FALLBACK_FRAME_SIZE,
    )

func _request_body_atlas() -> void:
    if enemy_type == "bishop":
        return
    if _cached_body_texture != null:
        _install_remote_body_texture(_cached_body_texture)
        return
    if _body_texture_failed:
        _install_fallback_body_texture()
        return
    if not _body_texture_waiters.has(self):
        _body_texture_waiters.append(self)
    if _body_texture_loading:
        return

    _body_texture_loading = true
    _start_body_atlas_request(BODY_ATLAS_V2_URL)


func _start_body_atlas_request(url: String) -> void:
    if _body_request != null:
        _body_request.queue_free()
    _body_request_url = url
    _body_request = HTTPRequest.new()
    _body_request.name = "EnemyBodyAtlasRequest"
    add_child(_body_request)
    _body_request.request_completed.connect(_on_body_atlas_loaded)
    if _body_request.request(url) != OK:
        if url == BODY_ATLAS_V2_URL:
            _start_body_atlas_request(BODY_ATLAS_URL)
        else:
            _finish_body_atlas_request(null)

func _on_body_atlas_loaded(
    result: int,
    response_code: int,
    _headers: PackedStringArray,
    bytes: PackedByteArray,
) -> void:
    if _body_request != null:
        _body_request.queue_free()
        _body_request = null

    var is_legacy := _body_request_url == BODY_ATLAS_URL
    var expected_rows := LEGACY_REMOTE_ATLAS_ROWS if is_legacy else REMOTE_ATLAS_ROWS
    var texture: Texture2D = null
    if result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300:
        var image := Image.new()
        if (
            image.load_webp_from_buffer(bytes) == OK
            and image.get_width() == int(REMOTE_FRAME_SIZE.x) * FRAMES_PER_TYPE
            and image.get_height() == int(REMOTE_FRAME_SIZE.y) * expected_rows
        ):
            texture = ImageTexture.create_from_image(image)
            _cached_body_texture = texture
            _cached_body_is_legacy = is_legacy

    if texture == null and not is_legacy:
        _start_body_atlas_request(BODY_ATLAS_URL)
        return
    _finish_body_atlas_request(texture)

func _finish_body_atlas_request(texture: Texture2D) -> void:
    if _body_request != null:
        _body_request.queue_free()
        _body_request = null
    _body_texture_loading = false
    _body_texture_failed = texture == null

    var waiters := _body_texture_waiters.duplicate()
    _body_texture_waiters.clear()
    for waiter in waiters:
        if not is_instance_valid(waiter):
            continue
        if texture == null:
            waiter.call("_install_fallback_body_texture")
        else:
            waiter.call("_install_remote_body_texture", texture)

func _install_fallback_body_texture() -> void:
    if _body == null or enemy_type == "bishop":
        return
    var texture := load(BODY_FALLBACK_ATLAS_PATH) as Texture2D
    if texture == null:
        _body.visible = false
        if _weapon_sprite != null:
            _weapon_sprite.visible = false
        return
    _using_remote_body = false
    _using_legacy_remote_body = false
    _body.texture = texture
    _body.visible = true
    _body.modulate = TYPE_TINT.get(enemy_type, Color.WHITE)
    var body_scale := float(FALLBACK_TYPE_SCALE.get(enemy_type, 0.39)) * ENEMY_VISUAL_SCALE
    _body.scale = Vector2(body_scale, body_scale)
    _body.position = Vector2(0.0, -98.0 * body_scale)
    _apply_weapon()
    _apply_body_frame()

func _install_remote_body_texture(texture: Texture2D) -> void:
    if texture == null or _body == null or enemy_type == "bishop":
        return
    _body_texture_failed = false
    _using_remote_body = true
    _using_legacy_remote_body = _cached_body_is_legacy
    _body.texture = texture
    _body.visible = true
    _body.modulate = TYPE_TINT.get(enemy_type, Color.WHITE)
    var body_scale := float(REMOTE_TYPE_SCALE.get(enemy_type, 1.248)) * ENEMY_VISUAL_SCALE
    # The canonical enemy raster is authored facing left. Weapon/muzzle sockets
    # remain authored facing right, so flip only the body inside FacingRoot.
    _body.scale = Vector2(-body_scale, body_scale)
    _body.position = Vector2(0.0, -REMOTE_BODY_CENTER_Y * body_scale)
    _apply_weapon()
    _apply_body_frame()

func _uses_integrated_body_weapon() -> bool:
    return _using_remote_body and not _using_legacy_remote_body and enemy_type != "bishop"

func _integrated_muzzle_position() -> Vector2:
    var source: Vector2 = INTEGRATED_MUZZLE_SOURCE_PX.get(enemy_type, Vector2(10.0, 30.0))
    var body_scale := float(REMOTE_TYPE_SCALE.get(enemy_type, 1.248)) * ENEMY_VISUAL_SCALE
    return Vector2(
        (REMOTE_FRAME_SIZE.x * 0.5 - source.x) * body_scale,
        (source.y - REMOTE_FRAME_SIZE.y * 0.5 - REMOTE_BODY_CENTER_Y) * body_scale,
    )

func _apply_weapon() -> void:
    if _weapon_sprite == null:
        return
    if (
        enemy_type != "bishop"
        and _cached_body_texture == null
        and not _body_texture_failed
        and not _body.visible
    ):
        _weapon_sprite.visible = false
        _muzzle_flash.visible = false
        return

    var integrated_weapon := _uses_integrated_body_weapon()
    if integrated_weapon:
        _weapon_sprite.visible = false
        _weapon_root.position = Vector2.ZERO
        _weapon_root.rotation = 0.0
        _muzzle.position = _integrated_muzzle_position()
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
    var type_y_adjust := 0.0
    match enemy_type:
        "bishop":
            type_y_adjust = -7.0
        "queen":
            type_y_adjust = -2.0
        "grenadier":
            type_y_adjust = 3.0
        "rook":
            type_y_adjust = 2.0
        "scout":
            type_y_adjust = 1.0
        "commando":
            type_y_adjust = -1.0
        "shield":
            type_y_adjust = 4.0
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
    if _idle_pose != "":
        _draw_idle_prop()
    if _surprise_remaining > 0.0:
        var pulse := 0.80 + 0.20 * sin(_visual_time * 18.0)
        draw_circle(Vector2(0.0, -visual_height - 46.0), 13.0, Color(0.98, 0.76, 0.20, 0.16 * pulse))
        draw_string(
            ThemeDB.fallback_font,
            Vector2(-4.0, -visual_height - 40.0),
            "!",
            HORIZONTAL_ALIGNMENT_LEFT,
            -1.0,
            22,
            Color(1.0, 0.86, 0.28, pulse),
        )
    if enemy_type == "bishop":
        _draw_bishop()
    elif enemy_type in ["queen", "grenadier", "scout", "commando", "shield"]:
        _draw_variant_backdrop()
    if hp <= 0:
        return
    var hp_width := maxf(44.0, visual_height * 0.72)
    var hp_ratio := clampf(float(hp) / float(max_hp), 0.0, 1.0)
    var bar_y := -visual_height - 28.0
    draw_rect(Rect2(Vector2(-hp_width * 0.5, bar_y), Vector2(hp_width, 6.0)), Color("2f3438"), true)
    draw_rect(Rect2(Vector2(-hp_width * 0.5, bar_y), Vector2(hp_width * hp_ratio, 6.0)), Color("c7634e"), true)

func _draw_variant_backdrop() -> void:
    var h := visual_height
    if enemy_type == "queen":
        var cape := PackedVector2Array([
            Vector2(-h * 0.30, -h * 0.78),
            Vector2(h * 0.20, -h * 0.76),
            Vector2(h * 0.34, -h * 0.12),
            Vector2(-h * 0.24, -h * 0.10),
        ])
        draw_colored_polygon(cape, Color(0.42, 0.05, 0.08, 0.72))
        draw_polyline(PackedVector2Array([
            Vector2(-h * 0.17, -h * 1.02),
            Vector2(-h * 0.06, -h * 1.16),
            Vector2(0.0, -h * 1.06),
            Vector2(h * 0.07, -h * 1.18),
            Vector2(h * 0.18, -h * 1.02),
        ]), Color("d7b45c"), 4.0)
    elif enemy_type == "grenadier":
        draw_rect(Rect2(Vector2(-h * 0.31, -h * 0.70), Vector2(h * 0.62, h * 0.50)), Color(0.10, 0.14, 0.08, 0.78), true)
        for x in [-0.21, 0.0, 0.21]:
            draw_circle(Vector2(h * x, -h * 0.43), maxf(3.0, h * 0.055), Color("58624a"))
            draw_line(Vector2(h * x, -h * 0.49), Vector2(h * x, -h * 0.56), Color("b9a66b"), 2.0)
    elif enemy_type == "scout":
        draw_line(Vector2(h * 0.14, -h * 0.92), Vector2(h * 0.20, -h * 1.18), Color("252b31"), 3.0)
        draw_circle(Vector2(h * 0.205, -h * 1.19), maxf(2.5, h * 0.035), Color("79b7d8"))
        draw_polyline(PackedVector2Array([
            Vector2(-h * 0.25, -h * 0.69),
            Vector2(0.0, -h * 0.61),
            Vector2(h * 0.23, -h * 0.70),
        ]), Color("8eb8c9"), 5.0)
    elif enemy_type == "commando":
        draw_rect(Rect2(Vector2(-h * 0.30, -h * 0.72), Vector2(h * 0.60, h * 0.46)), Color(0.12, 0.10, 0.07, 0.76), true)
        draw_rect(Rect2(Vector2(-h * 0.44, -h * 0.72), Vector2(h * 0.18, h * 0.19)), Color(0.30, 0.27, 0.22, 0.92), true)
        draw_rect(Rect2(Vector2(h * 0.26, -h * 0.72), Vector2(h * 0.18, h * 0.19)), Color(0.30, 0.27, 0.22, 0.92), true)
        draw_line(Vector2(-h * 0.26, -h * 0.78), Vector2(h * 0.26, -h * 0.28), Color("b88a4d"), 5.0)
        draw_line(Vector2(h * 0.26, -h * 0.78), Vector2(-h * 0.26, -h * 0.28), Color("b88a4d"), 5.0)
    elif enemy_type == "shield":
        var shield := PackedVector2Array([
            Vector2(-h * 0.40, -h * 0.80),
            Vector2(h * 0.30, -h * 0.80),
            Vector2(h * 0.37, -h * 0.34),
            Vector2(0.0, -h * 0.12),
            Vector2(-h * 0.42, -h * 0.34),
        ])
        draw_colored_polygon(shield, Color(0.20, 0.24, 0.28, 0.88))
        var shield_outline := shield.duplicate()
        shield_outline.append(shield[0])
        draw_polyline(shield_outline, Color("aab4bf"), 4.0)


func _draw_idle_prop() -> void:
    var h := visual_height
    match _idle_pose:
        "sit":
            draw_rect(
                Rect2(Vector2(-h * 0.24, -h * 0.20), Vector2(h * 0.46, h * 0.18)),
                Color("4c4332"),
                true,
            )
            draw_line(Vector2(-h * 0.18, -h * 0.03), Vector2(-h * 0.20, h * 0.16), Color("2d2b24"), 4.0)
            draw_line(Vector2(h * 0.14, -h * 0.03), Vector2(h * 0.18, h * 0.16), Color("2d2b24"), 4.0)
        "lean":
            draw_line(Vector2(h * 0.36, -h * 0.96), Vector2(h * 0.40, h * 0.10), Color("30383a"), 7.0)
        "rest":
            draw_rect(
                Rect2(Vector2(-h * 0.33, -h * 0.10), Vector2(h * 0.66, h * 0.12)),
                Color("3b4638"),
                true,
            )

func _draw_bishop() -> void:
    var h := visual_height
    var body_top := -h * 0.72
    var body_bottom := -4.0
    var telegraph := maxf(_bishop_shell_telegraph, _bishop_suppression_telegraph)
    if telegraph > 0.015:
        var suppression := _bishop_suppression_telegraph > _bishop_shell_telegraph
        var warning_color := Color("ff5b3d") if suppression else Color("ffb347")
        var pulse := 0.82 + 0.18 * sin(_visual_time * (18.0 if suppression else 13.0))
        var warning_radius := h * (0.42 + telegraph * 0.08 * pulse)
        draw_arc(Vector2(0.0, -h * 0.54), warning_radius, 0.0, TAU, 40, Color(warning_color.r, warning_color.g, warning_color.b, 0.35 + telegraph * 0.48), 5.0)
        draw_circle(Vector2(-h * 0.27, -h * 0.60), 5.0 + telegraph * 3.0, warning_color)
        draw_circle(Vector2(h * 0.27, -h * 0.60), 5.0 + telegraph * 3.0, warning_color)

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
    var visor_color := Color("ff735c") if telegraph > 0.0 else Color("e36d5a")
    draw_circle(Vector2(-h * 0.06, -h * 0.83), 3.0 + telegraph * 1.5, visor_color)
    draw_circle(Vector2(h * 0.06, -h * 0.83), 3.0 + telegraph * 1.5, visor_color)

func draw_ellipse_shadow(center: Vector2, radii: Vector2, color: Color) -> void:
    var points := PackedVector2Array()
    for i in range(24):
        var a := TAU * float(i) / 24.0
        points.append(center + Vector2(cos(a) * radii.x, sin(a) * radii.y))
    draw_colored_polygon(points, color)
