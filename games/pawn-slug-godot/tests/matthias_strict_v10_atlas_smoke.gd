extends SceneTree

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    var user_args := OS.get_cmdline_user_args()
    if user_args.size() != 2:
        _fail("expected atlas path and manifest path")
        return

    var atlas_path := String(user_args[0])
    var manifest_path := String(user_args[1])
    if not FileAccess.file_exists(atlas_path):
        _fail("atlas does not exist: " + atlas_path)
        return
    if not FileAccess.file_exists(manifest_path):
        _fail("manifest does not exist: " + manifest_path)
        return

    var image := Image.new()
    var load_error := image.load(atlas_path)
    if load_error != OK:
        _fail("Godot Image failed to load v10 atlas: %s error=%s" % [atlas_path, load_error])
        return

    var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("v10 manifest is not a JSON object")
        return
    var manifest: Dictionary = parsed
    if String(manifest.get("version", "")) != "v10":
        _fail("unexpected v10 manifest version")
        return

    var atlas_meta: Dictionary = manifest.get("atlas", {})
    var width := int(atlas_meta.get("width", -1))
    var height := int(atlas_meta.get("height", -1))
    var columns := int(atlas_meta.get("columns", -1))
    var rows := int(atlas_meta.get("rows", -1))
    var cell_size := int(atlas_meta.get("cell_size", -1))
    if Vector2i(width, height) != Vector2i(3072, 2304):
        _fail("unexpected strict-v10 atlas size")
        return
    if columns != 12 or rows != 9 or cell_size != 256:
        _fail("unexpected strict-v10 grid contract")
        return
    if Vector2i(image.get_width(), image.get_height()) != Vector2i(width, height):
        _fail("Godot decoded v10 atlas dimensions disagree with manifest")
        return

    var texture := ImageTexture.create_from_image(image)
    if texture == null or texture.get_width() != width or texture.get_height() != height:
        _fail("Godot failed to create v10 ImageTexture")
        return

    var actions_value = manifest.get("actions", [])
    if typeof(actions_value) != TYPE_ARRAY:
        _fail("v10 actions is not an array")
        return
    var actions: Array = actions_value
    if actions.size() != rows:
        _fail("v10 action count does not match rows")
        return

    var sprite_frames := SpriteFrames.new()
    if sprite_frames.has_animation("default"):
        sprite_frames.remove_animation("default")
    var expected_counts := {
        "idle": 8,
        "walk": 10,
        "run": 12,
        "jump": 6,
        "fall": 4,
        "land": 4,
        "crouch": 4,
        "crouch_walk": 8,
        "move_fire": 6,
    }
    var seen_rows := {}
    var total_frames := 0

    for action_value in actions:
        if typeof(action_value) != TYPE_DICTIONARY:
            _fail("v10 action entry is not an object")
            return
        var action: Dictionary = action_value
        var name := String(action.get("name", ""))
        var row := int(action.get("row", -1))
        var count := int(action.get("frames", -1))
        var fps := float(action.get("fps", -1.0))
        var loop := bool(action.get("loop", false))
        if not expected_counts.has(name) or int(expected_counts[name]) != count:
            _fail("unexpected variable frame count: %s=%d" % [name, count])
            return
        if row < 0 or row >= rows or seen_rows.has(row):
            _fail("invalid/duplicate v10 row: %s row=%d" % [name, row])
            return
        if count < 1 or count > columns or fps <= 0.0:
            _fail("invalid v10 action metadata: " + name)
            return
        seen_rows[row] = true

        sprite_frames.add_animation(name)
        sprite_frames.set_animation_speed(name, fps)
        sprite_frames.set_animation_loop(name, loop)
        for column in range(count):
            var region := Rect2(
                float(column * cell_size),
                float(row * cell_size),
                float(cell_size),
                float(cell_size)
            )
            if region.end.x > float(width) or region.end.y > float(height):
                _fail("v10 AtlasTexture region exceeds atlas: %s[%d]" % [name, column])
                return
            var frame_texture := AtlasTexture.new()
            frame_texture.atlas = texture
            frame_texture.region = region
            sprite_frames.add_frame(name, frame_texture)
            total_frames += 1

    if seen_rows.size() != rows:
        _fail("not every v10 atlas row is represented")
        return
    if total_frames != 62:
        _fail("unexpected v10 total frame count: %d" % total_frames)
        return

    var sprite := AnimatedSprite2D.new()
    sprite.sprite_frames = sprite_frames
    get_root().add_child(sprite)
    for action_value in actions:
        var action: Dictionary = action_value
        var name := String(action["name"])
        var count := int(action["frames"])
        if sprite_frames.get_frame_count(name) != count:
            _fail("Godot SpriteFrames count drift: " + name)
            return
        if absf(sprite_frames.get_animation_speed(name) - float(action["fps"])) > 0.001:
            _fail("Godot SpriteFrames fps drift: " + name)
            return
        if sprite_frames.get_animation_loop(name) != bool(action["loop"]):
            _fail("Godot SpriteFrames loop drift: " + name)
            return
        sprite.play(name)
        sprite.frame = count - 1
        var frame_texture := sprite_frames.get_frame_texture(name, count - 1)
        if not (frame_texture is AtlasTexture):
            _fail("v10 frame is not AtlasTexture: " + name)
            return
        var atlas_texture := frame_texture as AtlasTexture
        if atlas_texture.atlas == null or atlas_texture.region.size != Vector2(cell_size, cell_size):
            _fail("v10 AtlasTexture contract drift: " + name)
            return

    print("OK Godot strict-v10 runtime smoke: actions=%d frames=%d atlas=%dx%d" % [
        actions.size(), total_frames, width, height
    ])
    quit(0)
