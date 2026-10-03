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
    else:
        # Headless tools (traversal audit) pick a stage without a browser.
        var requested := OS.get_environment("PAWN_SLUG_STAGE")
        if requested in stage_catalog:
            return requested
    return default_stage_id

static func calm_visual_capture_probe(enemies: Array[Dictionary]) -> Array[Dictionary]:
    # CI/staging smokes only: with __pawnSlugVisualProbeX and
    # __pawnSlugVisualProbeCalmRadius set, the enemies around the probe start are
    # left out, so a smoke proving input and sprites cannot be killed (and
    # respawned with the pistol) while the page boots. Production never sets them.
    if not OS.has_feature("web"):
        return enemies
    var probe_x = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbeX === 'number' ? window.__pawnSlugVisualProbeX : null",
        true,
    )
    var radius = JavaScriptBridge.eval(
        "typeof window.__pawnSlugVisualProbeCalmRadius === 'number' ? window.__pawnSlugVisualProbeCalmRadius : null",
        true,
    )
    if typeof(probe_x) not in [TYPE_INT, TYPE_FLOAT] or typeof(radius) not in [TYPE_INT, TYPE_FLOAT]:
        return enemies
    var kept: Array[Dictionary] = []
    for enemy in enemies:
        if absf(float(enemy.get("x", 0.0)) - float(probe_x)) > float(radius):
            kept.append(enemy)
    return kept

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
