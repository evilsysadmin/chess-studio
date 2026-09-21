extends SceneTree

const PlayerProbe := preload("res://tests/player_probe.gd")
const MainRuntime := preload("res://scripts/main.gd")
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

    # Ladder traversal is authored in stage data. Matthias can acquire a ladder
    # from the floor, climb vertically without gravity, and exit cleanly onto
    # the top surface instead of needing a fake teleport.
    var ladder_spec := {"x": 430.0, "y": 70.0, "w": 42.0, "h": 130.0}
    player.configure_traversal_probe([ladder_spec], 320.0)
    player.position = Vector2(451.0, 157.0)
    var ladder_target := player.find_ladder_candidate_probe()
    _expect(ladder_target.size.x > 0.0, "ladder detecta a Matthias en su carril de entrada")
    if ladder_target.size.x > 0.0:
        player.start_ladder_climb_probe(ladder_target)
        _expect(player.is_ladder_climbing_probe(), "ladder activa estado de subida real")
        var ladder_start_y := player.position.y
        player.update_ladder_climb_probe(0.20, -1.0)
        _expect(player.position.y < ladder_start_y, "ladder mueve a Matthias verticalmente hacia arriba")
        player.position.y = 29.0
        player.update_ladder_climb_probe(0.02, -1.0)
        _expect(not player.is_ladder_climbing_probe(), "ladder libera a Matthias al alcanzar la plataforma superior")
        _expect(absf(player.position.y - 27.0) <= 0.1, "salida superior conserva los pies sobre la plataforma")

    var lives_before_pit := player.lives
    player.trigger_fall_death_probe()
    _expect(player.dead, "caer a un pozo profundo inicia muerte real")
    _expect(player.lives == maxi(0, lives_before_pit - 1), "pozo consume exactamente una vida")

    # Stage geometry probe: pits split the floor into real collision segments;
    # optional canopy/catwalk platforms remain one-way from below.
    var geometry_probe = MainRuntime.new()
    geometry_probe._map_geometry_root = Node2D.new()
    geometry_probe._world_size = Vector2(600.0, 240.0)
    geometry_probe._floor_y = 200.0
    geometry_probe._floor_depth = 40.0
    geometry_probe._pit_specs = [{"x": 220.0, "w": 100.0}]
    geometry_probe._build_floor_bodies()
    _expect(geometry_probe._map_geometry_root.has_node("Floor_00"), "pit conserva suelo físico a su izquierda")
    _expect(geometry_probe._map_geometry_root.has_node("Floor_01"), "pit conserva suelo físico a su derecha")
    var left_floor := geometry_probe._map_geometry_root.get_node("Floor_00/CollisionShape2D") as CollisionShape2D
    var right_floor := geometry_probe._map_geometry_root.get_node("Floor_01/CollisionShape2D") as CollisionShape2D
    if left_floor != null and left_floor.shape is RectangleShape2D:
        _expect(absf((left_floor.shape as RectangleShape2D).size.x - 220.0) <= EPSILON, "pozo corta la losa izquierda en su borde real")
    if right_floor != null and right_floor.shape is RectangleShape2D:
        _expect(absf((right_floor.shape as RectangleShape2D).size.x - 280.0) <= EPSILON, "pozo reanuda la losa tras el hueco")

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

    world.queue_free()
    await process_frame
    if _failures.is_empty():
        print("OK Pawn Slug Godot runtime mechanics smoke · crouch + 8-way aim + ledge/ladder climb + pits + safe respawn")
        quit(0)
        return
    print("FAILED Pawn Slug Godot runtime mechanics smoke · %d fallo(s)" % _failures.size())
    quit(1)
