extends CharacterBody2D

signal fired(origin: Vector2, direction: float)

const MOVE_SPEED := 330.0
const GROUND_ACCEL := 2200.0
const AIR_ACCEL := 1350.0
const GROUND_DECEL := 2800.0
const JUMP_SPEED := 610.0
const GRAVITY := 1550.0
const COYOTE_TIME := 0.10
const JUMP_BUFFER_TIME := 0.12
const FIRE_INTERVAL := 0.16

# Canonical Matthias runtime art is delivered from immutable R2 objects, never Git blobs.
# Contract mirrors frontend/src/pawnSlugMatthiasIntegratedSprites.js.
const PISTOL_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-42a01598d26b6ded.webp"
const PISTOL_SHOOT_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol-shoot/matthias_pistol_shoot_v1-fa1d5be42e176741.webp"
const ATLAS_FRAME_SIZE := Vector2(192.0, 192.0)
const ATLAS_COLUMNS := 16
const ATLAS_ROWS := 5
const SHOOT_FRAMES := 2
const ATLAS_SCALE := 0.88
const ATLAS_BOTTOM_GUTTER := 24.0
const PLAYER_FOOT_Y := 42.0
const IDLE_FPS := 6.0
const WALK_FPS := 10.0
const RUN_FPS := 14.0
const SHOOT_SECOND_FRAME_AT := 0.075
const SHOOT_HOLD_SECONDS := 0.18
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

var facing := 1.0
var fire_cooldown := 0.0
var muzzle_flash := 0.0
var _coyote_remaining := 0.0
var _jump_buffer_remaining := 0.0
var _jump_was_pressed := false
var _visual_time := 0.0
var _air_time := 0.0
var _shoot_age := SHOOT_HOLD_SECONDS
var _body_ready := false
var _shoot_ready := false
var _body_sprite: Sprite2D
var _shoot_sprite: Sprite2D

func _ready() -> void:
    _body_sprite = _make_art_sprite("MatthiasCanonicalBody")
    _shoot_sprite = _make_art_sprite("MatthiasCanonicalShoot")
    _shoot_sprite.visible = false
    _request_art(PISTOL_ATLAS_URL, "body")
    _request_art(PISTOL_SHOOT_URL, "shoot")

func _physics_process(delta: float) -> void:
    _visual_time += delta
    _shoot_age += delta

    var axis := _movement_axis()
    if absf(axis) > 0.08:
        facing = 1.0 if axis > 0.0 else -1.0

    var target_speed := axis * MOVE_SPEED
    var accel := GROUND_ACCEL if is_on_floor() else AIR_ACCEL
    if absf(axis) <= 0.08 and is_on_floor():
        accel = GROUND_DECEL
    velocity.x = move_toward(velocity.x, target_speed, accel * delta)

    if is_on_floor():
        _coyote_remaining = COYOTE_TIME
        _air_time = 0.0
    else:
        _coyote_remaining = maxf(0.0, _coyote_remaining - delta)
        _air_time += delta
        velocity.y += GRAVITY * delta

    var jump_pressed := _jump_pressed()
    if jump_pressed and not _jump_was_pressed:
        _jump_buffer_remaining = JUMP_BUFFER_TIME
    else:
        _jump_buffer_remaining = maxf(0.0, _jump_buffer_remaining - delta)

    if _jump_buffer_remaining > 0.0 and _coyote_remaining > 0.0:
        velocity.y = -JUMP_SPEED
        _jump_buffer_remaining = 0.0
        _coyote_remaining = 0.0
        _air_time = 0.0
    elif _jump_was_pressed and not jump_pressed and velocity.y < -JUMP_SPEED * 0.35:
        velocity.y *= 0.55
    _jump_was_pressed = jump_pressed

    move_and_slide()

    fire_cooldown = maxf(0.0, fire_cooldown - delta)
    muzzle_flash = maxf(0.0, muzzle_flash - delta)
    if _fire_pressed() and fire_cooldown <= 0.0:
        fire_cooldown = FIRE_INTERVAL
        muzzle_flash = 0.055
        _shoot_age = 0.0
        fired.emit(global_position + Vector2(facing * 38.0, -7.0), facing)

    _update_canonical_art(axis)
    queue_redraw()

func _make_art_sprite(sprite_name: String) -> Sprite2D:
    var sprite := Sprite2D.new()
    sprite.name = sprite_name
    sprite.centered = true
    sprite.region_enabled = true
    sprite.position = Vector2(0.0, PLAYER_FOOT_Y - (ATLAS_FRAME_SIZE.y - ATLAS_BOTTOM_GUTTER - ATLAS_FRAME_SIZE.y * 0.5) * ATLAS_SCALE)
    sprite.scale = Vector2(ATLAS_SCALE, ATLAS_SCALE)
    sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    sprite.visible = false
    add_child(sprite)
    return sprite

func _request_art(url: String, kind: String) -> void:
    var request := HTTPRequest.new()
    request.name = "ArtRequest_%s" % kind
    add_child(request)
    request.request_completed.connect(_on_art_request_completed.bind(kind, request))
    var error := request.request(url)
    if error != OK:
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
    if kind == "body" and (image.get_width() != int(ATLAS_FRAME_SIZE.x) * ATLAS_COLUMNS or image.get_height() != int(ATLAS_FRAME_SIZE.y) * ATLAS_ROWS):
        return
    if kind == "shoot" and (image.get_width() != int(ATLAS_FRAME_SIZE.x) * SHOOT_FRAMES or image.get_height() != int(ATLAS_FRAME_SIZE.y)):
        return

    var texture := ImageTexture.create_from_image(image)
    if kind == "body":
        _body_sprite.texture = texture
        _body_ready = true
        _body_sprite.visible = true
    elif kind == "shoot":
        _shoot_sprite.texture = texture
        _shoot_ready = true

func _update_canonical_art(axis: float) -> void:
    if not _body_ready:
        return

    var action := "idle"
    var frame := 0
    if not is_on_floor():
        action = "jump"
        frame = mini(ACTION_COUNTS[action] - 1, int(_air_time * 12.0))
    elif absf(axis) > 0.65:
        action = "run"
        frame = int(_visual_time * RUN_FPS) % ACTION_COUNTS[action]
    elif absf(axis) > 0.08:
        action = "walk"
        frame = int(_visual_time * WALK_FPS) % ACTION_COUNTS[action]
    else:
        frame = int(_visual_time * IDLE_FPS) % ACTION_COUNTS[action]

    _body_sprite.region_rect = Rect2(
        Vector2(frame * ATLAS_FRAME_SIZE.x, ACTION_ROWS[action] * ATLAS_FRAME_SIZE.y),
        ATLAS_FRAME_SIZE,
    )
    # Premium pistol bank is authored facing screen-left.
    _body_sprite.flip_h = facing > 0.0

    var show_shoot := _shoot_ready and _shoot_age < SHOOT_HOLD_SECONDS
    _shoot_sprite.visible = show_shoot
    _body_sprite.visible = not show_shoot
    if show_shoot:
        var shoot_frame := 0 if _shoot_age < SHOOT_SECOND_FRAME_AT else 1
        _shoot_sprite.region_rect = Rect2(
            Vector2(shoot_frame * ATLAS_FRAME_SIZE.x, 0.0),
            ATLAS_FRAME_SIZE,
        )
        # Authored shoot strip faces screen-right.
        _shoot_sprite.flip_h = facing < 0.0

func _movement_axis() -> float:
    var axis := 0.0
    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
        axis -= 1.0
    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
        axis += 1.0

    var joypads := Input.get_connected_joypads()
    if not joypads.is_empty():
        var joy_axis := Input.get_joy_axis(joypads[0], JOY_AXIS_LEFT_X)
        if absf(joy_axis) > absf(axis):
            axis = joy_axis
    return clampf(axis, -1.0, 1.0)

func _jump_pressed() -> bool:
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_A)

func _fire_pressed() -> bool:
    if Input.is_key_pressed(KEY_SPACE) or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
        return true
    var joypads := Input.get_connected_joypads()
    return not joypads.is_empty() and Input.is_joy_button_pressed(joypads[0], JOY_BUTTON_X)

func _draw() -> void:
    if not _body_ready:
        draw_rect(Rect2(Vector2(-24.0, -26.0), Vector2(48.0, 58.0)), Color("20262c"), true)
        draw_circle(Vector2(0.0, -43.0), 24.0, Color("d7c2a0"))
        draw_rect(Rect2(Vector2(-30.0, -69.0), Vector2(60.0, 10.0)), Color("11151a"), true)
        draw_rect(Rect2(Vector2(-18.0, -78.0), Vector2(36.0, 12.0)), Color("171c21"), true)

        var gun_origin := Vector2(facing * 14.0, -7.0)
        draw_line(gun_origin, gun_origin + Vector2(facing * 42.0, 0.0), Color("a4abb1"), 9.0)

    if muzzle_flash > 0.0:
        draw_circle(Vector2(facing * 65.0, -10.0), 9.0, Color("ffd36a"))
