extends SceneTree

func _init() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 2:
        push_error("usage: <atlas.png> <manifest.json>")
        quit(2)
        return
    var image := Image.load_from_file(args[0])
    if image == null or image.is_empty():
        push_error("cannot load atlas")
        quit(3)
        return
    var manifest_text := FileAccess.get_file_as_string(args[1])
    var manifest = JSON.parse_string(manifest_text)
    if typeof(manifest) != TYPE_DICTIONARY:
        push_error("invalid manifest")
        quit(4)
        return
    var atlas_meta: Dictionary = manifest.get("atlas", {})
    var cols := int(atlas_meta.get("columns", 0))
    var rows := int(atlas_meta.get("rows", 0))
    var cell := int(atlas_meta.get("cell_size", 0))
    if cols != 8 or rows != 18 or cell != 416:
        push_error("unexpected strict-v16 grid")
        quit(5)
        return
    if image.get_width() != cols * cell or image.get_height() != rows * cell:
        push_error("atlas dimensions do not match manifest")
        quit(6)
        return
    var texture := ImageTexture.create_from_image(image)
    var sprite_frames := SpriteFrames.new()
    sprite_frames.add_animation("strict_v16_smoke")
    for row in range(rows):
        for col in range(cols):
            var region := Rect2(col * cell, row * cell, cell, cell)
            if region.end.x > image.get_width() or region.end.y > image.get_height():
                push_error("region outside atlas")
                quit(7)
                return
            var frame := AtlasTexture.new()
            frame.atlas = texture
            frame.region = region
            sprite_frames.add_frame("strict_v16_smoke", frame)
    if sprite_frames.get_frame_count("strict_v16_smoke") != 144:
        push_error("SpriteFrames did not consume all 144 cells")
        quit(8)
        return
    print("OK strict-v16 Godot atlas smoke: 144 AtlasTexture regions")
    quit(0)
