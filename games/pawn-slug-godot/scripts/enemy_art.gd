extends Node2D

# Reviewed Blender enemy action atlas, published as an immutable R2 object.
# Contract mirrors frontend/src/pawnSlugSoldierAtlas.js and
# frontend/src/pawnSlugEnemyActionMotion.js.
const ACTION_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/enemies/action-atlas/enemy_cast_blender_v1_runtime-cf57e6e6be5a5d4a.webp"
const FRAME_SIZE := Vector2(96.0, 96.0)
const COLUMNS := 16
const TYPES := ["pawn", "knight", "rook"]
const ACTIONS := ["idle", "run", "jump", "crouch", "hurt", "climb", "death"]
const ROWS := 21
const FLOOR_Y := 610.0
const ACTION_COUNTS := {
    "idle": 12,
    "run": 16,
    "jump": 10,
    "crouch": 8,
    "hurt": 6,
    "climb": 12,
    "death": 14,
}
const ACTION_RATES := {
    "idle": 5.2,
    "run": 15.5,
    "jump": 12.0,
    "crouch": 10.0,
    "hurt": 48.0,
    "climb": 11.5,
    "death": 16.0,
}
const RUN_RATES := {
    "pawn": 30.0,
    "knight": 38.0,
    "rook": 22.0,
}
const SCALE_BY_TYPE := {
    "pawn": 1.02,
    "knight": 1.10,
    "rook": 1.28,
}

var _texture: ImageTexture
var _ready := false
var _time := 0.0
var _sprites: Dictionary = {}
var _previous_x: Dictionary = {}

func _ready() -> void:
    _request_atlas()

func ready() -> bool:
    return _ready

func supports_type(type: String) -> bool:
    return TYPES.has(type)

func sync(enemies: Array[Dictionary], player_x: float, delta: float) -> void:
    _time += maxf(0.0, delta)
    var live_ids: Dictionary = {}
    for enemy in enemies:
        var id := String(enemy.get("id", ""))
        var type := String(enemy.get("type", "pawn"))
        if id.is_empty() or not supports_type(type):
            continue
        live_ids[id] = true
        var sprite := _sprite_for(id, type)
        if sprite == null:
            continue

        var hp := int(enemy.get("hp", 0))
        if hp <= 0:
            sprite.visible = false
            _previous_x[id] = float(enemy.get("x", 0.0))
            continue

        var x := float(enemy.get("x", 0.0))
        var previous := float(_previous_x.get(id, x))
        var moving := absf(x - previous) > 0.08
        _previous_x[id] = x
        var action := "run" if moving else "idle"
        var direction := -1.0 if player_x < x else 1.0
        _apply_frame(sprite, type, action, direction)
        sprite.position = Vector2(x, FLOOR_Y)
        sprite.visible = _ready

    for id in _sprites.keys():
        if not live_ids.has(id):
            var stale: Sprite2D = _sprites[id]
            stale.visible = false

func _sprite_for(id: String, type: String) -> Sprite2D:
    if _sprites.has(id):
        return _sprites[id]
    var sprite := Sprite2D.new()
    sprite.name = "EnemyAtlas_%s" % id.replace("-", "_")
    sprite.centered = true
    sprite.region_enabled = true
    sprite.region_rect = Rect2(Vector2.ZERO, FRAME_SIZE)
    sprite.offset = Vector2(0.0, -FRAME_SIZE.y * 0.5)
    var scale := float(SCALE_BY_TYPE.get(type, 1.0))
    sprite.scale = Vector2(scale, scale)
    sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    sprite.visible = false
    if _ready:
        sprite.texture = _texture
    add_child(sprite)
    _sprites[id] = sprite
    return sprite

func _apply_frame(sprite: Sprite2D, type: String, action: String, direction: float) -> void:
    var safe_action := action if ACTIONS.has(action) else "idle"
    var type_index := TYPES.find(type)
    if type_index < 0:
        type_index = 0
    var action_index := ACTIONS.find(safe_action)
    if action_index < 0:
        action_index = 0
    var count := int(ACTION_COUNTS[safe_action])
    var rate := float(RUN_RATES.get(type, ACTION_RATES[safe_action])) if safe_action == "run" else float(ACTION_RATES[safe_action])
    var frame := int(floor(_time * rate)) % count
    var row := type_index * ACTIONS.size() + action_index
    sprite.region_rect = Rect2(
        Vector2(float(frame) * FRAME_SIZE.x, float(row) * FRAME_SIZE.y),
        FRAME_SIZE,
    )
    # The Blender atlas is authored facing screen-left.
    sprite.flip_h = direction > 0.0

func _request_atlas() -> void:
    var request := HTTPRequest.new()
    request.name = "EnemyActionAtlasRequest"
    add_child(request)
    request.request_completed.connect(_on_atlas_request_completed.bind(request))
    if request.request(ACTION_ATLAS_URL) != OK:
        request.queue_free()

func _on_atlas_request_completed(
    result: int,
    response_code: int,
    _headers: PackedStringArray,
    body: PackedByteArray,
    request: HTTPRequest,
) -> void:
    request.queue_free()
    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        return
    var image := Image.new()
    if image.load_webp_from_buffer(body) != OK:
        return
    if image.get_width() != int(FRAME_SIZE.x) * COLUMNS:
        return
    if image.get_height() != int(FRAME_SIZE.y) * ROWS:
        return
    _texture = ImageTexture.create_from_image(image)
    _ready = true
    for sprite in _sprites.values():
        sprite.texture = _texture
        sprite.visible = true
