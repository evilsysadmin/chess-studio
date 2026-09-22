extends RefCounted

const PICKUP_SPAWN_SIZE := Vector2(56.0, 56.0)
const PICKUP_SPAWN_CLEARANCE := 6.0
const PICKUP_SPAWN_SEARCH_STEP := 48.0

static func rects_from_specs(raw: Array) -> Array[Rect2]:
    var result: Array[Rect2] = []
    for entry in raw:
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var item: Dictionary = entry
        result.append(Rect2(
            float(item.get("x", 0.0)),
            float(item.get("y", 0.0)),
            float(item.get("w", 0.0)),
            float(item.get("h", 0.0)),
        ))
    return result

static func _pickup_spawn_rect(position: Vector2) -> Rect2:
    return Rect2(position - PICKUP_SPAWN_SIZE * 0.5, PICKUP_SPAWN_SIZE)

static func _pickup_spawn_clear(
    position: Vector2,
    world_size: Vector2,
    floor_y: float,
    obstacles: Array[Rect2],
    platforms: Array[Rect2],
) -> bool:
    var rect := _pickup_spawn_rect(position)
    if rect.position.x < 0.0 or rect.end.x > world_size.x:
        return false
    if rect.position.y < 0.0 or rect.end.y >= floor_y - 1.0:
        return false
    for obstacle in obstacles:
        if rect.intersects(obstacle.grow(PICKUP_SPAWN_CLEARANCE)):
            return false
    for platform in platforms:
        if rect.intersects(platform.grow(PICKUP_SPAWN_CLEARANCE)):
            return false
    return true

static func resolve_pickup_spawn(
    desired: Vector2,
    world_size: Vector2,
    floor_y: float,
    obstacles: Array[Rect2],
    platforms: Array[Rect2],
) -> Vector2:
    if _pickup_spawn_clear(desired, world_size, floor_y, obstacles, platforms):
        return desired

    var desired_rect := _pickup_spawn_rect(desired)
    var blockers: Array[Rect2] = []
    blockers.append_array(obstacles)
    blockers.append_array(platforms)
    for blocker in blockers:
        var expanded := blocker.grow(PICKUP_SPAWN_CLEARANCE)
        if not desired_rect.intersects(expanded):
            continue
        var above := Vector2(
            clampf(desired.x, PICKUP_SPAWN_SIZE.x * 0.5, world_size.x - PICKUP_SPAWN_SIZE.x * 0.5),
            blocker.position.y - PICKUP_SPAWN_SIZE.y * 0.5 - PICKUP_SPAWN_CLEARANCE,
        )
        if _pickup_spawn_clear(above, world_size, floor_y, obstacles, platforms):
            return above

    # If authored geometry changed around a pickup, search nearby instead of
    # allowing the item to materialize inside a crate/platform.
    for ring in range(1, 7):
        var distance := PICKUP_SPAWN_SEARCH_STEP * float(ring)
        var offsets := [
            Vector2(-distance, 0.0),
            Vector2(distance, 0.0),
            Vector2(0.0, -distance),
            Vector2(-distance, -distance),
            Vector2(distance, -distance),
        ]
        for offset in offsets:
            var candidate: Vector2 = desired + Vector2(offset)
            candidate.x = clampf(
                candidate.x,
                PICKUP_SPAWN_SIZE.x * 0.5,
                world_size.x - PICKUP_SPAWN_SIZE.x * 0.5,
            )
            candidate.y = minf(
                candidate.y,
                floor_y - PICKUP_SPAWN_SIZE.y * 0.5 - PICKUP_SPAWN_CLEARANCE,
            )
            if _pickup_spawn_clear(candidate, world_size, floor_y, obstacles, platforms):
                return candidate

    push_warning("Pickup spawn blocked near %s; keeping safest clamped fallback" % desired)
    return Vector2(
        clampf(desired.x, PICKUP_SPAWN_SIZE.x * 0.5, world_size.x - PICKUP_SPAWN_SIZE.x * 0.5),
        minf(desired.y, floor_y - PICKUP_SPAWN_SIZE.y * 0.5 - PICKUP_SPAWN_CLEARANCE),
    )
