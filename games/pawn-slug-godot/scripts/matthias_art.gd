extends Node2D

# Godot-native 2D Matthias visual controller.
# Matthias is always rendered from the approved canonical full-body weapon atlases.
# There is no generic motion-body fallback and firing never swaps character identity.
const FRAME_SIZE := Vector2(192.0, 192.0)
const ATLAS_ROWS := 5
const PLAYER_FOOT_Y := 42.0
const BODY_SCALE := 0.67
const BODY_CENTER_TO_FOOT := 72.0
const MUZZLE_FLASH_SECONDS := 0.055
const JUMP_VISUAL_SPEED_RANGE := 610.0
const AIR_APEX_SPEED := 90.0

const WEAPON_URLS := {
    "pistol": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-42a01598d26b6ded.webp",
    "machinegun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/machinegun/matthias_machinegun_canonical_v2-ed37fd69ea1f6ae9.webp",
    "shotgun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/shotgun/matthias_shotgun_canonical_v4-c12321f2afe18cf4.webp",
    "panzerfaust": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/panzerfaust/matthias_panzerfaust_canonical_v4-37db67d27387fde0.webp",
}
const WEAPON_COLUMNS := {
    "pistol": 4,
    "machinegun": 16,
    "shotgun": 16,
    "panzerfaust": 16,
}
const WEAPON_SOURCE_FACING := {
    "pistol": 1.0,
    "machinegun": -1.0,
    "shotgun": -1.0,
    "panzerfaust": -1.0,
}
const ACTION_ROWS := {
    "idle": 0,
    "walk": 1,
    "run": 2,
    "crouch": 3,
    "jump": 4,
}
const PISTOL_ACTION_COUNTS := {
    "idle": 1,
    "walk": 4,
    "run": 4,
    "crouch": 1,
    "jump": 1,
}
const PREMIUM_ACTION_COUNTS := {
    "idle": 10,
    "walk": 10,
    "run": 16,
    "crouch": 10,
    "jump": 9,
}
const ACTION_FPS := {
    "idle": 6.0,
    "walk": 10.0,
    "run": 8.0,
    "crouch": 8.0,
    "jump": 9.0,
}
const WEAPON_MOTION_SCALE := {
    "pistol": 1.0,
    "machinegun": 0.96,
    "shotgun": 0.90,
    "panzerfaust": 0.78,
}
const WEAPON_RECOIL_PIXELS := {
    "pistol": 4.0,
    "machinegun": 3.0,
    "shotgun": 7.0,
    "panzerfaust": 10.0,
}
const WEAPON_FLASH_SCALE := {
    "pistol": Vector2(0.75, 0.75),
    "machinegun": Vector2(0.95, 0.95),
    "shotgun": Vector2(1.20, 1.20),
    "panzerfaust": Vector2(1.55, 1.55),
}
const WEAPON_MUZZLE_POSES := {
    "pistol": {
        "idle": Vector2(54.0, -55.0), "walk": Vector2(55.0, -54.0), "run": Vector2(58.0, -53.0),
        "crouch": Vector2(58.0, -39.0), "jump": Vector2(56.0, -54.0), "apex": Vector2(57.0, -53.0), "fall": Vector2(56.0, -52.0),
    },
    "machinegun": {
        "idle": Vector2(68.0, -53.0), "walk": Vector2(70.0, -53.0), "run": Vector2(72.0, -51.0),
        "crouch": Vector2(72.0, -38.0), "jump": Vector2(69.0, -52.0), "apex": Vector2(70.0, -51.0), "fall": Vector2(69.0, -50.0),
    },
    "shotgun": {
        "idle": Vector2(74.0, -52.0), "walk": Vector2(76.0, -51.0), "run": Vector2(78.0, -50.0),
        "crouch": Vector2(79.0, -37.0), "jump": Vector2(75.0, -51.0), "apex": Vector2(76.0, -50.0), "fall": Vector2(75.0, -49.0),
    },
    "panzerfaust": {
        "idle": Vector2(73.0, -52.0), "walk": Vector2(75.0, -51.0), "run": Vector2(78.0, -48.0),
        "crouch": Vector2(78.0, -36.0), "jump": Vector2(74.0, -50.0), "apex": Vector2(75.0, -49.0), "fall": Vector2(74.0, -48.0),
    },
}

static var _cached_weapon_frames: Dictionary = {}

var _body_ready := false
var _weapon := "pistol"
var _action := "idle"
var _facing := 1.0
var _vertical_speed := 0.0
var _on_floor := false
var _crouching := false
var _muzzle_remaining := 0.0
var _hurt_remaining := 0.0
var _invuln_remaining := 0.0
var _dead := false
var _was_hurt := false
var _was_dead := false
var _request_serial := 0
var _requested_weapon := ""

var _facing_root: Node2D
var _fx_root: Node2D
var _body: AnimatedSprite2D
var _muzzle: Marker2D
var _muzzle_flash: Polygon2D
var _fx_player: AnimationPlayer

func _ready() -> void:
    _build_native_nodes()
    _build_fx_animations()
    _ensure_weapon_atlas()

func body_ready() -> bool:
    return _body_ready

func current_weapon() -> String:
    return _weapon

func set_weapon(kind: String) -> void:
    var next_weapon := kind if WEAPON_URLS.has(kind) else "pistol"
    if next_weapon == _weapon and (_body_ready or _requested_weapon == next_weapon):
        return
    _weapon = next_weapon
    _body_ready = false
    if _body != null:
        _body.visible = false
    _request_serial += 1
    _ensure_weapon_atlas()
    _sync_muzzle_pose()
    _sync_shoot_visibility()

func set_combat_state(
    hurt_remaining: float,
    invuln_remaining: float,
    dead: bool,
    _death_progress: float,
) -> void:
    _hurt_remaining = maxf(0.0, hurt_remaining)
    _invuln_remaining = maxf(0.0, invuln_remaining)
    _dead = dead

    var hurt_now := _hurt_remaining > 0.0
    if hurt_now and not _was_hurt and not _dead:
        _play_directional_fx("hurt")
    if _dead and not _was_dead:
        _play_directional_fx("death")
        if _body != null:
            _body.pause()
    elif not _dead and _was_dead:
        _reset_fx_transform()
        _play_body_action(_action, true)

    _was_hurt = hurt_now
    _was_dead = _dead
    _sync_modulate()
    _sync_shoot_visibility()

func update_visual(
    delta: float,
    horizontal_speed_ratio: float,
    on_floor: bool,
    crouching: bool,
    landed_now: bool,
    vertical_speed: float,
    facing: float,
    fired_now: bool,
) -> void:
    _facing = -1.0 if facing < 0.0 else 1.0
    _vertical_speed = vertical_speed
    _on_floor = on_floor
    _crouching = crouching and on_floor
    _facing_root.scale.x = _facing

    if landed_now and not _dead:
        _play_fx("land")
    if fired_now and not _dead and _hurt_remaining <= 0.0:
        _play_recoil_fx()
        _muzzle_remaining = MUZZLE_FLASH_SECONDS

    _muzzle_remaining = maxf(0.0, _muzzle_remaining - delta)

    var next_action := _resolve_action(horizontal_speed_ratio, on_floor, _crouching)
    if next_action != _action:
        _action = next_action
        _play_body_action(_action)
    elif _action == "jump" and _body_ready:
        _sync_jump_frame()

    _sync_muzzle_pose()
    _sync_modulate()
    _sync_shoot_visibility()

func _resolve_action(horizontal_speed_ratio: float, on_floor: bool, crouching: bool) -> String:
    if not on_floor:
        return "jump"
    if crouching:
        return "crouch"
    if horizontal_speed_ratio > 0.65:
        return "run"
    if horizontal_speed_ratio > 0.08:
        return "walk"
    return "idle"

func _visual_pose_key() -> String:
    if _action != "jump":
        return _action
    if _vertical_speed < -AIR_APEX_SPEED:
        return "jump"
    if _vertical_speed > AIR_APEX_SPEED:
        return "fall"
    return "apex"

func _action_counts() -> Dictionary:
    return PISTOL_ACTION_COUNTS if _weapon == "pistol" else PREMIUM_ACTION_COUNTS

func _build_native_nodes() -> void:
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
    _fx_root.add_child(_body)

    _muzzle = Marker2D.new()
    _muzzle.name = "Muzzle"
    _fx_root.add_child(_muzzle)

    _muzzle_flash = Polygon2D.new()
    _muzzle_flash.name = "MuzzleFlash"
    _muzzle_flash.polygon = PackedVector2Array([
        Vector2(0.0, 0.0), Vector2(9.0, -3.0), Vector2(14.0, 0.0), Vector2(9.0, 3.0),
        Vector2(0.0, 0.0), Vector2(4.0, -7.0), Vector2(7.0, 0.0), Vector2(4.0, 7.0),
    ])
    _muzzle_flash.color = Color("ffd36a")
    _muzzle_flash.visible = false
    _muzzle.add_child(_muzzle_flash)

    _fx_player = AnimationPlayer.new()
    _fx_player.name = "AnimationPlayer"
    _fx_player.root_node = NodePath("..")
    add_child(_fx_player)

func _sync_muzzle_pose() -> void:
    if _muzzle == null:
        return
    var poses: Dictionary = WEAPON_MUZZLE_POSES.get(_weapon, WEAPON_MUZZLE_POSES["pistol"])
    _muzzle.position = poses.get(_visual_pose_key(), poses["idle"])
    _muzzle_flash.scale = WEAPON_FLASH_SCALE.get(_weapon, Vector2.ONE)

func _sync_shoot_visibility() -> void:
    if _body != null:
        _body.visible = _body_ready
    if _muzzle_flash != null:
        _muzzle_flash.visible = _muzzle_remaining > 0.0 and not _dead and _body_ready

func _ensure_weapon_atlas() -> void:
    if _cached_weapon_frames.has(_weapon):
        _install_weapon_frames(_weapon, _cached_weapon_frames[_weapon])
        return
    _request_weapon_atlas(_weapon, _request_serial)

func _request_weapon_atlas(weapon_id: String, serial: int) -> void:
    if _requested_weapon == weapon_id:
        return
    _requested_weapon = weapon_id
    var request := HTTPRequest.new()
    request.name = "CanonicalAtlasRequest_%s_%d" % [weapon_id, serial]
    add_child(request)
    request.request_completed.connect(_on_weapon_atlas_loaded.bind(weapon_id, serial, request))
    if request.request(String(WEAPON_URLS[weapon_id])) != OK:
        if _requested_weapon == weapon_id:
            _requested_weapon = ""
        request.queue_free()

func _on_weapon_atlas_loaded(
    result: int,
    response_code: int,
    _headers: PackedStringArray,
    bytes: PackedByteArray,
    weapon_id: String,
    serial: int,
    request: HTTPRequest,
) -> void:
    if is_instance_valid(request):
        request.queue_free()
    if _requested_weapon == weapon_id:
        _requested_weapon = ""
    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        return

    var image := Image.new()
    if image.load_webp_from_buffer(bytes) != OK:
        return
    var expected_columns := int(WEAPON_COLUMNS.get(weapon_id, 16))
    if image.get_width() != int(FRAME_SIZE.x) * expected_columns:
        return
    if image.get_height() != int(FRAME_SIZE.y) * ATLAS_ROWS:
        return

    var atlas := ImageTexture.create_from_image(image)
    var frames := _make_sprite_frames(atlas, weapon_id)
    _cached_weapon_frames[weapon_id] = frames
    if weapon_id == _weapon and serial == _request_serial:
        _install_weapon_frames(weapon_id, frames)

func _install_weapon_frames(weapon_id: String, frames: SpriteFrames) -> void:
    if weapon_id != _weapon or frames == null or _body == null:
        return
    _body.sprite_frames = frames
    var source_facing := float(WEAPON_SOURCE_FACING.get(weapon_id, 1.0))
    _body.scale = Vector2(BODY_SCALE * source_facing, BODY_SCALE)
    _body_ready = true
    _body.visible = true
    _body.speed_scale = float(WEAPON_MOTION_SCALE.get(_weapon, 1.0))
    _play_body_action(_action, true)
    _sync_shoot_visibility()

func _make_sprite_frames(atlas: Texture2D, weapon_id: String) -> SpriteFrames:
    var frames := SpriteFrames.new()
    if frames.has_animation("default"):
        frames.remove_animation("default")
    var counts: Dictionary = PISTOL_ACTION_COUNTS if weapon_id == "pistol" else PREMIUM_ACTION_COUNTS

    for action in ACTION_ROWS.keys():
        frames.add_animation(action)
        frames.set_animation_speed(action, float(ACTION_FPS[action]))
        frames.set_animation_loop(action, action in ["idle", "walk", "run"])
        var count := int(counts[action])
        for frame_index in range(count):
            var frame_texture := AtlasTexture.new()
            frame_texture.atlas = atlas
            frame_texture.region = Rect2(
                Vector2(frame_index * FRAME_SIZE.x, float(ACTION_ROWS[action]) * FRAME_SIZE.y),
                FRAME_SIZE,
            )
            frames.add_frame(action, frame_texture)
    return frames

func _play_body_action(action: String, force_restart := false) -> void:
    if not _body_ready or _dead:
        return
    _body.speed_scale = float(WEAPON_MOTION_SCALE.get(_weapon, 1.0))
    if not force_restart and _body.animation == action:
        return
    _body.play(action)
    if action == "jump":
        _body.pause()
        _sync_jump_frame()

func _sync_jump_frame() -> void:
    if not _body_ready or _body.animation != "jump":
        return
    var counts := _action_counts()
    var count := int(counts["jump"])
    if count <= 1:
        _body.frame = 0
        return
    var phase := clampf(
        (_vertical_speed + JUMP_VISUAL_SPEED_RANGE) / (JUMP_VISUAL_SPEED_RANGE * 2.0),
        0.0,
        1.0,
    )
    _body.frame = clampi(int(round(phase * float(count - 1))), 0, count - 1)

func _sync_modulate() -> void:
    if _fx_root == null:
        return
    var color := Color.WHITE
    if _dead:
        color = Color(0.72, 0.72, 0.72, 1.0)
    elif _hurt_remaining > 0.0:
        color = Color(1.0, 0.62, 0.62, 1.0)
    elif _invuln_remaining > 0.0:
        color.a = 1.0 if int(floor(_invuln_remaining * 18.0)) % 2 == 0 else 0.42
    _fx_root.modulate = color

func _build_fx_animations() -> void:
    var library := AnimationLibrary.new()
    for weapon in WEAPON_RECOIL_PIXELS.keys():
        var kick := float(WEAPON_RECOIL_PIXELS[weapon])
        library.add_animation("recoil_%s_right" % weapon, _make_transform_animation(0.11, Vector2(-kick, 0.0), 0.0, Vector2.ONE))
        library.add_animation("recoil_%s_left" % weapon, _make_transform_animation(0.11, Vector2(kick, 0.0), 0.0, Vector2.ONE))
    library.add_animation("hurt_right", _make_transform_animation(0.18, Vector2(-12.0, 0.0), deg_to_rad(6.0), Vector2(1.0, 0.965)))
    library.add_animation("hurt_left", _make_transform_animation(0.18, Vector2(12.0, 0.0), deg_to_rad(-6.0), Vector2(1.0, 0.965)))
    library.add_animation("land", _make_transform_animation(0.12, Vector2.ZERO, 0.0, Vector2(1.035, 0.945)))
    library.add_animation("death_right", _make_death_animation(1.0))
    library.add_animation("death_left", _make_death_animation(-1.0))
    _fx_player.add_animation_library("", library)

func _make_transform_animation(
    length: float,
    displacement: Vector2,
    rotation: float,
    scale_peak: Vector2,
) -> Animation:
    var animation := Animation.new()
    animation.length = length

    var position_track := animation.add_track(Animation.TYPE_VALUE)
    animation.track_set_path(position_track, NodePath("FacingRoot/FxRoot:position"))
    animation.track_insert_key(position_track, 0.0, Vector2.ZERO)
    animation.track_insert_key(position_track, length * 0.35, displacement)
    animation.track_insert_key(position_track, length, Vector2.ZERO)

    var rotation_track := animation.add_track(Animation.TYPE_VALUE)
    animation.track_set_path(rotation_track, NodePath("FacingRoot/FxRoot:rotation"))
    animation.track_insert_key(rotation_track, 0.0, 0.0)
    animation.track_insert_key(rotation_track, length * 0.35, rotation)
    animation.track_insert_key(rotation_track, length, 0.0)

    var scale_track := animation.add_track(Animation.TYPE_VALUE)
    animation.track_set_path(scale_track, NodePath("FacingRoot/FxRoot:scale"))
    animation.track_insert_key(scale_track, 0.0, Vector2.ONE)
    animation.track_insert_key(scale_track, length * 0.35, scale_peak)
    animation.track_insert_key(scale_track, length, Vector2.ONE)
    return animation

func _make_death_animation(direction: float) -> Animation:
    var animation := Animation.new()
    animation.length = 0.55

    var position_track := animation.add_track(Animation.TYPE_VALUE)
    animation.track_set_path(position_track, NodePath("FacingRoot/FxRoot:position"))
    animation.track_insert_key(position_track, 0.0, Vector2.ZERO)
    animation.track_insert_key(position_track, 0.55, Vector2(-direction * 10.0, 34.0))

    var rotation_track := animation.add_track(Animation.TYPE_VALUE)
    animation.track_set_path(rotation_track, NodePath("FacingRoot/FxRoot:rotation"))
    animation.track_insert_key(rotation_track, 0.0, 0.0)
    animation.track_insert_key(rotation_track, 0.55, deg_to_rad(82.0) * direction)

    var scale_track := animation.add_track(Animation.TYPE_VALUE)
    animation.track_set_path(scale_track, NodePath("FacingRoot/FxRoot:scale"))
    animation.track_insert_key(scale_track, 0.0, Vector2.ONE)
    animation.track_insert_key(scale_track, 0.55, Vector2(1.0, 0.82))
    return animation

func _play_recoil_fx() -> void:
    var side := "left" if _facing < 0.0 else "right"
    _play_fx("recoil_%s_%s" % [_weapon, side])

func _play_directional_fx(prefix: String) -> void:
    _play_fx("%s_%s" % [prefix, "left" if _facing < 0.0 else "right"])

func _play_fx(animation_name: String) -> void:
    if _fx_player != null and _fx_player.has_animation(animation_name):
        _fx_player.play(animation_name)

func _reset_fx_transform() -> void:
    if _fx_player != null:
        _fx_player.stop()
    if _fx_root != null:
        _fx_root.position = Vector2.ZERO
        _fx_root.rotation = 0.0
        _fx_root.scale = Vector2.ONE
        _fx_root.modulate = Color.WHITE
