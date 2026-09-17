extends Node2D

signal barrel_exploded(position: Vector2, radius: float, damage: int)
signal reward_claimed(reward: Dictionary, item_id: String, score: int)

const WORLD_SCALE := 40.0
const CRATE_SIZE := Vector2(54.0, 44.0)
const BARREL_SIZE := Vector2(36.0, 54.0)
const BARREL_BLAST_RADIUS := 2.4 * WORLD_SCALE
const BARREL_BLAST_DAMAGE := 72

const TYPES := {
    "crate": {"hp": 45, "score": 60, "size": CRATE_SIZE, "explosive": false},
    "barrel": {"hp": 30, "score": 90, "size": BARREL_SIZE, "explosive": true},
}

const LAYOUT := [
    {"id": "forest-cache", "type": "crate", "x": 16.2 * WORLD_SCALE, "reward": {"credits": 14}},
    {"id": "forest-barrel", "type": "barrel", "x": 25.2 * WORLD_SCALE, "reward": {"grenades": 1}},
    {"id": "ruins-cache", "type": "crate", "x": 35.7 * WORLD_SCALE, "reward": {"ammo": {"shotgun": 6}, "credits": 8}},
    {"id": "ruins-barrel", "type": "barrel", "x": 42.1 * WORLD_SCALE, "reward": {"credits": 18}},
    {"id": "dungeon-cache", "type": "crate", "x": 49.7 * WORLD_SCALE, "reward": {"grenades": 2, "credits": 10}},
    {"id": "dungeon-barrel", "type": "barrel", "x": 54.2 * WORLD_SCALE, "reward": {"ammo": {"machinegun": 22}}},
    {"id": "fortress-cache", "type": "crate", "x": 67.4 * WORLD_SCALE, "reward": {"ammo": {"machinegun": 30}, "credits": 16}},
    {"id": "fortress-barrel", "type": "barrel", "x": 91.5 * WORLD_SCALE, "reward": {"credits": 24}},
    {"id": "last-line-cache", "type": "crate", "x": 103.0 * WORLD_SCALE, "reward": {"ammo": {"panzerfaust": 1}, "credits": 20}, "secret": true},
]

var _platforms: Array[Rect2] = []
var _floor_y := 610.0
var _items: Array[Dictionary] = []

func configure(platforms: Array[Rect2], floor_y: float) -> void:
    _platforms = platforms.duplicate()
    _floor_y = floor_y
    _items.clear()
    for entry in LAYOUT:
        var type := String(entry["type"])
        var spec: Dictionary = TYPES[type]
        var size: Vector2 = spec["size"]
        var x := float(entry["x"])
        _items.append({
            "id": String(entry["id"]),
            "type": type,
            "x": x,
            "bottom_y": _support_y(x),
            "size": size,
            "hp": int(spec["hp"]),
            "max_hp": int(spec["hp"]),
            "reward": (entry.get("reward", {}) as Dictionary).duplicate(true),
            "secret": bool(entry.get("secret", false)),
            "destroyed": false,
            "reward_claimed": false,
        })
    queue_redraw()

func active_count() -> int:
    var count := 0
    for item in _items:
        if not bool(item["destroyed"]):
            count += 1
    return count

func has_target_at(point: Vector2) -> bool:
    return _first_item_at(point) >= 0

func damage_at(point: Vector2, amount: int) -> bool:
    var index := _first_item_at(point)
    if index < 0:
        return false
    _damage_item(index, float(amount))
    return true

func apply_blast(position: Vector2, radius: float, damage: int) -> void:
    if radius <= 0.0 or damage <= 0:
        return
    for index in range(_items.size()):
        var item := _items[index]
        if bool(item["destroyed"]):
            continue
        var center := _item_rect(item).get_center()
        var distance := position.distance_to(center)
        if distance > radius:
            continue
        var falloff := clampf(1.0 - distance / (radius * 1.35), 0.0, 1.0)
        _damage_item(index, float(damage) * falloff)

func _first_item_at(point: Vector2) -> int:
    for index in range(_items.size()):
        var item := _items[index]
        if bool(item["destroyed"]):
            continue
        if _item_rect(item).has_point(point):
            return index
    return -1

func _damage_item(index: int, amount: float) -> void:
    if index < 0 or index >= _items.size() or amount <= 0.0:
        return
    var item := _items[index]
    if bool(item["destroyed"]):
        return
    item["hp"] = maxf(0.0, float(item["hp"]) - amount)
    if float(item["hp"]) > 0.0:
        _items[index] = item
        queue_redraw()
        return

    item["destroyed"] = true
    _items[index] = item
    _claim_reward(index)

    var spec: Dictionary = TYPES[String(item["type"])]
    if bool(spec["explosive"]):
        barrel_exploded.emit(_item_rect(item).get_center(), BARREL_BLAST_RADIUS, BARREL_BLAST_DAMAGE)
    queue_redraw()

func _claim_reward(index: int) -> void:
    var item := _items[index]
    if bool(item["reward_claimed"]):
        return
    item["reward_claimed"] = true
    _items[index] = item
    var spec: Dictionary = TYPES[String(item["type"])]
    reward_claimed.emit(
        (item["reward"] as Dictionary).duplicate(true),
        String(item["id"]),
        int(spec["score"]),
    )

func _support_y(x: float) -> float:
    var support := _floor_y
    for platform in _platforms:
        if x < platform.position.x or x > platform.position.x + platform.size.x:
            continue
        support = minf(support, platform.position.y)
    return support

func _item_rect(item: Dictionary) -> Rect2:
    var size: Vector2 = item["size"]
    return Rect2(
        Vector2(float(item["x"]) - size.x * 0.5, float(item["bottom_y"]) - size.y),
        size,
    )

func _draw() -> void:
    for item in _items:
        if bool(item["destroyed"]):
            continue
        if String(item["type"]) == "barrel":
            _draw_barrel(item)
        else:
            _draw_crate(item)

func _draw_crate(item: Dictionary) -> void:
    var rect := _item_rect(item)
    var ratio := clampf(float(item["hp"]) / float(item["max_hp"]), 0.0, 1.0)
    draw_rect(rect, Color("76513a"), true)
    draw_rect(rect, Color("c08a55") if not bool(item["secret"]) else Color("d7b65e"), false, 3.0)
    draw_line(rect.position + Vector2(7.0, 7.0), rect.end - Vector2(7.0, 7.0), Color("4a3228"), 4.0)
    draw_line(Vector2(rect.end.x - 7.0, rect.position.y + 7.0), Vector2(rect.position.x + 7.0, rect.end.y - 7.0), Color("4a3228"), 4.0)
    if ratio < 0.72:
        draw_line(rect.get_center() + Vector2(-5.0, -14.0), rect.get_center() + Vector2(3.0, 2.0), Color("2b201b"), 2.0)
    if ratio < 0.38:
        draw_line(rect.get_center() + Vector2(3.0, 2.0), rect.get_center() + Vector2(-8.0, 15.0), Color("2b201b"), 2.0)
    if bool(item["secret"]):
        draw_circle(rect.position + Vector2(rect.size.x - 8.0, 8.0), 3.5, Color("ffd66e"))

func _draw_barrel(item: Dictionary) -> void:
    var rect := _item_rect(item)
    var ratio := clampf(float(item["hp"]) / float(item["max_hp"]), 0.0, 1.0)
    draw_rect(rect, Color("596047"), true)
    draw_rect(rect, Color("a1a77a"), false, 3.0)
    draw_line(Vector2(rect.position.x, rect.position.y + 10.0), Vector2(rect.end.x, rect.position.y + 10.0), Color("2f352b"), 4.0)
    draw_line(Vector2(rect.position.x, rect.end.y - 10.0), Vector2(rect.end.x, rect.end.y - 10.0), Color("2f352b"), 4.0)
    draw_rect(Rect2(rect.get_center() - Vector2(3.0, 11.0), Vector2(6.0, 22.0)), Color("bd5b43"), true)
    draw_rect(Rect2(rect.get_center() - Vector2(11.0, 3.0), Vector2(22.0, 6.0)), Color("bd5b43"), true)
    if ratio < 0.55:
        draw_circle(rect.get_center() + Vector2(9.0, -13.0), 3.0, Color("ff8b4a"))
