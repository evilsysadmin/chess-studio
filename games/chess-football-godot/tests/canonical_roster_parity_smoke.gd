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
			== Vector2(0.91, 0.94)
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
					_assert_same_canonical_body(sprite)
					var base_scale: float = presenter._canonical_body_scale(sprite, player.role)
					var normalized_width := sprite.scale.x / base_scale
					var normalized_height := sprite.scale.y / base_scale
					if String(expected).ends_with("_diagonal"):
						# Real runtime scale, not merely the constant helper.
						assert(normalized_width >= 0.85 and normalized_width <= 0.94)
						assert(normalized_height >= 0.93 and normalized_height <= 0.99)
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
					_assert_same_canonical_body(sprite)
	print("chess-football canonical roster parity smoke: OK")
	quit(0)


func _assert_same_canonical_body(sprite: AnimatedSprite3D) -> void:
	var frame_texture := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
	assert(frame_texture is ImageTexture, "Legacy vector atlas leaked into 3D")
	var bounds := (frame_texture as ImageTexture).get_image().get_used_rect()
	assert(bounds.size.y >= 86)
	var scaled_pixels := float(bounds.size.y) * absf(sprite.scale.y)
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
