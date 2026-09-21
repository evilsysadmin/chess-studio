extends SceneTree

const MANIFEST_PATH := "res://assets/enemies-v4/enemy-initial-v4-manifest.json"
const ENEMY_VISUAL := preload("res://scripts/enemy_visual.gd")
const TYPES := ["pawn", "rook", "scout"]
const ACTION_ROWS := {"idle": 0, "run": 1, "shoot": 2, "hurt": 3}

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _row(body: Sprite2D) -> int:
    return int(round(body.region_rect.position.y / body.region_rect.size.y))

func _initialize() -> void:
    var parsed = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("initial enemy v4 manifest is not an object")
        return
    var manifest: Dictionary = parsed
    # JSON numeric values arrive as floats; normalize before enforcing the integer atlas contract.
    var cell = manifest.get("cell", [])
    var page_size = manifest.get("pageSize", [])
    if (
        typeof(cell) != TYPE_ARRAY
        or cell.size() < 2
        or int(cell[0]) != 320
        or int(cell[1]) != 416
        or typeof(page_size) != TYPE_ARRAY
        or page_size.size() < 2
        or int(page_size[0]) != 2560
        or int(page_size[1]) != 1664
    ):
        _fail("initial enemy v4 manifest dimensions drift")
        return

    var total := 0
    for item in manifest.get("types", []):
        var page_path := "res://assets/enemies-v4/" + String(item.get("page", ""))
        var texture := load(page_path) as Texture2D
        if texture == null or texture.get_width() != 2560 or texture.get_height() != 1664:
            _fail("Godot failed to import initial enemy v4 page: " + page_path)
            return
        var frames := SpriteFrames.new()
        if frames.has_animation("default"):
            frames.remove_animation("default")
        for action in manifest.get("actions", []):
            var action_name := String(action.get("name", ""))
            var row := int(action.get("row", -1))
            frames.add_animation(action_name)
            frames.set_animation_speed(action_name, float(action.get("fps", 1.0)))
            frames.set_animation_loop(action_name, bool(action.get("loop", false)))
            for col in range(8):
                var region := Rect2(float(col * 320), float(row * 416), 320.0, 416.0)
                if region.end.x > texture.get_width() or region.end.y > texture.get_height():
                    _fail("AtlasTexture escaped page")
                    return
                var atlas_texture := AtlasTexture.new()
                atlas_texture.atlas = texture
                atlas_texture.region = region
                frames.add_frame(action_name, atlas_texture)
                total += 1
            if frames.get_frame_count(action_name) != 8:
                _fail("SpriteFrames count drift: " + action_name)
                return

    if total != 96:
        _fail("unexpected initial enemy v4 frame total")
        return

    for kind in TYPES:
        var enemy = ENEMY_VISUAL.new()
        get_root().add_child(enemy)
        enemy.configure(kind, "machinegun", 62.0, 2, 2)
        await process_frame
        var body := enemy.get_node("FacingRoot/Body") as Sprite2D
        if body == null or not body.visible or body.region_rect.size != Vector2(320.0, 416.0):
            _fail("EnemyVisual did not install v4 body for " + kind)
            return
        if _row(body) != ACTION_ROWS["idle"]:
            _fail(kind + " did not start on idle row")
            return

        enemy.sync_state(0.0, 0.0, 1.0, true, 2, 2, 1.0)
        await process_frame
        if _row(body) != ACTION_ROWS["run"]:
            _fail(kind + " did not switch to run row")
            return

        enemy.play_fire()
        await process_frame
        if _row(body) != ACTION_ROWS["shoot"]:
            _fail(kind + " did not switch to shoot row")
            return

        enemy.sync_state(0.0, 0.0, 1.0, false, 1, 2, 1.0)
        await process_frame
        if _row(body) != ACTION_ROWS["hurt"]:
            _fail(kind + " did not switch to hurt row")
            return
        enemy.queue_free()
        await process_frame

    print("OK Godot initial enemy v4 smoke: 3 types, SpriteFrames/AtlasTexture + runtime rows")
    quit(0)
