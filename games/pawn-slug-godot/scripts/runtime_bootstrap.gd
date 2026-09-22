extends RefCounted

static func selected_stage_id(default_stage_id: String, stage_catalog: Array) -> String:
    if OS.has_feature("web"):
        var selected = JavaScriptBridge.eval(
            "(new URLSearchParams(window.location.search)).get('stage') || ''",
            true,
        )
        var candidate := String(selected)
        if candidate in stage_catalog:
            return candidate
    return default_stage_id

static func apply_visual_capture_probe(player, stage_start_x: float, world_size: Vector2) -> void:
    # CI's Playwright harness injects these JS-only globals before Godot boots.
    # Production pages never define them, so probes cannot alter normal gameplay.
    if not OS.has_feature("web") or player == null:
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
    var target_x := clampf(float(position_probe), stage_start_x, world_size.x - 96.0)
    player.global_position.x = target_x
    player.velocity = Vector2.ZERO
    player.reset_physics_interpolation()
