extends SceneTree

# Regression gate for the user-observed tiny legacy opponents and the
# differing 3D height/footline of the approved canonical view families.
func _initialize() -> void:
	var scene := load("res://main.tscn") as PackedScene
	assert(scene != null)
	var match_node = scene.instantiate()
	root.add_child(match_node)
	await process_frame
	await process_frame
	match_node.set_process(false)
	match_node.set_physics_process(false)
	var presenter: ChessFootball3DPresenter = match_node.presentation_3d
	assert(presenter != null)
	# Intentional asymmetric size trim is restricted to running diagonals.
	for name in [&"run", &"sprint", &"run_front", &"run_back",
		&"sprint_front", &"sprint_back", &"pass", &"shoot"]:
		assert(ChessFootball3DPresenter.view_compensation(name) == Vector2.ONE)
	for name in [&"run_front_diagonal", &"run_back_diagonal",
		&"sprint_front_diagonal", &"sprint_back_diagonal"]:
		assert(
			ChessFootball3DPresenter.view_compensation(name)
			== Vector2(0.91, 1.0)
		)
	var directions := [
		Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN,
		Vector2(1, 1).normalized(), Vector2(-1, 1).normalized(),
		Vector2(1, -1).normalized(), Vector2(-1, -1).normalized(),
	]
	for mode in ["broadcast", "tactical"]:
		for direction in directions:
			for team in match_node.teams:
				for player in team:
					player.action_lock_seconds = 0.0
					player.velocity = direction * player.base_speed
					player.visual.play("run")
					player.visual.frame = 3
					player._sync_facing()
					player._sync_locomotion(false)
			presenter.sync_presentation(1.0 / 60.0, mode)
			var expected := ChessFootballRunDirection.animation_for(
				&"run", ChessFootballRunDirection.view_for_velocity(direction * 250.0)
			)
			for team in match_node.teams:
				for player in team:
					var sprite: AnimatedSprite3D = presenter.player_sprites[player.get_instance_id()]
					assert(sprite != null)
					assert(sprite.animation == expected)
					_assert_same_canonical_body(sprite, presenter, player)
					var base_scale: float = presenter._canonical_body_scale(sprite, player.role)
					var camera_factor := ChessFootball3DPresenter.perspective_body_scale(
						presenter.camera, presenter.player_nodes[player.get_instance_id()].global_position
					)
					var normalized_width := sprite.scale.x / (base_scale * camera_factor)
					var normalized_height := sprite.scale.y / (base_scale * camera_factor)
					if String(expected).ends_with("_diagonal"):
						# Real runtime scale, not merely the constant helper.
						assert(normalized_width >= 0.85 and normalized_width <= 0.94)
						assert(normalized_height >= 1.00 and normalized_height <= 1.07)
					else:
						assert(normalized_width >= 0.94 and normalized_width <= 1.05)
						assert(normalized_height >= 1.00 and normalized_height <= 1.07)
		# Actions should not unexpectedly replace a raster player with the
		# legacy SVG body. The existing action timing/controls remain untouched.
		for action in ["pass", "shoot", "tackle", "celebrate"]:
			for team in match_node.teams:
				for player in team:
					player.action_lock_seconds = 0.0
					player.velocity = Vector2.ZERO
					player.play_action(action, 1.0)
					player.visual.frame = 3
			presenter.sync_presentation(1.0 / 60.0, mode)
			for team in match_node.teams:
				for player in team:
					var sprite: AnimatedSprite3D = presenter.player_sprites[player.get_instance_id()]
					assert(sprite.animation == StringName(action))
					_assert_same_canonical_body(sprite, presenter, player)
	# Audit ALL eight real raster poses, not just nominal 128x144 canvases
	# or frame 3. Both uniforms and the keeper have their own body references.
	for team in match_node.teams:
		for player in team:
			var sprite: AnimatedSprite3D = presenter.player_sprites[player.get_instance_id()]
			var frontal_width := 0.0
			for view_name in ["side", "front", "back", "front_diagonal", "back_diagonal"]:
				var animation := ChessFootballRunDirection.animation_for(&"run", view_name)
				assert(sprite.sprite_frames.has_animation(animation))
				assert(sprite.sprite_frames.get_frame_count(animation) == 8)
				sprite.animation = animation
				var widths: Array[float] = []
				var heights: Array[float] = []
				for i in range(8):
					var image_texture := sprite.sprite_frames.get_frame_texture(animation, i) as ImageTexture
					assert(image_texture != null)
					var rectangle := image_texture.get_image().get_used_rect()
					assert(rectangle.size.x >= 35 and rectangle.size.y >= 86)
					assert(rectangle.end.y <= 144)
					widths.append(float(rectangle.size.x))
					heights.append(float(rectangle.size.y))
				widths.sort()
				heights.sort()
				var base_scale := presenter._canonical_body_scale(sprite, player.role)
				var view_adjust := ChessFootball3DPresenter.view_compensation(animation)
				var effective_height := heights[4] * base_scale * view_adjust.y
				assert(absf(effective_height - ChessFootball3DPresenter.CANONICAL_BODY_HEIGHT_PIXELS) <= 6.0)
				# Running legs legitimately rise and fall; reject a frame that
				# turns the player into a miniature halfway through the cycle.
				assert((heights[7] - heights[0]) * base_scale <= 18.0)
				var effective_width := widths[4] * base_scale * view_adjust.x
				if view_name == "front":
					frontal_width = effective_width
				elif view_name.ends_with("_diagonal"):
					assert(absf(effective_width - frontal_width) <= 10.0)
	# Every frame from side/front/back/diagonals, both teams and keeper:
	# the lower alpha bound should land on the *same* grass contact height
	# in broadcast and tactical modes, independent of incidental transparent
	# padding around a bent running pose. Exercise actual 3D presenter logic.
	for mode in ["broadcast", "tactical"]:
		for team in match_node.teams:
			for player in team:
				var sprite: AnimatedSprite3D = presenter.player_sprites[player.get_instance_id()]
				var proxy: Node3D = presenter.player_nodes[player.get_instance_id()]
				player.velocity = Vector2.ZERO # no intentional running bob/lean
				sprite.pixel_size = (
					ChessFootball3DPresenter.TACTICAL_PLAYER_PIXEL_SIZE
					if mode == "tactical"
					else ChessFootball3DPresenter.PLAYER_PIXEL_SIZE
				)
				for view_name in ["side", "front", "back", "front_diagonal", "back_diagonal"]:
					var animation := ChessFootballRunDirection.animation_for(&"run", view_name)
					sprite.animation = animation
					for i in range(8):
						sprite.frame = i
						presenter._sync_player_secondary_motion(player, sprite, proxy)
						var texture: Texture2D = sprite.sprite_frames.get_frame_texture(animation, i)
						assert(ChessFootballSpriteBank.has_frame_bottom(texture))
						var actual_bottom := float((texture as ImageTexture).get_image().get_used_rect().end.y)
						assert(is_equal_approx(ChessFootballSpriteBank.frame_bottom(texture), actual_bottom))
						var bottom_offset := actual_bottom - ChessFootballSpriteBank.cell_size().y * 0.5
						var boot_contact := sprite.position.y - bottom_offset * sprite.pixel_size * sprite.scale.y
						var nominal_contact := ChessFootball3DPresenter.PLAYER_BASE_Y - (
							ChessFootballSpriteBank.footline() - ChessFootballSpriteBank.cell_size().y * 0.5
						) * ChessFootball3DPresenter.PLAYER_PIXEL_SIZE
						assert(absf(boot_contact - nominal_contact) < 0.005)
	# The user-observed size mismatch was in the *projected* camera view:
	# atlas/world bounds were equal, but perspective made rear players tiny.
	# Measure true Godot Camera3D screen positions across ten different
	# locations, both camera modes and both club kits, including keepers.
	var positions := [
		Vector2(-420.0, -560.0), Vector2(-180.0, -320.0),
		Vector2(0.0, 0.0), Vector2(180.0, 320.0),
		Vector2(420.0, 560.0),
	]
	for camera_mode in ["broadcast", "tactical"]:
		var camera := presenter.camera
		camera.position = (
			Vector3(0.0, ChessFootball3DPresenter.TACTICAL_HEIGHT, 0.35)
			if camera_mode == "tactical"
			else Vector3(0.0, ChessFootball3DPresenter.BROADCAST_HEIGHT,
				ChessFootball3DPresenter.BROADCAST_DEPTH)
		)
		camera.look_at(Vector3.ZERO if camera_mode == "tactical" else Vector3(0.0, 0.0, -0.85))
		presenter.last_camera_mode = camera_mode
		for team_id in range(2):
			for index in range(5):
				var player: Footballer = match_node.teams[team_id][index]
				player.global_position = ChessFootballMath.PITCH_RECT.get_center() + Vector2(
					positions[index].x + (float(team_id) - 0.5) * 65.0,
					positions[index].y,
				)
				player.action_lock_seconds = 0.0
				player.velocity = Vector2.ZERO
				player.visual.play("idle")
		presenter.sync_presentation(0.0, camera_mode)
		var first_height := -1.0
		for team in match_node.teams:
			for player in team:
				var key: int = player.get_instance_id()
				var proxy: Node3D = presenter.player_nodes[key]
				var sprite: AnimatedSprite3D = presenter.player_sprites[key]
				var image := (sprite.sprite_frames.get_frame_texture(
					sprite.animation, sprite.frame
				) as ImageTexture).get_image()
				var height_world := (
					float(image.get_used_rect().size.y) * sprite.pixel_size * sprite.scale.y
				)
				var center := proxy.global_position + Vector3.UP * ChessFootball3DPresenter.PLAYER_BASE_Y
				var camera_up := camera.global_transform.basis.y
				var top := camera.unproject_position(center + camera_up * height_world * 0.5)
				var bottom := camera.unproject_position(center - camera_up * height_world * 0.5)
				var screen_height := top.distance_to(bottom)
				if first_height < 0.0:
					first_height = screen_height
				assert(screen_height > 10.0)
				assert(absf(screen_height / first_height - 1.0) <= 0.075)
		# Test real 3D sync, not just the static body-scale and tonal helpers.
		# A running player must keep its projected size and display luminance
		# while turning through all eight headings, in either camera mode.
		for heading in [
			Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN,
			Vector2(1.0, 1.0).normalized(), Vector2(-1.0, 1.0).normalized(),
			Vector2(1.0, -1.0).normalized(), Vector2(-1.0, -1.0).normalized(),
		]:
			for team in match_node.teams:
				for player in team:
					player.action_lock_seconds = 0.0
					player.velocity = heading * player.base_speed
					player.visual.play("run")
					player.visual.frame = 3
					player._sync_facing()
					player._sync_locomotion(false)
			presenter.sync_presentation(0.0, camera_mode)
			var first_run_height := -1.0
			for team in match_node.teams:
				for player in team:
					var key: int = player.get_instance_id()
					var proxy: Node3D = presenter.player_nodes[key]
					var sprite: AnimatedSprite3D = presenter.player_sprites[key]
					var texture := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
					assert(texture is ImageTexture)
					var pose_height := float((texture as ImageTexture).get_image().get_used_rect().size.y)
					var world_height := pose_height * sprite.pixel_size * sprite.scale.y
					var center := proxy.global_position + Vector3.UP * ChessFootball3DPresenter.PLAYER_BASE_Y
					var camera_up := camera.global_transform.basis.y
					var top := camera.unproject_position(center + camera_up * world_height * 0.5)
					var bottom := camera.unproject_position(center - camera_up * world_height * 0.5)
					var run_height := top.distance_to(bottom)
					if first_run_height < 0.0:
						first_run_height = run_height
					assert(run_height > 10.0)
					# Running silhouettes change height during their authored stride.
					assert(absf(run_height / first_run_height - 1.0) <= 0.12)
					assert(not sprite.shaded)
					assert(sprite.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
					var frames := sprite.sprite_frames
					var reference_brightness := (
						ChessFootball3DPresenter._animation_luminance(frames, &"run_front")
						+ ChessFootball3DPresenter._animation_luminance(frames, &"run")
					) * 0.5
					var displayed_brightness := (
						ChessFootball3DPresenter._animation_luminance(frames, sprite.animation)
						* sprite.modulate.r
					)
					assert(reference_brightness > 0.10)
					assert(absf(displayed_brightness / reference_brightness - 1.0) < 0.065)
					assert(is_equal_approx(sprite.modulate.r, sprite.modulate.g))
					assert(is_equal_approx(sprite.modulate.r, sprite.modulate.b))
					assert(is_equal_approx(sprite.modulate.a, 1.0))
	# All ten unlit player billboards have the same light response across
	# camera positions; subtle baked-art brightness differences are balanced
	# per view, never by forcing skin/kit colors to a global average.
	for team in match_node.teams:
		for player in team:
			var sprite: AnimatedSprite3D = presenter.player_sprites[player.get_instance_id()]
			assert(not sprite.shaded)
			assert(sprite.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
			var frames := sprite.sprite_frames
			var reference_brightness := (
				ChessFootball3DPresenter._animation_luminance(frames, &"run_front")
				+ ChessFootball3DPresenter._animation_luminance(frames, &"run")
			) * 0.5
			assert(reference_brightness > 0.10)
			for name in [
				&"idle", &"run", &"sprint", &"run_front", &"run_back",
				&"run_front_diagonal", &"run_back_diagonal",
				&"sprint_front", &"sprint_back",
				&"pass", &"shoot", &"tackle", &"celebrate",
			]:
				sprite.animation = name
				var current := ChessFootball3DPresenter._animation_luminance(frames, name)
				assert(current > 0.10)
				var gain := presenter._tonal_view_gain(sprite)
				assert(gain >= 0.88 and gain <= 1.12)
				assert(absf(gain * current / reference_brightness - 1.0) < 0.065)
	print("chess-football canonical roster parity smoke: OK")
	quit(0)


func _assert_same_canonical_body(sprite: AnimatedSprite3D, presenter: ChessFootball3DPresenter, player: Footballer) -> void:
	var frame_texture := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
	assert(frame_texture is ImageTexture, "Legacy vector atlas leaked into 3D")
	assert(ChessFootballSpriteBank.has_frame_bottom(frame_texture))
	var bounds := (frame_texture as ImageTexture).get_image().get_used_rect()
	assert(bounds.size.y >= 86)
	var correction := ChessFootball3DPresenter.perspective_body_scale(
		presenter.camera, presenter.player_nodes[player.get_instance_id()].global_position
	)
	var scaled_pixels := float(bounds.size.y) * absf(sprite.scale.y) / correction
	assert(absf(scaled_pixels - ChessFootball3DPresenter.CANONICAL_BODY_HEIGHT_PIXELS) <= 18.0)
	# Sprite3D uses a centered canvas; boot soles must remain grounded in
	# both camera modes, including the different tactical pixel size.
	var half_cell := ChessFootballSpriteBank.cell_size().y * 0.5
	var visible_foot_height := (
		sprite.position.y
		- (float(bounds.end.y) - half_cell) * sprite.pixel_size * absf(sprite.scale.y)
	)
	assert(visible_foot_height >= -0.09)
	assert(visible_foot_height <= 0.25)
