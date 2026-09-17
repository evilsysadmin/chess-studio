extends Node2D

# Pawn Slug Matthias stays 2D. Godot owns the animation runtime: authored raster
# sheets are sliced into SpriteFrames and AnimatedSprite2D plays them directly.
# The full-v2 contract is an 8 x 10 sheet (idle/walk/run/jump/fall/land/
# shoot/reload/hurt/die). Until those immutable R2 objects are published, the
# canonical pistol handoff already provides real walk/run frames and the old
# canonical master remains the safe fallback for missing weapon sheets.
const MASTER_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/master/matthias_canonical_sprite_sheet_v1-9c21264274777d01.png"
const MASTER_SIZE := Vector2i(1536, 1024)
const LEGACY_PISTOL_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-42a01598d26b6ded.webp"

# Future content-addressed full atlases are added here after R2 publication.
# The runtime needs no hand-cut rectangles for them: Godot normalizes and slices
# the sheet into frame textures itself.
const FULL_ATLAS_URLS := {
}
const FULL_ATLAS_COLUMNS := 8
const FULL_ATLAS_ROWS := 10
const NORMALIZED_FRAME_SIZE := 192
const NORMALIZED_FOOT_GUTTER := 24
const CELL_GUARD_PX := 2
const BODY_SCALE := 0.67
const PLAYER_FOOT_Y := 42.0
const BODY_CENTER_TO_FOOT := 72.0
const MUZZLE_FLASH_SECONDS := 0.055

const FULL_ACTION_ORDER := [
    "idle", "walk", "run", "jump", "fall", "land", "shoot", "reload", "hurt", "die",
]
const FULL_ACTIONS := {
    "idle": {"row": 0, "count": 4, "fps": 6.0, "loop": true},
    "walk": {"row": 1, "count": 6, "fps": 10.0, "loop": true},
    "run": {"row": 2, "count": 6, "fps": 12.0, "loop": true},
    "jump": {"row": 3, "count": 4, "fps": 10.0, "loop": false},
    "fall": {"row": 4, "count": 4, "fps": 8.0, "loop": true},
    "land": {"row": 5, "count": 4, "fps": 12.0, "loop": false},
    "shoot": {"row": 6, "count": 6, "fps": 15.0, "loop": false},
    "reload": {"row": 7, "count": 6, "fps": 10.0, "loop": false},
    "hurt": {"row": 8, "count": 4, "fps": 12.0, "loop": false},
    "die": {"row": 9, "count": 8, "fps": 9.0, "loop": false},
}
const LEGACY_PISTOL_ACTIONS := {
    "idle": {"row": 0, "count": 1, "fps": 6.0, "loop": true},
    "walk": {"row": 1, "count": 4, "fps": 9.0, "loop": true},
    "run": {"row": 2, "count": 4, "fps": 12.0, "loop": true},
    "crouch": {"row": 3, "count": 1, "fps": 1.0, "loop": true},
    "jump": {"row": 4, "count": 1, "fps": 1.0, "loop": false},
}

# Exact source-pixel crops from the approved canonical master. These exist only
# as a graceful fallback while a weapon has no full authored animation sheet.
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

static var _full_frames_by_weapon: Dictionary = {}
static var _legacy_pistol_frames: SpriteFrames
static var _fallback_frames_by_weapon: Dictionary = {}
static var _master_texture: Texture2D

var _weapon := "pistol"
var _action := "idle"
var _body_ready := false
var _using_full_atlas := false
var _dead := false
var _hurt_remaining := 0.0
var _invuln_remaining := 0.0
var _muzzle_remaining := 0.0
var _recoil_x := 0.0
var _facing := 1.0
var _one_shot_action := ""
var _hold_one_shot := false

var _facing_root: Node2D
var _fx_root: Node2D
var _weapon_root: Node2D
var _body: AnimatedSprite2D
var _muzzle: Marker2D
var _flash: Polygon2D
var _master_request: HTTPRequest
var _atlas_request: HTTPRequest
var _atlas_request_weapon := ""
var _atlas_request_layout := ""

func _ready() -> void:
    _build_nodes()
    _install_or_request_weapon()

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
    _using_full_atlas = false
    _one_shot_action = ""
    _hold_one_shot = false
    _body.visible = false
    _install_or_request_weapon()

func set_combat_state(hurt_remaining: float, invuln_remaining: float, dead: bool, death_progress: float) -> void:
    var became_dead := dead and not _dead
    _hurt_remaining = maxf(0.0, hurt_remaining)
    _invuln_remaining = maxf(0.0, invuln_remaining)
    _dead = dead
    if _dead:
        if _using_full_atlas and _animation_available("die"):
            _fx_root.rotation = 0.0
            _fx_root.position.y = 0.0
            if became_dead:
                _play_one_shot("die", true)
        else:
            var p := clampf(death_progress, 0.0, 1.0)
            _fx_root.rotation = deg_to_rad(82.0) * _facing * p
            _fx_root.position.y = 28.0 * p
    else:
        _fx_root.rotation = 0.0
        _fx_root.position.y = 0.0
        if _hold_one_shot:
            _hold_one_shot = false
            _one_shot_action = ""
    _sync_modulate()

func update_visual(delta: float, horizontal_speed_ratio: float, on_floor: bool, crouching: bool, landed_now: bool, vertical_speed: float, facing: float, fired_now: bool) -> void:
    _facing = -1.0 if facing < 0.0 else 1.0
    _facing_root.scale.x = _facing

    if _body_ready and not _dead:
        if _using_full_atlas and _hurt_remaining > 0.0 and _animation_available("hurt"):
            if _one_shot_action != "hurt":
                _play_one_shot("hurt")
        elif fired_now and _using_full_atlas and _animation_available("shoot"):
            if _one_shot_action == "shoot":
                _action = "shoot"
                _body.frame = 0
                _body.play("shoot")
            else:
                _play_one_shot("shoot")
        elif landed_now and _using_full_atlas and _animation_available("land") and _one_shot_action.is_empty():
            _play_one_shot("land")
        elif _one_shot_action.is_empty():
            var next := _resolve_action(horizontal_speed_ratio, on_floor, crouching and on_floor, vertical_speed)
            if next != _action:
                _action = next
                _play_action()

    var authored_shoot := _using_full_atlas and _animation_available("shoot")
    if fired_now and not _dead and _hurt_remaining <= 0.0 and not authored_shoot:
        _muzzle_remaining = MUZZLE_FLASH_SECONDS
        _recoil_x = -_facing * float(RECOIL.get(_weapon, 4.0))
    if landed_now and not _dead and not (_using_full_atlas and _animation_available("land")):
        _fx_root.scale = Vector2(1.03, 0.95)

    _muzzle_remaining = maxf(0.0, _muzzle_remaining - delta)
    _recoil_x = move_toward(_recoil_x, 0.0, 70.0 * delta)
    _fx_root.position.x = _recoil_x
    _fx_root.scale = _fx_root.scale.lerp(Vector2.ONE, minf(1.0, 12.0 * delta))
    _sync_muzzle()
    _sync_modulate()
    _flash.visible = _muzzle_remaining > 0.0 and _body_ready and not _dead and not authored_shoot

func _resolve_action(speed: float, on_floor: bool, crouching: bool, vertical_speed: float) -> String:
    if not on_floor:
        if vertical_speed > 40.0 and _animation_available("fall"):
            return "fall"
        return "jump"
    if crouching:
        return "crouch"
    if speed > 0.65:
        return "run"
    if speed > 0.08:
        return "walk"
    return "idle"

func _build_nodes() -> void:
    _facing_root = Node2D.new()
    _facing_root.name = "FacingRoot"
    _facing_root.position = Vector2(0.0, PLAYER_FOOT_Y)
    add_child(_facing_root)
    _fx_root = Node2D.new()
    _fx_root.name = "FxRoot"
    _facing_root.add_child(_fx_root)

    _body = AnimatedSprite2D.new()
    _body.name = "CanonicalBody"
    _body.position = Vector2(0.0, -BODY_CENTER_TO_FOOT * BODY_SCALE)
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _body.visible = false
    _body.animation_finished.connect(_on_animation_finished)
    _fx_root.add_child(_body)

    _weapon_root = Node2D.new()
    _weapon_root.name = "WeaponRoot"
    _fx_root.add_child(_weapon_root)
    _muzzle = Marker2D.new()
    _muzzle.name = "Muzzle"
    _weapon_root.add_child(_muzzle)
    _flash = Polygon2D.new()
    _flash.polygon = PackedVector2Array([Vector2.ZERO, Vector2(9,-3), Vector2(14,0), Vector2(9,3), Vector2.ZERO, Vector2(4,-7), Vector2(7,0), Vector2(4,7)])
    _flash.color = Color("ffd36a")
    _flash.visible = false
    _muzzle.add_child(_flash)

func _install_or_request_weapon() -> void:
    if _full_frames_by_weapon.has(_weapon):
        _install_frames(_full_frames_by_weapon[_weapon], true)
        return

    var full_url := String(FULL_ATLAS_URLS.get(_weapon, ""))
    if not full_url.is_empty():
        if _atlas_request == null:
            _request_atlas(_weapon, full_url, "full")
        if _weapon == "pistol" and _legacy_pistol_frames != null:
            _install_frames(_legacy_pistol_frames, false)
        elif _fallback_frames_by_weapon.has(_weapon):
            _install_frames(_fallback_frames_by_weapon[_weapon], false)
        else:
            _ensure_master()
        return

    if _weapon == "pistol":
        if _legacy_pistol_frames != null:
            _install_frames(_legacy_pistol_frames, false)
            return
        if _atlas_request == null:
            _request_atlas("pistol", LEGACY_PISTOL_ATLAS_URL, "legacy-pistol")
        return

    if _fallback_frames_by_weapon.has(_weapon):
        _install_frames(_fallback_frames_by_weapon[_weapon], false)
        return
    _ensure_master()

func _request_atlas(weapon_id: String, url: String, layout: String) -> void:
    if _atlas_request != null:
        return
    _atlas_request_weapon = weapon_id
    _atlas_request_layout = layout
    _atlas_request = HTTPRequest.new()
    add_child(_atlas_request)
    _atlas_request.request_completed.connect(_on_atlas_loaded)
    if _atlas_request.request(url) != OK:
        _atlas_request.queue_free()
        _atlas_request = null
        _atlas_request_weapon = ""
        _atlas_request_layout = ""
        _ensure_master()

func _on_atlas_loaded(result: int, response_code: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
    var requested_weapon := _atlas_request_weapon
    var requested_layout := _atlas_request_layout
    if _atlas_request != null:
        _atlas_request.queue_free()
        _atlas_request = null
    _atlas_request_weapon = ""
    _atlas_request_layout = ""

    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        _ensure_master()
        return
    var image := _decode_raster(bytes)
    if image == null:
        _ensure_master()
        return

    var frames: SpriteFrames
    if requested_layout == "full":
        frames = _build_full_frames(image)
        if frames != null:
            _full_frames_by_weapon[requested_weapon] = frames
    elif requested_layout == "legacy-pistol":
        frames = _build_legacy_pistol_frames(image)
        if frames != null:
            _legacy_pistol_frames = frames

    if requested_weapon == _weapon and frames != null:
        _install_frames(frames, requested_layout == "full")
    else:
        _install_or_request_weapon()

func _decode_raster(bytes: PackedByteArray) -> Image:
    var image := Image.new()
    if image.load_png_from_buffer(bytes) == OK:
        return image
    image = Image.new()
    if image.load_webp_from_buffer(bytes) == OK:
        return image
    return null

func _build_full_frames(image: Image) -> SpriteFrames:
    if image.get_width() < FULL_ATLAS_COLUMNS * 32 or image.get_height() < FULL_ATLAS_ROWS * 32:
        return null
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for action in FULL_ACTION_ORDER:
        var spec: Dictionary = FULL_ACTIONS[action]
        frames.add_animation(action)
        frames.set_animation_loop(action, bool(spec["loop"]))
        frames.set_animation_speed(action, float(spec["fps"]))
        for frame_index in range(int(spec["count"])):
            var texture := _normalized_cell_texture(
                image,
                int(spec["row"]),
                frame_index,
                FULL_ATLAS_COLUMNS,
                FULL_ATLAS_ROWS,
            )
            if texture == null:
                return null
            frames.add_frame(action, texture)

    # Crouch remains a gameplay state although the new authored sheet uses LAND.
    # Reuse the impact frame instead of inventing another character pose.
    frames.add_animation("crouch")
    frames.set_animation_loop("crouch", true)
    frames.set_animation_speed("crouch", 1.0)
    frames.add_frame("crouch", frames.get_frame_texture("land", 0))
    return frames

func _build_legacy_pistol_frames(image: Image) -> SpriteFrames:
    if image.get_size() != Vector2i(768, 960):
        return null
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for action in LEGACY_PISTOL_ACTIONS.keys():
        var spec: Dictionary = LEGACY_PISTOL_ACTIONS[action]
        frames.add_animation(action)
        frames.set_animation_loop(action, bool(spec["loop"]))
        frames.set_animation_speed(action, float(spec["fps"]))
        for frame_index in range(int(spec["count"])):
            var texture := _normalized_cell_texture(image, int(spec["row"]), frame_index, 4, 5)
            if texture == null:
                return null
            frames.add_frame(action, texture)
    return frames

func _normalized_cell_texture(image: Image, row: int, column: int, columns: int, rows: int) -> Texture2D:
    var x0 := int(floor(float(column) * float(image.get_width()) / float(columns)))
    var x1 := int(floor(float(column + 1) * float(image.get_width()) / float(columns)))
    var y0 := int(floor(float(row) * float(image.get_height()) / float(rows)))
    var y1 := int(floor(float(row + 1) * float(image.get_height()) / float(rows)))
    var guard := mini(CELL_GUARD_PX, maxi(0, int(mini(x1 - x0, y1 - y0) / 8)))
    var rect := Rect2i(
        x0 + guard,
        y0 + guard,
        maxi(1, x1 - x0 - guard * 2),
        maxi(1, y1 - y0 - guard * 2),
    )
    var cell := image.get_region(rect)
    cell.resize(NORMALIZED_FRAME_SIZE, NORMALIZED_FRAME_SIZE, Image.INTERPOLATE_LANCZOS)

    # AI-authored/contact-sheet sources are not always mathematically aligned.
    # Normalize the vertical foot anchor in Godot so every SpriteFrames texture
    # has identical dimensions and a stable ground pivot.
    var used := cell.get_used_rect()
    if used.size == Vector2i.ZERO:
        return null
    var desired_bottom := NORMALIZED_FRAME_SIZE - NORMALIZED_FOOT_GUTTER
    var actual_bottom := used.position.y + used.size.y
    var shift_y := desired_bottom - actual_bottom
    if shift_y != 0:
        var canvas := Image.create(NORMALIZED_FRAME_SIZE, NORMALIZED_FRAME_SIZE, false, Image.FORMAT_RGBA8)
        canvas.fill(Color(0.0, 0.0, 0.0, 0.0))
        var source_rect := Rect2i(0, 0, NORMALIZED_FRAME_SIZE, NORMALIZED_FRAME_SIZE)
        var destination := Vector2i(0, shift_y)
        if destination.y < 0:
            source_rect.position.y = -destination.y
            source_rect.size.y += destination.y
            destination.y = 0
        source_rect.size.y = mini(source_rect.size.y, NORMALIZED_FRAME_SIZE - destination.y)
        if source_rect.size.y > 0:
            canvas.blit_rect(cell, source_rect, destination)
        cell = canvas
    return ImageTexture.create_from_image(cell)

func _ensure_master() -> void:
    if _master_texture != null:
        _build_fallback_frames()
        _install_or_request_weapon()
        return
    if _master_request != null:
        return
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
    _build_fallback_frames()
    _install_or_request_weapon()

func _build_fallback_frames() -> void:
    if _master_texture == null or not _fallback_frames_by_weapon.is_empty():
        return
    for weapon_id in SOURCE_RECTS.keys():
        var frames := SpriteFrames.new()
        frames.remove_animation("default")
        var source: Dictionary = SOURCE_RECTS[weapon_id]
        for action in ["idle", "walk", "run", "crouch", "jump"]:
            frames.add_animation(action)
            frames.set_animation_loop(action, action in ["idle", "walk", "run"])
            frames.set_animation_speed(action, 1.0)
            var frame := AtlasTexture.new()
            frame.atlas = _master_texture
            frame.region = source[action]
            frames.add_frame(action, frame)
        _fallback_frames_by_weapon[weapon_id] = frames

func _install_frames(frames: SpriteFrames, authored_full: bool) -> void:
    _body.sprite_frames = frames
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _using_full_atlas = authored_full
    _body_ready = true
    _body.visible = true
    _one_shot_action = ""
    _hold_one_shot = false
    if not _animation_available(_action):
        _action = "idle"
    _play_action()
    _sync_muzzle()

func _animation_available(name: String) -> bool:
    return _body_ready and _body.sprite_frames != null and _body.sprite_frames.has_animation(name) and _body.sprite_frames.get_frame_count(name) > 0

func _play_action() -> void:
    if not _body_ready or _dead or not _animation_available(_action):
        return
    _body.play(_action)

func _play_one_shot(name: String, hold: bool = false) -> void:
    if not _animation_available(name):
        return
    _one_shot_action = name
    _hold_one_shot = hold
    _action = name
    _body.play(name)
    _body.frame = 0

func _on_animation_finished() -> void:
    if _one_shot_action.is_empty() or _hold_one_shot:
        return
    _one_shot_action = ""
    _action = ""

func _sync_muzzle() -> void:
    var poses: Dictionary = MUZZLE_POS.get(_weapon, MUZZLE_POS["pistol"])
    _muzzle.position = poses.get(_action, poses["idle"])
    var s := float(FLASH_SCALE.get(_weapon, 1.0))
    _flash.scale = Vector2(s, s)

func _sync_modulate() -> void:
    var color := Color.WHITE
    if _dead:
        color = Color(0.72, 0.72, 0.72, 1.0)
    elif _hurt_remaining > 0.0 and not (_using_full_atlas and _animation_available("hurt")):
        color = Color(1.0, 0.62, 0.62, 1.0)
    elif _invuln_remaining > 0.0:
        color.a = 1.0 if int(floor(_invuln_remaining * 18.0)) % 2 == 0 else 0.42
    _fx_root.modulate = color
