class_name ChessFootballSpriteBank
extends RefCounted

const MANIFEST_PATH := "res://assets/players/manifest.json"
const ASSET_ROOT := "res://assets/players/"
const TEAM_KEYS := ["fc_matthias", "real_enroque"]

static var _cached_manifest: Dictionary = {}

static func manifest() -> Dictionary:
	if not _cached_manifest.is_empty():
		return _cached_manifest
	var raw := FileAccess.get_file_as_string(MANIFEST_PATH)
	var parsed: Variant = JSON.parse_string(raw)
	assert(parsed is Dictionary, "Chess Football sprite manifest inválido")
	_cached_manifest = parsed
	return _cached_manifest

static func atlas_key(team_id: int, role: String = "") -> String:
	var key: String = TEAM_KEYS[clampi(team_id, 0, TEAM_KEYS.size() - 1)]
	return key + "_keeper" if role == "keeper" else key

static func build_frames(team_id: int, role: String = "") -> SpriteFrames:
	var data := manifest()
	var key: String = atlas_key(team_id, role)
	var atlas_meta: Dictionary = data["atlases"][key]
	var texture := load(ASSET_ROOT + String(atlas_meta["file"])) as Texture2D
	assert(texture != null, "No se pudo cargar el atlas de Chess Football")

	var cell_data: Dictionary = data["cell"]
	var cell := Vector2(float(cell_data["width"]), float(cell_data["height"]))
	var expected_size := Vector2(cell.x * int(data["columns"]), cell.y * int(data["rows"]))
	assert(texture.get_size() == expected_size, "Dimensiones de atlas incompatibles con manifest")

	var frames := SpriteFrames.new()
	if frames.has_animation("default"):
		frames.remove_animation("default")
	for item in data["animations"]:
		var animation: Dictionary = item
		var animation_name := StringName(animation["name"])
		frames.add_animation(animation_name)
		frames.set_animation_speed(animation_name, float(animation["fps"]))
		frames.set_animation_loop(animation_name, bool(animation["loop"]))
		var row := int(animation["row"])
		for column in range(int(animation["frames"])):
			var region := AtlasTexture.new()
			region.atlas = texture
			region.region = Rect2(Vector2(float(column) * cell.x, float(row) * cell.y), cell)
			frames.add_frame(animation_name, region)
	return frames

static func cell_size() -> Vector2:
	var cell: Dictionary = manifest()["cell"]
	return Vector2(float(cell["width"]), float(cell["height"]))

static func footline() -> float:
	return float(manifest()["footline"])

static func display_scale() -> float:
	return float(manifest()["display_scale"])

static func animation_names() -> PackedStringArray:
	var names := PackedStringArray()
	for item in manifest()["animations"]:
		names.append(String(item["name"]))
	return names
