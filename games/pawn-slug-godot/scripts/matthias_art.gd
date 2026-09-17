extends Node2D

# Pawn Slug Matthias is sourced only from the reviewed 2D canonical master.
# Weapon changes select different authored rows; they never swap character identity.
const MASTER_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/master/matthias_canonical_sprite_sheet_v1-9c21264274777d01.png"
const MASTER_SIZE := Vector2i(1536, 1024)
const BODY_SCALE := 0.67
const PLAYER_FOOT_Y := 42.0
const BODY_CENTER_TO_FOOT := 72.0
const MUZZLE_FLASH_SECONDS := 0.055

# Exact source-pixel crops from the canonical sheet. Crouch intentionally uses
# the authored LAND pose at source scale, so Matthias becomes lower, not larger.
const SOURCE_RECTS := {
    "pistol": {
        "idle": Rect2i(135, 58, 90, 164), "walk": Rect2i(235, 58, 95, 164),
        "run": Rect2i(330, 58, 100, 164), "jump": Rect2i(430, 52, 110, 170),
        "crouch": Rect2i(715, 58, 110, 164),
    },
    "machinegun": {
        "idle": Rect2i(135, 278, 97, 157), "walk": Rect2i(235, 278, 95, 157),
        "run": Rect2i(330, 273, 105, 162), "jump": Rect2i(430, 268, 110, 167),
        "crouch": Rect2i(715, 278, 117, 157),
    },
    "shotgun": {
        "idle": Rect2i(130, 492, 112, 156), "walk": Rect2i(230, 492, 110, 156),
        "run": Rect2i(325, 487, 117, 161), "jump": Rect2i(425, 482, 127, 166),
        "crouch": Rect2i(710, 492, 132, 156),
    },
    "panzerfaust": {
        "idle": Rect2i(120, 710, 125, 155), "walk": Rect2i(220, 710, 125, 155),
        "run": Rect2i(320, 705, 130, 160), "jump": Rect2i(420, 700, 135, 165),
        "crouch": Rect2i(700, 710, 140, 155),
    },
}
const MUZZLE_POS := {
    "pistol": {"idle": Vector2(36,-37), "walk": Vector2(37,-36), "run": Vector2(39,-35), "crouch": Vector2(39,-26), "jump": Vector2(38,-36)},
    "machinegun": {"idle": Vector2(46,-36), "walk": Vector2(47,-36), "run": Vector2(48,-34), "crouch": Vector2(48,-26), "jump": Vector2(46,-35)},
    "shotgun": {"idle": Vector2(50,-35), "walk": Vector2(51,-34), "run": Vector2(52,-34), "crouch": Vector2(53,-25), "jump": Vector2(50,-34)},
    "panzerfaust": {"idle": Vector2(49,-35), "walk": Vector2(50,-34), "run": Vector2(52,-32), "crouch": Vector2(52,-24), "jump": Vector2(50,-33)},
}
const RECOIL := {"pistol": 4.0, "machinegun": 3.0, "shotgun": 7.0, "panzerfaust": 10.0}
const FLASH_SCALE := {"pistol": 0.75, "machinegun": 0.95, "shotgun": 1.20, "panzerfaust": 1.55}

static var _frames_by_weapon: Dictionary = {}
static var _master_texture: Texture2D

var _weapon := "pistol"
var _action := "idle"
var _body_ready := false
var _dead := false
var _hurt_remaining := 0.0
var _invuln_remaining := 0.0
var _muzzle_remaining := 0.0
var _recoil_x := 0.0
var _facing := 1.0

var _facing_root: Node2D
var _fx_root: Node2D
var _body: AnimatedSprite2D
var _muzzle: Marker2D
var _flash: Polygon2D
var _master_request: HTTPRequest

func _ready() -> void:
    _build_nodes()
    _ensure_master()

func body_ready() -> bool:
    return _body_ready

func current_weapon() -> String:
    return _weapon

func set_weapon(kind: String) -> void:
    var next := kind if SOURCE_RECTS.has(kind) else "pistol"
    if next == _weapon and _body_ready:
        return
    _weapon = next
    _body_ready = false
    _body.visible = false
    _install_or_request_weapon()

func set_combat_state(hurt_remaining: float, invuln_remaining: float, dead: bool, death_progress: float) -> void:
    _hurt_remaining = maxf(0.0, hurt_remaining)
    _invuln_remaining = maxf(0.0, invuln_remaining)
    _dead = dead
    if _dead:
        var p := clampf(death_progress, 0.0, 1.0)
        _fx_root.rotation = deg_to_rad(82.0) * _facing * p
        _fx_root.position.y = 28.0 * p
    else:
        _fx_root.rotation = 0.0
    _sync_modulate()

func update_visual(delta: float, horizontal_speed_ratio: float, on_floor: bool, crouching: bool, landed_now: bool, _vertical_speed: float, facing: float, fired_now: bool) -> void:
    _facing = -1.0 if facing < 0.0 else 1.0
    _facing_root.scale.x = _facing
    var next := _resolve_action(horizontal_speed_ratio, on_floor, crouching and on_floor)
    if next != _action:
        _action = next
        _play_action()

    if fired_now and not _dead and _hurt_remaining <= 0.0:
        _muzzle_remaining = MUZZLE_FLASH_SECONDS
        _recoil_x = -_facing * float(RECOIL.get(_weapon, 4.0))
    if landed_now and not _dead:
        _fx_root.scale = Vector2(1.03, 0.95)

    _muzzle_remaining = maxf(0.0, _muzzle_remaining - delta)
    _recoil_x = move_toward(_recoil_x, 0.0, 70.0 * delta)
    _fx_root.position.x = _recoil_x
    _fx_root.scale = _fx_root.scale.lerp(Vector2.ONE, minf(1.0, 12.0 * delta))
    _sync_muzzle()
    _sync_modulate()
    _flash.visible = _muzzle_remaining > 0.0 and _body_ready and not _dead

func _resolve_action(speed: float, on_floor: bool, crouching: bool) -> String:
    if not on_floor: return "jump"
    if crouching: return "crouch"
    if speed > 0.65: return "run"
    if speed > 0.08: return "walk"
    return "idle"

func _build_nodes() -> void:
    _facing_root = Node2D.new()
    _facing_root.position = Vector2(0.0, PLAYER_FOOT_Y)
    add_child(_facing_root)
    _fx_root = Node2D.new()
    _facing_root.add_child(_fx_root)

    _body = AnimatedSprite2D.new()
    _body.name = "CanonicalBody"
    _body.position = Vector2(0.0, -BODY_CENTER_TO_FOOT * BODY_SCALE)
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _body.visible = false
    _fx_root.add_child(_body)

    _muzzle = Marker2D.new()
    _fx_root.add_child(_muzzle)
    _flash = Polygon2D.new()
    _flash.polygon = PackedVector2Array([Vector2.ZERO, Vector2(9,-3), Vector2(14,0), Vector2(9,3), Vector2.ZERO, Vector2(4,-7), Vector2(7,0), Vector2(4,7)])
    _flash.color = Color("ffd36a")
    _flash.visible = false
    _muzzle.add_child(_flash)

func _ensure_master() -> void:
    if _master_texture != null:
        _build_all_frames()
        _install_or_request_weapon()
        return
    if _master_request != null: return
    _master_request = HTTPRequest.new()
    add_child(_master_request)
    _master_request.request_completed.connect(_on_master_loaded)
    if _master_request.request(MASTER_URL) != OK:
        _master_request.queue_free()
        _master_request = null
        push_error("Cannot request canonical 2D Matthias master")

func _on_master_loaded(result: int, response_code: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
    if _master_request != null:
        _master_request.queue_free()
        _master_request = null
    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        push_error("Cannot load canonical 2D Matthias master")
        return
    var image := Image.new()
    if image.load_png_from_buffer(bytes) != OK or image.get_size() != MASTER_SIZE:
        push_error("Canonical 2D Matthias master is invalid or changed dimensions")
        return
    _master_texture = ImageTexture.create_from_image(image)
    _build_all_frames()
    _install_or_request_weapon()

func _build_all_frames() -> void:
    if _master_texture == null or not _frames_by_weapon.is_empty(): return
    for weapon_id in SOURCE_RECTS.keys():
        var frames := SpriteFrames.new()
        frames.remove_animation("default")
        var source: Dictionary = SOURCE_RECTS[weapon_id]
        for action in ["idle", "walk", "run", "crouch", "jump"]:
            frames.add_animation(action)
            frames.set_animation_loop(action, action in ["idle", "walk", "run"])
            var frame := AtlasTexture.new()
            frame.atlas = _master_texture
            frame.region = source[action]
            frames.add_frame(action, frame)
        _frames_by_weapon[weapon_id] = frames

func _install_or_request_weapon() -> void:
    if not _frames_by_weapon.has(_weapon):
        _ensure_master()
        return
    _body.sprite_frames = _frames_by_weapon[_weapon]
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _body_ready = true
    _body.visible = true
    _play_action()
    _sync_muzzle()

func _play_action() -> void:
    if not _body_ready or _dead: return
    _body.play(_action)
    _body.pause()
    _body.frame = 0

func _sync_muzzle() -> void:
    var poses: Dictionary = MUZZLE_POS.get(_weapon, MUZZLE_POS["pistol"])
    _muzzle.position = poses.get(_action, poses["idle"])
    var s := float(FLASH_SCALE.get(_weapon, 1.0))
    _flash.scale = Vector2(s, s)

func _sync_modulate() -> void:
    var color := Color.WHITE
    if _dead:
        color = Color(0.72, 0.72, 0.72, 1.0)
    elif _hurt_remaining > 0.0:
        color = Color(1.0, 0.62, 0.62, 1.0)
    elif _invuln_remaining > 0.0:
        color.a = 1.0 if int(floor(_invuln_remaining * 18.0)) % 2 == 0 else 0.42
    _fx_root.modulate = color
