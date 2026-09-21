extends SceneTree

const ROOT := "/tmp/matthias-pistol-v1-seed"
const ATLAS_PATH := ROOT + "/bank/core.png"
const MANIFEST_PATH := ROOT + "/bank/manifest.json"
const CELL := 416
const EXPECTED := {
    "idle": 3,
    "walk": 4,
    "run": 4,
    "shoot": 1,
    "crouch": 1,
}

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    var image := Image.new()
    if image.load(ATLAS_PATH) != OK:
        _fail("Godot failed to load Matthias pistol v1 seed atlas")
        return
    if image.get_width() != CELL * 4 or image.get_height() != CELL * 5:
        _fail("Matthias pistol v1 seed atlas dimensions drift")
        return

    var raw := FileAccess.get_file_as_string(MANIFEST_PATH)
    var parsed = JSON.parse_string(raw)
    if typeof(parsed) != TYPE_DICTIONARY:
        _fail("Matthias pistol v1 seed manifest is not an object")
        return
    var manifest: Dictionary = parsed
    if String(manifest.get("kind", "")) != "pawn-slug-sprite-forge-bank":
        _fail("unexpected Sprite Forge manifest kind")
        return
    if String(manifest.get("actor", "")) != "matthias":
        _fail("unexpected Sprite Forge actor")
        return
    if String(manifest.get("weapon", "")) != "pistol":
        _fail("unexpected Sprite Forge weapon")
        return

    var texture := ImageTexture.create_from_image(image)
    if texture == null:
        _fail("Godot failed to create ImageTexture for v1 seed atlas")
        return

    var total := 0
    for animation in manifest.get("animations", []):
        var action := String(animation.get("name", ""))
        if not EXPECTED.has(action):
            _fail("unexpected seed action: " + action)
            return
        var regions = animation.get("regions", [])
        if regions.size() != int(EXPECTED[action]):
            _fail(action + " region count drift")
            return
        for region_data in regions:
            var region := Rect2(
                float(region_data.get("x", -1)),
                float(region_data.get("y", -1)),
                float(region_data.get("width", -1)),
                float(region_data.get("height", -1)),
            )
            if region.size != Vector2(CELL, CELL):
                _fail(action + " cell size drift")
                return
            if region.end.x > image.get_width() or region.end.y > image.get_height():
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

    if total != 13:
        _fail("unexpected Matthias pistol v1 seed frame total")
        return

    print("OK Matthias pistol v1 seed bank: 13 canonical frames loaded by Godot")
    quit(0)
