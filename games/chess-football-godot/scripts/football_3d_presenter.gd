class_name ChessFootball3DPresenter
extends Node3D

const WORLD_SCALE := 0.014
const CAMERA_LERP_SPEED := 4.8
const BROADCAST_HEIGHT := 9.8
const BROADCAST_DEPTH := 17.8
const TACTICAL_HEIGHT := 27.0
const PLAYER_PIXEL_SIZE := 0.0124
const TACTICAL_PLAYER_PIXEL_SIZE := 0.0162

var match_node: Node
var camera: Camera3D
var player_nodes: Dictionary = {}
var player_sprites: Dictionary = {}
var ball_node: MeshInstance3D
var field_width: float
var field_depth: float

func setup(p_match: Node) -> void:
	match_node = p_match
	var pitch := ChessFootballMath.PITCH_RECT
	field_width = pitch.size.x * WORLD_SCALE
	field_depth = pitch.size.y * WORLD_SCALE
	_build_environment()
	_build_pitch()
	_build_goals()
	_build_player_proxies()
	_build_ball()
	_build_camera()
	sync_presentation(1.0, "broadcast")

func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.010, 0.018, 0.028)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.40, 0.49, 0.62)
	environment.ambient_light_energy = 0.82
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-58.0, -28.0, 0.0)
	key_light.light_color = Color(0.92, 0.95, 1.0)
	key_light.light_energy = 1.42
	key_light.shadow_enabled = true
	add_child(key_light)

	var warm_fill := DirectionalLight3D.new()
	warm_fill.rotation_degrees = Vector3(-42.0, 145.0, 0.0)
	warm_fill.light_color = Color(1.0, 0.76, 0.48)
	warm_fill.light_energy = 0.46
	warm_fill.shadow_enabled = false
	add_child(warm_fill)

func _material(color: Color, roughness: float = 0.84) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	return material

func _build_pitch() -> void:
	var stripe_width := field_width / 16.0
	for i in range(16):
		var stripe := MeshInstance3D.new()
		var mesh := PlaneMesh.new()
		mesh.size = Vector2(stripe_width + 0.01, field_depth)
		stripe.mesh = mesh
		stripe.position = Vector3(-field_width * 0.5 + stripe_width * (float(i) + 0.5), 0.0, 0.0)
		stripe.material_override = _material(
			Color(0.050, 0.245, 0.090) if i % 2 == 0 else Color(0.070, 0.315, 0.112)
		)
		stripe.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(stripe)

	var line_color := Color(0.95, 0.96, 0.91)
	_add_box(Vector3(0.0, 0.018, -field_depth * 0.5), Vector3(field_width, 0.025, 0.055), line_color)
	_add_box(Vector3(0.0, 0.018, field_depth * 0.5), Vector3(field_width, 0.025, 0.055), line_color)
	_add_box(Vector3(-field_width * 0.5, 0.018, 0.0), Vector3(0.055, 0.025, field_depth), line_color)
	_add_box(Vector3(field_width * 0.5, 0.018, 0.0), Vector3(0.055, 0.025, field_depth), line_color)
	_add_box(Vector3(0.0, 0.022, 0.0), Vector3(0.045, 0.03, field_depth), line_color)
	_add_penalty_box(false, line_color)
	_add_penalty_box(true, line_color)
	_add_center_circle(line_color)

	var far_stand := MeshInstance3D.new()
	var far_mesh := BoxMesh.new()
	far_mesh.size = Vector3(field_width + 4.2, 1.45, 1.55)
	far_stand.mesh = far_mesh
	far_stand.position = Vector3(0.0, 0.70, -field_depth * 0.5 - 2.45)
	far_stand.material_override = _material(Color(0.030, 0.040, 0.052), 0.96)
	add_child(far_stand)

	for row in range(3):
		var step := MeshInstance3D.new()
		var step_mesh := BoxMesh.new()
		step_mesh.size = Vector3(field_width + 3.8 - row * 0.35, 0.42, 0.62)
		step.mesh = step_mesh
		step.position = Vector3(0.0, 0.23 + row * 0.42, -field_depth * 0.5 - 0.95 - row * 0.48)
		step.material_override = _material(Color(0.055 + row * 0.012, 0.060, 0.068), 0.94)
		add_child(step)

	_add_box(Vector3(0.0, 0.35, -field_depth * 0.5 - 0.34), Vector3(field_width + 0.8, 0.7, 0.16), Color(0.12, 0.10, 0.07))
	_add_box(Vector3(0.0, 0.25, field_depth * 0.5 + 0.28), Vector3(field_width + 0.8, 0.5, 0.12), Color(0.11, 0.095, 0.065))
	_add_benches()
	_add_floodlights()

func _add_benches() -> void:
	for x_value in [-4.2, 4.2]:
		var x: float = float(x_value)
		_add_box(Vector3(x, 0.20, field_depth * 0.5 + 0.68), Vector3(1.7, 0.38, 0.52), Color(0.055, 0.070, 0.082))
		_add_box(Vector3(x, 0.46, field_depth * 0.5 + 0.72), Vector3(1.7, 0.08, 0.56), Color(0.24, 0.26, 0.28))

func _add_floodlights() -> void:
	var z := -field_depth * 0.5 - 3.0
	for x_value in [-field_width * 0.43, field_width * 0.43]:
		var x: float = float(x_value)
		_add_box(Vector3(x, 2.45, z), Vector3(0.10, 4.9, 0.10), Color(0.20, 0.22, 0.24))
		var lamp := OmniLight3D.new()
		lamp.position = Vector3(x, 4.75, z)
		lamp.light_color = Color(0.82, 0.88, 1.0)
		lamp.light_energy = 0.78
		lamp.omni_range = 11.0
		lamp.shadow_enabled = false
		add_child(lamp)

func _add_penalty_box(right_side: bool, color: Color) -> void:
	var width := 265.0 * WORLD_SCALE
	var depth := 430.0 * WORLD_SCALE
	var edge_x := field_width * 0.5 if right_side else -field_width * 0.5
	var center_x := edge_x - width * 0.5 if right_side else edge_x + width * 0.5
	var inner_x := edge_x - width if right_side else edge_x + width
	_add_box(Vector3(center_x, 0.022, -depth * 0.5), Vector3(width, 0.03, 0.04), color)
	_add_box(Vector3(center_x, 0.022, depth * 0.5), Vector3(width, 0.03, 0.04), color)
	_add_box(Vector3(inner_x, 0.022, 0.0), Vector3(0.04, 0.03, depth), color)

func _add_center_circle(color: Color) -> void:
	var mesh := ImmediateMesh.new()
	var radius := 105.0 * WORLD_SCALE
	mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in range(49):
		var angle := TAU * float(i) / 48.0
		mesh.surface_add_vertex(Vector3(cos(angle) * radius, 0.035, sin(angle) * radius))
	mesh.surface_end()
	var circle := MeshInstance3D.new()
	circle.mesh = mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	circle.material_override = material
	add_child(circle)

func _build_goals() -> void:
	var goal_half := ChessFootballMath.GOAL_HALF_HEIGHT * WORLD_SCALE
	var post_height := 1.25
	var post := 0.075
	var depth := 0.82
	var white := Color(0.95, 0.96, 0.94)
	for side_value in [-1.0, 1.0]:
		var side: float = float(side_value)
		var x: float = side * field_width * 0.5
		for z_value in [-goal_half, goal_half]:
			var z: float = float(z_value)
			_add_box(Vector3(x, post_height * 0.5, z), Vector3(post, post_height, post), white)
		_add_box(Vector3(x, post_height, 0.0), Vector3(post, post, goal_half * 2.0 + post), white)
		var back_x: float = x + side * depth
		for z in [-goal_half, goal_half]:
			_add_box(Vector3(back_x, post_height * 0.5, z), Vector3(post * 0.7, post_height, post * 0.7), Color(0.66, 0.70, 0.72))
			_add_box(Vector3((x + back_x) * 0.5, post_height, z), Vector3(depth, post * 0.7, post * 0.7), Color(0.66, 0.70, 0.72))
		for line in range(1, 5):
			var net_z := lerpf(-goal_half, goal_half, float(line) / 5.0)
			_add_box(Vector3((x + back_x) * 0.5, 0.62, net_z), Vector3(depth, 0.025, 0.018), Color(0.78, 0.82, 0.84, 0.72))

func _build_player_proxies() -> void:
	for team in match_node.teams:
		for player in team:
			var root := Node3D.new()
			root.name = "Player3D_%d_%d" % [player.team_id, player.squad_index]

			var sprite := AnimatedSprite3D.new()
			sprite.name = "Sprite"
			sprite.sprite_frames = ChessFootballSpriteBank.build_frames(player.team_id)
			sprite.centered = true
			sprite.pixel_size = PLAYER_PIXEL_SIZE
			sprite.position.y = 0.76
			sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			sprite.flip_h = player.team_id == 1
			sprite.play("idle")
			root.add_child(sprite)

			var active_disc := MeshInstance3D.new()
			active_disc.name = "ActiveDisc"
			var disc_mesh := TorusMesh.new()
			disc_mesh.inner_radius = 0.40
			disc_mesh.outer_radius = 0.48
			active_disc.mesh = disc_mesh
			active_disc.position.y = 0.035
			active_disc.material_override = _material(Color(1.0, 0.72, 0.16), 0.32)
			active_disc.visible = false
			root.add_child(active_disc)

			add_child(root)
			player_nodes[player.get_instance_id()] = root
			player_sprites[player.get_instance_id()] = sprite

func _build_ball() -> void:
	ball_node = MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.16
	sphere.height = 0.32
	ball_node.mesh = sphere
	ball_node.material_override = _material(Color(0.965, 0.965, 0.92), 0.40)
	ball_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(ball_node)

func _build_camera() -> void:
	camera = Camera3D.new()
	camera.current = true
	camera.fov = 37.5
	camera.near = 0.08
	camera.far = 90.0
	add_child(camera)
	var focus := world_to_stage(match_node.ball.global_position)
	camera.position = Vector3(focus.x, BROADCAST_HEIGHT, BROADCAST_DEPTH)
	camera.look_at(Vector3(focus.x, 0.0, -0.85), Vector3.UP)

func _add_box(position_3d: Vector3, size_3d: Vector3, color: Color) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size_3d
	instance.mesh = box
	instance.position = position_3d
	instance.material_override = _material(color)
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(instance)
	return instance

func world_to_stage(world: Vector2, height: float = 0.0) -> Vector3:
	var center := ChessFootballMath.PITCH_RECT.get_center()
	return Vector3(
		(world.x - center.x) * WORLD_SCALE,
		height,
		(world.y - center.y) * WORLD_SCALE
	)

func sync_presentation(delta: float, mode: String) -> void:
	for team in match_node.teams:
		for player in team:
			var key: int = int(player.get_instance_id())
			var proxy: Node3D = player_nodes.get(key)
			var sprite: AnimatedSprite3D = player_sprites.get(key)
			if proxy == null or sprite == null:
				continue
			proxy.position = world_to_stage(player.global_position)
			if player.visual != null:
				var wanted_animation := StringName(player.visual.animation)
				if sprite.animation != wanted_animation:
					sprite.play(wanted_animation)
				sprite.flip_h = player.visual.flip_h
			sprite.pixel_size = TACTICAL_PLAYER_PIXEL_SIZE if mode == "tactical" else PLAYER_PIXEL_SIZE
			var active_disc := proxy.get_node_or_null("ActiveDisc") as MeshInstance3D
			if active_disc != null:
				active_disc.visible = player == match_node.controlled

	if ball_node != null:
		ball_node.position = world_to_stage(match_node.ball.global_position, 0.18)
		ball_node.rotate_z(match_node.ball.velocity.length() * delta * 0.004)

	_sync_camera(delta, mode)

func _sync_camera(delta: float, mode: String) -> void:
	if camera == null:
		return
	var focus := world_to_stage(match_node.ball.global_position)
	var wanted_position: Vector3
	var wanted_look: Vector3
	var wanted_fov: float
	if mode == "tactical":
		wanted_position = Vector3(0.0, TACTICAL_HEIGHT, 0.35)
		wanted_look = Vector3.ZERO
		wanted_fov = 43.0
	else:
		var lead := clampf(match_node.ball.velocity.x * WORLD_SCALE * 0.26, -2.2, 2.2)
		wanted_position = Vector3(focus.x + lead, BROADCAST_HEIGHT, BROADCAST_DEPTH)
		wanted_position.x = clampf(wanted_position.x, -field_width * 0.32, field_width * 0.32)
		wanted_look = Vector3(wanted_position.x, 0.0, -0.85)
		wanted_fov = 37.5

	var t := clampf(delta * CAMERA_LERP_SPEED, 0.0, 1.0)
	camera.position = camera.position.lerp(wanted_position, t)
	camera.fov = lerpf(camera.fov, wanted_fov, t)
	camera.look_at(wanted_look, Vector3.UP)

func debug_camera_is_3d() -> bool:
	return camera != null and camera is Camera3D

func debug_animated_players() -> int:
	return player_sprites.size()
