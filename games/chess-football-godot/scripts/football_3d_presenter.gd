class_name ChessFootball3DPresenter
extends Node3D

const WORLD_SCALE := 0.014
const CAMERA_LERP_SPEED := 4.8
const BROADCAST_HEIGHT := 9.8
const BROADCAST_DEPTH := 17.8
const TACTICAL_HEIGHT := 27.0
const PLAYER_PIXEL_SIZE := 0.0124
const TACTICAL_PLAYER_PIXEL_SIZE := 0.0162
const PLAYER_BASE_Y := 0.76
const PLAYER_RUN_BOB := 0.050
const PLAYER_SPRINT_BOB := 0.072

var match_node: Node
var camera: Camera3D
var player_nodes: Dictionary = {}
var player_sprites: Dictionary = {}
var ball_node: MeshInstance3D
var ball_shadow: MeshInstance3D
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
	_add_stadium_apron()
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
	far_mesh.size = Vector3(field_width + 6.2, 2.15, 2.35)
	far_stand.mesh = far_mesh
	far_stand.position = Vector3(0.0, 1.02, -field_depth * 0.5 - 3.05)
	far_stand.material_override = _material(Color(0.024, 0.033, 0.046), 0.96)
	add_child(far_stand)

	for row in range(5):
		var step := MeshInstance3D.new()
		var step_mesh := BoxMesh.new()
		step_mesh.size = Vector3(field_width + 5.5 - row * 0.42, 0.40, 0.64)
		step.mesh = step_mesh
		step.position = Vector3(0.0, 0.23 + row * 0.39, -field_depth * 0.5 - 1.0 - row * 0.49)
		step.material_override = _material(Color(0.050 + row * 0.010, 0.057, 0.067), 0.94)
		add_child(step)

	_add_ad_panels()
	_add_crowd()
	_add_end_stands()
	_add_far_roof()
	_add_box(Vector3(0.0, 0.22, field_depth * 0.5 + 0.28), Vector3(field_width + 1.4, 0.44, 0.12), Color(0.075, 0.070, 0.060))
	_add_benches()
	_add_floodlights()

func _add_stadium_apron() -> void:
	var apron := MeshInstance3D.new()
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(field_width + 8.0, field_depth + 8.0)
	apron.mesh = mesh
	apron.position = Vector3(0.0, -0.035, 0.0)
	apron.material_override = _material(Color(0.025, 0.052, 0.046), 0.98)
	apron.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(apron)

	_add_box(Vector3(0.0, -0.12, -field_depth * 0.5 - 4.0), Vector3(field_width + 8.0, 0.22, 0.16), Color(0.030, 0.038, 0.048))
	_add_box(Vector3(0.0, -0.12, field_depth * 0.5 + 4.0), Vector3(field_width + 8.0, 0.22, 0.16), Color(0.030, 0.038, 0.048))

func _add_end_stands() -> void:
	var stand_x := field_width * 0.5 + 2.05
	for side_value in [-1.0, 1.0]:
		var side: float = float(side_value)
		_add_box(
			Vector3(side * stand_x, 0.82, 0.0),
			Vector3(2.15, 1.70, field_depth + 1.8),
			Color(0.025, 0.034, 0.047)
		)
		for row in range(4):
			var x := side * (field_width * 0.5 + 0.72 + float(row) * 0.42)
			var height := 0.22 + float(row) * 0.34
			_add_box(
				Vector3(x, height, 0.0),
				Vector3(0.56, 0.34, field_depth + 1.25 - float(row) * 0.24),
				Color(0.050 + float(row) * 0.010, 0.058, 0.069)
			)

func _add_far_roof() -> void:
	var roof_z := -field_depth * 0.5 - 3.70
	_add_box(Vector3(0.0, 3.25, roof_z), Vector3(field_width + 6.4, 0.18, 2.4), Color(0.045, 0.050, 0.060))
	for x_value in [-field_width * 0.48, -field_width * 0.16, field_width * 0.16, field_width * 0.48]:
		var x: float = float(x_value)
		_add_box(Vector3(x, 1.75, roof_z + 0.55), Vector3(0.11, 3.0, 0.11), Color(0.20, 0.22, 0.24))
		_add_box(Vector3(x, 3.03, roof_z + 0.10), Vector3(0.10, 0.10, 1.05), Color(0.20, 0.22, 0.24))

func _add_benches() -> void:
	for x_value in [-4.2, 4.2]:
		var x: float = float(x_value)
		_add_box(Vector3(x, 0.20, field_depth * 0.5 + 0.68), Vector3(1.7, 0.38, 0.52), Color(0.055, 0.070, 0.082))
		_add_box(Vector3(x, 0.46, field_depth * 0.5 + 0.72), Vector3(1.7, 0.08, 0.56), Color(0.24, 0.26, 0.28))

func _add_floodlights() -> void:
	for z_value in [-field_depth * 0.5 - 3.15, field_depth * 0.5 + 3.15]:
		var z: float = float(z_value)
		for x_value in [-field_width * 0.43, field_width * 0.43]:
			var x: float = float(x_value)
			_add_box(Vector3(x, 2.55, z), Vector3(0.10, 5.10, 0.10), Color(0.20, 0.22, 0.24))
			_add_box(Vector3(x, 5.02, z), Vector3(1.25, 0.12, 0.26), Color(0.24, 0.26, 0.29))
			var lamp := OmniLight3D.new()
			lamp.position = Vector3(x, 4.90, z)
			lamp.light_color = Color(0.84, 0.90, 1.0)
			lamp.light_energy = 0.72
			lamp.omni_range = 12.0
			lamp.shadow_enabled = false
			add_child(lamp)

func _add_ad_panels() -> void:
	var panel_count := 12
	var panel_width := field_width / float(panel_count)
	var z := -field_depth * 0.5 - 0.30
	for i in range(panel_count):
		var x := -field_width * 0.5 + panel_width * (float(i) + 0.5)
		var color := Color(0.08, 0.22, 0.48)
		if i % 3 == 1:
			color = Color(0.42, 0.055, 0.085)
		elif i % 3 == 2:
			color = Color(0.55, 0.40, 0.10)
		_add_box(Vector3(x, 0.24, z), Vector3(panel_width - 0.05, 0.42, 0.08), color)

func _add_crowd() -> void:
	var rows := 5
	var seats := 34
	for row in range(rows):
		for seat in range(seats):
			var ratio := (float(seat) + 0.5) / float(seats)
			var x := lerpf(-field_width * 0.47, field_width * 0.47, ratio)
			var y := 0.42 + float(row) * 0.38
			var z := -field_depth * 0.5 - 1.02 - float(row) * 0.48
			var palette := (seat + row * 2) % 7
			var color := Color(0.23, 0.25, 0.28)
			if palette in [0, 4]:
				color = Color(0.12, 0.34, 0.72)
			elif palette in [1, 5]:
				color = Color(0.55, 0.075, 0.11)
			elif palette == 2:
				color = Color(0.72, 0.56, 0.16)
			_add_box(Vector3(x, y, z), Vector3(0.17, 0.22, 0.12), color)

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
	var net_thin := 0.022
	var depth := 0.82
	var white := Color(0.95, 0.96, 0.94)
	var net_color := Color(0.58, 0.63, 0.66)
	for side_value in [-1.0, 1.0]:
		var side: float = float(side_value)
		var x: float = side * field_width * 0.5
		var back_x: float = x + side * depth
		for z_value in [-goal_half, goal_half]:
			var z: float = float(z_value)
			_add_box(Vector3(x, post_height * 0.5, z), Vector3(post, post_height, post), white)
			_add_box(Vector3(back_x, post_height * 0.5, z), Vector3(post * 0.65, post_height, post * 0.65), net_color)
			_add_box(Vector3((x + back_x) * 0.5, post_height, z), Vector3(depth, post * 0.65, post * 0.65), net_color)
			_add_box(Vector3((x + back_x) * 0.5, 0.045, z), Vector3(depth, post * 0.55, post * 0.55), net_color)
		_add_box(Vector3(x, post_height, 0.0), Vector3(post, post, goal_half * 2.0 + post), white)
		_add_box(Vector3(back_x, post_height, 0.0), Vector3(post * 0.65, post * 0.65, goal_half * 2.0), net_color)
		_add_box(Vector3(back_x, 0.045, 0.0), Vector3(post * 0.55, post * 0.55, goal_half * 2.0), net_color)
		for line in range(1, 6):
			var net_z := lerpf(-goal_half, goal_half, float(line) / 6.0)
			_add_box(Vector3(back_x, post_height * 0.5, net_z), Vector3(net_thin, post_height, net_thin), net_color)
			_add_box(Vector3((x + back_x) * 0.5, post_height, net_z), Vector3(depth, net_thin, net_thin), net_color)
		for line in range(1, 5):
			var net_y := post_height * float(line) / 5.0
			_add_box(Vector3(back_x, net_y, 0.0), Vector3(net_thin, net_thin, goal_half * 2.0), net_color)

func _build_player_proxies() -> void:
	for team in match_node.teams:
		for player in team:
			var root := Node3D.new()
			root.name = "Player3D_%d_%d" % [player.team_id, player.squad_index]

			var sprite := AnimatedSprite3D.new()
			sprite.name = "Sprite"
			sprite.sprite_frames = ChessFootballSpriteBank.build_frames(player.team_id, player.role)
			sprite.centered = true
			sprite.pixel_size = PLAYER_PIXEL_SIZE
			sprite.position.y = PLAYER_BASE_Y
			sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			sprite.flip_h = player.team_id == 1
			sprite.play("idle")
			root.add_child(sprite)

			var shadow := MeshInstance3D.new()
			shadow.name = "ContactShadow"
			var shadow_mesh := CylinderMesh.new()
			shadow_mesh.top_radius = 0.30
			shadow_mesh.bottom_radius = 0.30
			shadow_mesh.height = 0.010
			shadow.mesh = shadow_mesh
			shadow.position.y = 0.012
			shadow.material_override = _material(Color(0.012, 0.020, 0.015), 1.0)
			root.add_child(shadow)

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

	ball_shadow = MeshInstance3D.new()
	var shadow_mesh := CylinderMesh.new()
	shadow_mesh.top_radius = 0.105
	shadow_mesh.bottom_radius = 0.105
	shadow_mesh.height = 0.008
	ball_shadow.mesh = shadow_mesh
	ball_shadow.material_override = _material(Color(0.012, 0.020, 0.015), 1.0)
	ball_shadow.position.y = 0.010
	add_child(ball_shadow)

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
				sprite.speed_scale = player.visual.speed_scale
				sprite.frame = player.visual.frame
			sprite.pixel_size = TACTICAL_PLAYER_PIXEL_SIZE if mode == "tactical" else PLAYER_PIXEL_SIZE
			_sync_player_secondary_motion(player, sprite, proxy)
			var active_disc := proxy.get_node_or_null("ActiveDisc") as MeshInstance3D
			if active_disc != null:
				active_disc.visible = player == match_node.controlled

	if ball_node != null:
		ball_node.position = world_to_stage(match_node.ball.global_position, 0.18)
		ball_node.rotate_z(match_node.ball.velocity.length() * delta * 0.004)
	if ball_shadow != null:
		ball_shadow.position = world_to_stage(match_node.ball.global_position, 0.010)

	_sync_camera(delta, mode)

func _sync_player_secondary_motion(player: Footballer, sprite: AnimatedSprite3D, proxy: Node3D) -> void:
	var animation_name := String(sprite.animation)
	var frame_count := maxi(1, sprite.sprite_frames.get_frame_count(sprite.animation))
	var phase := TAU * float(sprite.frame) / float(frame_count)
	var speed_ratio := clampf(player.velocity.length() / maxf(player.base_speed, 1.0), 0.0, 1.4)
	var moving_weight := clampf(speed_ratio, 0.0, 1.0)
	var bob := sin(phase) * 0.010
	var stretch_x := 1.0
	var stretch_y := 1.0
	var tilt_degrees := 0.0
	var facing_sign := -1.0 if sprite.flip_h else 1.0

	if animation_name == "run":
		bob = absf(sin(phase)) * PLAYER_RUN_BOB * moving_weight
		stretch_x = 1.0 + absf(cos(phase)) * 0.025
		stretch_y = 1.0 - absf(cos(phase)) * 0.018
		tilt_degrees = -facing_sign * 2.8 * moving_weight
	elif animation_name == "sprint":
		bob = absf(sin(phase)) * PLAYER_SPRINT_BOB * moving_weight
		stretch_x = 1.0 + absf(cos(phase)) * 0.040
		stretch_y = 1.0 - absf(cos(phase)) * 0.028
		tilt_degrees = -facing_sign * 5.2 * moving_weight
	elif animation_name == "pass":
		bob = absf(sin(phase)) * 0.018
		tilt_degrees = -facing_sign * 3.5
	elif animation_name == "shoot":
		bob = absf(sin(phase)) * 0.026
		stretch_x = 1.035
		stretch_y = 0.985
		tilt_degrees = -facing_sign * 7.5
	elif animation_name == "tackle":
		bob = -0.035
		stretch_x = 1.070
		stretch_y = 0.940
		tilt_degrees = -facing_sign * 11.0
	elif animation_name == "celebrate":
		bob = absf(sin(phase)) * 0.080
		stretch_y = 1.025

	sprite.position.y = PLAYER_BASE_Y + bob
	sprite.rotation.z = deg_to_rad(tilt_degrees)
	sprite.scale = Vector3(stretch_x, stretch_y, 1.0)

	var shadow := proxy.get_node_or_null("ContactShadow") as MeshInstance3D
	if shadow != null:
		var shadow_scale := clampf(1.0 - maxf(bob, 0.0) * 2.2, 0.76, 1.0)
		shadow.scale = Vector3(shadow_scale, 1.0, shadow_scale)

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
