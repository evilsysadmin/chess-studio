extends SceneTree

const BODY_PATH := "res://assets/enemy_body_motion_atlas.svg"
const WEAPON_PATH := "res://assets/weapon_atlas.svg"
const OUTPUT_DIR := "/tmp/pawn-slug-v1-slice"
const FRAME_SIZE := Vector2(256.0, 256.0)
const WEAPON_FRAME_SIZE := Vector2(256.0, 128.0)
const BODY_SCALE := Vector2(0.86, 0.86)
const WEAPON_SCALE := Vector2(0.40, 0.40)
const FRAME_COUNT := 8

const SOCKETS := [
    {"anchor": Vector2(12.0, -12.0), "rear": Vector2(-13.0, 13.0), "front": Vector2(16.0, 12.0), "muzzle": Vector2(62.0, -11.0), "angle": -2.5},
    {"anchor": Vector2(13.0, -13.0), "rear": Vector2(-12.0, 12.0), "front": Vector2(17.0, 11.0), "muzzle": Vector2(63.0, -12.0), "angle": -1.8},
    {"anchor": Vector2(14.0, -14.0), "rear": Vector2(-11.0, 11.0), "front": Vector2(18.0, 10.0), "muzzle": Vector2(64.0, -13.0), "angle": -1.0},
    {"anchor": Vector2(15.0, -13.0), "rear": Vector2(-10.0, 12.0), "front": Vector2(19.0, 11.0), "muzzle": Vector2(65.0, -12.0), "angle": -0.2},
    {"anchor": Vector2(14.0, -12.0), "rear": Vector2(-11.0, 13.0), "front": Vector2(18.0, 12.0), "muzzle": Vector2(64.0, -11.0), "angle": 0.8},
    {"anchor": Vector2(13.0, -11.0), "rear": Vector2(-12.0, 14.0), "front": Vector2(17.0, 13.0), "muzzle": Vector2(63.0, -10.0), "angle": 0.2},
    {"anchor": Vector2(12.0, -12.0), "rear": Vector2(-13.0, 13.0), "front": Vector2(16.0, 12.0), "muzzle": Vector2(62.0, -11.0), "angle": -1.0},
    {"anchor": Vector2(11.0, -13.0), "rear": Vector2(-14.0, 12.0), "front": Vector2(15.0, 11.0), "muzzle": Vector2(61.0, -12.0), "angle": -2.0},
]

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _diamond(position: Vector2, color: Color, size: float = 4.0) -> Polygon2D:
    var marker := Polygon2D.new()
    marker.polygon = PackedVector2Array([
        Vector2(-size, 0.0),
        Vector2(0.0, -size),
        Vector2(size, 0.0),
        Vector2(0.0, size),
    ])
    marker.color = color
    marker.position = position
    marker.z_index = 20
    return marker

func _label(text: String, x: float) -> Label:
    var label := Label.new()
    label.text = text
    label.position = Vector2(x + 8.0, 316.0)
    label.add_theme_font_size_override("font_size", 13)
    label.modulate = Color(0.86, 0.89, 0.94, 1.0)
    return label

func _initialize() -> void:
    var body_texture := load(BODY_PATH) as Texture2D
    var weapon_texture := load(WEAPON_PATH) as Texture2D
    if body_texture == null:
        _fail("weapon-neutral body fixture failed to import")
        return
    if weapon_texture == null:
        _fail("weapon layer fixture failed to import")
        return

    var viewport := SubViewport.new()
    viewport.size = Vector2i(2048, 350)
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.transparent_bg = false
    get_root().add_child(viewport)

    var background := ColorRect.new()
    background.size = Vector2(2048.0, 350.0)
    background.color = Color(0.045, 0.052, 0.064, 1.0)
    viewport.add_child(background)

    var world := Node2D.new()
    viewport.add_child(world)
    var debug_root := Node2D.new()
    viewport.add_child(debug_root)

    for frame in range(FRAME_COUNT):
        var origin := Vector2(128.0 + float(frame) * 256.0, 180.0)

        var body := Sprite2D.new()
        body.texture = body_texture
        body.region_enabled = true
        body.region_rect = Rect2(Vector2(float(frame) * 256.0, 0.0), FRAME_SIZE)
        body.centered = true
        body.position = origin
        body.scale = BODY_SCALE
        body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
        world.add_child(body)

        var socket: Dictionary = SOCKETS[frame]
        var weapon := Sprite2D.new()
        weapon.texture = weapon_texture
        weapon.region_enabled = true
        weapon.region_rect = Rect2(Vector2(256.0, 0.0), WEAPON_FRAME_SIZE)
        weapon.centered = true
        weapon.position = origin + Vector2(socket["anchor"])
        weapon.rotation = deg_to_rad(float(socket["angle"]))
        weapon.scale = WEAPON_SCALE
        weapon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
        weapon.z_index = 5
        world.add_child(weapon)

        var hand_line := Line2D.new()
        hand_line.width = 2.0
        hand_line.default_color = Color(0.34, 0.92, 0.77, 0.9)
        hand_line.points = PackedVector2Array([
            origin + Vector2(socket["rear"]),
            origin + Vector2(socket["front"]),
        ])
        hand_line.z_index = 15
        debug_root.add_child(hand_line)
        debug_root.add_child(_diamond(origin + Vector2(socket["anchor"]), Color(1.0, 0.74, 0.22, 1.0)))
        debug_root.add_child(_diamond(origin + Vector2(socket["rear"]), Color(0.34, 0.92, 0.77, 1.0), 3.0))
        debug_root.add_child(_diamond(origin + Vector2(socket["front"]), Color(0.34, 0.92, 0.77, 1.0), 3.0))
        debug_root.add_child(_diamond(origin + Vector2(socket["muzzle"]), Color(1.0, 0.34, 0.30, 1.0), 3.5))
        viewport.add_child(_label("frame %02d" % frame, float(frame) * 256.0))

    DirAccess.make_dir_recursive_absolute(OUTPUT_DIR)
    await process_frame
    await process_frame

    debug_root.visible = false
    await process_frame
    var clean := viewport.get_texture().get_image()
    if clean == null or clean.get_width() != 2048 or clean.get_height() != 350:
        _fail("clean socket slice capture failed")
        return
    if clean.save_png(OUTPUT_DIR + "/enemy-pawn-smg-v1-clean.png") != OK:
        _fail("failed to save clean socket slice")
        return

    debug_root.visible = true
    await process_frame
    var debug := viewport.get_texture().get_image()
    if debug.save_png(OUTPUT_DIR + "/enemy-pawn-smg-v1-debug.png") != OK:
        _fail("failed to save debug socket slice")
        return

    print("OK enemy socket v1 visual slice: 8 pawn phases + modular machinegun")
    quit(0)
