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

static func _median(values: Array[float]) -> float:
    if values.is_empty():
        return 0.0
    var ordered := values.duplicate()
    ordered.sort()
    var middle := ordered.size() / 2
    if ordered.size() % 2 == 1:
        return float(ordered[middle])
    return (float(ordered[middle - 1]) + float(ordered[middle])) * 0.5

static func _measure_texture(texture: Texture2D, scale_x: float, scale_y: float) -> Dictionary:
    if texture == null:
        return {}
    var image := texture.get_image()
    if image == null or image.is_empty():
        return {}
    image.convert(Image.FORMAT_RGBA8)
    var width := image.get_width()
    var height := image.get_height()
    var bytes := image.get_data()
    var min_x := width
    var min_y := height
    var max_x := -1
    var max_y := -1
    var alpha_area := 0
    # Central band excludes most barrel/weapon footprint and tracks Matthias'
    # torso/head mass. It catches same-bbox/smaller-body regressions.
    var core_min_x := int(floor(float(width) * 0.34))
    var core_max_x := int(ceil(float(width) * 0.64))
    var core_min_y := height
    var core_max_y := -1
    var core_area := 0
    var alpha_cutoff := int(round(0.10 * 255.0))
    for y in range(height):
        var row_offset := y * width * 4
        for x in range(width):
            var alpha := int(bytes[row_offset + x * 4 + 3])
            if alpha <= alpha_cutoff:
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
        return {}
    var core_height := (core_max_y - core_min_y + 1) if core_max_y >= core_min_y else 0
    return {
        "bbox_width": max_x - min_x + 1,
        "bbox_height": max_y - min_y + 1,
        "alpha_area": alpha_area,
        "core_area": core_area,
        "core_height": core_height,
        "world_bbox_width": float(max_x - min_x + 1) * scale_x,
        "world_bbox_height": float(max_y - min_y + 1) * scale_y,
        "world_core_height": float(core_height) * scale_y,
    }

static func _animation_profile(body: AnimatedSprite2D, animation: String) -> Dictionary:
    if body == null or body.sprite_frames == null or not body.sprite_frames.has_animation(animation):
        return {}
    var count := body.sprite_frames.get_frame_count(animation)
    if count <= 0:
        return {}
    var scale_x := absf(body.global_scale.x)
    var scale_y := absf(body.global_scale.y)
    var bbox_heights: Array[float] = []
    var core_heights: Array[float] = []
    var core_areas: Array[float] = []
    var world_core_heights: Array[float] = []
    for frame_index in range(count):
        var texture := body.sprite_frames.get_frame_texture(animation, frame_index)
        var metrics := _measure_texture(texture, scale_x, scale_y)
        if metrics.is_empty():
            continue
        bbox_heights.append(float(metrics["bbox_height"]))
        core_heights.append(float(metrics["core_height"]))
        core_areas.append(float(metrics["core_area"]))
        world_core_heights.append(float(metrics["world_core_height"]))
    if core_heights.is_empty():
        return {}
    core_heights.sort()
    core_areas.sort()
    bbox_heights.sort()
    world_core_heights.sort()
    return {
        "frames": count,
        "bbox_height_median": _median(bbox_heights),
        "bbox_height_min": bbox_heights[0],
        "bbox_height_max": bbox_heights[-1],
        "core_height_median": _median(core_heights),
        "core_height_min": core_heights[0],
        "core_height_max": core_heights[-1],
        "core_area_median": _median(core_areas),
        "core_area_min": core_areas[0],
        "core_area_max": core_areas[-1],
        "world_core_height_median": _median(world_core_heights),
        "world_core_height_min": world_core_heights[0],
        "world_core_height_max": world_core_heights[-1],
        "body_scale_x": scale_x,
        "body_scale_y": scale_y,
    }

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

    var art := player.get_node_or_null("MatthiasArt")
    var requested_pose_value = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbePose === 'string' ? window.__pawnSlugVisualProbePose : ''",
        true,
    )
    var requested_pose := String(requested_pose_value)
    if art != null and requested_pose in ["idle", "run", "crouch"]:
        art.set_combat_state(0.0, 0.0, false, 0.0)
        art.set_aim_direction(Vector2.RIGHT)
        art.update_visual(
            0.0,
            1.0 if requested_pose == "run" else 0.0,
            true,
            requested_pose == "crouch",
            false,
            0.0,
            1.0,
            false,
        )

    var body := player.get_node_or_null("MatthiasArt/FacingRoot/FxRoot/CanonicalBody") as AnimatedSprite2D
    if body == null or body.sprite_frames == null or not body.visible:
        return
    var animation := String(body.animation)
    var frame_index := int(body.frame)
    if animation.is_empty() or not body.sprite_frames.has_animation(animation):
        return
    if frame_index < 0 or frame_index >= body.sprite_frames.get_frame_count(animation):
        return
    var scale_x := absf(body.global_scale.x)
    var scale_y := absf(body.global_scale.y)
    var current := _measure_texture(
        body.sprite_frames.get_frame_texture(animation, frame_index),
        scale_x,
        scale_y,
    )
    if current.is_empty():
        return

    var velocity: Vector2 = player.get("velocity")
    var logical_action := requested_pose if requested_pose in ["idle", "run", "crouch"] else animation
    var metrics := current.duplicate(true)
    metrics.merge({
        "request_id": request_id,
        "weapon": String(player.get("weapon")),
        "action": logical_action,
        "animation": animation,
        "velocity_x": float(velocity.x),
        "velocity_y": float(velocity.y),
        "frame": frame_index,
        "body_scale_x": scale_x,
        "body_scale_y": scale_y,
        "animation_profile": _animation_profile(body, animation),
        "player_x": float(player.global_position.x),
        "player_y": float(player.global_position.y),
    }, true)
    JavaScriptBridge.eval("window.__pawnSlugVisualMetrics = " + JSON.stringify(metrics) + ";")
