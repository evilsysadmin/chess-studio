class_name ChessFootballSpriteBank
extends RefCounted

const MANIFEST_PATH := "res://assets/players/manifest.json"
const ASSET_ROOT := "res://assets/players/"
const TEAM_KEYS := ["fc_matthias", "real_enroque"]

static var _cached_manifest: Dictionary = {}
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

static func _canonical_run_meta() -> Dictionary:
	return manifest().get("canonical_run", {})

static func _canonical_run_target(team_id: int) -> Color:
	return Color("#245fc2") if clampi(team_id, 0, 1) == 0 else Color("#ad2936")

static func _recolor_canonical_run(image: Image, team_id: int) -> void:
	var target := _canonical_run_target(team_id)
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var color := image.get_pixel(x, y)
			if color.a <= 0.03:
				continue
			if color.h >= 0.43 and color.h <= 0.60 and color.s >= 0.25 and color.v >= 0.18:
				var saturation := clampf(color.s * 0.72 + target.s * 0.28, 0.20, 1.0)
				image.set_pixel(x, y, Color.from_hsv(target.h, saturation, color.v, color.a))

static func _canonical_run_texture(team_id: int) -> Texture2D:
	var key := _team_key(team_id)
	if _cached_run_textures.has(key):
		return _cached_run_textures[key]
	var meta := _canonical_run_meta()
	assert(not meta.is_empty(), "Falta canonical run meta para Chess Football")
	var encoded := ""
	for part_variant in meta["encoded_parts"]:
		var encoded_path := ASSET_ROOT + String(part_variant)
		encoded += FileAccess.get_file_as_string(encoded_path).strip_edges()
	assert(not encoded.is_empty(), "Canonical run atlas vacío")
	var bytes := Marshalls.base64_to_raw(encoded)
	var hash := HashingContext.new()
	assert(hash.start(HashingContext.HASH_SHA256) == OK, "No se pudo iniciar SHA-256")
	assert(hash.update(bytes) == OK, "No se pudo hashear canonical run")
	assert(hash.finish().hex_encode() == String(meta["sha256"]), "Canonical run SHA-256 inválido")
	var image := Image.new()
	assert(image.load_png_from_buffer(bytes) == OK, "Canonical run PNG inválido")
	_recolor_canonical_run(image, team_id)
	assert(image.generate_mipmaps() == OK, "No se pudieron generar mipmaps del canonical run")
	var texture := ImageTexture.create_from_image(image)
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

	var run_meta := _canonical_run_meta()
	var run_texture := _canonical_run_texture(team_id)
	var run_cell_data: Dictionary = run_meta["cell"]
	var run_cell := Vector2(float(run_cell_data["width"]), float(run_cell_data["height"]))
	var run_frames := int(run_meta["frames"])
	assert(
		run_texture.get_size() == Vector2(run_cell.x * run_frames, run_cell.y),
		"Dimensiones de canonical run incompatibles con manifest"
	)

	var frames := SpriteFrames.new()
	if frames.has_animation("default"):
		frames.remove_animation("default")
	for item in data["animations"]:
		var animation: Dictionary = item
		var animation_name := StringName(animation["name"])
		frames.add_animation(animation_name)
		var animation_fps := float(animation["fps"])
		if animation_name == &"sprint":
			animation_fps = maxf(animation_fps, 15.0)
		frames.set_animation_speed(animation_name, animation_fps)
		frames.set_animation_loop(animation_name, bool(animation["loop"]))
		if animation_name == &"idle":
			var idle_region := AtlasTexture.new()
			idle_region.atlas = run_texture
			idle_region.region = Rect2(Vector2.ZERO, run_cell)
			frames.add_frame(animation_name, idle_region)
			continue
		if animation_name in [&"run", &"sprint"]:
			assert(run_frames == int(animation["frames"]), "Canonical locomotion frame count inválido")
			for column in range(run_frames):
				var run_region := AtlasTexture.new()
				run_region.atlas = run_texture
				run_region.region = Rect2(Vector2(float(column) * run_cell.x, 0.0), run_cell)
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
