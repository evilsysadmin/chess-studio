extends SceneTree

const PlayerProbe := preload("res://tests/player_probe.gd")
const MainRuntime := preload("res://scripts/main.gd")
const EnemyUtilityAI := preload("res://scripts/enemy_utility_ai.gd")
const TraversalManager := preload("res://scripts/traversal_manager.gd")
const EPSILON := 0.01

var _failures: Array[String] = []

func _initialize() -> void:
    call_deferred("_run")

func _expect(condition: bool, message: String) -> void:
    if condition:
        return
    _failures.append(message)
    push_error("Pawn Slug runtime smoke: " + message)

func _expect_vector(actual: Vector2, expected: Vector2, message: String) -> void:
    _expect(actual.distance_to(expected) <= EPSILON, "%s · actual=%s expected=%s" % [message, actual, expected])

func _static_rect(parent: Node, body_name: String, position: Vector2, size: Vector2) -> StaticBody2D:
    var body := StaticBody2D.new()
    body.name = body_name
    body.position = position
    var collision := CollisionShape2D.new()
    collision.name = "CollisionShape2D"
    var shape := RectangleShape2D.new()
    shape.size = size
    collision.shape = shape
    body.add_child(collision)
    parent.add_child(body)
    return body

func _static_one_way_rect(parent: Node, body_name: String, position: Vector2, size: Vector2) -> StaticBody2D:
    var body := _static_rect(parent, body_name, position, size)
    var collision := body.get_node("CollisionShape2D") as CollisionShape2D
    collision.one_way_collision = true
    collision.one_way_collision_margin = 7.0
    return body

func _make_player(parent: Node, position: Vector2):
    var player := PlayerProbe.new()
    player.name = "PlayerProbe"
    player.position = position
    var collision := CollisionShape2D.new()
    collision.name = "CollisionShape2D"
    var shape := RectangleShape2D.new()
    shape.size = Vector2(48.0, 84.0)
    collision.shape = shape
    player.add_child(collision)
    parent.add_child(player)
    return player

func _run() -> void:
    var world := Node2D.new()
    world.name = "RuntimeSmokeWorld"
    root.add_child(world)

    _static_rect(world, "Floor", Vector2(0.0, 200.0), Vector2(800.0, 40.0))
    var player = _make_player(world, Vector2(0.0, 137.0))
    await physics_frame

    var standing_rect: Rect2 = player.combat_hitbox_rect()
    player.force_crouching(true)
    var crouched_rect: Rect2 = player.combat_hitbox_rect()
    _expect_vector(crouched_rect.size, Vector2(48.0, 48.0), "crouch usa hitbox 48x48 real")
    _expect(
        absf((standing_rect.position.y + standing_rect.size.y) - (crouched_rect.position.y + crouched_rect.size.y)) <= EPSILON,
        "crouch conserva la línea de pies",
    )

    var ceiling := _static_rect(world, "LowCeiling", Vector2(0.0, 105.0), Vector2(180.0, 20.0))
    await physics_frame
    _expect(not player.can_stand_probe(), "Matthias no puede levantarse dentro de un techo bajo")
    ceiling.queue_free()
    await physics_frame
    await physics_frame
    _expect(player.can_stand_probe(), "Matthias vuelve a poder levantarse al liberar el techo")

    var aim_cases := [
        [Vector2(1.0, 0.0), Vector2.RIGHT, "derecha"],
        [Vector2(1.0, -1.0), Vector2(1.0, -1.0).normalized(), "diagonal superior derecha"],
        [Vector2(-1.0, -1.0), Vector2(-1.0, -1.0).normalized(), "diagonal superior izquierda"],
        [Vector2(-1.0, 0.0), Vector2.LEFT, "izquierda"],
        [Vector2(-1.0, 1.0), Vector2(-1.0, 1.0).normalized(), "diagonal inferior izquierda"],
        [Vector2(1.0, 1.0), Vector2(1.0, 1.0).normalized(), "diagonal inferior derecha"],
    ]
    for aim_case in aim_cases:
        _expect_vector(
            player.quantize_aim_probe(aim_case[0]),
            aim_case[1],
            "aim 8-way " + String(aim_case[2]),
        )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2.UP, false),
        Vector2.UP,
        "vertical arriba se conserva en el aire",
    )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2.DOWN, false),
        Vector2.DOWN,
        "vertical abajo se conserva en el aire",
    )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2.UP, true),
        Vector2.UP,
        "arriba solo en suelo permite disparo vertical real",
    )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2.DOWN, true),
        Vector2.RIGHT,
        "abajo en suelo queda horizontal para poder agacharse y disparar",
    )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2(1.0, 1.0).normalized(), true),
        Vector2.RIGHT,
        "derecha + abajo en suelo conserva crouch-walk con disparo horizontal",
    )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2(-1.0, 1.0).normalized(), true),
        Vector2.LEFT,
        "izquierda + abajo en suelo conserva crouch-walk con disparo horizontal",
    )
    player.facing = -1.0
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2.UP, true),
        Vector2.UP,
        "arriba solo en suelo es vertical aunque el facing sea izquierdo",
    )
    _expect_vector(
        player.constrain_vertical_aim_probe(Vector2.DOWN, true),
        Vector2.LEFT,
        "abajo en suelo respeta facing izquierdo sin abandonar crouch",
    )
    _expect_vector(player.quantize_aim_probe(Vector2.ZERO), Vector2.LEFT, "aim neutro conserva facing")

    # Drop-through probe: crouch+jump targets only the one-way support below
    # Matthias, leaves solid geometry alone, and gives him downward momentum.
    var drop_platform := _static_one_way_rect(
        world,
        "DropPlatform",
        Vector2(320.0, 130.0),
        Vector2(180.0, 24.0),
    )
    player.position = Vector2(320.0, 76.0)
    player.velocity = Vector2.ZERO
    await physics_frame
    _expect(player.try_drop_through_probe(), "drop-through reconoce la plataforma one-way bajo los pies")
    _expect(player.drop_through_body_probe() == drop_platform, "drop-through ignora sólo la plataforma actual")
    _expect(player.velocity.y > 0.0, "drop-through aplica impulso descendente")
    player.clear_drop_through_probe()
    _expect(player.drop_through_body_probe() == null, "drop-through retira la excepción tras finalizar")

    # Ledge-climb probe: shoulder sees the platform wall while the head ray is
    # clear, then the downward scan resolves a safe standing point on top.
    player.force_crouching(false)
    player.facing = 1.0
    player.position = Vector2(0.0, 132.0)
    _static_rect(world, "ClimbLedge", Vector2(70.0, 90.0), Vector2(80.0, 24.0))
    await physics_frame
    var ledge_target := player.find_ledge_climb_target_probe()
    _expect(not ledge_target.is_empty(), "ledge climb detecta una cornisa alcanzable")
    if not ledge_target.is_empty():
        var target: Vector2 = ledge_target["target"]
        _expect(absf(target.x - 64.0) <= 1.0, "ledge climb entra lo suficiente sobre la plataforma")
        _expect(absf(target.y - 35.0) <= 1.0, "ledge climb termina con los pies sobre la cara superior")
        _expect(player.respawn_position_is_clear_probe(target), "ledge climb sólo acepta un destino de pie libre")
        player.start_ledge_climb_probe(target)
        _expect(player.is_climbing_probe(), "el segundo toque puede iniciar el estado de escalada")

    # Reproduce the old checkpoint failure: y=137 intersects this platform.
    # Safe respawn must raycast its real top (118) and place the 84px standing
    # body above it, rather than restoring the fixed ground Y inside geometry.
    _static_rect(world, "RespawnPlatform", Vector2(200.0, 130.0), Vector2(120.0, 24.0))
    await physics_frame
    var blocked_checkpoint := Vector2(200.0, 137.0)
    _expect(
        not player.respawn_position_is_clear_probe(blocked_checkpoint),
        "el checkpoint legacy de prueba está realmente bloqueado",
    )
    var safe_respawn: Vector2 = player.find_safe_respawn_probe(blocked_checkpoint)
    _expect(absf(safe_respawn.x - 200.0) <= EPSILON, "respawn conserva X cuando el soporte es válido")
    _expect(absf(safe_respawn.y - 75.0) <= 0.1, "respawn se apoya sobre la cara superior real de la plataforma")
    _expect(player.respawn_position_is_clear_probe(safe_respawn), "respawn final queda libre de geometría")

    # Stage geometry probe: optional canopy/catwalk platforms may be crossed
    # from below while still supporting Matthias/enemies from above.
    var geometry_probe = MainRuntime.new()
    geometry_probe._map_geometry_root = Node2D.new()
    geometry_probe._add_stage_body(
        Rect2(0.0, 0.0, 160.0, 24.0),
        "OneWayProbe",
        true,
    )
    var one_way_shape := geometry_probe._map_geometry_root.get_node(
        "OneWayProbe/CollisionShape2D"
    ) as CollisionShape2D
    _expect(one_way_shape != null, "stage geometry crea collision shape para plataforma one-way")
    if one_way_shape != null:
        _expect(one_way_shape.one_way_collision, "plataforma one-way permite atravesarla desde abajo")
        _expect(one_way_shape.one_way_collision_margin >= 4.0, "plataforma one-way conserva margen estable")
    geometry_probe._map_geometry_root.free()
    geometry_probe._map_geometry_root = null
    geometry_probe.free()

    # Traversal authoring probe: ladders expose only a tight climb zone and
    # authored pits physically split the canonical floor into safe segments.
    var traversal_host := Node2D.new()
    traversal_host.name = "TraversalHost"
    world.add_child(traversal_host)
    var traversal_geometry := Node2D.new()
    traversal_geometry.name = "StageGeometry"
    traversal_host.add_child(traversal_geometry)
    _static_rect(
        traversal_geometry,
        "Floor",
        Vector2(400.0, 220.0),
        Vector2(800.0, 40.0),
    )
    var traversal = TraversalManager.new()
    traversal_host.add_child(traversal)
    traversal.configure_stage({
        "theme": "night_front",
        "world": {"width": 800.0, "height": 240.0, "floor_y": 200.0},
        "ladders": [
            {"x": 300.0, "top_y": 80.0, "bottom_y": 200.0, "w": 30.0, "exit_dir": 1.0},
        ],
        "pits": [
            {"x": 420.0, "w": 120.0, "kind": "test_pit"},
        ],
    })
    var ladder_hit := traversal.ladder_for_player(Vector2(305.0, 130.0))
    _expect(not ladder_hit.is_empty(), "ladder zone reconoce a Matthias dentro del ancho y recorrido")
    _expect(
        traversal.ladder_for_player(Vector2(360.0, 130.0)).is_empty(),
        "ladder zone no captura movimiento lateral lejos de la escalera",
    )
    _expect(traversal.pit_below_x(470.0), "pit contract identifica suelo ausente dentro del hueco")
    _expect(not traversal.pit_below_x(390.0), "pit contract conserva suelo fuera del hueco")
    traversal._rebuild_floor_with_pits()
    _expect(
        traversal_geometry.get_node_or_null("Floor") == null,
        "pit rebuild retira la losa continua legacy",
    )
    var left_floor := traversal_geometry.get_node_or_null("FloorSegment_00") as StaticBody2D
    var right_floor := traversal_geometry.get_node_or_null("FloorSegment_01") as StaticBody2D
    _expect(left_floor != null and right_floor != null, "pit rebuild crea suelo a ambos lados del hueco")
    if left_floor != null and right_floor != null:
        var left_shape := left_floor.get_node("CollisionShape2D") as CollisionShape2D
        var right_shape := right_floor.get_node("CollisionShape2D") as CollisionShape2D
        _expect(absf(left_shape.shape.size.x - 420.0) <= EPSILON, "segmento izquierdo termina al borde del pozo")
        _expect(absf(right_shape.shape.size.x - 260.0) <= EPSILON, "segmento derecho empieza tras el pozo")
    # Utility AI probe: bounded intent selection must prefer traversal over
    # staring at blocked geometry, remember a target briefly, and preserve
    # deliberate arcade breathing room.
    _expect(
        EnemyUtilityAI.choose_intent({
            "target_known": true,
            "visible": false,
            "distance": 210.0,
            "standoff": 260.0,
            "vertical_gap": 0.0,
            "vertical_threshold": 64.0,
            "blocker_ahead": true,
            "pit_ahead": false,
            "ladder_route": false,
            "grenade_evade": 0.0,
            "role": "assaulter",
            "retreat_ratio": 0.64,
            "comfort_margin": 24.0,
            "advance_margin": 80.0,
        }) == EnemyUtilityAI.INTENT_TRAVERSE,
        "utility AI prefiere atravesar un obstáculo a quedarse mirando",
    )
    _expect(
        EnemyUtilityAI.choose_intent({
            "target_known": true,
            "visible": true,
            "distance": 265.0,
            "standoff": 260.0,
            "vertical_gap": 0.0,
            "vertical_threshold": 64.0,
            "blocker_ahead": false,
            "pit_ahead": false,
            "ladder_route": false,
            "grenade_evade": 0.0,
            "role": "support",
            "retreat_ratio": 0.64,
            "comfort_margin": 24.0,
            "advance_margin": 80.0,
        }) == EnemyUtilityAI.INTENT_SHOOT,
        "utility AI puede mantener una posición de tiro razonable",
    )
    _expect(
        EnemyUtilityAI.choose_intent({
            "target_known": true,
            "visible": true,
            "distance": 260.0,
            "standoff": 260.0,
            "vertical_gap": 0.0,
            "vertical_threshold": 64.0,
            "blocker_ahead": false,
            "pit_ahead": false,
            "ladder_route": false,
            "grenade_evade": -1.0,
            "role": "support",
            "retreat_ratio": 0.64,
            "comfort_margin": 24.0,
            "advance_margin": 80.0,
        }) == EnemyUtilityAI.INTENT_EVADE,
        "granada cercana interrumpe una intención normal con evasión urgente",
    )
    _expect(
        EnemyUtilityAI.choose_intent({
            "target_known": false,
            "visible": false,
            "distance": 999.0,
            "standoff": 260.0,
        }) == EnemyUtilityAI.INTENT_HOLD,
        "sin percepción ni memoria el enemigo no rastrea telepáticamente",
    )
    _expect(
        EnemyUtilityAI.choose_intent({
            "target_known": true,
            "visible": true,
            "distance": 265.0,
            "standoff": 260.0,
            "vertical_gap": 0.0,
            "vertical_threshold": 64.0,
            "blocker_ahead": false,
            "pit_ahead": false,
            "ladder_route": false,
            "grenade_evade": 0.0,
            "role": "support",
            "enemy_type": "pawn",
            "pressure_slot_available": false,
            "retreat_ratio": 0.64,
            "comfort_margin": 24.0,
            "advance_margin": 80.0,
        }) == EnemyUtilityAI.INTENT_HOLD,
        "support sin hueco de presión mantiene su carril en vez de sumarse al pelotón de tiro",
    )
    _expect(
        EnemyUtilityAI.choose_intent({
            "target_known": true,
            "visible": true,
            "distance": 265.0,
            "standoff": 260.0,
            "vertical_gap": 0.0,
            "vertical_threshold": 64.0,
            "blocker_ahead": false,
            "pit_ahead": false,
            "ladder_route": false,
            "grenade_evade": 0.0,
            "role": "assaulter",
            "enemy_type": "commando",
            "pressure_slot_available": false,
            "retreat_ratio": 0.64,
            "comfort_margin": 24.0,
            "advance_margin": 80.0,
        }) == EnemyUtilityAI.INTENT_ADVANCE,
        "assaulter sin hueco de presión reposiciona/avanza en vez de disparar a coro",
    )

    _expect(
        EnemyUtilityAI.decision_interval_for("scout", "assaulter")
            < EnemyUtilityAI.decision_interval_for("shield", "assaulter"),
        "scout reevalúa antes que shield sin cambiar de cerebro",
    )
    _expect(
        EnemyUtilityAI.commit_seconds_for("grenadier", EnemyUtilityAI.INTENT_SHOOT, "support")
            > EnemyUtilityAI.commit_seconds_for("commando", EnemyUtilityAI.INTENT_SHOOT, "assaulter"),
        "grenadier support mantiene una decisión de tiro más estable que commando",
    )
    _expect(
        absf(
            EnemyUtilityAI.commit_seconds_for("scout", EnemyUtilityAI.INTENT_EVADE, "assaulter")
                - 0.12
        ) <= EPSILON,
        "evasión urgente rompe el commitment aunque el arquetipo sea estable",
    )
    _expect(
        EnemyUtilityAI.commit_seconds_for("scout", EnemyUtilityAI.INTENT_TRAVERSE, "assaulter")
            >= 0.48,
        "traversal recibe commitment suficiente para no abortar una escalada/salto a mitad",
    )

    var scout_scores := EnemyUtilityAI.score_intents({
        "target_known": true,
        "visible": true,
        "distance": 430.0,
        "standoff": 260.0,
        "vertical_gap": 0.0,
        "vertical_threshold": 64.0,
        "blocker_ahead": false,
        "pit_ahead": false,
        "ladder_route": false,
        "grenade_evade": 0.0,
        "role": "assaulter",
        "enemy_type": "scout",
        "retreat_ratio": 0.64,
        "comfort_margin": 24.0,
        "advance_margin": 80.0,
    })
    var grenadier_scores := EnemyUtilityAI.score_intents({
        "target_known": true,
        "visible": true,
        "distance": 430.0,
        "standoff": 260.0,
        "vertical_gap": 0.0,
        "vertical_threshold": 64.0,
        "blocker_ahead": false,
        "pit_ahead": false,
        "ladder_route": false,
        "grenade_evade": 0.0,
        "role": "assaulter",
        "enemy_type": "grenadier",
        "retreat_ratio": 0.64,
        "comfort_margin": 24.0,
        "advance_margin": 80.0,
    })
    _expect(
        float(scout_scores[EnemyUtilityAI.INTENT_ADVANCE])
            > float(grenadier_scores[EnemyUtilityAI.INTENT_ADVANCE]),
        "scout puntúa avance por encima de grenadier sin duplicar su cerebro",
    )
    var commando_scores := EnemyUtilityAI.score_intents({
        "target_known": true,
        "visible": false,
        "distance": 240.0,
        "standoff": 260.0,
        "vertical_gap": 90.0,
        "vertical_threshold": 64.0,
        "blocker_ahead": false,
        "pit_ahead": false,
        "ladder_route": true,
        "grenade_evade": 0.0,
        "role": "assaulter",
        "enemy_type": "commando",
        "retreat_ratio": 0.64,
        "comfort_margin": 24.0,
        "advance_margin": 80.0,
    })
    var pawn_scores := EnemyUtilityAI.score_intents({
        "target_known": true,
        "visible": false,
        "distance": 240.0,
        "standoff": 260.0,
        "vertical_gap": 90.0,
        "vertical_threshold": 64.0,
        "blocker_ahead": false,
        "pit_ahead": false,
        "ladder_route": true,
        "grenade_evade": 0.0,
        "role": "assaulter",
        "enemy_type": "pawn",
        "retreat_ratio": 0.64,
        "comfort_margin": 24.0,
        "advance_margin": 80.0,
    })
    _expect(
        float(commando_scores[EnemyUtilityAI.INTENT_TRAVERSE])
            > float(pawn_scores[EnemyUtilityAI.INTENT_TRAVERSE]),
        "commando favorece traversal más que pawn sobre la misma policy",
    )

    # Enemy traversal probe: mobile enemies should read authored geometry
    # instead of freezing below platforms or phasing through crates/pits.
    var enemy_probe = MainRuntime.new()
    enemy_probe._floor_y = 610.0
    enemy_probe._world_size = Vector2(1280.0, 720.0)
    var enemy_probe_obstacles: Array[Rect2] = [Rect2(200.0, 550.0, 60.0, 60.0)]
    var enemy_probe_platforms: Array[Rect2] = [Rect2(420.0, 520.0, 190.0, 24.0)]
    enemy_probe._obstacles = enemy_probe_obstacles
    enemy_probe._platforms = enemy_probe_platforms
    enemy_probe._stage_manifest = {
        "ladders": [
            {"x": 320.0, "top_y": 456.0, "bottom_y": 610.0, "w": 30.0, "exit_dir": 1.0},
        ],
        "pits": [
            {"x": 700.0, "w": 180.0, "kind": "test_pit"},
        ],
    }
    var pursuit_target := Node2D.new()
    pursuit_target.name = "EnemyTraversalTarget"
    pursuit_target.position = Vector2(340.0, 568.0)
    enemy_probe.add_child(pursuit_target)
    enemy_probe.player = pursuit_target

    enemy_probe._enemy_suppression_remaining = 0.5
    enemy_probe._enemy_suppression_origin_x = 400.0
    _expect(
        enemy_probe._enemy_under_local_suppression({"role": "assaulter", "x": 900.0}),
        "supresión coordina assaulter cercano al support",
    )
    _expect(
        not enemy_probe._enemy_under_local_suppression({"role": "assaulter", "x": 1200.0}),
        "supresión no empuja assaulter remoto fuera del radio local",
    )
    _expect(
        not enemy_probe._enemy_under_local_suppression({"role": "support", "x": 500.0}),
        "support no consume el bonus de avance reservado a assaulters",
    )
    enemy_probe._enemy_suppression_remaining = 0.0
    enemy_probe._enemy_suppression_origin_x = -INF

    enemy_probe.enemies = [
        {
            "id": "pressure-a",
            "type": "pawn",
            "x": 300.0,
            "hp": 34,
            "alerted": true,
            "ai_visible": true,
            "ai_intent": EnemyUtilityAI.INTENT_SHOOT,
        },
        {
            "id": "pressure-b",
            "type": "commando",
            "x": 360.0,
            "hp": 78,
            "alerted": true,
            "ai_visible": true,
            "ai_intent": EnemyUtilityAI.INTENT_SHOOT,
        },
        {
            "id": "pressure-c",
            "type": "scout",
            "x": 420.0,
            "hp": 46,
            "alerted": true,
            "ai_visible": true,
            "ai_intent": EnemyUtilityAI.INTENT_ADVANCE,
        },
    ]
    _expect(
        enemy_probe._enemy_pressure_shooter_count() == enemy_probe.MAX_ENEMY_PRESSURE_SHOOTERS,
        "pressure budget cuenta sólo tiradores móviles visibles comprometidos",
    )
    _expect(
        not enemy_probe._enemy_pressure_slot_available(enemy_probe.enemies[2]),
        "tercer móvil visible no recibe otro slot de tiro cuando el budget está lleno",
    )
    _expect(
        enemy_probe._enemy_pressure_slot_available(enemy_probe.enemies[0]),
        "un tirador ya comprometido puede conservar su propio slot al reevaluar",
    )
    enemy_probe.enemies.clear()

    # Hearing probe: noise should carry its source position into short memory,
    # not merely flip alerted=true and not reveal Matthias' later hidden X.
    pursuit_target.position = Vector2(340.0, 568.0)
    enemy_probe.enemies.clear()
    enemy_probe.enemies.append({
        "id": "heard-pawn",
        "type": "pawn",
        "x": 700.0,
        "spawn_x": 700.0,
        "y": 610.0,
        "hp": 34,
        "alerted": false,
        "reaction": 0.0,
        "idle_pose": "",
        "ai_memory_remaining": 0.0,
    })
    enemy_probe._alert_enemies(600.0, 900.0)
    var heard_enemy: Dictionary = enemy_probe.enemies[0]
    _expect(bool(heard_enemy["alerted"]), "ruido alerta al enemigo dentro del radio")
    _expect(
        absf(float(heard_enemy["ai_last_target_x"]) - 600.0) <= EPSILON,
        "memoria auditiva apunta al origen del ruido y no a la X real de Matthias",
    )

    # Alarm propagation shares last-known intel. An ally must not receive the
    # player's current hidden position just because another enemy raised alarm.
    enemy_probe.enemies.clear()
    enemy_probe.enemies.append({
        "id": "alarm-source",
        "type": "rook",
        "x": 700.0,
        "spawn_x": 700.0,
        "y": 610.0,
        "hp": 112,
        "alerted": true,
        "reaction": 0.0,
        "idle_pose": "guard",
        "ai_memory_remaining": 0.8,
        "ai_last_target_x": 590.0,
        "ai_last_target_foot_y": 610.0,
    })
    enemy_probe.enemies.append({
        "id": "alarm-ally",
        "type": "pawn",
        "x": 760.0,
        "spawn_x": 760.0,
        "y": 610.0,
        "hp": 34,
        "alerted": false,
        "reaction": 0.0,
        "idle_pose": "",
        "ai_memory_remaining": 0.0,
    })
    pursuit_target.position = Vector2(1000.0, 568.0)
    enemy_probe._raise_enemy_alarm(0, 200.0)
    var alarm_ally: Dictionary = enemy_probe.enemies[1]
    _expect(
        absf(float(alarm_ally["ai_last_target_x"]) - 590.0) <= EPSILON,
        "alarma comparte la última posición conocida sin telepatía de escuadra",
    )
    enemy_probe.enemies.clear()
    pursuit_target.position = Vector2(340.0, 568.0)

    # Low-cover ballistics probe: a standing-height normal round may skim the
    # top of a small crate, while low shots and explosives still hit geometry.
    _expect(
        not enemy_probe._point_hits_player_projectile_geometry(Vector2(220.0, 560.0), false),
        "disparo alto normal pasa por la franja superior de cobertura baja",
    )
    _expect(
        enemy_probe._point_hits_player_projectile_geometry(Vector2(220.0, 585.0), false),
        "disparo bajo normal sigue chocando con la caja",
    )
    _expect(
        enemy_probe._point_hits_player_projectile_geometry(Vector2(220.0, 560.0), true),
        "explosivo sigue impactando cobertura baja",
    )

    var crate_enemy := {
        "type": "pawn",
        "x": 145.0,
        "spawn_x": 145.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
        "air_direction": 0.0,
        "air_speed_scale": 1.0,
        "hp": 34,
    }
    _expect(
        enemy_probe._enemy_try_auto_jump(crate_enemy, 1.0),
        "enemigo móvil salta una caja/plataforma baja que corta su avance",
    )
    _expect(float(crate_enemy["vy"]) < 0.0, "salto enemigo aplica velocidad vertical ascendente")
    _expect(not bool(crate_enemy["on_ground"]), "salto enemigo abandona estado de suelo")

    # Short-memory probe: acquire a visible target, then hide it behind the
    # crate. The AI must continue toward the remembered point rather than
    # snapping to Matthias' new hidden location.
    pursuit_target.position = Vector2(165.0, 568.0)
    var memory_enemy := {
        "type": "pawn",
        "x": 145.0,
        "spawn_x": 145.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
        "air_direction": 0.0,
        "air_speed_scale": 1.0,
        "alerted": true,
        "role": "assaulter",
        "ai_intent": EnemyUtilityAI.INTENT_HOLD,
        "ai_decision_timer": 0.0,
        "ai_commit_remaining": 0.0,
        "ai_memory_remaining": 0.0,
        "ai_last_target_x": 145.0,
        "ai_last_target_foot_y": 610.0,
        "hp": 34,
    }
    var memory_stats: Dictionary = enemy_probe.ENEMY_TYPES["pawn"]
    enemy_probe._update_enemy_ai_plan(memory_enemy, memory_stats, 270.0, 0.05)
    _expect(bool(memory_enemy["ai_visible"]), "utility AI adquiere a Matthias con LOS real")
    var remembered_x := float(memory_enemy["ai_target_x"])
    pursuit_target.position = Vector2(340.0, 568.0)
    enemy_probe._update_enemy_ai_plan(memory_enemy, memory_stats, 270.0, 0.10)
    _expect(not bool(memory_enemy["ai_visible"]), "utility AI detecta pérdida real de LOS tras la caja")
    _expect(
        absf(float(memory_enemy["ai_target_x"]) - remembered_x) <= EPSILON,
        "memoria corta conserva la última posición vista en vez de hacer tracking oculto",
    )
    _expect(
        float(memory_enemy["ai_memory_remaining"]) > 0.0,
        "memoria corta sigue viva durante su ventana acotada",
    )

    var blocked_enemy := {
        "type": "pawn",
        "x": 145.0,
        "spawn_x": 145.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
        "air_direction": 0.0,
        "air_speed_scale": 1.0,
        "alerted": true,
        "hp": 34,
    }
    var blocked_stats: Dictionary = enemy_probe.ENEMY_TYPES["pawn"]
    var blocked_distance_x := pursuit_target.global_position.x - float(blocked_enemy["x"])
    var blocked_standoff := enemy_probe._enemy_weapon_standoff(blocked_enemy, blocked_stats)
    var blocked_speed := enemy_probe._update_soldier_movement(
        blocked_enemy,
        blocked_stats,
        blocked_standoff,
        blocked_distance_x,
        absf(blocked_distance_x),
        1.0 / 60.0,
    )
    _expect(blocked_speed > 0.0, "LOS bloqueada no convierte al soldado en tancredo")
    _expect(float(blocked_enemy["vy"]) < 0.0, "soldado con LOS bloqueada salta la caja al avanzar")

    var pursuit_bounds := enemy_probe._enemy_horizontal_bounds(
        {"x": 900.0, "spawn_x": 145.0, "alerted": true},
        enemy_probe.SOLDIER_ROAM_LIMIT,
    )
    _expect(
        pursuit_bounds.x <= EPSILON and absf(pursuit_bounds.y - 1280.0) <= EPSILON,
        "enemigo alertado deja atrás el leash de spawn y puede perseguir por el escenario",
    )

    var ladder_enemy := {
        "type": "commando",
        "x": 250.0,
        "spawn_x": 250.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
    }
    var route_ladder := enemy_probe._enemy_route_ladder_toward(ladder_enemy, 456.0)
    _expect(not route_ladder.is_empty(), "enemigo móvil encuentra escalera que conecta su nivel con Matthias")
    if not route_ladder.is_empty():
        _expect(absf(float(route_ladder["x"]) - 320.0) <= EPSILON, "routing enemigo conserva la escalera authored")

    var far_ladder_enemy := {
        "type": "commando",
        "x": 1200.0,
        "spawn_x": 1200.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
    }
    var far_route_ladder := enemy_probe._enemy_route_ladder_toward(far_ladder_enemy, 456.0)
    _expect(
        not far_route_ladder.is_empty(),
        "enemigo busca una escalera útil aunque no esté pegada a su spawn",
    )

    var pit_enemy := {
        "type": "scout",
        "x": 640.0,
        "spawn_x": 640.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
        "air_direction": 0.0,
        "air_speed_scale": 1.0,
        "hp": 46,
    }
    _expect(not enemy_probe._enemy_pit_ahead(pit_enemy, 1.0).is_empty(), "enemigo detecta un hueco antes de pisarlo")
    _expect(enemy_probe._enemy_try_auto_jump(pit_enemy, 1.0), "enemigo salta el hueco en vez de quedarse clavado")
    _expect(
        float(pit_enemy["air_speed_scale"]) >= enemy_probe.ENEMY_TRAVERSAL_PIT_AIR_SPEED_SCALE,
        "salto de hueco conserva impulso arcade suficiente",
    )
    var shield_enemy := {
        "type": "shield",
        "x": 640.0,
        "spawn_x": 640.0,
        "y": 610.0,
        "vy": 0.0,
        "on_ground": true,
        "traversal_mode": "ground",
        "air_direction": 0.0,
        "air_speed_scale": 1.0,
        "hp": 168,
    }
    _expect(enemy_probe._enemy_try_auto_jump(shield_enemy, 1.0), "shield lento también inicia salto de hueco")
    _expect(
        32.0 * float(shield_enemy["air_speed_scale"]) >= enemy_probe.ENEMY_TRAVERSAL_PIT_MIN_AIR_SPEED,
        "shield lento recibe velocidad horizontal mínima para cruzar el hueco",
    )

    var landing_y := enemy_probe._enemy_landing_y(230.0, 530.0, 570.0)
    _expect(absf(landing_y - 550.0) <= EPSILON, "enemigo puede aterrizar/trepar sobre una caja")
    _expect(not enemy_probe._enemy_pit_below_x(650.0), "suelo normal sigue siendo soporte enemigo")
    _expect(enemy_probe._enemy_pit_below_x(760.0), "hueco authored elimina soporte enemigo")
    enemy_probe.free()

    traversal_host.queue_free()

    world.queue_free()
    await process_frame
    if _failures.is_empty():
        print("OK Pawn Slug Godot runtime mechanics smoke · crouch + 8-way aim + ledge climb + ladders + pits + enemy traversal + low-cover ballistics + safe respawn")
        quit(0)
        return
    print("FAILED Pawn Slug Godot runtime mechanics smoke · enemy traversal included · %d fallo(s)" % _failures.size())
    quit(1)
