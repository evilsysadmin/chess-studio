extends SceneTree

# Scenery review captures: renders the real stage at fixed x positions with
# enemies removed. Needs a renderer (not --headless), e.g. under xvfb-run:
#   PAWN_SLUG_STAGE=jungle_relay_v1 PAWN_SLUG_CAPTURE_DIR=/tmp/out \
#     xvfb-run -a godot --rendering-driver opengl3 --fixed-fps 60 \
#     --path games/pawn-slug-godot --script res://tests/scenery_capture.gd

const SHOTS := [0.06, 0.3, 0.55, 0.8]
var _main: Node
var _player
var _frame := 0
var _shot := 0
var _settle := 0
var _out := ""

func _initialize() -> void:
    _out = OS.get_environment("PAWN_SLUG_CAPTURE_DIR")
    if _out == "":
        _out = "user://scenery"
    DirAccess.make_dir_recursive_absolute(_out)
    root.size = Vector2i(1280, 720)
    var scene: PackedScene = load("res://main.tscn")
    _main = scene.instantiate()
    root.add_child(_main)

func _process(_delta: float) -> bool:
    _frame += 1
    if _player == null:
        _player = _main.get_node_or_null("Player")
        return false
    if _frame == 3:
        _main.enemies.clear()
    if not _player.visual_ready():
        if _frame > 120 and _player._art != null:
            _player._art._body_ready = true
        return false
    _player.invuln_remaining = 999.0
    if _settle == 0:
        var x: float = _main._world_size.x * SHOTS[_shot]
        var target: Vector2 = _player._find_safe_respawn_position(Vector2(x, _main._floor_y - 60.0))
        _player.global_position = target
        _player.velocity = Vector2.ZERO
    _settle += 1
    if _settle < 40:
        return false
    var image := root.get_texture().get_image()
    var path := "%s/%s_%d.png" % [_out, _main._stage_id, _shot]
    image.save_png(path)
    print("CAPTURE ", path)
    _shot += 1
    _settle = 0
    if _shot >= SHOTS.size():
        quit(0)
        return true
    return false
