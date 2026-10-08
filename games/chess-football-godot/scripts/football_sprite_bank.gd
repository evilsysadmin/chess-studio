class_name ChessFootballSpriteBank
extends RefCounted

const MANIFEST_PATH := "res://assets/players/manifest.json"
const ASSET_ROOT := "res://assets/players/"
const RASTER_RUN_ROOT := "res://assets/players/raster_run/"
const RASTER_RUN_SIZE := Vector2(1024.0, 144.0)
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

static func atlas_key(team_id: int, role: String = "", squad_index: int = -1) -> String:
	var key: String = TEAM_KEYS[clampi(team_id, 0, TEAM_KEYS.size() - 1)]
	if role == "keeper":
		return key + "_keeper"
	if squad_index < 1:
		return key
	var variant_map: Dictionary = manifest().get("field_variants", {})
	var variants: Array = variant_map.get(key, [])
	if variants.is_empty():
		return key
	var field_slot := clampi(squad_index - 1, 0, variants.size() - 1)
	return String(variants[field_slot])

static func raster_run_path(team_id: int) -> String:
	var team_key: String = TEAM_KEYS[clampi(team_id, 0, TEAM_KEYS.size() - 1)]
	return RASTER_RUN_ROOT + team_key + ".png"


static func build_frames(team_id: int, role: String = "", squad_index: int = -1) -> SpriteFrames:
	var data := manifest()
	var key: String = atlas_key(team_id, role, squad_index)
	var atlas_meta: Dictionary = data["atlases"][key]
	var texture := load(ASSET_ROOT + String(atlas_meta["file"])) as Texture2D
	assert(texture != null, "No se pudo cargar el atlas de Chess Football")

	var cell_data: Dictionary = data["cell"]
	var cell := Vector2(float(cell_data["width"]), float(cell_data["height"]))
	var expected_size := Vector2(cell.x * int(data["columns"]), cell.y * int(data["rows"]))
	assert(texture.get_size() == expected_size, "Dimensiones de atlas incompatibles con manifest")

	var raster_run: Texture2D = null
	if role != "keeper":
		raster_run = load(raster_run_path(team_id)) as Texture2D
		assert(raster_run != null, "No se pudo cargar el atlas raster canónico de carrera")
		assert(raster_run.get_size() == RASTER_RUN_SIZE, "Dimensiones de raster run incompatibles")

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
			if raster_run != null and animation_name in [&"run", &"sprint"]:
				region.atlas = raster_run
				region.region = Rect2(Vector2(float(column) * cell.x, 0.0), cell)
			else:
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
