extends SceneTree

func _init() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 3:
        push_error("usage: <atlas.png> <run13.png> <manifest.json>")
        quit(2)
        return

    var atlas_image := Image.load_from_file(args[0])
    var run_image := Image.load_from_file(args[1])
    if atlas_image == null or atlas_image.is_empty():
        push_error("cannot load v23 atlas")
        quit(3)
        return
    if run_image == null or run_image.is_empty():
        push_error("cannot load v23 run13")
        quit(4)
        return

    var manifest = JSON.parse_string(FileAccess.get_file_as_string(args[2]))
    if typeof(manifest) != TYPE_DICTIONARY:
        push_error("invalid v23 manifest")
        quit(5)
        return

    var atlas_meta: Dictionary = manifest.get("atlas", {})
    if int(atlas_meta.get("columns", 0)) != 8:
        push_error("v23 atlas columns mismatch")
        quit(6)
        return
    if int(atlas_meta.get("rows", 0)) != 18:
        push_error("v23 atlas rows mismatch")
        quit(7)
        return
    if int(atlas_meta.get("cell_size", 0)) != 416:
        push_error("v23 cell size mismatch")
        quit(8)
        return
    if atlas_image.get_size() != Vector2i(3328, 7488):
        push_error("v23 atlas dimensions mismatch")
        quit(9)
        return
    if run_image.get_size() != Vector2i(5408, 416):
        push_error("v23 run13 dimensions mismatch")
        quit(10)
        return

    var actions: Array = manifest.get("actions", [])
    var counts: Dictionary = manifest.get("frame_counts", {})
    if actions.size() != 18:
        push_error("v23 action count mismatch")
        quit(11)
        return

    var texture := ImageTexture.create_from_image(atlas_image)
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for row in range(actions.size()):
        var action := String(actions[row])
        var count := int(counts.get(action, 8))
        if count <= 0 or count > 8:
            push_error("invalid frame count for %s" % action)
            quit(12)
            return
        frames.add_animation(action)
        for column in range(count):
            var tex := AtlasTexture.new()
            tex.atlas = texture
            tex.region = Rect2(column * 416, row * 416, 416, 416)
            frames.add_frame(action, tex)

    if frames.get_frame_count("hurt") != 6:
        push_error("v23 hurt must use exactly six authored frames")
        quit(13)
        return
    for action in actions:
        var name := String(action)
        if name == "hurt":
            continue
        if frames.get_frame_count(name) != 8:
            push_error("v23 %s must expose eight atlas frames" % name)
            quit(14)
            return

    var run_texture := ImageTexture.create_from_image(run_image)
    if frames.has_animation("run"):
        frames.remove_animation("run")
    frames.add_animation("run")
    frames.set_animation_loop("run", true)
    frames.set_animation_speed("run", 26.0)
    for column in range(13):
        var tex := AtlasTexture.new()
        tex.atlas = run_texture
        tex.region = Rect2(column * 416, 0, 416, 416)
        frames.add_frame("run", tex)
    if frames.get_frame_count("run") != 13:
        push_error("v23 run13 frame count mismatch")
        quit(15)
        return

    print("OK strict-v23 SMG Godot smoke: 18 actions + hurt6 + run13")
    quit(0)
