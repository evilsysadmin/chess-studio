extends Node2D

# Canonical Matthias runtime art is delivered from immutable R2 objects, never Git blobs.
# Contract mirrors frontend/src/pawnSlugMatthiasIntegratedSprites.js.
const PISTOL_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-42a01598d26b6ded.webp"
const PISTOL_SHOOT_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol-shoot/matthias_pistol_shoot_v1-fa1d5be42e176741.webp"
const FRAME_SIZE := Vector2(192.0, 192.0)
const ATLAS_COLUMNS := 16
const ATLAS_ROWS := 5
const SHOOT_FRAMES := 2
const ART_SCALE := 0.88
const BOTTOM_GUTTER := 24.0
const PLAYER_FOOT_Y := 42.0
const SHOOT_SECOND_FRAME_AT := 0.075
const SHOOT_HOLD_SECONDS := 0.18
const MUZZLE_FLASH_SECONDS := 0.055
const MUZZLE_OFFSET := Vector2(65.0, -10.0)
const CROUCH_MUZZLE_Y_SHIFT := 18.0
const MUZZLE_RADIUS := 9.0
const LANDING_SECONDS := 0.12
const LANDING_Y_SQUASH := 0.055
const LANDING_X_STRETCH := 0.035
const CANONICAL_PISTOL_RUN_FRAMES := 4
const CANONICAL_PISTOL_RUN_FPS := 8.0
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
    "run": CANONICAL_PISTOL_RUN_FRAMES,
    "crouch": 10,
    "jump": 9,
}
const ACTION_FPS := {
    "idle": 6.0,
    "walk": 10.0,
    "run": CANONICAL_PISTOL_RUN_FPS,
    "crouch": 8.0,
}

var _body_ready := false
var _shoot_ready := false
var _body_sprite: Sprite2D
var _shoot_sprite: Sprite2D
var _action := "idle"
var _action_time := 0.0
var _shoot_age := SHOOT_HOLD_SECONDS
var _muzzle_age := MUZZLE_FLASH_SECONDS
var _landing_remaining := 0.0
var _facing := 1.0
var _vertical_speed := 0.0
var _crouching := false

func _ready() -> void:
    _body_sprite = _make_art_sprite("MatthiasCanonicalBody")
    _shoot_sprite = _make_art_sprite("MatthiasCanonicalShoot")
    _shoot_sprite.visible = false
    _request_art(PISTOL_ATLAS_URL, "body")
    _request_art(PISTOL_SHOOT_URL, "shoot")

func body_ready() -> bool:
    return _body_ready

func update_visual(
    delta: float,
    movement_axis: float,
    on_floor: bool,
    crouching: bool,
    landed_now: bool,
    vertical_speed: float,
    facing: float,
    fired_now: bool,
) -> void:
    _facing = -1.0 if facing < 0.0 else 1.0
    _vertical_speed = vertical_speed
    _crouching = crouching and on_floor
    if landed_now:
        _landing_remaining = LANDING_SECONDS
    else:
        _landing_remaining = maxf(0.0, _landing_remaining - delta)
    if fired_now:
        _shoot_age = 0.0
        _muzzle_age = 0.0
    else:
        _shoot_age += delta
        _muzzle_age += delta

    var next_action := _resolve_action(movement_axis, on_floor, _crouching)
    if next_action != _action:
        _action = next_action
        _action_time = 0.0
    else:
        _action_time += delta

    if _body_ready:
        _apply_body_frame()
    _apply_shoot_frame()
    _apply_pose_transform()
    queue_redraw()

func _resolve_action(movement_axis: float, on_floor: bool, crouching: bool) -> String:
    if not on_floor:
        return "jump"
    if crouching:
        return "crouch"
    if absf(movement_axis) > 0.65:
        return "run"
    if absf(movement_axis) > 0.08:
        return "walk"
    return "idle"

# Pistol run intentionally uses only the four authored canonical poses at 8 fps,
# matching pawnSlugMatthiasAuthoredMotion.js instead of racing through filler frames.
func _apply_body_frame() -> void:
    var count := int(ACTION_COUNTS[_action])
    var frame := 0
    if _action == "jump":
        frame = _jump_frame_for_speed(_vertical_speed, count)
    else:
        frame = int(_action_time * float(ACTION_FPS[_action])) % count

    _body_sprite.region_rect = Rect2(
        Vector2(frame * FRAME_SIZE.x, float(ACTION_ROWS[_action]) * FRAME_SIZE.y),
        FRAME_SIZE,
    )
    # Premium pistol bank is authored facing screen-left.
    _body_sprite.flip_h = _facing > 0.0

# Airborne art follows the real ballistic phase rather than elapsed animation time.
# Full ascent maps to the first pose, the apex to the middle pose and descent to
# the last pose. Variable-height jumps therefore remain visually synchronized.
func _jump_frame_for_speed(vertical_speed: float, count: int) -> int:
    if count <= 1:
        return 0
    var phase := clampf(
        (vertical_speed + JUMP_VISUAL_SPEED_RANGE) / (JUMP_VISUAL_SPEED_RANGE * 2.0),
        0.0,
        1.0,
    )
    return clampi(int(round(phase * float(count - 1))), 0, count - 1)

func _apply_shoot_frame() -> void:
    # Canonical authored shoot strip is standing-only, matching the existing web
    # runtime. Crouched fire keeps the crouch body and only renders muzzle FX.
    var show_shoot := (
        _body_ready
        and _shoot_ready
        and not _crouching
        and _shoot_age < SHOOT_HOLD_SECONDS
    )
    if _body_sprite:
        _body_sprite.visible = _body_ready and not show_shoot
    if not _shoot_sprite:
        return
    _shoot_sprite.visible = show_shoot
    if not show_shoot:
        return

    var frame := 0 if _shoot_age < SHOOT_SECOND_FRAME_AT else 1
    _shoot_sprite.region_rect = Rect2(Vector2(frame * FRAME_SIZE.x, 0.0), FRAME_SIZE)
    # Authored shoot strip faces screen-right.
    _shoot_sprite.flip_h = _facing < 0.0

# Match the web runtime's 120ms landing squash, but recalculate the sprite's Y
# from its scaled visible height so the feet stay pinned instead of floating.
func _apply_pose_transform() -> void:
    var landing := clampf(_landing_remaining / LANDING_SECONDS, 0.0, 1.0)
    var scale_x := ART_SCALE * (1.0 + landing * LANDING_X_STRETCH)
    var scale_y := ART_SCALE * (1.0 - landing * LANDING_Y_SQUASH)
    for sprite in [_body_sprite, _shoot_sprite]:
        if sprite == null:
            continue
        sprite.scale = Vector2(scale_x, scale_y)
        sprite.position = Vector2(
            0.0,
            PLAYER_FOOT_Y - (FRAME_SIZE.y - BOTTOM_GUTTER - FRAME_SIZE.y * 0.5) * scale_y,
        )

func _draw() -> void:
    if _muzzle_age >= MUZZLE_FLASH_SECONDS:
        return
    var muzzle_y := MUZZLE_OFFSET.y + (CROUCH_MUZZLE_Y_SHIFT if _crouching else 0.0)
    draw_circle(
        Vector2(_facing * MUZZLE_OFFSET.x, muzzle_y),
        MUZZLE_RADIUS,
        Color("ffd36a"),
    )

func _make_art_sprite(sprite_name: String) -> Sprite2D:
    var sprite := Sprite2D.new()
    sprite.name = sprite_name
    sprite.centered = true
    sprite.region_enabled = true
    sprite.position = Vector2(
        0.0,
        PLAYER_FOOT_Y - (FRAME_SIZE.y - BOTTOM_GUTTER - FRAME_SIZE.y * 0.5) * ART_SCALE,
    )
    sprite.scale = Vector2(ART_SCALE, ART_SCALE)
    sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    sprite.visible = false
    add_child(sprite)
    return sprite

func _request_art(url: String, kind: String) -> void:
    var request := HTTPRequest.new()
    request.name = "ArtRequest_%s" % kind
    add_child(request)
    request.request_completed.connect(_on_art_request_completed.bind(kind, request))
    if request.request(url) != OK:
        request.queue_free()

func _on_art_request_completed(
    result: int,
    response_code: int,
    _headers: PackedStringArray,
    body: PackedByteArray,
    kind: String,
    request: HTTPRequest,
) -> void:
    request.queue_free()
    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        return

    var image := Image.new()
    if image.load_webp_from_buffer(body) != OK:
        return
    if kind == "body" and not _valid_body_dimensions(image):
        return
    if kind == "shoot" and not _valid_shoot_dimensions(image):
        return

    var texture := ImageTexture.create_from_image(image)
    if kind == "body":
        _body_sprite.texture = texture
        _body_ready = true
        _apply_body_frame()
    elif kind == "shoot":
        _shoot_sprite.texture = texture
        _shoot_ready = true
    _apply_shoot_frame()
    _apply_pose_transform()

func _valid_body_dimensions(image: Image) -> bool:
    return (
        image.get_width() == int(FRAME_SIZE.x) * ATLAS_COLUMNS
        and image.get_height() == int(FRAME_SIZE.y) * ATLAS_ROWS
    )

func _valid_shoot_dimensions(image: Image) -> bool:
    return (
        image.get_width() == int(FRAME_SIZE.x) * SHOOT_FRAMES
        and image.get_height() == int(FRAME_SIZE.y)
    )
