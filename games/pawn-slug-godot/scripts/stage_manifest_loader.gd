extends RefCounted

const StageGeometryPolicy := preload("res://scripts/stage_geometry_policy.gd")


static func _dictionary_entries(raw_entries) -> Array[Dictionary]:
    var entries: Array[Dictionary] = []
    if typeof(raw_entries) != TYPE_ARRAY:
        return entries
    for entry in raw_entries:
        if typeof(entry) == TYPE_DICTIONARY:
            entries.append(Dictionary(entry).duplicate(true))
    return entries


static func load_stage(stage_id: String) -> Dictionary:
    var path := "res://maps/%s.json" % stage_id
    if not FileAccess.file_exists(path):
        return {}

    var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
    if typeof(parsed) != TYPE_DICTIONARY:
        return {}

    var manifest: Dictionary = Dictionary(parsed).duplicate(true)
    var world: Dictionary = manifest.get("world", {})
    var world_size := Vector2(
        float(world.get("width", 1280.0)),
        float(world.get("height", 720.0)),
    )
    var floor_y := float(world.get("floor_y", 610.0))
    var floor_depth := float(world.get("floor_depth", 110.0))
    var boundary_thickness := float(world.get("boundary_thickness", 40.0))
    var stage_start_x := float(world.get("start_x", 110.0))

    var checkpoints: Array = manifest.get("checkpoints", [stage_start_x]).duplicate(true)
    var platform_specs := _dictionary_entries(manifest.get("platforms", []))
    var platforms: Array[Rect2] = StageGeometryPolicy.rects_from_specs(platform_specs)
    var obstacle_specs := _dictionary_entries(manifest.get("obstacles", []))
    var obstacles: Array[Rect2] = StageGeometryPolicy.rects_from_specs(obstacle_specs)
    var dressing_specs := _dictionary_entries(manifest.get("dressing", []))
    var story_prop_specs := _dictionary_entries(manifest.get("story_props", []))
    var enemy_spawns := _dictionary_entries(manifest.get("enemies", []))
    var setpieces := _dictionary_entries(manifest.get("setpieces", []))

    var pickups: Array[Dictionary] = []
    for entry in manifest.get("pickups", []):
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var pickup := Dictionary(entry).duplicate(true)
        var desired_pickup := Vector2(
            float(pickup.get("x", stage_start_x)),
            float(pickup.get("y", floor_y - 44.0)),
        )
        var safe_pickup := StageGeometryPolicy.resolve_pickup_spawn(
            desired_pickup,
            world_size,
            floor_y,
            obstacles,
            platforms,
        )
        pickup["x"] = safe_pickup.x
        pickup["y"] = safe_pickup.y
        pickup["taken"] = false
        pickups.append(pickup)

    var boss_spec: Dictionary = manifest.get("boss", {})
    var boss_x := float(boss_spec.get("x", 4580.0))
    var boss_hp := int(boss_spec.get("hp", 780))
    var boss_size := Vector2(
        float(boss_spec.get("width", 190.0)),
        float(boss_spec.get("height", 150.0)),
    )
    var boss_trigger_x := float(boss_spec.get("trigger_x", boss_x - 720.0))
    var boss_arena_left := float(boss_spec.get("arena_left", boss_x - 570.0))
    var boss_arena_right := float(boss_spec.get("arena_right", boss_x + 500.0))

    var extraction_spec: Dictionary = manifest.get("extraction", {})
    var extraction_x := float(extraction_spec.get("x", world_size.x - 150.0))

    return {
        "manifest": manifest,
        "world_size": world_size,
        "floor_y": floor_y,
        "floor_depth": floor_depth,
        "boundary_thickness": boundary_thickness,
        "stage_start_x": stage_start_x,
        "checkpoints": checkpoints,
        "platform_specs": platform_specs,
        "platforms": platforms,
        "obstacle_specs": obstacle_specs,
        "obstacles": obstacles,
        "dressing_specs": dressing_specs,
        "story_prop_specs": story_prop_specs,
        "enemy_spawns": enemy_spawns,
        "setpieces": setpieces,
        "pickups": pickups,
        "boss_x": boss_x,
        "boss_hp": boss_hp,
        "boss_size": boss_size,
        "boss_trigger_x": boss_trigger_x,
        "boss_arena_left": boss_arena_left,
        "boss_arena_right": boss_arena_right,
        "extraction_x": extraction_x,
    }
