extends SceneTree

# Strict-contract smoke for the enemy v2 atlas: grid dimensions, SpriteFrames/AnimatedSprite2D
# consumption, and the real EnemyVisual runtime (action rows, aim buckets, weapon grips).

const EnemyVisualScript := preload("res://scripts/enemy_visual.gd")
const CELL := 128
const FRAMES := 8
const WEAPONS := ["pistol", "machinegun", "shotgun", "panzerfaust"]
const AIM_CASES := {
    "shoot": Vector2(1.0, 0.0),
    "shoot_up": Vector2(0.0, -1.0),
    "shoot_down": Vector2(0.0, 1.0),
    "shoot_diag_up": Vector2(1.0, -1.0),
    "shoot_diag_down": Vector2(1.0, 1.0),
}

func _fail(message: String) -> void:
    push_error(message)
    quit(1)

func _initialize() -> void:
    _run()

func _run() -> void:
    var types: Array = EnemyGripsV2.TYPES
    var actions: Array = EnemyGripsV2.ACTIONS
    var args := OS.get_cmdline_user_args()
    var atlas_path := "res://art/enemies-v2/pawn_slug_enemy_godot_strict_8x117_128_v2.png"
    if args.size() == 1:
        atlas_path = String(args[0])
    var texture := load(atlas_path) as Texture2D
    if texture == null:
        _fail("Godot failed to load enemy atlas: " + atlas_path)
        return
    var size := texture.get_image().get_size()
    if size != Vector2i(FRAMES * CELL, types.size() * actions.size() * CELL):
        _fail("enemy atlas dimensions drifted: " + str(size))
        return
    if EnemyGripsV2.DATA.size() != types.size() * actions.size() * FRAMES * EnemyGripsV2.STRIDE:
        _fail("enemy grip table size drifted: " + str(EnemyGripsV2.DATA.size()))
        return

    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for type_index in range(types.size()):
        for action_index in range(actions.size()):
            var animation := "%s_%s" % [types[type_index], actions[action_index]]
            frames.add_animation(animation)
            frames.set_animation_speed(animation, 8.0)
            frames.set_animation_loop(animation, ["idle", "run", "crouch", "climb"].has(actions[action_index]))
            var row := type_index * actions.size() + action_index
            for column in range(FRAMES):
                var atlas_frame := AtlasTexture.new()
                atlas_frame.atlas = texture
                atlas_frame.region = Rect2(column * CELL, row * CELL, CELL, CELL)
                frames.add_frame(animation, atlas_frame)
            if frames.get_frame_count(animation) != FRAMES:
                _fail("enemy SpriteFrames count drifted: " + animation)
                return
    var sprite := AnimatedSprite2D.new()
    sprite.sprite_frames = frames
    get_root().add_child(sprite)

    var checked := 0
    for type_index in range(types.size()):
        for weapon in WEAPONS:
            var visual = EnemyVisualScript.new()
            get_root().add_child(visual)
            await process_frame
            visual.configure(String(types[type_index]), weapon, 84.0, 40, 40)
            visual.sync_state(100.0, 400.0, 1.0, false, 40, 40)
            visual._process(0.02)
            if not visual._using_v2:
                _fail("EnemyVisual did not adopt the v2 atlas: %s/%s" % [types[type_index], weapon])
                return
            if not _row_is(visual, type_index, "idle", actions):
                _fail("idle row mismatch: %s/%s" % [types[type_index], weapon])
                return
            visual.sync_state(100.0, 400.0, 1.0, true, 40, 40, 1.0)
            visual._process(0.02)
            if not _row_is(visual, type_index, "run", actions):
                _fail("run row mismatch: %s/%s" % [types[type_index], weapon])
                return
            for action in AIM_CASES:
                visual.play_fire_direction(AIM_CASES[action])
                visual._process(0.10)
                if not _row_is(visual, type_index, action, actions):
                    _fail("aim row mismatch %s/%s expected %s" % [types[type_index], weapon, action])
                    return
                if not visual._weapon_root.visible:
                    _fail("weapon hidden while firing %s/%s/%s" % [types[type_index], weapon, action])
                    return
            # facing left mirrors the aim into the local right-facing frame
            visual.sync_state(100.0, 400.0, -1.0, false, 40, 40)
            visual.play_fire_direction(Vector2(-1.0, -1.0))
            visual._process(0.10)
            if not _row_is(visual, type_index, "shoot_diag_up", actions):
                _fail("left-facing aim not mirrored: %s/%s" % [types[type_index], weapon])
                return
            visual.sync_state(100.0, 400.0, 1.0, false, 20, 40)
            visual._process(0.10)
            if not _row_is(visual, type_index, "hurt", actions):
                _fail("hurt row mismatch: %s/%s" % [types[type_index], weapon])
                return
            visual.sync_state(100.0, 400.0, 1.0, false, 0, 40)
            visual._process(0.9)
            if not _row_is(visual, type_index, "death", actions) or visual._frame != FRAMES - 1:
                _fail("death did not land on its last frame: %s/%s" % [types[type_index], weapon])
                return
            visual.free()
            checked += 1

    print("OK Godot enemy strict runtime smoke: types=%d actions=%d frames=%d runtime_cases=%d atlas=%dx%d" % [
        types.size(), actions.size(), types.size() * actions.size() * FRAMES, checked, size.x, size.y,
    ])
    quit(0)

func _row_is(visual: Node, type_index: int, action: String, actions: Array) -> bool:
    var expected_row := type_index * actions.size() + actions.find(action)
    return int(round(visual._body.region_rect.position.y / CELL)) == expected_row
