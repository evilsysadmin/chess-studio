extends SceneTree

const ROOT := "/tmp/matthias-pistol-v1-seed"
const ATLAS_PATH := ROOT + "/bank/core.png"
const MANIFEST_PATH := ROOT + "/bank/manifest.json"
const REPORT_PATH := ROOT + "/seed-bank-report.json"
const CELL := 416

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _read_object(path: String, label: String) -> Dictionary:
    var raw := FileAccess.get_file_as_string(path)
    var parsed = JSON.parse_string(raw)
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail(label + " is not an object")
        return {}
    return parsed

func _initialize() -> void:
    var manifest := _read_object(MANIFEST_PATH, "Matthias pistol v1 seed manifest")
    if manifest.is_empty():
        return
    var report := _read_object(REPORT_PATH, "Matthias pistol v1 seed report")
    if report.is_empty():
        return

    if String(manifest.get("kind", "")) != "pawn-slug-sprite-forge-bank":
        _fail("unexpected Sprite Forge manifest kind")
        return
    if String(manifest.get("actor", "")) != "matthias":
        _fail("unexpected Sprite Forge actor")
        return
    if String(manifest.get("weapon", "")) != "pistol":
        _fail("unexpected Sprite Forge weapon")
        return

    var parts = manifest.get("parts", {})
    if typeof(parts) != TYPE_DICTIONARY or not parts.has("core"):
        _fail("Sprite Forge manifest is missing core part")
        return
    var core: Dictionary = parts["core"]
    var size = core.get("size", [])
    if typeof(size) != TYPE_ARRAY or size.size() != 2:
        _fail("core part size is invalid")
        return

    var image := Image.new()
    if image.load(ATLAS_PATH) != OK:
        _fail("Godot failed to load Matthias pistol v1 seed atlas")
        return
    if image.get_width() != int(size[0]) or image.get_height() != int(size[1]):
        _fail("Godot atlas dimensions disagree with Sprite Forge manifest")
        return
    if image.get_width() != int(core.get("columns", 0)) * CELL:
        _fail("core column contract drift")
        return
    if image.get_height() != int(core.get("rows", 0)) * CELL:
        _fail("core row contract drift")
        return

    var expected_coverage := {}
    for action_value in report.get("coverage", []):
        expected_coverage[String(action_value)] = true

    var texture := ImageTexture.create_from_image(image)
    if texture == null:
        _fail("Godot failed to create ImageTexture for v1 seed atlas")
        return

    var seen := {}
    var total := 0
    for animation_value in manifest.get("animations", []):
        if typeof(animation_value) != TYPE_DICTIONARY:
            _fail("manifest animation entry is not an object")
            return
        var animation: Dictionary = animation_value
        var action := String(animation.get("name", ""))
        if action.is_empty() or seen.has(action):
            _fail("invalid or duplicate seed action: " + action)
            return
        seen[action] = true
        if not expected_coverage.has(action):
            _fail("manifest action missing from seed report: " + action)
            return

        var stored_frames := int(animation.get("stored_frames", -1))
        var authored_frames := int(animation.get("authored_frames", -1))
        var regions = animation.get("regions", [])
        if stored_frames <= 0 or authored_frames <= 0:
            _fail(action + " frame counts must be positive")
            return
        if regions.size() != stored_frames:
            _fail(action + " region count disagrees with stored_frames")
            return

        for region_data_value in regions:
            if typeof(region_data_value) != TYPE_DICTIONARY:
                _fail(action + " region is not an object")
                return
            var region_data: Dictionary = region_data_value
            var region := Rect2(
                float(region_data.get("x", -1)),
                float(region_data.get("y", -1)),
                float(region_data.get("width", -1)),
                float(region_data.get("height", -1)),
            )
            if region.size != Vector2(CELL, CELL):
                _fail(action + " cell size drift")
                return
            if (
                region.position.x < 0.0
                or region.position.y < 0.0
                or region.end.x > image.get_width()
                or region.end.y > image.get_height()
            ):
                _fail(action + " cell escaped atlas")
                return

            var cell := image.get_region(Rect2i(region))
            if cell.get_used_rect().size == Vector2i.ZERO:
                _fail(action + " contains an empty authored cell")
                return

            var atlas_texture := AtlasTexture.new()
            atlas_texture.atlas = texture
            atlas_texture.region = region
            if atlas_texture.region.size != Vector2(CELL, CELL):
                _fail(action + " AtlasTexture region drift")
                return
            total += 1

    if seen.size() != expected_coverage.size():
        _fail("manifest/report coverage count drift")
        return

    var expected_total := 0
    for animation_value in manifest.get("animations", []):
        expected_total += int(animation_value.get("stored_frames", 0))
    if total != expected_total:
        _fail("Godot loaded frame total disagrees with manifest")
        return

    print(
        "OK Matthias pistol v1 seed bank: ",
        total,
        " canonical frames loaded by Godot across ",
        seen.size(),
        " actions",
    )
    quit(0)
