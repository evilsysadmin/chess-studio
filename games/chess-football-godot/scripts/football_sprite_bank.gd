class_name ChessFootballSpriteBank
extends RefCounted

const MANIFEST_PATH := "res://assets/players/manifest.json"
const ASSET_ROOT := "res://assets/players/"
const TEAM_KEYS := ["fc_matthias", "real_enroque"]

# Temporary action poses are composed from the already approved lateral
# raster run canon. Keep gameplay timing and unique action animation names;
# never flash back to a differently styled vector footballer mid-match.
# Authored action-specific raster art can replace these holds later.
const CANONICAL_ACTION_POSES := {
	"pass": [0, 0, 2, 3, 4, 4, 6, 6],
	"shoot": [1, 1, 3, 3, 5, 5, 7, 7],
	"tackle": [5, 6, 7, 7, 4, 3, 2, 1],
	"celebrate": [0, 2, 4, 6, 4, 2, 0, 0],
}

static var _cached_manifest: Dictionary = {}
static var _cached_run_textures: Dictionary = {}
static var _cached_3d_run_frames: Dictionary = {}
static var _cached_directional_textures: Dictionary = {}
static var _cached_3d_directional_frames: Dictionary = {}
static var _cached_keeper_textures: Dictionary = {}
static var _cached_keeper_frames: Dictionary = {}
# Every 3D raster frame has a known alpha boot baseline. Cache it while the
# CPU image is being cropped, not by reading textures back from WebGL each tick.
static var _cached_3d_frame_bottoms: Dictionary = {}
# Per-frame opaque-pixel luminance is gathered from already decoded CPU
# pixels during atlas slicing. No texture readbacks in the 3D game loop.
static var _cached_3d_frame_luminance: Dictionary = {}

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
	# Never perform required work inside assert(): release Web exports strip assertions.
	var hash_start := hash.start(HashingContext.HASH_SHA256)
	assert(hash_start == OK, "No se pudo iniciar SHA-256")
	var hash_update := hash.update(bytes)
	assert(hash_update == OK, "No se pudo hashear canonical run")
	var digest := hash.finish().hex_encode()
	assert(digest == String(meta["sha256"]), "Canonical run SHA-256 inválido")
	var image := Image.new()
	var decode_result := image.load_png_from_buffer(bytes)
	assert(decode_result == OK, "Canonical run PNG inválido")
	if decode_result != OK:
		push_error("Chess Football: cannot decode canonical run PNG; Web export may be missing .b64 assets")
		return null
	_recolor_canonical_run(image, team_id)
	var mipmap_result := image.generate_mipmaps()
	assert(mipmap_result == OK, "No se pudieron generar mipmaps del canonical run")
	var texture := ImageTexture.create_from_image(image)
	_cached_run_textures[key] = texture
	return texture

static func _directional_run_texture(team_id: int) -> Texture2D:
	var key := _team_key(team_id)
	if _cached_directional_textures.has(key):
		return _cached_directional_textures[key]
	var meta: Dictionary = manifest().get("directional_run", {})
	if meta.is_empty():
		return null
	var encoded := ""
	for part in meta["encoded_parts"]:
		encoded += FileAccess.get_file_as_string(ASSET_ROOT + String(part)).strip_edges()
	if encoded.is_empty():
		push_error("Chess Football: directional run atlas missing from Web export")
		return null
	var bytes := Marshalls.base64_to_raw(encoded)
	var hash := HashingContext.new()
	if hash.start(HashingContext.HASH_SHA256) != OK or hash.update(bytes) != OK:
		push_error("Chess Football: directional atlas SHA-256 failed")
		return null
	if hash.finish().hex_encode() != String(meta["sha256"]):
		push_error("Chess Football: directional run atlas SHA-256 mismatch")
		return null
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK:
		push_error("Chess Football: directional run PNG could not be decoded")
		return null
	var size_meta: Dictionary = meta["cell"]
	var expected_size := Vector2i(
		int(size_meta["width"]) * int(meta["frames"]),
		int(size_meta["height"]) * int((meta["views"] as Dictionary).size()),
	)
	if image.get_size() != expected_size:
		push_error("Chess Football: directional run atlas dimensions mismatch")
		return null
	# This source's authored blue is slightly more violet than the side run.
	# Remap kit blues to each team's hue; never recolor white fabric or skin.
	var target := _canonical_run_target(team_id)
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var color := image.get_pixel(x, y)
			if color.a <= 0.03:
				continue
			if color.h >= 0.54 and color.h <= 0.74 and color.s >= 0.25 and color.v >= 0.12:
				var saturation := clampf(color.s * 0.72 + target.s * 0.28, 0.20, 1.0)
				image.set_pixel(x, y, Color.from_hsv(target.h, saturation, color.v, color.a))
	var mipmap_result := image.generate_mipmaps()
	assert(mipmap_result == OK, "Chess Football: directional run mipmaps failed")
	var texture := ImageTexture.create_from_image(image)
	_cached_directional_textures[key] = texture
	return texture

static func _register_frame_bottom(texture: ImageTexture, cropped: Image) -> void:
	var visible: Rect2i = cropped.get_used_rect()
	assert(visible.size.y >= 60 and visible.end.y <= cropped.get_height())
	_cached_3d_frame_bottoms[texture.get_instance_id()] = float(visible.end.y)
	var rgba := cropped
	if rgba.get_format() != Image.FORMAT_RGBA8:
		rgba = cropped.duplicate()
		rgba.convert(Image.FORMAT_RGBA8)
	var bytes := rgba.get_data()
	var total := 0.0
	var opaque_count := 0
	for offset in range(0, bytes.size(), 4):
		if bytes[offset + 3] < 128:
			continue
		total += (
			0.2126 * float(bytes[offset])
			+ 0.7152 * float(bytes[offset + 1])
			+ 0.0722 * float(bytes[offset + 2])
		) / 255.0
		opaque_count += 1
	_cached_3d_frame_luminance[texture.get_instance_id()] = (
		total / float(opaque_count) if opaque_count > 0 else 0.0
	)


static func frame_luminance(texture: Texture2D) -> float:
	if texture == null:
		return 0.0
	return float(_cached_3d_frame_luminance.get(texture.get_instance_id(), 0.0))


static func frame_bottom(texture: Texture2D) -> float:
	if texture == null:
		return footline()
	return float(_cached_3d_frame_bottoms.get(texture.get_instance_id(), footline()))


static func has_frame_bottom(texture: Texture2D) -> bool:
	return texture != null and _cached_3d_frame_bottoms.has(texture.get_instance_id())


static func _direction_frame_3d(
	team_id: int, row: int, column: int, atlas: Texture2D, cell: Vector2
) -> Texture2D:
	var key := "%d:%d:%d" % [team_id, row, column]
	if _cached_3d_directional_frames.has(key):
		return _cached_3d_directional_frames[key]
	# WebGL cannot reliably draw AtlasTexture as AnimatedSprite3D frames.
	var source := atlas.get_image()
	var region := source.get_region(Rect2i(
		column * int(cell.x), row * int(cell.y), int(cell.x), int(cell.y)
	))
	assert(not region.is_empty(), "Empty directional 3D football frame")
	var texture := ImageTexture.create_from_image(region)
	_register_frame_bottom(texture, region)
	_cached_3d_directional_frames[key] = texture
	return texture

# Keeper runtime uses the accepted 4x8 raster bank, never the SVG silhouettes
# or another team's field-player animations. Four authored views are available.
static func _keeper_texture(team_id: int) -> Texture2D:
	var key := _team_key(team_id)
	if _cached_keeper_textures.has(key):
		return _cached_keeper_textures[key]
	var meta: Dictionary = manifest().get("goalkeeper_run", {})
	if meta.is_empty():
		push_error("Chess Football: canonical keeper metadata missing")
		return null
	var encoded := ""
	for part in meta["encoded_parts"]:
		# The approved payload has fixed-width base64 lines, unlike old run chunks.
		encoded += FileAccess.get_file_as_string(ASSET_ROOT + String(part)).replace("\n", "").replace("\r", "").strip_edges()
	if encoded.is_empty():
		push_error("Chess Football: approved keeper payload missing from Web export")
		return null
	var bytes := Marshalls.base64_to_raw(encoded)
	var hash := HashingContext.new()
	if hash.start(HashingContext.HASH_SHA256) != OK or hash.update(bytes) != OK:
		push_error("Chess Football: cannot verify keeper atlas SHA")
		return null
	if hash.finish().hex_encode() != String(meta["sha256"]):
		push_error("Chess Football: keeper asset does not match approved SHA")
		return null
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK:
		push_error("Chess Football: cannot decode approved keeper atlas")
		return null
	var cell: Dictionary = meta["cell"]
	if image.get_size() != Vector2i(int(cell["width"]) * int(meta["frames"]), int(cell["height"]) * 4):
		push_error("Chess Football: keeper atlas has invalid dimensions")
		return null
	if team_id == 1:
		# Recolor jersey/shorts/socks ONLY. Cap, white gloves and skin stay intact.
		var target := Color("#2bafad")
		for y in range(image.get_height()):
			for x in range(image.get_width()):
				var color := image.get_pixel(x, y)
				if color.a < 0.10:
					continue
				if color.h >= 0.105 and color.h <= 0.19 and color.s >= 0.43 and color.v >= 0.28:
					image.set_pixel(x, y, Color.from_hsv(target.h, color.s, color.v, color.a))
	var mipmap_result := image.generate_mipmaps()
	assert(mipmap_result == OK, "Chess Football: keeper mipmap creation failed")
	var texture := ImageTexture.create_from_image(image)
	_cached_keeper_textures[key] = texture
	return texture


static func _keeper_frame_3d(team_id: int, row: int, column: int, atlas: Texture2D, cell: Vector2) -> ImageTexture:
	var key := "%d:%d:%d" % [team_id, row, column]
	if _cached_keeper_frames.has(key):
		return _cached_keeper_frames[key]
	var image := atlas.get_image()
	var region := image.get_region(Rect2i(column * int(cell.x), row * int(cell.y), int(cell.x), int(cell.y)))
	assert(region.get_size() == Vector2i(128, 144), "Chess Football: invalid goalkeeper frame")
	var texture := ImageTexture.create_from_image(region)
	_register_frame_bottom(texture, region)
	_cached_keeper_frames[key] = texture
	return texture


static func _build_keeper_frames(team_id: int) -> SpriteFrames:
	var data := manifest()
	var meta: Dictionary = data["goalkeeper_run"]
	var atlas := _keeper_texture(team_id)
	var frames := SpriteFrames.new()
	if frames.has_animation("default"):
		frames.remove_animation("default")
	if atlas == null:
		push_error("Chess Football: keeper raster bank unavailable")
		return frames
	var cell := Vector2(float(meta["cell"]["width"]), float(meta["cell"]["height"]))
	var side_row := int(meta["side_fallback_row"])
	var front_row := int(meta["views"]["front"])
	for item in data["animations"]:
		var anim: StringName = StringName(item["name"])
		frames.add_animation(anim)
		frames.set_animation_speed(anim, maxf(float(item["fps"]), 15.0) if anim == &"sprint" else float(item["fps"]))
		frames.set_animation_loop(anim, bool(item["loop"]))
		if anim == &"idle":
			frames.add_frame(anim, _keeper_frame_3d(team_id, front_row, 0, atlas, cell))
			continue
		for frame_id in range(int(item["frames"])):
			var source_frame := frame_id
			if anim not in [&"run", &"sprint"]:
				var poses: Array = CANONICAL_ACTION_POSES.get(String(anim), [])
				if poses.is_empty():
					push_error("Chess Football: no keeper raster for " + String(anim))
					break
				source_frame = int(poses[frame_id % poses.size()])
			frames.add_frame(anim, _keeper_frame_3d(team_id, side_row, source_frame, atlas, cell))
	for view_name in ["front", "back", "back_diagonal", "front_diagonal"]:
		var authored_row: int = int(meta["views"][view_name])
		for base_name in ["run", "sprint"]:
			var named := StringName(base_name + "_" + view_name)
			frames.add_animation(named)
			frames.set_animation_speed(named, 15.0 if base_name == "sprint" else 12.0)
			frames.set_animation_loop(named, true)
			for frame_id in range(int(meta["frames"])):
				frames.add_frame(named, _keeper_frame_3d(team_id, authored_row, frame_id, atlas, cell))
	return frames


static func _run_frame_3d(team_id: int, column: int, atlas: Texture2D, cell: Vector2) -> Texture2D:
	var key := "%d:%d" % [team_id, column]
	if _cached_3d_run_frames.has(key):
		return _cached_3d_run_frames[key]
	# Sprite3D needs a standalone texture: AtlasTexture regions can vanish on WebGL.
	var source := atlas.get_image()
	var region := source.get_region(Rect2i(column * int(cell.x), 0, int(cell.x), int(cell.y)))
	assert(not region.is_empty(), "Empty 3D football frame")
	var texture := ImageTexture.create_from_image(region)
	_register_frame_bottom(texture, region)
	_cached_3d_run_frames[key] = texture
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

static func build_frames(team_id: int, role: String = "", squad_index: int = -1, for_3d: bool = false) -> SpriteFrames:
	if role == "keeper" and for_3d:
		return _build_keeper_frames(team_id)
	var data := manifest()
	var key: String = atlas_key(team_id, role, squad_index)
	var atlas_meta: Dictionary = data["atlases"][key]
	# The vector bank is kept for the authoritative 2D simulation only.
	# Never load/show its inconsistent body silhouettes in the 3D stadium.
	var texture: Texture2D = null
	var cell_data: Dictionary = data["cell"]
	var cell := Vector2(float(cell_data["width"]), float(cell_data["height"]))
	if not for_3d:
		texture = load(ASSET_ROOT + String(atlas_meta["file"])) as Texture2D
		assert(texture != null, "No se pudo cargar el atlas de Chess Football")
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
			frames.add_frame(animation_name, _run_frame_3d(team_id, 0, run_texture, run_cell) if for_3d else idle_region)
			continue
		if animation_name in [&"run", &"sprint"]:
			assert(run_frames == int(animation["frames"]), "Canonical locomotion frame count inválido")
			for column in range(run_frames):
				var run_region := AtlasTexture.new()
				run_region.atlas = run_texture
				run_region.region = Rect2(Vector2(float(column) * run_cell.x, 0.0), run_cell)
				frames.add_frame(animation_name, _run_frame_3d(team_id, column, run_texture, run_cell) if for_3d else run_region)
			continue
		if for_3d:
			var action_poses: Array = CANONICAL_ACTION_POSES.get(String(animation_name), [])
			if action_poses.is_empty():
				push_error("Chess Football: no canonical 3D raster for action " + String(animation_name))
				continue
			for action_frame in range(int(animation["frames"])):
				var source_frame: int = int(action_poses[action_frame % action_poses.size()])
				frames.add_frame(
					animation_name,
					_run_frame_3d(team_id, source_frame, run_texture, run_cell),
				)
			continue
		var row := int(animation["row"])
		for column in range(int(animation["frames"])):
			var region := AtlasTexture.new()
			region.atlas = texture
			region.region = Rect2(Vector2(float(column) * cell.x, float(row) * cell.y), cell)
			frames.add_frame(animation_name, region)
	# Add the four supplementary canonical views while preserving the original
	# side run/sprint and all action animations, including their existing phases.
	var directional_meta: Dictionary = data.get("directional_run", {})
	if not directional_meta.is_empty():
		var directional_atlas := _directional_run_texture(team_id)
		if directional_atlas != null:
			var directional_cell_data: Dictionary = directional_meta["cell"]
			var directional_cell := Vector2(
				float(directional_cell_data["width"]), float(directional_cell_data["height"])
			)
			for view_name in ["front", "back", "back_diagonal", "front_diagonal"]:
				var row: int = int(directional_meta["views"][view_name])
				for base_name in ["run", "sprint"]:
					var directional_name := StringName(base_name + "_" + view_name)
					frames.add_animation(directional_name)
					frames.set_animation_speed(directional_name, 15.0 if base_name == "sprint" else 12.0)
					frames.set_animation_loop(directional_name, true)
					for column in range(int(directional_meta["frames"])):
						var region := AtlasTexture.new()
						region.atlas = directional_atlas
						region.region = Rect2(
							Vector2(column * directional_cell.x, row * directional_cell.y),
							directional_cell,
						)
						frames.add_frame(
							directional_name,
							_direction_frame_3d(team_id, row, column, directional_atlas, directional_cell)
							if for_3d else region,
						)
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
