extends SceneTree

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 2:
        _fail("expected enemy atlas path and manifest path")
        return
    var atlas_path := String(args[0])
    var manifest_path := String(args[1])
    if not FileAccess.file_exists(atlas_path) or not FileAccess.file_exists(manifest_path):
        _fail("enemy strict atlas/manifest missing")
        return

    var image := Image.new()
    var err := image.load(atlas_path)
    if err != OK:
        _fail("Godot failed to decode strict enemy atlas: %s" % err)
        return
    var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("enemy manifest is not an object")
        return
    var manifest: Dictionary = parsed
    if String(manifest.get("version", "")) != "enemy-v10":
        _fail("unexpected enemy strict version")
        return

    var atlas_meta: Dictionary = manifest.get("atlas", {})
    var columns := int(atlas_meta.get("columns", -1))
    var rows := int(atlas_meta.get("rows", -1))
    var cell_size := int(atlas_meta.get("cell_size", -1))
    var width := int(atlas_meta.get("width", -1))
    var height := int(atlas_meta.get("height", -1))
    if columns != 16 or rows != 7 or cell_size != 96:
        _fail("enemy strict grid contract drift")
        return
    if Vector2i(width, height) != Vector2i(1536, 672):
        _fail("enemy strict atlas size contract drift")
        return
    if image.get_size() != Vector2i(width, height):
        _fail("Godot decoded enemy atlas dimensions disagree with manifest")
        return

    var texture := ImageTexture.create_from_image(image)
    if texture == null:
        _fail("Godot failed to create enemy ImageTexture")
        return
    var frames := SpriteFrames.new()
    if frames.has_animation("default"):
        frames.remove_animation("default")

    var expected_counts := {
        "idle": 12, "run": 16, "jump": 10, "crouch": 8,
        "hurt": 6, "climb": 12, "death": 14,
    }
    var actions: Array = manifest.get("actions", [])
    if actions.size() != rows:
        _fail("enemy action count does not match rows")
        return

    var total := 0
    for action_value in actions:
        if typeof(action_value) != TYPE_DICTIONARY:
            _fail("enemy action entry is not an object")
            return
        var action: Dictionary = action_value
        var name := String(action.get("name", ""))
        var row := int(action.get("row", -1))
        var count := int(action.get("frames", -1))
        var fps := float(action.get("fps", -1.0))
        var loop := bool(action.get("loop", false))
        if not expected_counts.has(name) or int(expected_counts[name]) != count:
            _fail("unexpected enemy frame count: %s=%d" % [name, count])
            return
        if row < 0 or row >= rows or count < 1 or count > columns or fps <= 0.0:
            _fail("invalid enemy action metadata: " + name)
            return

        frames.add_animation(name)
        frames.set_animation_speed(name, fps)
        frames.set_animation_loop(name, loop)
        for column in range(count):
            var region := Rect2(
                float(column * cell_size),
                float(row * cell_size),
                float(cell_size),
                float(cell_size)
            )
            if region.end.x > width or region.end.y > height:
                _fail("enemy AtlasTexture region exceeds atlas")
                return
            var frame_texture := AtlasTexture.new()
            frame_texture.atlas = texture
            frame_texture.region = region
            frames.add_frame(name, frame_texture)
            total += 1

    if total != 78:
        _fail("unexpected strict enemy total frame count: %d" % total)
        return

    var sprite := AnimatedSprite2D.new()
    sprite.sprite_frames = frames
    get_root().add_child(sprite)
    for action_value in actions:
        var action: Dictionary = action_value
        var name := String(action["name"])
        var count := int(action["frames"])
        if frames.get_frame_count(name) != count:
            _fail("enemy SpriteFrames count drift: " + name)
            return
        sprite.play(name)
        sprite.frame = count - 1
        var frame_texture := frames.get_frame_texture(name, count - 1)
        if not (frame_texture is AtlasTexture):
            _fail("enemy frame is not AtlasTexture: " + name)
            return

    print("OK Godot strict enemy-v10 smoke: enemy=%s actions=%d frames=%d" % [
        String(manifest.get("enemy_type", "")), actions.size(), total
    ])
    quit(0)
