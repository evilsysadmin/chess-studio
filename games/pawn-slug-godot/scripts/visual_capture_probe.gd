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

static func _measure_texture(texture: Texture2D, scale_x: float, scale_y: float) -> Dictionary:
    if texture == null:
        return {"error": "missing-texture"}
    var image := texture.get_image()
    if image == null or image.is_empty():
        return {"error": "empty-image"}
    if image.is_compressed():
        var decompress_result := image.decompress()
        if decompress_result != OK:
            return {"error": "decompress-failed:%s" % decompress_result}
    image.convert(Image.FORMAT_RGBA8)
    if image.get_format() != Image.FORMAT_RGBA8:
        return {"error": "rgba8-convert-failed"}

    var width := image.get_width()
    var height := image.get_height()
    var bytes := image.get_data()
    if bytes.size() != width * height * 4:
        return {
            "error": "unexpected-rgba-buffer",
            "buffer_size": bytes.size(),
            "expected_size": width * height * 4,
        }

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
        return {"error": "empty-alpha"}
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
    if animation.is_empty() or not body.sprite_frames.has_animation(animation):
        return

    var frame_count := body.sprite_frames.get_frame_count(animation)
    var requested_frame_value = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbeFrame === 'number' ? window.__pawnSlugVisualProbeFrame : -1",
        true,
    )
    var requested_frame := int(requested_frame_value) if typeof(requested_frame_value) in [TYPE_INT, TYPE_FLOAT] else -1
    if requested_frame >= 0:
        body.pause()
        body.frame = clampi(requested_frame, 0, frame_count - 1)

    var frame_index := int(body.frame)
    if frame_index < 0 or frame_index >= frame_count:
        return

    var scale_x := absf(body.global_scale.x)
    var scale_y := absf(body.global_scale.y)
    var metrics := _measure_texture(
        body.sprite_frames.get_frame_texture(animation, frame_index),
        scale_x,
        scale_y,
    )
    metrics["request_id"] = request_id
    metrics["weapon"] = String(player.get("weapon"))
    metrics["action"] = requested_pose if requested_pose in ["idle", "run", "crouch"] else animation
    metrics["animation"] = animation
    metrics["frame"] = frame_index
    metrics["frame_count"] = frame_count
    metrics["body_scale_x"] = scale_x
    metrics["body_scale_y"] = scale_y
    metrics["player_x"] = float(player.global_position.x)
    metrics["player_y"] = float(player.global_position.y)
    JavaScriptBridge.eval("window.__pawnSlugVisualMetrics = " + JSON.stringify(metrics) + ";")
