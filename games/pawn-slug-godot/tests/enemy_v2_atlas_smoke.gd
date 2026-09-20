extends SceneTree

const TYPES := ["pawn","knight","rook","bishop","queen","grenadier","scout","commando","shield"]
const ACTIONS := ["idle","run"]

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 2:
        _fail("expected atlas path and manifest path")
        return
    var atlas_path := String(args[0])
    var manifest_path := String(args[1])
    var image := Image.new()
    if image.load(atlas_path) != OK:
        _fail("Godot failed to decode enemy v2 PNG")
        return
    var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("enemy v2 manifest is not an object")
        return
    var manifest: Dictionary = parsed
    if String(manifest.get("version", "")) != "v2":
        _fail("unexpected enemy manifest version")
        return
    var meta: Dictionary = manifest.get("atlas", {})
    var width := int(meta.get("width", -1))
    var height := int(meta.get("height", -1))
    var columns := int(meta.get("columns", -1))
    var rows := int(meta.get("rows", -1))
    var cell := int(meta.get("cell_size", -1))
    if Vector2i(width, height) != Vector2i(1024, 2304) or columns != 8 or rows != 18 or cell != 128:
        _fail("enemy v2 grid contract drift")
        return
    if Vector2i(image.get_width(), image.get_height()) != Vector2i(width, height):
        _fail("decoded dimensions disagree with manifest")
        return
    var texture := ImageTexture.create_from_image(image)
    if texture == null:
        _fail("failed to create ImageTexture")
        return
    var types_value = manifest.get("types", [])
    if typeof(types_value) != TYPE_ARRAY or types_value.size() != TYPES.size():
        _fail("enemy type metadata mismatch")
        return
    var frames := SpriteFrames.new()
    if frames.has_animation("default"):
        frames.remove_animation("default")
    var total := 0
    for ti in range(TYPES.size()):
        var type_meta: Dictionary = types_value[ti]
        if String(type_meta.get("type", "")) != TYPES[ti]:
            _fail("enemy type order drift")
            return
        var action_meta: Array = type_meta.get("actions", [])
        if action_meta.size() != 2:
            _fail("enemy action metadata mismatch")
            return
        for ai in range(ACTIONS.size()):
            var action: Dictionary = action_meta[ai]
            var expected_row := ti * 2 + ai
            if String(action.get("name", "")) != ACTIONS[ai] or int(action.get("row", -1)) != expected_row or int(action.get("frames", -1)) != 8:
                _fail("enemy action contract drift")
                return
            var animation := "%s_%s" % [TYPES[ti], ACTIONS[ai]]
            frames.add_animation(animation)
            frames.set_animation_speed(animation, float(action.get("fps", 1.0)))
            frames.set_animation_loop(animation, bool(action.get("loop", true)))
            for col in range(8):
                var region := Rect2(float(col * cell), float(expected_row * cell), float(cell), float(cell))
                if region.end.x > width or region.end.y > height:
                    _fail("AtlasTexture region escaped atlas")
                    return
                var atlas_texture := AtlasTexture.new()
                atlas_texture.atlas = texture
                atlas_texture.region = region
                frames.add_frame(animation, atlas_texture)
                total += 1
            if frames.get_frame_count(animation) != 8:
                _fail("SpriteFrames count drift")
                return
    var sprite := AnimatedSprite2D.new()
    sprite.sprite_frames = frames
    get_root().add_child(sprite)
    for kind in TYPES:
        for action in ACTIONS:
            var animation := "%s_%s" % [kind, action]
            sprite.play(animation)
            sprite.frame = 7
            var frame_texture := frames.get_frame_texture(animation, 7)
            if not (frame_texture is AtlasTexture) or (frame_texture as AtlasTexture).region.size != Vector2(128, 128):
                _fail("Godot runtime frame contract drift: " + animation)
                return
    if total != 144:
        _fail("unexpected enemy frame total")
        return
    print("OK Godot enemy v2 runtime smoke: types=9 animations=18 frames=144 atlas=1024x2304")
    quit(0)
