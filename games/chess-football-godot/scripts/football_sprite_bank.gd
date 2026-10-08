class_name ChessFootballSpriteBank
extends RefCounted

const MANIFEST_PATH := "res://assets/players/manifest.json"
const ASSET_ROOT := "res://assets/players/"
const TEAM_KEYS := ["fc_matthias", "real_enroque"]

static var _cached_manifest: Dictionary = {}
static var _cached_run_manifests: Dictionary = {}
static var _cached_run_textures: Dictionary = {}

static func manifest() -> Dictionary:
	if not _cached_manifest.is_empty():
		return _cached_manifest
	var raw := FileAccess.get_file_as_string(MANIFEST_PATH)
	var parsed: Variant = JSON.parse_string(raw)
	assert(parsed is Dictionary, "Chess Football sprite manifest inválido")
	_cached_manifest = parsed
	return _cached_manifest

static func _team_key(team_id: int) -> String:
	return TEAM_KEYS[clampi(team_id, 0, TEAM_KEYS.size() - 1)]

static func _canonical_run_meta(team_id: int) -> Dictionary:
	var canonical: Dictionary = manifest().get("canonical_run", {})
	var teams: Dictionary = canonical.get("teams", {})
	return teams.get(_team_key(team_id), {})

static func _canonical_run_manifest(team_id: int) -> Dictionary:
	var key := _team_key(team_id)
	if _cached_run_manifests.has(key):
		return _cached_run_manifests[key]
	var meta := _canonical_run_meta(team_id)
	assert(not meta.is_empty(), "Falta canonical run meta para Chess Football")
	var manifest_path := ASSET_ROOT + String(meta["manifest"])
	var raw := FileAccess.get_file_as_string(manifest_path)
	var parsed: Variant = JSON.parse_string(raw)
	assert(parsed is Dictionary, "Canonical run manifest inválido")
	_cached_run_manifests[key] = parsed
	return parsed

static func _canonical_run_texture(team_id: int) -> Texture2D:
	var key := _team_key(team_id)
	if _cached_run_textures.has(key):
		return _cached_run_textures[key]
	var meta := _canonical_run_meta(team_id)
	var texture := load(ASSET_ROOT + String(meta["atlas"])) as Texture2D
	assert(texture != null, "No se pudo cargar canonical run atlas")
	_cached_run_textures[key] = texture
	return texture

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

	var run_manifest := _canonical_run_manifest(team_id)
	var run_texture := _canonical_run_texture(team_id)
	var run_part: Dictionary = run_manifest["parts"]["main"]
	var run_size: Array = run_part["size"]
	assert(
		run_texture.get_size() == Vector2(float(run_size[0]), float(run_size[1])),
		"Dimensiones de canonical run incompatibles con manifest"
	)
	var run_animation: Dictionary = run_manifest["animations"][0]
	assert(String(run_animation["name"]) == "run", "Canonical run bank sin animación run")

	var frames := SpriteFrames.new()
	if frames.has_animation("default"):
		frames.remove_animation("default")
	for item in data["animations"]:
		var animation: Dictionary = item
		var animation_name := StringName(animation["name"])
		frames.add_animation(animation_name)
		frames.set_animation_speed(animation_name, float(animation["fps"]))
		frames.set_animation_loop(animation_name, bool(animation["loop"]))
		if animation_name == &"run":
			var regions: Array = run_animation["regions"]
			assert(regions.size() == int(animation["frames"]), "Canonical run frame count inválido")
			for region_meta_variant in regions:
				var region_meta: Dictionary = region_meta_variant
				var run_region := AtlasTexture.new()
				run_region.atlas = run_texture
				run_region.region = Rect2(
					Vector2(float(region_meta["x"]), float(region_meta["y"])),
					Vector2(float(region_meta["width"]), float(region_meta["height"]))
				)
				frames.add_frame(animation_name, run_region)
			continue
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
