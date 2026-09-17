extends Node2D

# Godot-native 2D Matthias visual controller.
# The body uses the published 16x5 motion atlas and every weapon is a separate
# 2D sprite attached to a Marker2D. Gameplay only talks to this facade.
const MOTION_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/motion/matthias_motion_atlas_v5_payload-85988118befde412.webp"
const WEAPON_ATLAS_PATH := "res://assets/weapon_atlas.svg"
const FRAME_SIZE := Vector2(96.0, 96.0)
const ATLAS_COLUMNS := 16
const ATLAS_ROWS := 5
const PLAYER_FOOT_Y := 42.0
const BODY_SCALE := 1.34
const MUZZLE_FLASH_SECONDS := 0.055
const JUMP_VISUAL_SPEED_RANGE := 610.0

const ACTION_ROWS := {
    "idle": 0,
    "walk": 1,
    "run": 2,
    "crouch": 3,
    "jump": 4,
}
const ACTION_COUNTS := {
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
const WEAPON_FRAME := {
    "pistol": 0,
    "machinegun": 1,
    "shotgun": 2,
    "panzerfaust": 3,
}
const WEAPON_SCALE := {
    "pistol": Vector2(0.23, 0.23),
    "machinegun": Vector2(0.27, 0.27),
    "shotgun": Vector2(0.28, 0.28),
    "panzerfaust": Vector2(0.31, 0.31),
}
const WEAPON_MUZZLE_X := {
    "pistol": 38.0,
    "machinegun": 52.0,
    "shotgun": 57.0,
    "panzerfaust": 61.0,
}
const ACTION_WEAPON_POSITION := {
    "idle": Vector2(17.0, -55.0),
    "walk": Vector2(18.0, -55.0),
    "run": Vector2(20.0, -54.0),
    "crouch": Vector2(19.0, -39.0),
    "jump": Vector2(19.0, -55.0),
}
const ACTION_WEAPON_ROTATION := {
    "idle": 0.0,
    "walk": -0.02,
    "run": -0.045,
    "crouch": 0.0,
    "jump": -0.035,
}

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

var _facing_root: Node2D
var _fx_root: Node2D
var _body: AnimatedSprite2D
var _weapon_root: Marker2D
var _weapon_sprite: Sprite2D
var _muzzle: Marker2D
var _muzzle_flash: Polygon2D
var _fx_player: AnimationPlayer
var _art_request: HTTPRequest

func _ready() -> void:
    _build_native_nodes()
    _build_fx_animations()
    _load_weapon_texture()
    _request_motion_atlas()

func body_ready() -> bool:
    return _body_ready

func current_weapon() -> String:
    return _weapon

func set_weapon(kind: String) -> void:
    _weapon = kind if WEAPON_FRAME.has(kind) else "pistol"
    _apply_weapon_frame()
    _sync_weapon_pose()

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
        _play_directional_fx("recoil")
        _muzzle_remaining = MUZZLE_FLASH_SECONDS

    _muzzle_remaining = maxf(0.0, _muzzle_remaining - delta)
    if _muzzle_flash != null:
        _muzzle_flash.visible = _muzzle_remaining > 0.0 and not _dead

    var next_action := _resolve_action(horizontal_speed_ratio, on_floor, _crouching)
    if next_action != _action:
        _action = next_action
        _play_body_action(_action)
    elif _action == "jump" and _body_ready:
        _sync_jump_frame()

    _sync_weapon_pose()
    _sync_modulate()

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

func _build_native_nodes() -> void:
    _facing_root = Node2D.new()
    _facing_root.name = "FacingRoot"
    _facing_root.position = Vector2(0.0, PLAYER_FOOT_Y)
    add_child(_facing_root)

    _fx_root = Node2D.new()
    _fx_root.name = "FxRoot"
    _facing_root.add_child(_fx_root)

    _body = AnimatedSprite2D.new()
    _body.name = "Body"
    _body.position = Vector2(0.0, -48.0 * BODY_SCALE)
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _body.visible = false
    _fx_root.add_child(_body)

    _weapon_root = Marker2D.new()
    _weapon_root.name = "WeaponRoot"
    _fx_root.add_child(_weapon_root)

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
        Vector2(0.0, 0.0),
        Vector2(9.0, -3.0),
        Vector2(14.0, 0.0),
        Vector2(9.0, 3.0),
        Vector2(0.0, 0.0),
        Vector2(4.0, -7.0),
        Vector2(7.0, 0.0),
        Vector2(4.0, 7.0),
    ])
    _muzzle_flash.color = Color("ffd36a")
    _muzzle_flash.visible = false
    _muzzle.add_child(_muzzle_flash)

    _fx_player = AnimationPlayer.new()
    _fx_player.name = "AnimationPlayer"
    _fx_player.root_node = NodePath("..")
    add_child(_fx_player)

func _load_weapon_texture() -> void:
    var texture := load(WEAPON_ATLAS_PATH) as Texture2D
    if texture == null:
        _weapon_sprite.visible = false
        return
    _weapon_sprite.texture = texture
    _weapon_sprite.visible = true
    _apply_weapon_frame()

func _apply_weapon_frame() -> void:
    if _weapon_sprite == null:
        return
    var index := int(WEAPON_FRAME.get(_weapon, 0))
    _weapon_sprite.region_rect = Rect2(Vector2(index * 256.0, 0.0), Vector2(256.0, 128.0))
    _weapon_sprite.scale = WEAPON_SCALE.get(_weapon, Vector2(0.23, 0.23))
    if _muzzle != null:
        _muzzle.position = Vector2(float(WEAPON_MUZZLE_X.get(_weapon, 38.0)), 0.0)

func _sync_weapon_pose() -> void:
    if _weapon_root == null:
        return
    _weapon_root.position = ACTION_WEAPON_POSITION.get(_action, ACTION_WEAPON_POSITION["idle"])
    _weapon_root.rotation = float(ACTION_WEAPON_ROTATION.get(_action, 0.0))
    if _weapon == "panzerfaust":
        _weapon_root.position += Vector2(-2.0, -2.0 if _action != "crouch" else 1.0)
    elif _weapon == "shotgun":
        _weapon_root.position += Vector2(2.0, 0.0)

func _request_motion_atlas() -> void:
    _art_request = HTTPRequest.new()
    _art_request.name = "MotionAtlasRequest"
    add_child(_art_request)
    _art_request.request_completed.connect(_on_motion_atlas_loaded)
    if _art_request.request(MOTION_ATLAS_URL) != OK:
        _art_request.queue_free()
        _art_request = null

func _on_motion_atlas_loaded(
    result: int,
    response_code: int,
    _headers: PackedStringArray,
    bytes: PackedByteArray,
) -> void:
    if _art_request != null:
        _art_request.queue_free()
        _art_request = null
    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        return

    var image := Image.new()
    if image.load_webp_from_buffer(bytes) != OK:
        return
    if image.get_width() != int(FRAME_SIZE.x) * ATLAS_COLUMNS:
        return
    if image.get_height() != int(FRAME_SIZE.y) * ATLAS_ROWS:
        return

    var atlas := ImageTexture.create_from_image(image)
    _body.sprite_frames = _make_sprite_frames(atlas)
    _body_ready = true
    _body.visible = true
    _play_body_action(_action, true)

func _make_sprite_frames(atlas: Texture2D) -> SpriteFrames:
    var frames := SpriteFrames.new()
    if frames.has_animation("default"):
        frames.remove_animation("default")

    for action in ACTION_ROWS.keys():
        frames.add_animation(action)
        frames.set_animation_speed(action, float(ACTION_FPS[action]))
        frames.set_animation_loop(action, action in ["idle", "walk", "run"])
        var count := int(ACTION_COUNTS[action])
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
    if not force_restart and _body.animation == action:
        return
    _body.play(action)
    if action == "jump":
        _body.pause()
        _sync_jump_frame()

func _sync_jump_frame() -> void:
    if not _body_ready or _body.animation != "jump":
        return
    var count := int(ACTION_COUNTS["jump"])
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
    library.add_animation("recoil_right", _make_transform_animation(0.11, Vector2(-5.0, 0.0), 0.0, Vector2.ONE))
    library.add_animation("recoil_left", _make_transform_animation(0.11, Vector2(5.0, 0.0), 0.0, Vector2.ONE))
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
