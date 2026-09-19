extends SceneTree

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 2:
        _fail("expected atlas and manifest")
        return
    var atlas_path := String(args[0])
    var manifest_path := String(args[1])
    var image := Image.new()
    if image.load(atlas_path) != OK:
        _fail("cannot load strict-v12 atlas")
        return
    var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("strict-v12 manifest is not an object")
        return
    var manifest: Dictionary = parsed
    if String(manifest.get("version", "")) != "v12":
        _fail("strict-v12 version drift")
        return
    var atlas: Dictionary = manifest.get("atlas", {})
    var cols := int(atlas.get("columns", -1))
    var rows := int(atlas.get("rows", -1))
    var cell := int(atlas.get("cell_size", -1))
    if cols != 8 or rows != 18 or cell != 416:
        _fail("strict-v12 grid drift")
        return
    if image.get_size() != Vector2i(cols * cell, rows * cell):
        _fail("strict-v12 decoded size drift")
        return
    var texture := ImageTexture.create_from_image(image)
    var sprite_frames := SpriteFrames.new()
    if sprite_frames.has_animation("default"):
        sprite_frames.remove_animation("default")
    var actions: Array = manifest.get("actions", [])
    if actions.size() != rows:
        _fail("strict-v12 action count drift")
        return
    var total := 0
    for action_value in actions:
        if typeof(action_value) != TYPE_DICTIONARY:
            _fail("strict-v12 action entry invalid")
            return
        var action: Dictionary = action_value
        var name := String(action.get("name", ""))
        var row := int(action.get("row", -1))
        var count := int(action.get("frames", -1))
        if row < 0 or row >= rows or count != 8:
            _fail("strict-v12 minimum-8 contract drift: " + name)
            return
        sprite_frames.add_animation(name)
        sprite_frames.set_animation_speed(name, float(action.get("fps", 1.0)))
        sprite_frames.set_animation_loop(name, bool(action.get("loop", false)))
        for col in range(count):
            var frame := AtlasTexture.new()
            frame.atlas = texture
            frame.region = Rect2(col * cell, row * cell, cell, cell)
            sprite_frames.add_frame(name, frame)
            total += 1
    if total != 144:
        _fail("strict-v12 total frame count drift")
        return
    var sprite := AnimatedSprite2D.new()
    sprite.sprite_frames = sprite_frames
    get_root().add_child(sprite)
    for action_value in actions:
        var action: Dictionary = action_value
        var name := String(action["name"])
        if sprite_frames.get_frame_count(name) != 8:
            _fail("strict-v12 SpriteFrames drift: " + name)
            return
        sprite.play(name)
        sprite.frame = 7
        var frame_texture := sprite_frames.get_frame_texture(name, 7)
        if not (frame_texture is AtlasTexture):
            _fail("strict-v12 frame is not AtlasTexture: " + name)
            return
    print("OK Godot strict-v12 runtime smoke: 18 poses x 8 frames = 144")
    quit(0)
