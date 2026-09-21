extends Node2D

# Pawn Slug Matthias stays 2D. Godot owns the animation runtime: authored raster
# sheets are sliced into SpriteFrames and AnimatedSprite2D plays them directly.
# The strict-v7 contract is an exact 8 x 11 sheet (idle/walk/run/jump/fall/land/
# directional shoot/reload/hurt/die/crouch), 256 x 256 per cell.
# v7 is derived deterministically from the uploaded 1070 x 1470 R2 source sheets
# with Lanczos, reproducing the packaged 2048 x 2816 strict atlases exactly.
# Godot consumes those normalized cells directly; the old canonical assets remain
# only as a graceful fallback if a remote strict atlas cannot be loaded.
const MASTER_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/master/matthias_canonical_sprite_sheet_v1-9c21264274777d01.png"
const MASTER_SIZE := Vector2i(1536, 1024)
const LEGACY_PISTOL_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol/matthias_canonical_pistol_v1-42a01598d26b6ded.webp"
# Strict Godot runtime atlases: v13 is an exact 8 x 18 grid of 416 x 416 RGBA
# cells. Each cell is consumed directly as an AtlasTexture region: no runtime
# rescale or repack step is allowed at runtime.
const STRICT_RUNTIME_GENERATION := "v21"
const FULL_ATLAS_URLS := {
    "pistol": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/matthias/strict-v21/pistol/v21-24640d861efc3087.png",
    "machinegun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/matthias/strict-v17/machinegun/v17-63e2021dd301fa44.png",
    "shotgun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/matthias/strict-v16/shotgun/v16-c2a67fc5a7f50926.png",
    "panzerfaust": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/matthias/strict-v16/panzerfaust/v16-80a0297d66e3dcf3.png",
}

# v10 remains an experimental candidate only. Runtime now uses the coherent
# strict-v17 tactical bank; v10 stays disabled because its mixed silhouettes
# would regress identity continuity.
const V10_RUNTIME_PROMOTION_ENABLED := false
const V10_PISTOL_ATLAS_URL := "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/matthias/strict-v10/pistol/matthias_pistol_godot_strict_12x9_256_v10-10047b75952259db.png"
const V10_ATLAS_COLUMNS := 12
const V10_ATLAS_ROWS := 9
const V10_ATLAS_CELL_SIZE := 256
const V10_ATLAS_SIZE := Vector2i(
    V10_ATLAS_COLUMNS * V10_ATLAS_CELL_SIZE,
    V10_ATLAS_ROWS * V10_ATLAS_CELL_SIZE,
)
const V10_BODY_SCALE := 0.74
const V10_PACKED_FOOT_Y := 232.0
const V10_BODY_Y := -(V10_PACKED_FOOT_Y - float(V10_ATLAS_CELL_SIZE) * 0.5) * V10_BODY_SCALE
const V10_ACTION_ORDER := [
    "idle", "walk", "run", "jump", "fall", "land", "crouch", "crouch_walk", "move_fire",
]
const V10_ACTIONS := {
    "idle": {"row": 0, "count": 8, "fps": 6.0, "loop": true},
    "walk": {"row": 1, "count": 10, "fps": 12.0, "loop": true},
    "run": {"row": 2, "count": 12, "fps": 16.0, "loop": true},
    "jump": {"row": 3, "count": 6, "fps": 12.0, "loop": false},
    "fall": {"row": 4, "count": 4, "fps": 10.0, "loop": true},
    "land": {"row": 5, "count": 4, "fps": 14.0, "loop": false},
    "crouch": {"row": 6, "count": 4, "fps": 8.0, "loop": true},
    "crouch_walk": {"row": 7, "count": 8, "fps": 10.0, "loop": true},
    "move_fire": {"row": 8, "count": 6, "fps": 15.0, "loop": false},
}

# Historical V9_* names are retained as the stable 18-row runtime contract.
# strict-v17 preserves that eight-column contract without changing
# cell size, pivot, foot line, row semantics or world scale.
const V9_ATLAS_COLUMNS := 8
const V9_ATLAS_ROWS := 18
const V9_ATLAS_CELL_SIZE := 416
const V9_ATLAS_SIZE := Vector2i(
    V9_ATLAS_COLUMNS * V9_ATLAS_CELL_SIZE,
    V9_ATLAS_ROWS * V9_ATLAS_CELL_SIZE,
)
const V9_BODY_SCALE := 0.43
const V9_PACKED_FOOT_Y := 382.0
const V9_BODY_Y := -(V9_PACKED_FOOT_Y - float(V9_ATLAS_CELL_SIZE) * 0.5) * V9_BODY_SCALE
const V9_ACTION_ORDER := [
    "idle",
    "walk",
    "run",
    "jump",
    "fall",
    "land",
    "crouch",
    "crouch_walk",
    "shoot",
    "shoot_up",
    "shoot_down",
    "shoot_diag_up",
    "shoot_diag_up_alt",
    "shoot_diag_down",
    "shoot_crouch",
    "reload",
    "hurt",
    "die",
]
const V9_ACTIONS := {
    # 8/6 speed-up preserves the authored v9 action duration after expanding
    # each bank from six to eight frames; strict-v16 keeps that timing contract.
    "idle": {"row": 0, "fps": 8.0, "loop": true},
    "walk": {"row": 1, "fps": 13.333333, "loop": true},
    "run": {"row": 2, "fps": 16.0, "loop": true},
    "jump": {"row": 3, "fps": 13.333333, "loop": false},
    "fall": {"row": 4, "fps": 10.666667, "loop": true},
    "land": {"row": 5, "fps": 16.0, "loop": false},
    "crouch": {"row": 6, "fps": 8.0, "loop": true},
    "crouch_walk": {"row": 7, "fps": 10.666667, "loop": true},
    "shoot": {"row": 8, "fps": 20.0, "loop": false},
    "shoot_up": {"row": 9, "fps": 20.0, "loop": false},
    "shoot_down": {"row": 10, "fps": 20.0, "loop": false},
    "shoot_diag_up": {"row": 11, "fps": 20.0, "loop": false},
    "shoot_diag_up_alt": {"row": 12, "fps": 20.0, "loop": false},
    "shoot_diag_down": {"row": 13, "fps": 20.0, "loop": false},
    "shoot_crouch": {"row": 14, "fps": 20.0, "loop": false},
    "reload": {"row": 15, "fps": 13.333333, "loop": false},
    "hurt": {"row": 16, "fps": 16.0, "loop": false},
    "die": {"row": 17, "fps": 12.0, "loop": false},
}
const V9_MUZZLE_LENGTH := {
    "pistol": 34.0,
    "machinegun": 64.0,
    "shotgun": 70.0,
    "panzerfaust": 72.0,
}
const V9_MUZZLE_PIVOT_Y := {
    "pistol": -37.0,
    "machinegun": -36.0,
    "shotgun": -35.0,
    "panzerfaust": -34.0,
}
const V9_MUZZLE_ACTION_AIM := {
    "shoot": Vector2(1.0, 0.0),
    "shoot_up": Vector2(0.0, -1.0),
    "shoot_down": Vector2(0.0, 1.0),
    "shoot_diag_up": Vector2(1.0, -1.0),
    "shoot_diag_up_alt": Vector2(1.0, -1.0),
    "shoot_diag_down": Vector2(1.0, 1.0),
    "shoot_crouch": Vector2(1.0, 0.0),
}
const V9_MUZZLE_RAY_HALF_WIDTH_PX := 42.0
const V9_MUZZLE_SCAN_Y_MAX_RATIO_DIRECTIONAL := 0.80
const V9_MUZZLE_CLUSTER_DEPTH_PX := 12.0
const V7_SOURCE_SIZE := Vector2i(1070, 1470)
const DIRECTIONAL_ATLAS_URLS := {
    "pistol": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_pistol_directional_strict_v8.png",
    "machinegun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_machinegun_directional_strict_v8.png",
    "shotgun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_shotgun_directional_strict_v8.png",
    "panzerfaust": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_panzerfaust_directional_strict_v8.png",
}
const DIRECTIONAL_ATLAS_COLUMNS := 3
const DIRECTIONAL_ATLAS_ROWS := 4
const DIRECTIONAL_ATLAS_CELL_SIZE := 362
const DIRECTIONAL_ATLAS_SIZE := Vector2i(
    DIRECTIONAL_ATLAS_COLUMNS * DIRECTIONAL_ATLAS_CELL_SIZE,
    DIRECTIONAL_ATLAS_ROWS * DIRECTIONAL_ATLAS_CELL_SIZE,
)
const DIRECTIONAL_ACTION_ROWS := {
    "shoot": 0,
    "shoot_up": 1,
    "shoot_down": 2,
    "shoot_crouch": 3,
}
# Exact pose-only crops from the uploaded v7 generated sheets. The generated
# sheets omitted/misaligned whole rows for several weapons, so treating them as
# a strict 8x11 locomotion atlas caused the sunk/levitating regression. Keep
# v6 for body motion and use only these verified diagonal poses from v7.
const DIRECTIONAL_SOURCE_RECTS := {
    "pistol": {
        "shoot_up": [Rect2i(422, 672, 102, 138), Rect2i(684, 687, 103, 125)],
        "shoot_down": [Rect2i(808, 702, 96, 124)],
    },
    "machinegun": {
        "shoot_up": [Rect2i(412, 783, 107, 132), Rect2i(678, 780, 113, 135)],
        "shoot_down": [Rect2i(810, 788, 97, 127)],
    },
    "shotgun": {
        "shoot_up": [Rect2i(434, 689, 118, 131), Rect2i(703, 684, 108, 136)],
        "shoot_down": [Rect2i(823, 692, 110, 128)],
    },
    "panzerfaust": {
        "shoot_up": [Rect2i(401, 781, 122, 130), Rect2i(652, 784, 135, 127)],
        "shoot_down": [Rect2i(779, 788, 116, 123)],
    },
}
const FULL_ATLAS_FALLBACK_URLS := {
    "pistol": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_pistol_godot_strict_8x11_256_v6.png",
    "machinegun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_machinegun_godot_strict_8x11_256_v6.png",
    "shotgun": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_shotgun_godot_strict_8x11_256_v6.png",
    "panzerfaust": "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2/matthias_panzerfaust_godot_strict_8x11_256_v6.png",
}
const FULL_ATLAS_COLUMNS := 8
const FULL_ATLAS_ROWS := 11
const FULL_ATLAS_CELL_SIZE := 256
const FULL_ATLAS_SIZE := Vector2i(FULL_ATLAS_COLUMNS * FULL_ATLAS_CELL_SIZE, FULL_ATLAS_ROWS * FULL_ATLAS_CELL_SIZE)
const DIRECTIONAL_SHOOT_ROW := 6
const DIRECTIONAL_SHOOT_FPS := 15.0
# Use pose-only cells for authored aiming. Muzzle flash is rendered by Godot at
# the computed barrel tip, so baked flash cells cannot drift into the weapon.
const DIRECTIONAL_SHOOT_COLUMNS := {
    "shoot": [0, 2],
    "shoot_up": [3, 5],
    "shoot_down": [6],
}
const CROUCH_SHOOT_COLUMNS := [4, 5, 6]
const NORMALIZED_FRAME_SIZE := 192
const NORMALIZED_FOOT_GUTTER := 24
const CELL_GUARD_PX := 2
const AUTHORED_BODY_SCALE := 0.67
const BODY_SCALE := 0.50
const DIRECTIONAL_BODY_SCALE := BODY_SCALE * float(FULL_ATLAS_CELL_SIZE) / float(DIRECTIONAL_ATLAS_CELL_SIZE)
const BODY_SCALE_RATIO := BODY_SCALE / AUTHORED_BODY_SCALE
const PLAYER_FOOT_Y := 42.0
const RUN_LEG_MOTION_SAMPLE_STEP := 6
const RUN_LEG_MOTION_MIN_DIFF := 0.025
const RUN_LEG_MOTION_MIN_SCORE := 0.045
const RUN_LEG_MOTION_RELATIVE_GAIN := 1.08
const RUN_LEG_PIXEL_DIFF := 0.20
const RUN_ENTER_SPEED_RATIO := 0.72
const RUN_EXIT_SPEED_RATIO := 0.54
const WALK_CYCLE_HZ_MIN := 1.20
const WALK_CYCLE_HZ_MAX := 1.60
# Keep the 8-frame strict run bank at or below its authored 16 fps ceiling.
# This also narrows the walk -> run cadence jump while preserving stride phase.
const RUN_CYCLE_HZ_MIN := 1.70
const RUN_CYCLE_HZ_MAX := 2.00
const WALK_BOB_PX := 0.65
const RUN_BOB_PX := 1.65
const RUN_LEAN_DEGREES := 1.35
const BODY_CENTER_TO_FOOT := 72.0
const MUZZLE_FLASH_SECONDS := 0.055
const MUZZLE_SCAN_ALPHA := 0.12
const MUZZLE_SCAN_Y_MIN_RATIO := 0.12
const MUZZLE_SCAN_Y_MAX_RATIO := 0.88
const MUZZLE_TIP_PAD_PX := 2.0
const MUZZLE_TIP_FORWARD_PX := {
    "pistol": 8.0,
    "machinegun": 10.0,
    "shotgun": 12.0,
    "panzerfaust": 12.0,
}
const RUN_FIRE_RECOIL_DEGREES := 4.2
const RUN_FIRE_RECOIL_DECAY_DEGREES := 32.0
const MOVING_FIRE_FLASH_SECONDS := 0.088
const MOVING_FIRE_RECOIL_HOLD_SECONDS := 0.060
const MOVING_FIRE_RECOIL_DECAY_PX := 38.0
const MOVING_FIRE_RECOIL_BOOST := {
    "pistol": 1.65,
    "machinegun": 2.25,
    "shotgun": 1.65,
    "panzerfaust": 1.35,
}
const MOVING_FIRE_FLASH_BOOST := {
    # Horizontal pistol fire now keeps the clean locomotion pose and uses the
    # procedural flash. Other authored weapon flashes remain larger on purpose.
    "pistol": 1.35,
    "machinegun": 3.60,
    "shotgun": 1.55,
    "panzerfaust": 1.40,
}

const FULL_ACTION_ORDER := [
    "idle", "walk", "run", "jump", "fall", "land", "shoot", "reload", "hurt", "die", "crouch",
]
const FULL_ACTIONS := {
    "idle": {"row": 0, "count": 4, "fps": 6.0, "loop": true},
    "walk": {"row": 1, "count": 6, "fps": 10.0, "loop": true},
    "run": {"row": 2, "count": 6, "fps": 12.0, "loop": true},
    "jump": {"row": 3, "count": 4, "fps": 10.0, "loop": false},
    "fall": {"row": 4, "count": 4, "fps": 8.0, "loop": true},
    "land": {"row": 5, "count": 4, "fps": 12.0, "loop": false},
    "shoot": {"row": 6, "count": 6, "fps": 15.0, "loop": false},
    "reload": {"row": 7, "count": 6, "fps": 10.0, "loop": false},
    "hurt": {"row": 8, "count": 4, "fps": 12.0, "loop": false},
    "die": {"row": 9, "count": 8, "fps": 9.0, "loop": false},
    "crouch": {"row": 10, "count": 1, "fps": 1.0, "loop": true},
}
const LEGACY_PISTOL_ACTIONS := {
    "idle": {"row": 0, "count": 1, "fps": 6.0, "loop": true},
    "walk": {"row": 1, "count": 4, "fps": 9.0, "loop": true},
    "run": {"row": 2, "count": 4, "fps": 12.0, "loop": true},
    "crouch": {"row": 3, "count": 1, "fps": 1.0, "loop": true},
    "jump": {"row": 4, "count": 1, "fps": 1.0, "loop": false},
}

# Exact source-pixel crops from the approved canonical master. These exist only
# as a graceful fallback while a weapon has no full authored animation sheet.
const SOURCE_RECTS := {
    "pistol": {
        "idle": Rect2i(135, 58, 90, 164), "walk": Rect2i(235, 58, 95, 164),
        "run": Rect2i(330, 58, 100, 164), "jump": Rect2i(430, 52, 110, 170),
        "crouch": Rect2i(715, 58, 110, 164),
    },
    "machinegun": {
        "idle": Rect2i(135, 278, 97, 157), "walk": Rect2i(235, 278, 95, 157),
        "run": Rect2i(330, 273, 105, 162), "jump": Rect2i(430, 268, 110, 167),
        "crouch": Rect2i(715, 278, 117, 157),
    },
    "shotgun": {
        "idle": Rect2i(130, 492, 112, 156), "walk": Rect2i(230, 492, 110, 156),
        "run": Rect2i(325, 487, 117, 161), "jump": Rect2i(425, 482, 127, 166),
        "crouch": Rect2i(710, 492, 132, 156),
    },
    "panzerfaust": {
        "idle": Rect2i(120, 710, 125, 155), "walk": Rect2i(220, 710, 125, 155),
        "run": Rect2i(320, 705, 130, 160), "jump": Rect2i(420, 700, 135, 165),
        "crouch": Rect2i(700, 710, 140, 155),
    },
}
const MUZZLE_POS := {
    "pistol": {"idle": Vector2(36,-37), "walk": Vector2(37,-36), "run": Vector2(39,-35), "crouch": Vector2(39,-26), "jump": Vector2(38,-36)},
    "machinegun": {"idle": Vector2(46,-36), "walk": Vector2(47,-36), "run": Vector2(48,-34), "crouch": Vector2(48,-26), "jump": Vector2(46,-35)},
    "shotgun": {"idle": Vector2(50,-35), "walk": Vector2(51,-34), "run": Vector2(52,-34), "crouch": Vector2(53,-25), "jump": Vector2(50,-34)},
    "panzerfaust": {"idle": Vector2(49,-35), "walk": Vector2(50,-34), "run": Vector2(52,-32), "crouch": Vector2(52,-24), "jump": Vector2(50,-33)},
}
const RECOIL := {"pistol": 4.0, "machinegun": 3.0, "shotgun": 7.0, "panzerfaust": 10.0}
const FLASH_SCALE := {"pistol": 0.75, "machinegun": 0.95, "shotgun": 1.20, "panzerfaust": 1.55}

# Some authored pistol/SMG shoot cells deform Matthias' face/head around the
# baked muzzle-flash frames. Keep the clean firing pose from known-good cells
# and preserve only the far-right muzzle/flash strip from each original cell.
const SHOOT_FACE_REPAIR_SOURCE_FRAMES := [0, 0, 2, 2, 0, 2]
const SHOOT_FACE_REPAIR_CUT_X := {
    "pistol": 172,
    "machinegun": 176,
}

static var _full_frames_by_weapon: Dictionary = {}
static var _full_body_y_by_weapon: Dictionary = {}
static var _full_muzzle_by_weapon: Dictionary = {}
static var _directional_ready_by_weapon: Dictionary = {}
static var _directional_body_y_by_weapon: Dictionary = {}
static var _v9_ready_by_weapon: Dictionary = {}
static var _v10_ready_by_weapon: Dictionary = {}
static var _legacy_pistol_frames: SpriteFrames
static var _fallback_frames_by_weapon: Dictionary = {}
static var _master_texture: Texture2D

var _weapon := "pistol"
var _rendered_weapon := ""
var _action := "idle"
var _body_ready := false
var _using_full_atlas := false
var _dead := false
var _hurt_remaining := 0.0
var _invuln_remaining := 0.0
var _muzzle_remaining := 0.0
var _muzzle_flash_boost := 1.0
var _recoil_x := 0.0
var _recoil_rotation := 0.0
var _moving_recoil_hold_remaining := 0.0
var _facing := 1.0
var _aim_direction := Vector2.RIGHT
var _one_shot_action := ""
var _hold_one_shot := false
var _climbing := false
var _climb_progress := 0.0

var _facing_root: Node2D
var _fx_root: Node2D
var _weapon_root: Node2D
var _body: AnimatedSprite2D
var _muzzle: Marker2D
var _flash: Polygon2D
var _master_request: HTTPRequest
var _atlas_request: HTTPRequest
var _atlas_request_weapon := ""
var _atlas_request_layout := ""

func _ready() -> void:
    _build_nodes()
    _install_or_request_weapon()
    queue_redraw()

func body_ready() -> bool:
    return _body_ready

func current_weapon() -> String:
    return _weapon

func set_aim_direction(direction: Vector2) -> void:
    var safe_direction := direction.normalized()
    if safe_direction.length_squared() <= 0.001:
        safe_direction = Vector2(_facing, 0.0)
    _aim_direction = safe_direction
    if _flash != null:
        _sync_aim_feedback()

func set_climb_state(active: bool, progress: float = 0.0) -> void:
    _climbing = active
    _climb_progress = clampf(progress, 0.0, 1.0)
    if not _climbing:
        if _body != null and _body.is_playing() == false:
            _action = ""
        return
    _one_shot_action = ""
    _hold_one_shot = false
    _muzzle_remaining = 0.0
    _recoil_x = 0.0
    _recoil_rotation = 0.0

func set_weapon(kind: String) -> void:
    var next := kind if SOURCE_RECTS.has(kind) else "pistol"
    if next == _weapon and _body_ready and _rendered_weapon == next:
        return
    _weapon = next
    _one_shot_action = ""
    _hold_one_shot = false
    _install_or_request_weapon()
    queue_redraw()

func set_combat_state(hurt_remaining: float, invuln_remaining: float, dead: bool, death_progress: float) -> void:
    var became_dead := dead and not _dead
    _hurt_remaining = maxf(0.0, hurt_remaining)
    _invuln_remaining = maxf(0.0, invuln_remaining)
    _dead = dead
    if _dead:
        if _using_full_atlas and _animation_available("die"):
            _fx_root.rotation = 0.0
            _fx_root.position.y = 0.0
            if became_dead:
                _play_one_shot("die", true)
        else:
            var p := clampf(death_progress, 0.0, 1.0)
            _fx_root.rotation = deg_to_rad(82.0) * _facing * p
            _fx_root.position.y = 28.0 * p
    else:
        _fx_root.rotation = 0.0
        _fx_root.position.y = 0.0
        if _hold_one_shot:
            _hold_one_shot = false
            _one_shot_action = ""
    _sync_modulate()

func update_visual(delta: float, horizontal_speed_ratio: float, on_floor: bool, crouching: bool, landed_now: bool, vertical_speed: float, facing: float, fired_now: bool) -> void:
    _facing = -1.0 if facing < 0.0 else 1.0
    _facing_root.scale.x = _facing

    if _climbing and _body_ready and not _dead:
        _apply_climb_visual()
        _muzzle_remaining = 0.0
        _flash.visible = false
        _fx_root.position.x = 0.0
        _fx_root.position.y = 0.0
        _fx_root.rotation = 0.0
        _sync_muzzle()
        _sync_modulate()
        return

    var weapon_visual_ready := _rendered_weapon == _weapon
    var locomoting_now := (
        on_floor
        and not crouching
        and horizontal_speed_ratio > 0.08
    )
    if on_floor and crouching and _one_shot_action in ["shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_down", "move_fire"]:
        _one_shot_action = ""
        _hold_one_shot = false
        _action = ""
    var authored_shoot_action := _shoot_action_for_state(on_floor, crouching, locomoting_now)
    if locomoting_now and _one_shot_action == "shoot":
        _one_shot_action = ""
        _hold_one_shot = false
        _action = ""

    if _body_ready and not _dead:
        if _using_full_atlas and _hurt_remaining > 0.0 and _animation_available("hurt"):
            if _one_shot_action != "hurt":
                _play_one_shot("hurt")
        elif (
            fired_now
            and not authored_shoot_action.is_empty()
            and weapon_visual_ready
            and _using_full_atlas
            and _animation_available(authored_shoot_action)
        ):
            if _one_shot_action == authored_shoot_action:
                _action = authored_shoot_action
                _body.frame = 0
                _body.play(authored_shoot_action)
            else:
                _play_one_shot(authored_shoot_action)
        elif landed_now and _using_full_atlas and _animation_available("land") and _one_shot_action.is_empty():
            _play_one_shot("land")
        elif _one_shot_action.is_empty():
            var next := _resolve_action(horizontal_speed_ratio, on_floor, crouching and on_floor, vertical_speed)
            if next != _action:
                var preserve_stride_phase := (
                    _action in ["walk", "run", "crouch_walk"]
                    and next in ["walk", "run", "crouch_walk"]
                )
                var stride_phase := _locomotion_phase() if preserve_stride_phase else 0.0
                _action = next
                _play_action()
                if preserve_stride_phase:
                    _restore_locomotion_phase(stride_phase)
            if _action in ["walk", "run", "crouch_walk"]:
                _sync_locomotion_playback(horizontal_speed_ratio)

    var authored_shoot := (
        not authored_shoot_action.is_empty()
        and weapon_visual_ready
        and _using_full_atlas
        and _animation_available(authored_shoot_action)
    )
    if fired_now and not _dead and _hurt_remaining <= 0.0:
        # strict-v9 shooting rows already contain the authored muzzle flash.
        # Older/fallback locomotion paths keep the procedural flash.
        var v9_authored_shoot := authored_shoot and _v9_ready_by_weapon.has(_rendered_weapon)
        _muzzle_remaining = 0.0 if v9_authored_shoot else MUZZLE_FLASH_SECONDS
        _muzzle_flash_boost = 1.0
        if not authored_shoot:
            var visual_weapon := _rendered_weapon if not _rendered_weapon.is_empty() else _weapon
            var recoil_strength := float(RECOIL.get(visual_weapon, 4.0))
            if locomoting_now:
                recoil_strength *= float(MOVING_FIRE_RECOIL_BOOST.get(visual_weapon, 1.65))
                _muzzle_flash_boost = float(MOVING_FIRE_FLASH_BOOST.get(visual_weapon, 1.50))
                _muzzle_remaining = MOVING_FIRE_FLASH_SECONDS
                _moving_recoil_hold_remaining = MOVING_FIRE_RECOIL_HOLD_SECONDS
                _recoil_rotation = deg_to_rad(-RUN_FIRE_RECOIL_DEGREES)
            # FacingRoot already mirrors local X. Negative local X is backwards
            # for both facings, so recoil remains negative in local space.
            _recoil_x = -recoil_strength
    if landed_now and not _dead and not (_using_full_atlas and _animation_available("land")):
        _fx_root.scale = Vector2(1.03, 0.95)

    _muzzle_remaining = maxf(0.0, _muzzle_remaining - delta)
    if _muzzle_remaining <= 0.0:
        _muzzle_flash_boost = 1.0
    _moving_recoil_hold_remaining = maxf(0.0, _moving_recoil_hold_remaining - delta)
    if _moving_recoil_hold_remaining <= 0.0:
        _recoil_x = move_toward(_recoil_x, 0.0, MOVING_FIRE_RECOIL_DECAY_PX * delta)
        _recoil_rotation = move_toward(
            _recoil_rotation,
            0.0,
            deg_to_rad(RUN_FIRE_RECOIL_DECAY_DEGREES) * delta,
        )
    _fx_root.position.x = _recoil_x
    if not _dead:
        _fx_root.rotation += _recoil_rotation
    if not _dead and _action != "walk" and _action != "run":
        _fx_root.position.y = 0.0
    _fx_root.scale = _fx_root.scale.lerp(Vector2.ONE, minf(1.0, 12.0 * delta))
    _sync_muzzle()
    _sync_modulate()
    _flash.visible = _muzzle_remaining > 0.0 and _body_ready and not _dead

func _shoot_action_for_state(on_floor: bool, crouching: bool, locomoting_now: bool) -> String:
    if not _using_full_atlas:
        return ""
    if on_floor and crouching:
        if _rendered_weapon == "pistol":
            return ""
        if _animation_available("shoot_crouch"):
            return "shoot_crouch"

    var has_horizontal := absf(_aim_direction.x) > 0.25
    var has_vertical := absf(_aim_direction.y) > 0.25
    if has_vertical and has_horizontal:
        if _aim_direction.y < 0.0 and _animation_available("shoot_diag_up"):
            return "shoot_diag_up"
        if _aim_direction.y > 0.0 and _animation_available("shoot_diag_down"):
            return "shoot_diag_down"
    elif has_vertical:
        if _aim_direction.y < 0.0 and _animation_available("shoot_up"):
            return "shoot_up"
        if _aim_direction.y > 0.0 and _animation_available("shoot_down"):
            return "shoot_down"

    # Horizontal pistol fire stays on the clean locomotion/idle pose. The
    # authored v9/v10 firing silhouettes read like an SMG at game scale; Godot
    # already owns recoil and muzzle flash, so do not swap Matthias' body here.
    if _rendered_weapon == "pistol" and not has_vertical:
        return ""

    if locomoting_now:
        if (
            _rendered_weapon == "pistol"
            and _v10_ready_by_weapon.has(_rendered_weapon)
            and not has_vertical
            and _animation_available("move_fire")
        ):
            return "move_fire"
        return ""
    return "shoot" if _animation_available("shoot") else ""

func _apply_climb_visual() -> void:
    # Current strict-v6 atlases have no dedicated climb row yet. Prefer a real
    # "climb" animation automatically when a future atlas provides it; until
    # then sample jump -> land frames as a deterministic fallback so the
    # mechanic can ship independently from the next art pass.
    var animation := "climb" if _animation_available("climb") else "jump"
    if not _animation_available(animation):
        animation = "idle"
    if not _animation_available(animation):
        return
    if _body.animation != animation:
        _body.animation = animation
    _body.pause()
    var frame_count := _body.sprite_frames.get_frame_count(animation)
    if frame_count <= 0:
        return
    var sampled_progress := _climb_progress
    if animation == "jump" and _climb_progress > 0.72 and _animation_available("land"):
        animation = "land"
        if _body.animation != animation:
            _body.animation = animation
        frame_count = _body.sprite_frames.get_frame_count(animation)
        sampled_progress = (_climb_progress - 0.72) / 0.28
    _body.frame = clampi(int(floor(sampled_progress * float(frame_count))), 0, frame_count - 1)

func _resolve_action(speed: float, on_floor: bool, crouching: bool, vertical_speed: float) -> String:
    if not on_floor:
        if vertical_speed > 40.0 and _animation_available("fall"):
            return "fall"
        return "jump"
    if crouching:
        if speed > 0.08 and _animation_available("crouch_walk"):
            return "crouch_walk"
        return "crouch"
    # Hysteresis avoids walk/run ping-pong while acceleration hovers around the
    # threshold; once Matthias is running he keeps the stride until clearly slow.
    if _action == "run" and speed > RUN_EXIT_SPEED_RATIO:
        return "run"
    if speed > RUN_ENTER_SPEED_RATIO:
        return "run"
    if speed > 0.08:
        return "walk"
    return "idle"

func _build_nodes() -> void:
    _facing_root = Node2D.new()
    _facing_root.name = "FacingRoot"
    _facing_root.position = Vector2(0.0, PLAYER_FOOT_Y)
    add_child(_facing_root)
    _fx_root = Node2D.new()
    _fx_root.name = "FxRoot"
    _facing_root.add_child(_fx_root)

    _body = AnimatedSprite2D.new()
    _body.name = "CanonicalBody"
    _body.position = Vector2(0.0, -BODY_CENTER_TO_FOOT * BODY_SCALE)
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _body.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
    _body.visible = false
    _body.animation_finished.connect(_on_animation_finished)
    _body.frame_changed.connect(_on_body_frame_changed)
    _fx_root.add_child(_body)

    _weapon_root = Node2D.new()
    _weapon_root.name = "WeaponRoot"
    # Muzzle offsets are expressed in grounded world pixels. The legacy
    # fallback is scaled explicitly in _sync_muzzle; strict atlases derive the
    # barrel tip directly from authored alpha, so this node stays 1:1.
    _weapon_root.scale = Vector2.ONE
    _fx_root.add_child(_weapon_root)
    _muzzle = Marker2D.new()
    _muzzle.name = "Muzzle"
    _weapon_root.add_child(_muzzle)
    _flash = Polygon2D.new()
    _flash.polygon = PackedVector2Array([Vector2.ZERO, Vector2(9,-3), Vector2(14,0), Vector2(9,3), Vector2.ZERO, Vector2(4,-7), Vector2(7,0), Vector2(4,7)])
    _flash.color = Color("ffd36a")
    _flash.visible = false
    _muzzle.add_child(_flash)

func _install_or_request_weapon() -> void:
    if _full_frames_by_weapon.has(_weapon):
        _install_frames(_full_frames_by_weapon[_weapon], true)
        return

    var full_url := String(FULL_ATLAS_URLS.get(_weapon, ""))
    if not full_url.is_empty():
        if _atlas_request == null:
            _request_atlas(_weapon, full_url, "full-v9")
        # Keep the canvas hidden at boot, or keep the previously rendered weapon
        # during a pickup switch, while the canonical strict atlas is in flight.
        # Fallback art is reserved for a real download/decode failure in
        # _on_atlas_loaded(), so it never flashes for a healthy R2 request.
        return

    if _weapon == "pistol":
        if _legacy_pistol_frames != null:
            _install_frames(_legacy_pistol_frames, false)
            return
        if _atlas_request == null:
            _request_atlas("pistol", LEGACY_PISTOL_ATLAS_URL, "legacy-pistol")
        return

    if _fallback_frames_by_weapon.has(_weapon):
        _install_frames(_fallback_frames_by_weapon[_weapon], false)
        return
    _ensure_master()

func _ensure_v10_locomotion(weapon_id: String) -> void:
    if not V10_RUNTIME_PROMOTION_ENABLED:
        return
    if weapon_id != "pistol" or _v10_ready_by_weapon.has(weapon_id):
        return
    if _atlas_request != null or not _v9_ready_by_weapon.has(weapon_id):
        return
    if not _full_frames_by_weapon.has(weapon_id):
        return
    _request_atlas(weapon_id, V10_PISTOL_ATLAS_URL, "locomotion-v10")

func _ensure_directional_source(weapon_id: String) -> void:
    if _v9_ready_by_weapon.has(weapon_id) or _directional_ready_by_weapon.has(weapon_id):
        return
    if not _full_frames_by_weapon.has(weapon_id) or _atlas_request != null:
        return
    var url := String(DIRECTIONAL_ATLAS_URLS.get(weapon_id, ""))
    if url.is_empty():
        return
    _request_atlas(weapon_id, url, "directional-v8")

func _request_atlas(weapon_id: String, url: String, layout: String) -> void:
    if _atlas_request != null:
        return
    _atlas_request_weapon = weapon_id
    _atlas_request_layout = layout
    _atlas_request = HTTPRequest.new()
    add_child(_atlas_request)
    _atlas_request.request_completed.connect(_on_atlas_loaded)
    if _atlas_request.request(url) != OK:
        _atlas_request.queue_free()
        _atlas_request = null
        _atlas_request_weapon = ""
        _atlas_request_layout = ""
        if layout == "locomotion-v10":
            push_warning("Matthias v10 locomotion request could not start; keeping strict-v9")
            return
        if layout in ["full-v9", "full-v7-source"] and _request_full_fallback(weapon_id):
            return
        _ensure_master()

func _on_atlas_loaded(result: int, response_code: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
    var requested_weapon := _atlas_request_weapon
    var requested_layout := _atlas_request_layout
    if _atlas_request != null:
        _atlas_request.queue_free()
        _atlas_request = null
    _atlas_request_weapon = ""
    _atlas_request_layout = ""

    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        if requested_layout == "locomotion-v10":
            push_warning("Matthias v10 locomotion download failed; keeping strict-v9")
            return
        if requested_layout in ["full-v9", "full-v7-source"] and _request_full_fallback(requested_weapon):
            return
        _ensure_master()
        return
    var image := _decode_raster(bytes)
    if image == null:
        if requested_layout == "locomotion-v10":
            push_warning("Matthias v10 locomotion PNG decode failed; keeping strict-v9")
            return
        if requested_layout in ["full-v9", "full-v7-source"] and _request_full_fallback(requested_weapon):
            return
        _ensure_master()
        return

    var frames: SpriteFrames
    if requested_layout == "full-v9":
        frames = _build_v9_frames(image)
        if frames == null:
            if _request_full_fallback(requested_weapon):
                return
        else:
            _full_frames_by_weapon[requested_weapon] = frames
            _full_body_y_by_weapon[requested_weapon] = V9_BODY_Y
            # Runtime atlases are validated before publication. Per-frame muzzle
            # pixel scans used to walk millions of pixels here on the web main
            # thread, causing visible stalls. Use the stable procedural socket;
            # exact authored sockets belong in the published manifest, not a
            # runtime image-analysis pass.
            _full_muzzle_by_weapon[requested_weapon] = {}
            _v9_ready_by_weapon[requested_weapon] = true
            _directional_ready_by_weapon[requested_weapon] = true

    elif requested_layout == "locomotion-v10":
        if _append_v10_locomotion_frames(requested_weapon, image):
            _v10_ready_by_weapon[requested_weapon] = true
            if requested_weapon == _weapon:
                _install_frames(_full_frames_by_weapon[requested_weapon], true)
        else:
            push_warning("Matthias strict-v10 locomotion atlas rejected; keeping strict-v9")
        return

    elif requested_layout == "directional-v8":
        if image.get_size() == DIRECTIONAL_ATLAS_SIZE and _append_directional_atlas_frames(requested_weapon, image):
            _directional_ready_by_weapon[requested_weapon] = true
            if requested_weapon == _weapon:
                _sync_muzzle()
        else:
            push_warning(
                "Matthias directional v8 atlas invalid for %s: %s"
                % [requested_weapon, image.get_size()]
            )
        return

    if requested_layout == "directional-v7-source":
        if image.get_size() == V7_SOURCE_SIZE and _append_directional_source_frames(requested_weapon, image):
            _directional_ready_by_weapon[requested_weapon] = true
            if requested_weapon == _weapon:
                _sync_muzzle()
        else:
            push_warning("Matthias directional v7 source invalid for %s" % requested_weapon)
        if requested_weapon != _weapon:
            call_deferred("_install_or_request_weapon")
        return

    if requested_layout == "full-v7-source":
        var render_image := _normalize_v7_source(image)
        if render_image == null:
            if _request_full_fallback(requested_weapon):
                return
        else:
            frames = _build_full_frames(render_image, requested_weapon, true)
            if frames != null:
                var body_y := _full_body_y_for_atlas(render_image)
                _full_frames_by_weapon[requested_weapon] = frames
                _full_body_y_by_weapon[requested_weapon] = body_y
                _full_muzzle_by_weapon[requested_weapon] = _full_muzzle_positions_for_atlas(render_image, body_y, true, requested_weapon)
    elif requested_layout == "full":
        var render_image := _repair_distorted_shoot_frames(image, requested_weapon)
        frames = _build_full_frames(render_image, requested_weapon, false)
        if frames != null:
            var body_y := _full_body_y_for_atlas(render_image)
            _full_frames_by_weapon[requested_weapon] = frames
            _full_body_y_by_weapon[requested_weapon] = body_y
            _full_muzzle_by_weapon[requested_weapon] = _full_muzzle_positions_for_atlas(render_image, body_y, false, requested_weapon)
    elif requested_layout == "legacy-pistol":
        frames = _build_legacy_pistol_frames(image)
        if frames != null:
            _legacy_pistol_frames = frames

    if requested_weapon == _weapon and frames != null:
        _install_frames(frames, requested_layout in ["full-v9", "full-v7-source", "full"])
    else:
        _install_or_request_weapon()

func _request_full_fallback(weapon_id: String) -> bool:
    var fallback_url := String(FULL_ATLAS_FALLBACK_URLS.get(weapon_id, ""))
    if fallback_url.is_empty():
        return false
    _request_atlas(weapon_id, fallback_url, "full")
    return true

func _normalize_v7_source(image: Image) -> Image:
    if image.get_size() != V7_SOURCE_SIZE:
        push_error("Matthias v7 source has invalid dimensions: %s, expected %s" % [image.get_size(), V7_SOURCE_SIZE])
        return null
    var normalized: Image = image.duplicate() as Image
    if normalized == null:
        return null
    normalized.resize(FULL_ATLAS_SIZE.x, FULL_ATLAS_SIZE.y, Image.INTERPOLATE_LANCZOS)
    if normalized.get_size() != FULL_ATLAS_SIZE:
        push_error("Matthias v7 normalization failed: %s" % [normalized.get_size()])
        return null
    return normalized

func _append_directional_atlas_frames(weapon_id: String, image: Image) -> bool:
    if image.get_size() != DIRECTIONAL_ATLAS_SIZE or not _full_frames_by_weapon.has(weapon_id):
        return false
    var frames: SpriteFrames = _full_frames_by_weapon[weapon_id]
    var atlas_texture := ImageTexture.create_from_image(image)
    var body_y_by_action := {}

    for action in ["shoot", "shoot_up", "shoot_down", "shoot_crouch"]:
        var row := int(DIRECTIONAL_ACTION_ROWS[action])
        if frames.has_animation(action):
            frames.remove_animation(action)
        frames.add_animation(action)
        frames.set_animation_loop(action, false)
        frames.set_animation_speed(action, DIRECTIONAL_SHOOT_FPS)
        var anchors: Array = []
        for column in range(DIRECTIONAL_ATLAS_COLUMNS):
            var texture := AtlasTexture.new()
            texture.atlas = atlas_texture
            texture.region = Rect2(
                column * DIRECTIONAL_ATLAS_CELL_SIZE,
                row * DIRECTIONAL_ATLAS_CELL_SIZE,
                DIRECTIONAL_ATLAS_CELL_SIZE,
                DIRECTIONAL_ATLAS_CELL_SIZE,
            )
            frames.add_frame(action, texture)
            anchors.append(_directional_body_y_for_cell(image, row, column))
        body_y_by_action[action] = anchors

    _directional_body_y_by_weapon[weapon_id] = body_y_by_action
    return true

func _directional_body_y_for_cell(image: Image, row: int, column: int) -> float:
    var cell := image.get_region(Rect2i(
        column * DIRECTIONAL_ATLAS_CELL_SIZE,
        row * DIRECTIONAL_ATLAS_CELL_SIZE,
        DIRECTIONAL_ATLAS_CELL_SIZE,
        DIRECTIONAL_ATLAS_CELL_SIZE,
    ))
    # Scan only the left half/lower body. Downward muzzle flashes and rockets can
    # extend below the boots on the right; they must never become the ground anchor.
    var foot_y := -1
    var x_end := int(round(float(DIRECTIONAL_ATLAS_CELL_SIZE) * 0.50))
    var y_start := int(round(float(DIRECTIONAL_ATLAS_CELL_SIZE) * 0.45))
    for y in range(y_start, DIRECTIONAL_ATLAS_CELL_SIZE):
        for x in range(0, x_end):
            if cell.get_pixel(x, y).a >= 0.10:
                foot_y = maxi(foot_y, y)
    if foot_y < 0:
        var used := cell.get_used_rect()
        if used.size == Vector2i.ZERO:
            return -BODY_CENTER_TO_FOOT * BODY_SCALE
        foot_y = used.position.y + used.size.y
    return -(float(foot_y) - float(DIRECTIONAL_ATLAS_CELL_SIZE) * 0.5) * DIRECTIONAL_BODY_SCALE

func _append_directional_source_frames(weapon_id: String, image: Image) -> bool:
    if not _full_frames_by_weapon.has(weapon_id):
        return false
    var spec_value = DIRECTIONAL_SOURCE_RECTS.get(weapon_id, {})
    if typeof(spec_value) != TYPE_DICTIONARY:
        return false
    var spec: Dictionary = spec_value
    var frames: SpriteFrames = _full_frames_by_weapon[weapon_id]
    var body_y := float(_full_body_y_by_weapon.get(weapon_id, -BODY_CENTER_TO_FOOT * BODY_SCALE))
    var target_foot_y := clampf(
        float(FULL_ATLAS_CELL_SIZE) * 0.5 - body_y / BODY_SCALE,
        156.0,
        float(FULL_ATLAS_CELL_SIZE - 6),
    )
    var muzzle_map: Dictionary = _full_muzzle_by_weapon.get(weapon_id, {}).duplicate(true)

    for action in ["shoot_up", "shoot_down"]:
        if frames.has_animation(action):
            frames.remove_animation(action)
        frames.add_animation(action)
        frames.set_animation_loop(action, false)
        frames.set_animation_speed(action, DIRECTIONAL_SHOOT_FPS)
        var muzzles: Array = []
        var rects: Array = spec.get(action, [])
        for rect_value in rects:
            var source_rect: Rect2i = rect_value
            var normalized := _directional_frame_from_source(image, source_rect, target_foot_y)
            if normalized == null:
                continue
            frames.add_frame(action, ImageTexture.create_from_image(normalized))
            muzzles.append(_muzzle_from_directional_frame(normalized, body_y, weapon_id))
        if frames.get_frame_count(action) <= 0:
            frames.remove_animation(action)
            return false
        muzzle_map[action] = muzzles

    _full_muzzle_by_weapon[weapon_id] = muzzle_map
    return true

func _directional_frame_from_source(image: Image, source_rect: Rect2i, target_foot_y: float) -> Image:
    var x0 := maxi(0, source_rect.position.x)
    var y0 := maxi(0, source_rect.position.y)
    var x1 := mini(image.get_width(), source_rect.position.x + source_rect.size.x)
    var y1 := mini(image.get_height(), source_rect.position.y + source_rect.size.y)
    if x1 <= x0 or y1 <= y0:
        return null
    var crop := image.get_region(Rect2i(x0, y0, x1 - x0, y1 - y0))
    var used := crop.get_used_rect()
    if used.size == Vector2i.ZERO:
        return null
    crop = crop.get_region(used)

    # Preserve the scale the source would have had in a 2048px-wide strict
    # atlas, but fit oversized weapons inside one 256px Godot frame.
    var scale_factor := float(FULL_ATLAS_SIZE.x) / float(V7_SOURCE_SIZE.x)
    scale_factor = minf(
        scale_factor,
        float(FULL_ATLAS_CELL_SIZE - 10) / float(maxi(1, crop.get_width())),
    )
    scale_factor = minf(
        scale_factor,
        float(maxi(80, int(target_foot_y) - 6)) / float(maxi(1, crop.get_height())),
    )
    var scaled_size := Vector2i(
        maxi(1, int(round(float(crop.get_width()) * scale_factor))),
        maxi(1, int(round(float(crop.get_height()) * scale_factor))),
    )
    crop.resize(scaled_size.x, scaled_size.y, Image.INTERPOLATE_LANCZOS)

    var canvas := Image.create(
        FULL_ATLAS_CELL_SIZE,
        FULL_ATLAS_CELL_SIZE,
        false,
        Image.FORMAT_RGBA8,
    )
    canvas.fill(Color(0.0, 0.0, 0.0, 0.0))
    var foot_y := clampi(
        int(round(target_foot_y)),
        scaled_size.y + 2,
        FULL_ATLAS_CELL_SIZE - 2,
    )
    var destination := Vector2i(
        int(round(float(FULL_ATLAS_CELL_SIZE - scaled_size.x) * 0.5)),
        foot_y - scaled_size.y,
    )
    canvas.blit_rect(crop, Rect2i(Vector2i.ZERO, scaled_size), destination)
    return canvas

func _muzzle_from_directional_frame(image: Image, body_y: float, weapon_id: String) -> Vector2:
    var used := image.get_used_rect()
    if used.size == Vector2i.ZERO:
        return Vector2.ZERO
    var tip_x := -1
    for y in range(used.position.y, used.position.y + used.size.y):
        for x in range(used.position.x, used.position.x + used.size.x):
            if image.get_pixel(x, y).a >= MUZZLE_SCAN_ALPHA:
                tip_x = maxi(tip_x, x)
    if tip_x < 0:
        return Vector2.ZERO
    var y_samples: Array[int] = []
    var cluster_x_start := maxi(used.position.x, tip_x - 8)
    for y in range(used.position.y, used.position.y + used.size.y):
        for x in range(cluster_x_start, tip_x + 1):
            if image.get_pixel(x, y).a >= MUZZLE_SCAN_ALPHA:
                y_samples.append(y)
                break
    if y_samples.is_empty():
        return Vector2.ZERO
    y_samples.sort()
    var tip_y := float(y_samples[int(y_samples.size() / 2)])
    var forward_pad := float(MUZZLE_TIP_FORWARD_PX.get(weapon_id, MUZZLE_TIP_PAD_PX))
    return Vector2(
        (float(tip_x) + forward_pad - FULL_ATLAS_CELL_SIZE * 0.5) * BODY_SCALE,
        body_y + (tip_y - FULL_ATLAS_CELL_SIZE * 0.5) * BODY_SCALE,
    )

func _decode_raster(bytes: PackedByteArray) -> Image:
    var image := Image.new()
    if image.load_png_from_buffer(bytes) == OK:
        return image
    image = Image.new()
    if image.load_webp_from_buffer(bytes) == OK:
        return image
    return null

func _repair_distorted_shoot_frames(image: Image, weapon_id: String) -> Image:
    if not SHOOT_FACE_REPAIR_CUT_X.has(weapon_id):
        return image

    var repaired: Image = image.duplicate() as Image
    if repaired == null:
        return image

    var shoot_spec: Dictionary = FULL_ACTIONS["shoot"]
    var shoot_row := int(shoot_spec["row"])
    var shoot_count := int(shoot_spec["count"])
    var cut_x := int(SHOOT_FACE_REPAIR_CUT_X[weapon_id])
    for frame_index in range(shoot_count):
        var source_index := int(SHOOT_FACE_REPAIR_SOURCE_FRAMES[frame_index])
        var source_rect := Rect2i(
            source_index * FULL_ATLAS_CELL_SIZE,
            shoot_row * FULL_ATLAS_CELL_SIZE,
            cut_x,
            FULL_ATLAS_CELL_SIZE,
        )
        repaired.blit_rect(
            image,
            source_rect,
            Vector2i(
                frame_index * FULL_ATLAS_CELL_SIZE,
                shoot_row * FULL_ATLAS_CELL_SIZE,
            ),
        )
    return repaired


func _append_v10_locomotion_frames(weapon_id: String, image: Image) -> bool:
    if weapon_id != "pistol" or image.get_size() != V10_ATLAS_SIZE:
        return false
    if not _full_frames_by_weapon.has(weapon_id):
        return false

    # Validate every used cell before mutating the live v9 SpriteFrames object.
    for action in V10_ACTION_ORDER:
        var spec: Dictionary = V10_ACTIONS[action]
        var row := int(spec["row"])
        var count := int(spec["count"])
        for frame_index in range(count):
            var rect := Rect2i(
                frame_index * V10_ATLAS_CELL_SIZE,
                row * V10_ATLAS_CELL_SIZE,
                V10_ATLAS_CELL_SIZE,
                V10_ATLAS_CELL_SIZE,
            )
            if image.get_region(rect).get_used_rect().size == Vector2i.ZERO:
                push_warning("Strict Matthias v10 contains empty cell %s/%d" % [action, frame_index])
                return false

    var frames: SpriteFrames = _full_frames_by_weapon[weapon_id]
    var atlas_texture := ImageTexture.create_from_image(image)
    for action in V10_ACTION_ORDER:
        var spec: Dictionary = V10_ACTIONS[action]
        if frames.has_animation(action):
            frames.remove_animation(action)
        frames.add_animation(action)
        frames.set_animation_loop(action, bool(spec["loop"]))
        frames.set_animation_speed(action, float(spec["fps"]))
        var row := int(spec["row"])
        for frame_index in range(int(spec["count"])):
            var texture := AtlasTexture.new()
            texture.atlas = atlas_texture
            texture.region = Rect2(
                frame_index * V10_ATLAS_CELL_SIZE,
                row * V10_ATLAS_CELL_SIZE,
                V10_ATLAS_CELL_SIZE,
                V10_ATLAS_CELL_SIZE,
            )
            frames.add_frame(action, texture)
    return true

func _build_v9_frames(image: Image) -> SpriteFrames:
    if image.get_size() != V9_ATLAS_SIZE:
        push_error(
            "Strict Matthias runtime atlas has invalid dimensions: %s, expected %s"
            % [image.get_size(), V9_ATLAS_SIZE]
        )
        return null

    var atlas_texture := ImageTexture.create_from_image(image)
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for action in V9_ACTION_ORDER:
        var spec: Dictionary = V9_ACTIONS[action]
        frames.add_animation(action)
        frames.set_animation_loop(action, bool(spec["loop"]))
        frames.set_animation_speed(action, float(spec["fps"]))
        var row := int(spec["row"])
        for frame_index in range(V9_ATLAS_COLUMNS):
            var rect := Rect2i(
                frame_index * V9_ATLAS_CELL_SIZE,
                row * V9_ATLAS_CELL_SIZE,
                V9_ATLAS_CELL_SIZE,
                V9_ATLAS_CELL_SIZE,
            )
            # Empty/guard/cell validation is a publish-time CI gate. Re-scanning
            # all 144 cells here copies and inspects the full 3328x7488 image on
            # the web main thread and can freeze gameplay when an atlas lands.
            var texture := AtlasTexture.new()
            texture.atlas = atlas_texture
            texture.region = Rect2(rect)
            frames.add_frame(action, texture)
    return frames

func _build_full_frames(image: Image, weapon_id: String, directional_shoot: bool) -> SpriteFrames:
    if image.get_size() != FULL_ATLAS_SIZE:
        push_error("Strict Matthias atlas has invalid dimensions: %s, expected %s" % [image.get_size(), FULL_ATLAS_SIZE])
        return null

    var atlas_texture := ImageTexture.create_from_image(image)
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for action in FULL_ACTION_ORDER:
        var spec: Dictionary = FULL_ACTIONS[action]
        frames.add_animation(action)
        frames.set_animation_loop(action, bool(spec["loop"]))
        frames.set_animation_speed(action, float(spec["fps"]))
        var row := int(spec["row"])
        if action == "shoot" and directional_shoot:
            _append_animation_columns(frames, action, atlas_texture, row, DIRECTIONAL_SHOOT_COLUMNS["shoot"])
            continue
        if action == "run":
            row = _select_run_source_row(image)
        for frame_index in range(int(spec["count"])):
            # Generated contact sheets can occasionally contain a transparent
            # first cell. Never let a blank authored frame become Matthias' idle.
            if not _cell_has_visible_pixels(image, row, frame_index):
                continue
            var texture := AtlasTexture.new()
            texture.atlas = atlas_texture
            texture.region = Rect2(
                frame_index * FULL_ATLAS_CELL_SIZE,
                row * FULL_ATLAS_CELL_SIZE,
                FULL_ATLAS_CELL_SIZE,
                FULL_ATLAS_CELL_SIZE,
            )
            frames.add_frame(action, texture)

    if directional_shoot:
        frames.add_animation("shoot_up")
        frames.set_animation_loop("shoot_up", false)
        frames.set_animation_speed("shoot_up", DIRECTIONAL_SHOOT_FPS)
        _append_animation_columns(frames, "shoot_up", atlas_texture, DIRECTIONAL_SHOOT_ROW, DIRECTIONAL_SHOOT_COLUMNS["shoot_up"])
        frames.add_animation("shoot_down")
        frames.set_animation_loop("shoot_down", false)
        frames.set_animation_speed("shoot_down", DIRECTIONAL_SHOOT_FPS)
        _append_animation_columns(frames, "shoot_down", atlas_texture, DIRECTIONAL_SHOOT_ROW, DIRECTIONAL_SHOOT_COLUMNS["shoot_down"])
        frames.add_animation("shoot_crouch")
        frames.set_animation_loop("shoot_crouch", false)
        frames.set_animation_speed("shoot_crouch", DIRECTIONAL_SHOOT_FPS)
        _append_animation_columns(frames, "shoot_crouch", atlas_texture, int(FULL_ACTIONS["crouch"]["row"]), CROUCH_SHOOT_COLUMNS)

    if frames.get_frame_count("idle") <= 0:
        for fallback_action in ["walk", "run", "jump"]:
            if frames.get_frame_count(fallback_action) > 0:
                frames.add_frame("idle", frames.get_frame_texture(fallback_action, 0))
                break

    return frames

func _append_animation_columns(frames: SpriteFrames, animation: String, atlas_texture: Texture2D, row: int, columns: Array) -> void:
    for column_value in columns:
        var column := int(column_value)
        if column < 0 or column >= FULL_ATLAS_COLUMNS:
            continue
        var texture := AtlasTexture.new()
        texture.atlas = atlas_texture
        texture.region = Rect2(
            column * FULL_ATLAS_CELL_SIZE,
            row * FULL_ATLAS_CELL_SIZE,
            FULL_ATLAS_CELL_SIZE,
            FULL_ATLAS_CELL_SIZE,
        )
        frames.add_frame(animation, texture)

func _full_body_y_for_atlas(image: Image) -> float:
    # Strict 256px cells are intentionally consumed as-authored, but their
    # visible feet do not share the legacy 192px normalized pivot. Derive one
    # stable grounded foot line per atlas and move only the Sprite2D node; this
    # preserves every authored pixel while keeping Matthias on top of platforms.
    var foot_samples: Array[int] = []
    for action in ["idle", "walk", "run", "crouch"]:
        var spec: Dictionary = FULL_ACTIONS[action]
        var row := int(spec["row"])
        if action == "run":
            row = _select_run_source_row(image)
        for frame_index in range(int(spec["count"])):
            var rect := Rect2i(
                frame_index * FULL_ATLAS_CELL_SIZE,
                row * FULL_ATLAS_CELL_SIZE,
                FULL_ATLAS_CELL_SIZE,
                FULL_ATLAS_CELL_SIZE,
            )
            var used := image.get_region(rect).get_used_rect()
            if used.size == Vector2i.ZERO:
                continue
            foot_samples.append(used.position.y + used.size.y)

    if foot_samples.is_empty():
        return -BODY_CENTER_TO_FOOT * BODY_SCALE
    foot_samples.sort()
    var foot_y := float(foot_samples[int(foot_samples.size() / 2)])
    return -(foot_y - float(FULL_ATLAS_CELL_SIZE) * 0.5) * BODY_SCALE

func _full_muzzle_positions_for_atlas(image: Image, body_y: float, directional_shoot: bool, weapon_id: String) -> Dictionary:
    # The weapon is baked into each strict frame. Treat the authored barrel tip
    # as the single source of truth instead of maintaining hand-tuned offsets
    # that drift whenever atlas grounding/scale changes.
    var result := {}
    for action in ["idle", "walk", "run", "jump", "fall", "crouch"]:
        var spec: Dictionary = FULL_ACTIONS[action]
        var row := int(spec["row"])
        if action == "run":
            row = _select_run_source_row(image)
        var positions: Array = []
        for frame_index in range(int(spec["count"])):
            if not _cell_has_visible_pixels(image, row, frame_index):
                continue
            positions.append(_muzzle_from_full_cell(image, row, frame_index, body_y, weapon_id))
        if not positions.is_empty():
            result[action] = positions
    if directional_shoot:
        for shoot_action in ["shoot", "shoot_up", "shoot_down"]:
            var shoot_positions: Array = []
            for column_value in DIRECTIONAL_SHOOT_COLUMNS[shoot_action]:
                shoot_positions.append(_muzzle_from_full_cell(image, DIRECTIONAL_SHOOT_ROW, int(column_value), body_y, weapon_id))
            result[shoot_action] = shoot_positions
        var crouch_positions: Array = []
        for column_value in CROUCH_SHOOT_COLUMNS:
            crouch_positions.append(_muzzle_from_full_cell(image, int(FULL_ACTIONS["crouch"]["row"]), int(column_value), body_y, weapon_id))
        result["shoot_crouch"] = crouch_positions
    return result

func _muzzle_from_full_cell(image: Image, row: int, column: int, body_y: float, weapon_id: String) -> Vector2:
    var cell := image.get_region(Rect2i(
        column * FULL_ATLAS_CELL_SIZE,
        row * FULL_ATLAS_CELL_SIZE,
        FULL_ATLAS_CELL_SIZE,
        FULL_ATLAS_CELL_SIZE,
    ))
    var used := cell.get_used_rect()
    if used.size == Vector2i.ZERO:
        return Vector2.ZERO

    # Ignore boots and cap peaks; the right-most opaque cluster through the
    # torso/weapon band is the barrel tip for the canonical right-facing art.
    var y_start := maxi(used.position.y, int(round(FULL_ATLAS_CELL_SIZE * MUZZLE_SCAN_Y_MIN_RATIO)))
    var y_end := mini(used.position.y + used.size.y, int(round(FULL_ATLAS_CELL_SIZE * MUZZLE_SCAN_Y_MAX_RATIO)))
    var tip_x := -1
    for y in range(y_start, y_end):
        for x in range(used.position.x, used.position.x + used.size.x):
            if cell.get_pixel(x, y).a >= MUZZLE_SCAN_ALPHA:
                tip_x = maxi(tip_x, x)

    if tip_x < 0:
        return Vector2.ZERO

    var y_samples: Array[int] = []
    var cluster_x_start := maxi(used.position.x, tip_x - 7)
    for y in range(y_start, y_end):
        for x in range(cluster_x_start, tip_x + 1):
            if cell.get_pixel(x, y).a >= MUZZLE_SCAN_ALPHA:
                y_samples.append(y)
                break
    if y_samples.is_empty():
        return Vector2.ZERO
    y_samples.sort()
    var tip_y := float(y_samples[int(y_samples.size() / 2)])
    var forward_pad := float(MUZZLE_TIP_FORWARD_PX.get(weapon_id, MUZZLE_TIP_PAD_PX))
    return Vector2(
        (float(tip_x) + forward_pad - FULL_ATLAS_CELL_SIZE * 0.5) * BODY_SCALE,
        body_y + (tip_y - FULL_ATLAS_CELL_SIZE * 0.5) * BODY_SCALE,
    )

func _cell_has_visible_pixels(image: Image, row: int, column: int) -> bool:
    var rect := Rect2i(
        column * FULL_ATLAS_CELL_SIZE,
        row * FULL_ATLAS_CELL_SIZE,
        FULL_ATLAS_CELL_SIZE,
        FULL_ATLAS_CELL_SIZE,
    )
    return image.get_region(rect).get_used_rect().size != Vector2i.ZERO

func _select_run_source_row(image: Image) -> int:
    var run_spec: Dictionary = FULL_ACTIONS["run"]
    var walk_spec: Dictionary = FULL_ACTIONS["walk"]
    var run_row := int(run_spec["row"])
    var walk_row := int(walk_spec["row"])
    var run_score := _lower_body_motion_score(image, run_row, int(run_spec["count"]))
    var walk_score := _lower_body_motion_score(image, walk_row, int(walk_spec["count"]))
    if (
        walk_score > run_score + RUN_LEG_MOTION_MIN_DIFF
        and (
            walk_score > run_score * RUN_LEG_MOTION_RELATIVE_GAIN
            or run_score < RUN_LEG_MOTION_MIN_SCORE
        )
    ):
        push_warning(
            "Strict run row has weak lower-body motion; using authored walk stride for running"
        )
        return walk_row
    return run_row

func _lower_body_motion_score(image: Image, row: int, frame_count: int) -> float:
    if frame_count <= 1:
        return 0.0
    var changed := 0
    var sampled := 0
    var y_start := int(round(float(FULL_ATLAS_CELL_SIZE) * 0.55))
    var y_end := FULL_ATLAS_CELL_SIZE - 12
    var x_start := 18
    var x_end := FULL_ATLAS_CELL_SIZE - 18
    for frame_index in range(1, frame_count):
        var previous_x := (frame_index - 1) * FULL_ATLAS_CELL_SIZE
        var current_x := frame_index * FULL_ATLAS_CELL_SIZE
        var base_y := row * FULL_ATLAS_CELL_SIZE
        for local_y in range(y_start, y_end, RUN_LEG_MOTION_SAMPLE_STEP):
            for local_x in range(x_start, x_end, RUN_LEG_MOTION_SAMPLE_STEP):
                var previous := image.get_pixel(previous_x + local_x, base_y + local_y)
                var current := image.get_pixel(current_x + local_x, base_y + local_y)
                if maxf(previous.a, current.a) <= 0.10:
                    continue
                var pixel_diff := (
                    absf(previous.r - current.r)
                    + absf(previous.g - current.g)
                    + absf(previous.b - current.b)
                    + absf(previous.a - current.a)
                )
                if pixel_diff >= RUN_LEG_PIXEL_DIFF:
                    changed += 1
                sampled += 1
    if sampled <= 0:
        return 0.0
    return float(changed) / float(sampled)

func _build_legacy_pistol_frames(image: Image) -> SpriteFrames:
    if image.get_size() != Vector2i(768, 960):
        return null
    var frames := SpriteFrames.new()
    frames.remove_animation("default")
    for action in LEGACY_PISTOL_ACTIONS.keys():
        var spec: Dictionary = LEGACY_PISTOL_ACTIONS[action]
        frames.add_animation(action)
        frames.set_animation_loop(action, bool(spec["loop"]))
        frames.set_animation_speed(action, float(spec["fps"]))
        for frame_index in range(int(spec["count"])):
            var texture := _normalized_cell_texture(image, int(spec["row"]), frame_index, 4, 5)
            if texture == null:
                return null
            frames.add_frame(action, texture)
    return frames

func _normalized_cell_texture(image: Image, row: int, column: int, columns: int, rows: int) -> Texture2D:
    var x0 := int(floor(float(column) * float(image.get_width()) / float(columns)))
    var x1 := int(floor(float(column + 1) * float(image.get_width()) / float(columns)))
    var y0 := int(floor(float(row) * float(image.get_height()) / float(rows)))
    var y1 := int(floor(float(row + 1) * float(image.get_height()) / float(rows)))
    var guard := mini(CELL_GUARD_PX, maxi(0, int(mini(x1 - x0, y1 - y0) / 8)))
    var rect := Rect2i(
        x0 + guard,
        y0 + guard,
        maxi(1, x1 - x0 - guard * 2),
        maxi(1, y1 - y0 - guard * 2),
    )
    var cell := image.get_region(rect)
    cell.resize(NORMALIZED_FRAME_SIZE, NORMALIZED_FRAME_SIZE, Image.INTERPOLATE_LANCZOS)

    # AI-authored/contact-sheet sources are not always mathematically aligned.
    # Normalize the vertical foot anchor in Godot so every SpriteFrames texture
    # has identical dimensions and a stable ground pivot.
    var used := cell.get_used_rect()
    if used.size == Vector2i.ZERO:
        return null
    var desired_bottom := NORMALIZED_FRAME_SIZE - NORMALIZED_FOOT_GUTTER
    var actual_bottom := used.position.y + used.size.y
    var shift_y := desired_bottom - actual_bottom
    if shift_y != 0:
        var canvas := Image.create(NORMALIZED_FRAME_SIZE, NORMALIZED_FRAME_SIZE, false, Image.FORMAT_RGBA8)
        canvas.fill(Color(0.0, 0.0, 0.0, 0.0))
        var source_rect := Rect2i(0, 0, NORMALIZED_FRAME_SIZE, NORMALIZED_FRAME_SIZE)
        var destination := Vector2i(0, shift_y)
        if destination.y < 0:
            source_rect.position.y = -destination.y
            source_rect.size.y += destination.y
            destination.y = 0
        source_rect.size.y = mini(source_rect.size.y, NORMALIZED_FRAME_SIZE - destination.y)
        if source_rect.size.y > 0:
            canvas.blit_rect(cell, source_rect, destination)
        cell = canvas
    return ImageTexture.create_from_image(cell)

func _ensure_master() -> void:
    if _master_texture != null:
        _build_fallback_frames()
        _install_or_request_weapon()
        return
    if _master_request != null:
        return
    _master_request = HTTPRequest.new()
    add_child(_master_request)
    _master_request.request_completed.connect(_on_master_loaded)
    if _master_request.request(MASTER_URL) != OK:
        _master_request.queue_free()
        _master_request = null
        push_error("Cannot request canonical 2D Matthias master")

func _on_master_loaded(result: int, response_code: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
    if _master_request != null:
        _master_request.queue_free()
        _master_request = null
    if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
        push_error("Cannot load canonical 2D Matthias master")
        return
    var image := Image.new()
    if image.load_png_from_buffer(bytes) != OK or image.get_size() != MASTER_SIZE:
        push_error("Canonical 2D Matthias master is invalid or changed dimensions")
        return
    _master_texture = ImageTexture.create_from_image(image)
    _build_fallback_frames()
    _install_or_request_weapon()

func _build_fallback_frames() -> void:
    if _master_texture == null or not _fallback_frames_by_weapon.is_empty():
        return
    for weapon_id in SOURCE_RECTS.keys():
        var frames := SpriteFrames.new()
        frames.remove_animation("default")
        var source: Dictionary = SOURCE_RECTS[weapon_id]
        for action in ["idle", "walk", "run", "jump"]:
            frames.add_animation(action)
            frames.set_animation_loop(action, action in ["idle", "walk", "run"])
            frames.set_animation_speed(action, 1.0)
            var frame := AtlasTexture.new()
            frame.atlas = _master_texture
            frame.region = source[action]
            frames.add_frame(action, frame)
        frames.add_animation("crouch")
        frames.set_animation_loop("crouch", true)
        frames.set_animation_speed("crouch", 1.0)
        frames.add_frame("crouch", frames.get_frame_texture("jump", 0))
        _fallback_frames_by_weapon[weapon_id] = frames

func _install_frames(frames: SpriteFrames, authored_full: bool) -> void:
    _body.sprite_frames = frames
    var v9_ready := _v9_ready_by_weapon.has(_weapon)
    var v10_ready := _v10_ready_by_weapon.has(_weapon)
    var using_v10_action := v10_ready and V10_ACTIONS.has(_action)
    var body_scale := V10_BODY_SCALE if using_v10_action else (V9_BODY_SCALE if v9_ready else BODY_SCALE)
    _body.scale = Vector2(body_scale, body_scale)
    var body_y := V10_BODY_Y if using_v10_action else (V9_BODY_Y if v9_ready else -BODY_CENTER_TO_FOOT * BODY_SCALE)
    if authored_full and not v9_ready:
        body_y = float(_full_body_y_by_weapon.get(_weapon, body_y))
    _body.position = Vector2(0.0, body_y)
    _using_full_atlas = authored_full
    _rendered_weapon = _weapon
    _body_ready = true
    _body.visible = true
    _one_shot_action = ""
    _hold_one_shot = false
    if not _animation_available(_action):
        _action = "idle"
    _play_action()
    if _body.sprite_frames.get_frame_count(_action) > 0:
        _body.frame = 0
    _body.visible = true
    _sync_muzzle()
    queue_redraw()
    if authored_full and v9_ready and _rendered_weapon == "pistol" and not v10_ready:
        call_deferred("_ensure_v10_locomotion", _rendered_weapon)
    elif authored_full and not v9_ready:
        call_deferred("_ensure_directional_source", _rendered_weapon)

func _animation_available(name: String) -> bool:
    return _body_ready and _body.sprite_frames != null and _body.sprite_frames.has_animation(name) and _body.sprite_frames.get_frame_count(name) > 0

func _play_action() -> void:
    if not _body_ready or _dead or not _animation_available(_action):
        return
    _apply_body_transform(_action, _body.frame)
    if _action in ["walk", "run", "crouch_walk"]:
        _body.speed_scale = 1.0
        _body.play(_action)
        return
    _body.speed_scale = 1.0
    _body.play(_action)

func _locomotion_phase() -> float:
    if not _animation_available(_action):
        return 0.0
    var frame_count := _body.sprite_frames.get_frame_count(_action)
    if frame_count <= 0:
        return 0.0
    return fposmod(
        (float(_body.frame) + _body.frame_progress) / float(frame_count),
        1.0,
    )

func _restore_locomotion_phase(phase: float) -> void:
    if not _animation_available(_action):
        return
    var frame_count := _body.sprite_frames.get_frame_count(_action)
    if frame_count <= 0:
        return
    var frame_position := fposmod(phase, 1.0) * float(frame_count)
    var frame_index := int(floor(frame_position)) % frame_count
    _body.set_frame_and_progress(frame_index, frame_position - floor(frame_position))

func _sync_locomotion_playback(horizontal_speed_ratio: float) -> void:
    if not _animation_available(_action):
        return
    var frame_count := _body.sprite_frames.get_frame_count(_action)
    if frame_count <= 1:
        return

    var ratio := clampf(horizontal_speed_ratio, 0.0, 1.0)
    var cycle_hz := WALK_CYCLE_HZ_MIN
    if _action == "run":
        var run_t := clampf(
            (ratio - RUN_EXIT_SPEED_RATIO) / maxf(0.001, 1.0 - RUN_EXIT_SPEED_RATIO),
            0.0,
            1.0,
        )
        cycle_hz = lerpf(RUN_CYCLE_HZ_MIN, RUN_CYCLE_HZ_MAX, smoothstep(0.0, 1.0, run_t))
    else:
        var walk_t := clampf(ratio / RUN_ENTER_SPEED_RATIO, 0.0, 1.0)
        cycle_hz = lerpf(WALK_CYCLE_HZ_MIN, WALK_CYCLE_HZ_MAX, smoothstep(0.0, 1.0, walk_t))

    # Let AnimatedSprite2D advance on the render clock. The old manual
    # floor(accumulator) stepping was quantized to the 60 Hz physics tick, so an
    # authored 13-16 fps stride alternated uneven tick counts and looked jerky
    # on common 120/144 Hz displays even while world movement was interpolated.
    var authored_fps := _body.sprite_frames.get_animation_speed(_action)
    var desired_fps := float(frame_count) * cycle_hz
    _body.speed_scale = desired_fps / maxf(0.001, authored_fps)
    if _body.animation != _action or not _body.is_playing():
        _body.play(_action)
    _apply_locomotion_polish(frame_count, ratio)

func _apply_locomotion_polish(frame_count: int, speed_ratio: float) -> void:
    if frame_count <= 1:
        return
    var phase := _locomotion_phase() * TAU
    if _action == "run":
        var intensity := clampf(
            (speed_ratio - RUN_EXIT_SPEED_RATIO) / maxf(0.001, 1.0 - RUN_EXIT_SPEED_RATIO),
            0.0,
            1.0,
        )
        intensity = smoothstep(0.0, 1.0, intensity)
        _fx_root.position.y = -absf(sin(phase * 2.0)) * RUN_BOB_PX * intensity
        _fx_root.rotation = deg_to_rad(-RUN_LEAN_DEGREES * intensity)
    elif _action == "walk":
        var intensity := clampf(speed_ratio / RUN_ENTER_SPEED_RATIO, 0.0, 1.0)
        _fx_root.position.y = -absf(sin(phase * 2.0)) * WALK_BOB_PX * intensity

func _play_one_shot(name: String, hold: bool = false) -> void:
    if not _animation_available(name):
        return
    _one_shot_action = name
    _hold_one_shot = hold
    _action = name
    _body.frame = 0
    _apply_body_transform(name, 0)
    _body.play(name)

func _on_body_frame_changed() -> void:
    if _body == null:
        return
    _apply_body_transform(String(_body.animation), _body.frame)

func _apply_body_transform(action: String, frame_index: int) -> void:
    if _v10_ready_by_weapon.has(_rendered_weapon) and V10_ACTIONS.has(action):
        _body.scale = Vector2(V10_BODY_SCALE, V10_BODY_SCALE)
        _body.position.y = V10_BODY_Y
        return
    if _v9_ready_by_weapon.has(_rendered_weapon):
        _body.scale = Vector2(V9_BODY_SCALE, V9_BODY_SCALE)
        _body.position.y = V9_BODY_Y
        return
    var directional_by_action: Dictionary = _directional_body_y_by_weapon.get(_rendered_weapon, {})
    if directional_by_action.has(action):
        var anchors: Array = directional_by_action[action]
        if not anchors.is_empty():
            _body.scale = Vector2(DIRECTIONAL_BODY_SCALE, DIRECTIONAL_BODY_SCALE)
            _body.position.y = float(anchors[clampi(frame_index, 0, anchors.size() - 1)])
            return
    _body.scale = Vector2(BODY_SCALE, BODY_SCALE)
    _body.position.y = float(
        _full_body_y_by_weapon.get(_rendered_weapon, -BODY_CENTER_TO_FOOT * BODY_SCALE)
    )

func _on_animation_finished() -> void:
    if _one_shot_action.is_empty() or _hold_one_shot:
        return
    _one_shot_action = ""
    _action = ""
    _apply_body_transform("idle", 0)

func _sync_muzzle() -> void:
    var visual_weapon := _rendered_weapon if not _rendered_weapon.is_empty() else _weapon
    if _v9_ready_by_weapon.has(visual_weapon):
        var used_frame_socket := false
        var v9_poses: Dictionary = _full_muzzle_by_weapon.get(visual_weapon, {})
        if v9_poses.has(_action):
            var frame_positions: Array = v9_poses.get(_action, [])
            if not frame_positions.is_empty():
                var frame_index := clampi(_body.frame, 0, frame_positions.size() - 1)
                var frame_position: Vector2 = frame_positions[frame_index]
                if frame_position != Vector2.ZERO:
                    _muzzle.position = frame_position
                    used_frame_socket = true
        if not used_frame_socket:
            _muzzle.position = _v9_muzzle_position(visual_weapon)
        var v9_scale := float(FLASH_SCALE.get(visual_weapon, 1.0)) * _muzzle_flash_boost
        _flash.scale = Vector2(v9_scale, v9_scale)
        _sync_aim_feedback()
        return
    var strict_poses: Dictionary = _full_muzzle_by_weapon.get(visual_weapon, {})
    if _using_full_atlas and not strict_poses.is_empty():
        var action_key := _action if strict_poses.has(_action) else "idle"
        var frame_positions: Array = strict_poses.get(action_key, [])
        if not frame_positions.is_empty():
            var frame_index := clampi(_body.frame, 0, frame_positions.size() - 1)
            var authored_position: Vector2 = frame_positions[frame_index]
            if authored_position != Vector2.ZERO:
                _muzzle.position = authored_position
    else:
        var poses: Dictionary = MUZZLE_POS.get(visual_weapon, MUZZLE_POS["pistol"])
        _muzzle.position = Vector2(poses.get(_action, poses["idle"])) * BODY_SCALE_RATIO
    var s := float(FLASH_SCALE.get(visual_weapon, 1.0)) * _muzzle_flash_boost
    _flash.scale = Vector2(s, s)
    _sync_aim_feedback()

func _v9_muzzle_positions_for_atlas(image: Image, weapon_id: String) -> Dictionary:
    var result := {}
    for action in V9_MUZZLE_ACTION_AIM.keys():
        var spec: Dictionary = V9_ACTIONS[action]
        var row := int(spec["row"])
        var aim: Vector2 = V9_MUZZLE_ACTION_AIM[action]
        aim = aim.normalized()
        var positions: Array = []
        for frame_index in range(V9_ATLAS_COLUMNS):
            positions.append(
                _v9_muzzle_from_cell(image, row, frame_index, weapon_id, action, aim)
            )
        result[action] = positions
    return result

func _v9_muzzle_from_cell(
    image: Image,
    row: int,
    column: int,
    weapon_id: String,
    action: String,
    aim: Vector2,
) -> Vector2:
    var cell := image.get_region(Rect2i(
        column * V9_ATLAS_CELL_SIZE,
        row * V9_ATLAS_CELL_SIZE,
        V9_ATLAS_CELL_SIZE,
        V9_ATLAS_CELL_SIZE,
    ))
    var used := cell.get_used_rect()
    if used.size == Vector2i.ZERO:
        return Vector2.ZERO

    # Follow a narrow ray from the authored weapon-hand pivot and choose the
    # furthest opaque cluster along the actual firing direction. This prevents
    # vertical shots from inheriting the old centre-of-body procedural socket.
    var crouched := action == "shoot_crouch"
    var pivot_y := -25.0 if crouched else float(V9_MUZZLE_PIVOT_Y.get(weapon_id, -36.0))
    var pivot_world := Vector2(7.0, pivot_y)
    var centre := Vector2(
        float(V9_ATLAS_CELL_SIZE) * 0.5,
        float(V9_ATLAS_CELL_SIZE) * 0.5,
    )
    var pivot_px := Vector2(
        centre.x + pivot_world.x / V9_BODY_SCALE,
        centre.y + (pivot_world.y - V9_BODY_Y) / V9_BODY_SCALE,
    )

    var y_start := maxi(used.position.y, 2)
    var y_end := mini(
        used.position.y + used.size.y,
        int(round(float(V9_ATLAS_CELL_SIZE) * V9_MUZZLE_SCAN_Y_MAX_RATIO_DIRECTIONAL)),
    )
    var best_forward := -INF
    for y in range(y_start, y_end):
        for x in range(used.position.x, used.position.x + used.size.x):
            if cell.get_pixel(x, y).a < MUZZLE_SCAN_ALPHA:
                continue
            var delta := Vector2(float(x), float(y)) - pivot_px
            var forward := delta.dot(aim)
            if forward < 0.0:
                continue
            var lateral := absf(delta.cross(aim))
            if lateral > V9_MUZZLE_RAY_HALF_WIDTH_PX:
                continue
            best_forward = maxf(best_forward, forward)

    if best_forward == -INF:
        return Vector2.ZERO

    var cluster := Vector2.ZERO
    var cluster_count := 0
    for y in range(y_start, y_end):
        for x in range(used.position.x, used.position.x + used.size.x):
            if cell.get_pixel(x, y).a < MUZZLE_SCAN_ALPHA:
                continue
            var point := Vector2(float(x), float(y))
            var delta := point - pivot_px
            var forward := delta.dot(aim)
            var lateral := absf(delta.cross(aim))
            if (
                lateral <= V9_MUZZLE_RAY_HALF_WIDTH_PX
                and forward >= best_forward - V9_MUZZLE_CLUSTER_DEPTH_PX
            ):
                cluster += point
                cluster_count += 1

    if cluster_count <= 0:
        return Vector2.ZERO
    var tip_px := cluster / float(cluster_count)
    return Vector2(
        (tip_px.x - centre.x) * V9_BODY_SCALE,
        V9_BODY_Y + (tip_px.y - centre.y) * V9_BODY_SCALE,
    ) + aim * 2.0

func _v9_muzzle_position(weapon_id: String) -> Vector2:
    var local_aim := Vector2(_aim_direction.x * _facing, _aim_direction.y)
    if local_aim.length_squared() <= 0.001:
        local_aim = Vector2.RIGHT
    local_aim = local_aim.normalized()
    var crouched := _action in ["crouch", "crouch_walk", "shoot_crouch"]
    var pivot_y := -25.0 if crouched else float(V9_MUZZLE_PIVOT_Y.get(weapon_id, -36.0))
    var pivot := Vector2(7.0, pivot_y)
    var length := float(V9_MUZZLE_LENGTH.get(weapon_id, 58.0))
    return pivot + local_aim * length

func _sync_aim_feedback() -> void:
    if _flash == null:
        return
    # FacingRoot mirrors local X for left-facing Matthias. Convert the world
    # aim vector back into that mirrored local space so the procedural flash
    # points along the actual projectile direction without rotating the authored
    # raster body/weapon around the player's feet.
    var local_aim := Vector2(_aim_direction.x * _facing, _aim_direction.y)
    if local_aim.length_squared() <= 0.001:
        local_aim = Vector2.RIGHT
    _flash.rotation = local_aim.angle()

func _sync_modulate() -> void:
    var color := Color.WHITE
    if _dead:
        color = Color(0.72, 0.72, 0.72, 1.0)
    elif _hurt_remaining > 0.0 and not (_using_full_atlas and _animation_available("hurt")):
        color = Color(1.0, 0.62, 0.62, 1.0)
    elif _invuln_remaining > 0.0:
        # Keep invulnerability readable without making locomotion look as if
        # animation frames are disappearing. Damage feedback stays opaque.
        color = Color(1.0, 0.90, 0.84, 1.0)
    _fx_root.modulate = color
