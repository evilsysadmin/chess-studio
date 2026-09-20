extends SceneTree

const TYPES := ["pawn", "knight", "rook", "queen", "grenadier", "scout", "commando", "shield", "bishop"]
const EXPECTED_ACTIONS := ["idle", "run"]

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 2:
        _fail("expected output directory and manifest path")
        return
    var output_dir := String(args[0])
    var manifest_path := String(args[1])
    var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("enemy v2 manifest is not an object")
        return
    var manifest: Dictionary = parsed
    if int(manifest.get("schema", -1)) != 2 or String(manifest.get("scope", "")) != "pawn-slug-godot-enemy-v2":
        _fail("enemy v2 manifest contract drift")
        return
    if manifest.get("cell", []) != [256, 416] or manifest.get("grid", []) != [4, 4]:
        _fail("enemy v2 cell/grid contract drift")
        return
    var actions_value = manifest.get("actions", [])
    if typeof(actions_value) != TYPE_ARRAY or actions_value.size() != 2:
        _fail("enemy v2 actions contract drift")
        return
    var types_value = manifest.get("types", [])
    if typeof(types_value) != TYPE_ARRAY or types_value.size() != TYPES.size():
        _fail("enemy v2 type count drift")
        return
    var total := 0
    for ti in range(TYPES.size()):
        var item: Dictionary = types_value[ti]
        var kind := String(item.get("type", ""))
        if kind != TYPES[ti]:
            _fail("enemy v2 type order drift")
            return
        var atlas_path := output_dir.path_join(String(item.get("atlas", "")))
        var image := Image.new()
        if image.load(atlas_path) != OK or Vector2i(image.get_width(), image.get_height()) != Vector2i(1024, 1664):
            _fail("Godot failed to decode mobile-safe atlas: " + kind)
            return
        var texture := ImageTexture.create_from_image(image)
        if texture == null:
            _fail("Godot failed to create ImageTexture: " + kind)
            return
        var sprite_frames := SpriteFrames.new()
        if sprite_frames.has_animation("default"):
            sprite_frames.remove_animation("default")
        for ai in range(actions_value.size()):
            var action: Dictionary = actions_value[ai]
            var action_name := String(action.get("name", ""))
            if action_name != EXPECTED_ACTIONS[ai]:
                _fail("enemy v2 action order drift")
                return
            var indices: Array = action.get("indices", [])
            if indices.size() != 8:
                _fail("enemy v2 action frame count drift: " + action_name)
                return
            var animation := "%s_%s" % [kind, action_name]
            sprite_frames.add_animation(animation)
            sprite_frames.set_animation_speed(animation, float(action.get("fps", 1.0)))
            sprite_frames.set_animation_loop(animation, bool(action.get("loop", true)))
            for index_value in indices:
                var index := int(index_value)
                var row := int(index / 4)
                var col := index % 4
                var region := Rect2(float(col * 256), float(row * 416), 256.0, 416.0)
                if region.end.x > 1024.0 or region.end.y > 1664.0:
                    _fail("AtlasTexture region escaped atlas: %s[%d]" % [kind, index])
                    return
                var atlas_texture := AtlasTexture.new()
                atlas_texture.atlas = texture
                atlas_texture.region = region
                sprite_frames.add_frame(animation, atlas_texture)
                total += 1
            if sprite_frames.get_frame_count(animation) != 8:
                _fail("SpriteFrames count drift: " + animation)
                return
        var sprite := AnimatedSprite2D.new()
        sprite.sprite_frames = sprite_frames
        get_root().add_child(sprite)
        for action_name in EXPECTED_ACTIONS:
            var animation := "%s_%s" % [kind, action_name]
            sprite.play(animation)
            sprite.frame = 7
            var frame_texture := sprite_frames.get_frame_texture(animation, 7)
            if not (frame_texture is AtlasTexture) or (frame_texture as AtlasTexture).region.size != Vector2(256, 416):
                _fail("runtime AtlasTexture contract drift: " + animation)
                return
        sprite.queue_free()
    if total != 144:
        _fail("unexpected enemy v2 frame total: %d" % total)
        return
    print("OK Godot enemy v2 runtime smoke: types=9 animations=18 frames=144 pages=9x1024x1664")
    quit(0)
