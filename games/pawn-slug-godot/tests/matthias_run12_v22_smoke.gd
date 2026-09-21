extends SceneTree

func _init() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 1:
        push_error("usage: <run12.png>")
        quit(2)
        return
    var image := Image.load_from_file(args[0])
    if image == null or image.is_empty():
        push_error("cannot load run12 atlas")
        quit(3)
        return
    var cell := 416
    var columns := 12
    if image.get_width() != cell * columns or image.get_height() != cell:
        push_error("unexpected run12 dimensions: %s" % image.get_size())
        quit(4)
        return
    var texture := ImageTexture.create_from_image(image)
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    frames.add_animation("run")
    frames.set_animation_loop("run", true)
    frames.set_animation_speed("run", 18.0)
    for column in range(columns):
        var region := Rect2(column * cell, 0, cell, cell)
        if region.end.x > image.get_width():
            push_error("run12 region outside atlas")
            quit(5)
            return
        var frame := AtlasTexture.new()
        frame.atlas = texture
        frame.region = region
        frames.add_frame("run", frame)
    if frames.get_frame_count("run") != 12:
        push_error("run12 SpriteFrames count mismatch")
        quit(6)
        return
    print("OK strict-v22 run12 Godot smoke: 12 AtlasTexture regions")
    quit(0)
