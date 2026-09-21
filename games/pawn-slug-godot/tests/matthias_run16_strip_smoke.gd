extends SceneTree

func _init() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 2:
        push_error("usage: <run16.png> <manifest.json>")
        quit(2)
        return
    var image := Image.load_from_file(args[0])
    if image == null or image.is_empty():
        push_error("cannot load run16 strip")
        quit(3)
        return
    var manifest = JSON.parse_string(FileAccess.get_file_as_string(args[1]))
    if typeof(manifest) != TYPE_DICTIONARY:
        push_error("invalid manifest")
        quit(4)
        return
    var strip_meta: Dictionary = manifest.get("strip", {})
    var cols := int(strip_meta.get("columns", 0))
    var rows := int(strip_meta.get("rows", 0))
    var cell := int(strip_meta.get("cell_size", 0))
    if cols != 16 or rows != 1 or cell != 416:
        push_error("unexpected run16 grid")
        quit(5)
        return
    if image.get_width() != cols * cell or image.get_height() != rows * cell:
        push_error("run16 dimensions do not match manifest")
        quit(6)
        return
    var texture := ImageTexture.create_from_image(image)
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    frames.add_animation("run")
    frames.set_animation_loop("run", true)
    frames.set_animation_speed("run", 32.0)
    for col in range(cols):
        var region := Rect2(col * cell, 0, cell, cell)
        if region.end.x > image.get_width() or region.end.y > image.get_height():
            push_error("run16 region outside strip")
            quit(7)
            return
        var frame := AtlasTexture.new()
        frame.atlas = texture
        frame.region = region
        frames.add_frame("run", frame)
    if frames.get_frame_count("run") != 16:
        push_error("SpriteFrames did not consume all 16 run frames")
        quit(8)
        return
    print("OK run16 Godot strip smoke: 16 AtlasTexture regions")
    quit(0)
