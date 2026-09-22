class_name PawnSlugVisualCaptureProbe
extends RefCounted

static var _metrics_request_seen := -1

static func apply(player: Node, stage_start_x: float, world_width: float) -> void:
    # CI's Playwright harness injects these JS-only globals before Godot boots.
    # Normal production pages never define them, so probes cannot alter regular
    # gameplay or become public URL cheats.
    if not OS.has_feature("web"):
        return

    var weapon_probe = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbeWeapon === 'string' ? window.__pawnSlugVisualProbeWeapon : ''",
        true,
    )
    var weapon_id := String(weapon_probe)
    if weapon_id in ["machinegun", "shotgun", "panzerfaust"]:
        player.grant_weapon(weapon_id)

    var position_probe = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbeX === 'number' ? window.__pawnSlugVisualProbeX : null",
        true,
    )
    if typeof(position_probe) not in [TYPE_INT, TYPE_FLOAT]:
        return
    var target_x := clampf(float(position_probe), stage_start_x, world_width - 96.0)
    player.global_position.x = target_x
    player.velocity = Vector2.ZERO
    player.reset_physics_interpolation()

static func publish_metrics(player: Node) -> void:
    if not OS.has_feature("web"):
        return
    var request_value = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualMetricsRequest === 'number' ? window.__pawnSlugVisualMetricsRequest : -1",
        true,
    )
    if typeof(request_value) not in [TYPE_INT, TYPE_FLOAT]:
        return
    var request_id := int(request_value)
    if request_id < 0 or request_id == _metrics_request_seen:
        return
    _metrics_request_seen = request_id

    var body := player.get_node_or_null("MatthiasArt/FacingRoot/FxRoot/CanonicalBody") as AnimatedSprite2D
    if body == null or body.sprite_frames == null or not body.visible:
        return
    var animation := String(body.animation)
    var frame_index := int(body.frame)
    if animation.is_empty() or not body.sprite_frames.has_animation(animation):
        return
    if frame_index < 0 or frame_index >= body.sprite_frames.get_frame_count(animation):
        return
    var texture := body.sprite_frames.get_frame_texture(animation, frame_index)
    if texture == null:
        return
    var image := texture.get_image()
    if image == null or image.is_empty():
        return

    var width := image.get_width()
    var height := image.get_height()
    var min_x := width
    var min_y := height
    var max_x := -1
    var max_y := -1
    var alpha_area := 0
    # Central band excludes most barrel/weapon footprint and tracks Matthias'
    # body mass. It catches same-bbox/smaller-body regressions.
    var core_min_x := int(floor(float(width) * 0.34))
    var core_max_x := int(ceil(float(width) * 0.64))
    var core_min_y := height
    var core_max_y := -1
    var core_area := 0
    for y in range(height):
        for x in range(width):
            if image.get_pixel(x, y).a <= 0.10:
                continue
            alpha_area += 1
            min_x = mini(min_x, x)
            min_y = mini(min_y, y)
            max_x = maxi(max_x, x)
            max_y = maxi(max_y, y)
            if x >= core_min_x and x < core_max_x:
                core_area += 1
                core_min_y = mini(core_min_y, y)
                core_max_y = maxi(core_max_y, y)
    if max_x < min_x or max_y < min_y:
        return

    var scale_x := absf(body.global_scale.x)
    var scale_y := absf(body.global_scale.y)
    var core_height := (core_max_y - core_min_y + 1) if core_max_y >= core_min_y else 0
    var velocity: Vector2 = player.get("velocity")
    var crouching := bool(player.get("_crouching"))
    var logical_action := "idle"
    if crouching:
        logical_action = "crouch"
    elif absf(velocity.x) >= 237.6:
        # Player MOVE_SPEED 330 * RUN_ENTER_SPEED_RATIO 0.72. Keep this probe
        # independent from MatthiasArt's internal animation bookkeeping: the
        # texture below is still the exact frame Godot renders.
        logical_action = "run"
    elif absf(velocity.x) > 26.4:
        logical_action = "walk"
    var metrics := {
        "request_id": request_id,
        "weapon": String(player.get("weapon")),
        "action": logical_action,
        "animation": animation,
        "velocity_x": float(velocity.x),
        "velocity_y": float(velocity.y),
        "frame": frame_index,
        "texture_width": width,
        "texture_height": height,
        "bbox_width": max_x - min_x + 1,
        "bbox_height": max_y - min_y + 1,
        "alpha_area": alpha_area,
        "core_area": core_area,
        "core_height": core_height,
        "body_scale_x": scale_x,
        "body_scale_y": scale_y,
        "world_bbox_width": float(max_x - min_x + 1) * scale_x,
        "world_bbox_height": float(max_y - min_y + 1) * scale_y,
        "world_core_height": float(core_height) * scale_y,
        "player_x": float(player.global_position.x),
        "player_y": float(player.global_position.y),
    }
    JavaScriptBridge.eval("window.__pawnSlugVisualMetrics = " + JSON.stringify(metrics) + ";")
