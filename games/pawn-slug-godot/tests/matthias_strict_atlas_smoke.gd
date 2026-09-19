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
        _fail("Godot Image failed to load atlas: %s error=%s" % [atlas_path, load_error])
        return

    var manifest_raw := FileAccess.get_file_as_string(manifest_path)
    var parsed = JSON.parse_string(manifest_raw)
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("manifest is not a JSON object")
        return
    var manifest: Dictionary = parsed
    if not manifest.has("atlas") or not manifest.has("actions"):
        _fail("manifest missing atlas/actions")
        return

    var atlas_meta: Dictionary = manifest["atlas"]
    var expected_width := int(atlas_meta.get("width", -1))
    var expected_height := int(atlas_meta.get("height", -1))
    var columns := int(atlas_meta.get("columns", -1))
    var rows := int(atlas_meta.get("rows", -1))
    var cell_size := int(atlas_meta.get("cell_size", -1))
    if Vector2i(image.get_width(), image.get_height()) != Vector2i(expected_width, expected_height):
        _fail("Godot decoded atlas dimensions disagree with manifest")
        return
    if columns != 6 or rows != 18 or cell_size != 416:
        _fail("unexpected strict-v9 atlas grid contract")
        return

    var texture := ImageTexture.create_from_image(image)
    if texture == null or texture.get_width() != expected_width or texture.get_height() != expected_height:
        _fail("ImageTexture creation failed or changed atlas dimensions")
        return

    var frames := SpriteFrames.new()
    if frames.has_animation("default"):
        frames.remove_animation("default")

    var actions: Array = manifest["actions"]
    if actions.size() != rows:
        _fail("manifest action count does not match atlas rows")
        return

    var seen_rows := {}
    for action_value in actions:
        if typeof(action_value) != TYPE_DICTIONARY:
            _fail("manifest action entry is not an object")
            return
        var action: Dictionary = action_value
        var name := String(action.get("name", ""))
        var row := int(action.get("row", -1))
        var frame_count := int(action.get("frames", -1))
        var fps := float(action.get("fps", -1.0))
        var loop := bool(action.get("loop", false))
        if name.is_empty() or row < 0 or row >= rows or seen_rows.has(row):
            _fail("invalid/duplicate Godot animation row: %s row=%s" % [name, row])
            return
        if frame_count != columns or fps <= 0.0:
            _fail("invalid Godot animation contract: %s" % name)
            return
        seen_rows[row] = true

        frames.add_animation(name)
        frames.set_animation_speed(name, fps)
        frames.set_animation_loop(name, loop)
        for column in range(frame_count):
            var region := Rect2(
                float(column * cell_size),
                float(row * cell_size),
                float(cell_size),
                float(cell_size)
            )
            if region.end.x > float(expected_width) or region.end.y > float(expected_height):
                _fail("AtlasTexture region exceeds atlas for %s[%d]" % [name, column])
                return
            var frame_texture := AtlasTexture.new()
            frame_texture.atlas = texture
            frame_texture.region = region
            frames.add_frame(name, frame_texture)

    if seen_rows.size() != rows:
        _fail("not every atlas row is represented by a Godot animation")
        return

    var sprite := AnimatedSprite2D.new()
    sprite.sprite_frames = frames
    get_root().add_child(sprite)

    for action_value in actions:
        var action: Dictionary = action_value
        var name := String(action["name"])
        var expected_frames := int(action["frames"])
        if not frames.has_animation(name):
            _fail("SpriteFrames missing animation: " + name)
            return
        if frames.get_frame_count(name) != expected_frames:
            _fail("SpriteFrames frame count drift: " + name)
            return
        if absf(frames.get_animation_speed(name) - float(action["fps"])) > 0.001:
            _fail("SpriteFrames FPS drift: " + name)
            return
        if frames.get_animation_loop(name) != bool(action["loop"]):
            _fail("SpriteFrames loop drift: " + name)
            return
        sprite.play(name)
        sprite.frame = expected_frames - 1
        var last_texture := frames.get_frame_texture(name, expected_frames - 1)
        if not (last_texture is AtlasTexture):
            _fail("Godot did not retain AtlasTexture frame: " + name)
            return
        var atlas_frame := last_texture as AtlasTexture
        if atlas_frame.atlas == null or atlas_frame.region.size != Vector2(cell_size, cell_size):
            _fail("AtlasTexture region contract drift: " + name)
            return

    print("OK Godot strict-v9 runtime smoke: animations=%d frames=%d atlas=%dx%d" % [
        actions.size(),
        actions.size() * columns,
        expected_width,
        expected_height
    ])
    quit(0)
