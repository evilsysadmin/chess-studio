extends SceneTree

const BODY_PATH := "res://tests/fixtures/enemy_pawn_socket_body_v1.svg"
const WEAPON_PATH := "res://assets/weapon_atlas.svg"
const OUTPUT_DIR := "/tmp/pawn-slug-v1-slice"
const FRAME_SIZE := Vector2(256.0, 256.0)
const WEAPON_FRAME_SIZE := Vector2(256.0, 128.0)
const WEAPON_SCALE := Vector2(0.40, 0.40)

const SOCKETS := [
    {"anchor": [12.0, -12.0], "rear": [-13.0, 13.0], "front": [16.0, 12.0], "muzzle": [62.0, -11.0], "angle": -2.5},
    {"anchor": [13.0, -13.0], "rear": [-12.0, 12.0], "front": [17.0, 11.0], "muzzle": [63.0, -12.0], "angle": -1.8},
    {"anchor": [14.0, -14.0], "rear": [-11.0, 11.0], "front": [18.0, 10.0], "muzzle": [64.0, -13.0], "angle": -1.0},
    {"anchor": [15.0, -13.0], "rear": [-10.0, 12.0], "front": [19.0, 11.0], "muzzle": [65.0, -12.0], "angle": -0.2},
    {"anchor": [14.0, -12.0], "rear": [-11.0, 13.0], "front": [18.0, 12.0], "muzzle": [64.0, -11.0], "angle": 0.8},
    {"anchor": [13.0, -11.0], "rear": [-12.0, 14.0], "front": [17.0, 13.0], "muzzle": [63.0, -10.0], "angle": 0.2},
    {"anchor": [12.0, -12.0], "rear": [-13.0, 13.0], "front": [16.0, 12.0], "muzzle": [62.0, -11.0], "angle": -1.0},
    {"anchor": [11.0, -13.0], "rear": [-14.0, 12.0], "front": [15.0, 11.0], "muzzle": [61.0, -12.0], "angle": -2.0},
]

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _vec(value: Array) -> Vector2:
    return Vector2(float(value[0]), float(value[1]))

func _initialize() -> void:
    var body_texture := load(BODY_PATH) as Texture2D
    var weapon_texture := load(WEAPON_PATH) as Texture2D
    if body_texture == null:
        _fail("weapon-neutral body fixture failed to import")
        return
    if weapon_texture == null:
        _fail("weapon layer fixture failed to import")
        return

    var body_image := body_texture.get_image()
    var weapon_image := weapon_texture.get_image()
    if body_image == null or body_image.get_width() != 2048 or body_image.get_height() != 256:
        _fail("Godot did not rasterize the body fixture as expected")
        return
    if body_image.get_used_rect().size == Vector2i.ZERO:
        _fail("Godot body fixture imported with empty alpha")
        return
    if weapon_image == null or weapon_image.get_width() != 1024 or weapon_image.get_height() != 128:
        _fail("Godot did not rasterize the weapon fixture as expected")
        return
    if weapon_image.get_used_rect().size == Vector2i.ZERO:
        _fail("Godot weapon fixture imported with empty alpha")
        return

    DirAccess.make_dir_recursive_absolute(OUTPUT_DIR)
    if body_image.save_png(OUTPUT_DIR + "/body-import.png") != OK:
        _fail("failed to persist Godot body import")
        return
    if weapon_image.save_png(OUTPUT_DIR + "/weapon-import.png") != OK:
        _fail("failed to persist Godot weapon import")
        return

    for frame in range(SOCKETS.size()):
        var socket: Dictionary = SOCKETS[frame]
        var body := Sprite2D.new()
        body.texture = body_texture
        body.region_enabled = true
        body.region_rect = Rect2(Vector2(float(frame) * 256.0, 0.0), FRAME_SIZE)
        body.centered = true

        var weapon := Sprite2D.new()
        weapon.texture = weapon_texture
        weapon.region_enabled = true
        weapon.region_rect = Rect2(Vector2(256.0, 0.0), WEAPON_FRAME_SIZE)
        weapon.centered = true
        weapon.position = _vec(socket["anchor"])
        weapon.rotation = deg_to_rad(float(socket["angle"]))
        weapon.scale = WEAPON_SCALE
        weapon.z_index = 5
        body.add_child(weapon)
        get_root().add_child(body)

        if body.region_rect.size != FRAME_SIZE:
            _fail("body region contract drift")
            return
        if weapon.region_rect.size != WEAPON_FRAME_SIZE:
            _fail("weapon region contract drift")
            return
        if weapon.position != _vec(socket["anchor"]):
            _fail("weapon anchor was not applied")
            return
        body.queue_free()

    var payload := {"schema": 1, "fixture": "pawn+machinegun", "frames": SOCKETS}
    var file := FileAccess.open(OUTPUT_DIR + "/socket-contract.json", FileAccess.WRITE)
    if file == null:
        _fail("failed to write socket contract")
        return
    file.store_string(JSON.stringify(payload, "  "))
    file.close()

    print("OK enemy socket v1 transform smoke: Godot import + 8 per-frame machinegun sockets")
    quit(0)
