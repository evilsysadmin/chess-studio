extends SceneTree

# Traversal audit: drives the real Player through a real stage with real key
# events and reports where an attentive player cannot progress. Enemies are
# removed and the player is invulnerable: this measures geometry only.
#
#   PAWN_SLUG_STAGE=jungle_relay_v1 godot --headless --path games/pawn-slug-godot \
#       --script res://tests/traversal_audit.gd
#
# Strategy per stall (in order): plain jump; jump + mid-air double tap (the
# ledge climb); crouch-walk; climb up (ladders). A stall that survives all of
# them is reported, then the bot is moved past it to keep auditing.

const STALL_FRAMES := 45
const TACTIC_FRAMES := 80
const MAX_FRAMES := 60 * 240

var _main: Node
var _player
var _frame := 0
var _best_x := -INF
var _last_progress_frame := 0
var _tactic := -1
var _tactic_frame := 0
var _goal_x := 0.0
var _report: Array = []
var _deaths: Array = []
var _was_dead := false
var _keys := {}
var _death_counts := {}
var _seen_stuck := {}
var _pit_jump_frames := 0

func _initialize() -> void:
    var scene: PackedScene = load("res://main.tscn")
    _main = scene.instantiate()
    root.add_child(_main)

func _press(key: Key, down: bool) -> void:
    if bool(_keys.get(key, false)) == down:
        return
    _keys[key] = down
    var event := InputEventKey.new()
    event.keycode = key
    event.physical_keycode = key
    event.pressed = down
    Input.parse_input_event(event)

func _release_all() -> void:
    for key in _keys.keys():
        _press(key, false)

func _physics_process(_delta: float) -> bool:
    _frame += 1
    if _player == null:
        _player = _main.get_node_or_null("Player")
        if _player == null:
            return false
    if _frame == 2:
        _main.enemies.clear()
        var boss: Dictionary = _main._stage_manifest.get("boss", {})
        var extraction: Dictionary = _main._stage_manifest.get("extraction", {})
        _goal_x = float(boss.get("trigger_x", extraction.get("x", _main._world_size.x - 200.0))) - 40.0
        print("AUDIT stage=%s goal_x=%.0f start_x=%.0f" % [_main._stage_id, _goal_x, _player.global_position.x])
    if not _player.visual_ready():
        if _frame > 120 and _player._art != null:
            _player._art._body_ready = true
        return false
    _player.invuln_remaining = 999.0
    _player.lives = 99
    if _player.dead:
        if not _was_dead:
            var at := Vector2(_player.global_position)
            _deaths.append(at)
            var bucket := int(at.x / 200.0)
            _death_counts[bucket] = int(_death_counts.get(bucket, 0)) + 1
            _release_all()
        _was_dead = true
        return false
    if _was_dead:
        _was_dead = false
        _tactic = -1
        _last_progress_frame = _frame
        _best_x = _player.global_position.x
        # Three deaths in the same 200 px: report it as impassable and skip.
        for bucket in _death_counts.keys():
            if int(_death_counts[bucket]) >= 3 and _player.global_position.x < (int(bucket) + 1) * 200.0 + 60.0:
                _report.append({"x": int(bucket) * 200 + 100, "y": -1, "on_floor": false, "why": "repeated deaths"})
                _death_counts[bucket] = -1000
                _skip_to(float((int(bucket) + 1) * 200 + 220))
                return false
    var x: float = _player.global_position.x
    if _frame % 600 == 0:
        print("AUDIT progress frame=%d ms=%d x=%.0f y=%.0f tactic=%d dead=%s" % [_frame, Time.get_ticks_msec(), x, _player.global_position.y, _tactic, _player.dead])
    if x >= _goal_x or _frame > MAX_FRAMES:
        _finish(x >= _goal_x)
        return true
    if x > _best_x + 6.0:
        _best_x = x
        _last_progress_frame = _frame
        if _tactic != -1:
            _tactic = -1
            _release_all()
    _press(KEY_RIGHT, true)
    # A player sees a gap coming: jump at the edge of a pit like a person would.
    if _tactic == -1 and _player.is_on_floor():
        for pit in _main._stage_manifest.get("pits", []):
            var edge := float(pit.get("x", 0.0))
            if x + 24.0 >= edge - 26.0 and x + 24.0 < edge + 4.0:
                _press(KEY_SPACE, true)
                _pit_jump_frames = 28
    if _pit_jump_frames > 0:
        _pit_jump_frames -= 1
        if _pit_jump_frames == 0:
            _press(KEY_SPACE, false)
    var stalled := _frame - _last_progress_frame
    if stalled < STALL_FRAMES:
        return false
    if _tactic == -1:
        _tactic = 0
        _tactic_frame = _frame
    var t := _frame - _tactic_frame
    match _tactic:
        0: # full jump
            _press(KEY_SPACE, t < 28)
        1: # jump, then mid-air double tap for the ledge climb
            _press(KEY_SPACE, t < 16 or (t >= 22 and t < 26) or (t >= 30 and t < 34))
        2: # crouch-walk under low clearance
            _press(KEY_DOWN, t < TACTIC_FRAMES - 4)
        3: # climb (ladders)
            _press(KEY_UP, t < TACTIC_FRAMES - 4)
            _press(KEY_SPACE, t >= 40 and t < 60)
        4: # back off, then run-up jump (long gaps, approach from further away)
            _press(KEY_RIGHT, t >= 30)
            _press(KEY_LEFT, t < 30)
            _press(KEY_SPACE, t >= 44 and t < 72)
        _:
            var key := int(x / 40.0)
            if not _seen_stuck.has(key):
                _seen_stuck[key] = true
                _report.append({"x": round(x), "y": round(_player.global_position.y), "on_floor": _player.is_on_floor(), "why": "stall"})
            _skip_to(x + 140.0)
            return false
    if t >= TACTIC_FRAMES:
        _release_all()
        _tactic += 1
        _tactic_frame = _frame
    return false

func _skip_to(target_x: float) -> void:
    _release_all()
    var target: Vector2 = _player._find_safe_respawn_position(Vector2(target_x, _main._floor_y - 60.0))
    _player.global_position = target
    _player.velocity = Vector2.ZERO
    _best_x = target.x
    _last_progress_frame = _frame
    _tactic = -1

func _finish(reached: bool) -> void:
    _release_all()
    print("AUDIT result stage=%s reached_goal=%s frames=%d" % [_main._stage_id, reached, _frame])
    for stuck in _report:
        print("AUDIT STUCK x=%d y=%d on_floor=%s why=%s" % [stuck["x"], stuck["y"], stuck["on_floor"], stuck.get("why", "")])
    for death in _deaths:
        print("AUDIT DEATH x=%d y=%d" % [death.x, death.y])
    quit(0 if reached and _report.is_empty() else 1)
