extends SceneTree

# Regression: the visible 3D keeper must show MULTIPLE DISTINCT poses while
# moving, even if its hidden 2D animation remains at frame zero.
func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var game = packed.instantiate()
	root.add_child(game)
	await process_frame
	await process_frame
	game.set_process(false)
	game.set_physics_process(false)
	var presenter: ChessFootball3DPresenter = game.presentation_3d
	assert(presenter != null)
	for team_id in range(2):
		var keeper: Footballer = game.teams[team_id][0]
		var key: int = keeper.get_instance_id()
		var sprite: AnimatedSprite3D = presenter.player_sprites[key]
		assert(sprite != null)
		var observed: Dictionary = {}
		var min_lean := INF
		var max_lean := -INF
		var min_sway := INF
		var max_sway := -INF
		var min_lift := INF
		var max_lift := -INF
		keeper.action_lock_seconds = 0.0
		keeper.velocity = Vector2.DOWN * keeper.base_speed
		keeper.visual.play("run")
		keeper.visual.frame = 0
		keeper._sync_locomotion(false)
		for tick in range(48):
			# Deliberately pin the hidden sprite. The old presenter would
			# force the visible 3D keeper to frame zero forever.
			keeper.visual.frame = 0
			presenter.sync_presentation(1.0 / 60.0, "broadcast")
			assert(sprite.animation == &"run_front")
			assert(sprite.sprite_frames.get_frame_count(sprite.animation) == 8)
			observed[sprite.frame] = true
			min_lean = minf(min_lean, rad_to_deg(sprite.rotation.z))
			max_lean = maxf(max_lean, rad_to_deg(sprite.rotation.z))
			min_sway = minf(min_sway, sprite.position.x)
			max_sway = maxf(max_sway, sprite.position.x)
			min_lift = minf(min_lift, sprite.position.y)
			max_lift = maxf(max_lift, sprite.position.y)
		assert(observed.size() >= 6)
		# A timing-only smoke passed before, while the visible image barely
		# changed at normal match zoom. Require an expressive *screen pose*
		# in addition to advancing frame indices.
		assert(max_lean - min_lean >= 17.0)
		assert(max_sway - min_sway >= 0.15)
		assert(max_lift - min_lift >= 0.08)
		assert(not sprite.is_playing()) # exactly one clock owns 3D frames
		var before_turn: int = sprite.frame
		keeper.velocity = Vector2(1.0, -1.0).normalized() * keeper.base_speed
		keeper.visual.frame = 0
		presenter.sync_presentation(0.0, "broadcast")
		assert(sprite.animation == &"run_back_diagonal")
		assert(sprite.frame == before_turn) # do not restart stride on turn
		for tick in range(10):
			keeper.visual.frame = 0
			presenter.sync_presentation(1.0 / 60.0, "broadcast")
		assert(sprite.frame != before_turn)
		var before_pause: int = sprite.frame
		presenter.sync_presentation(0.0, "broadcast")
		assert(sprite.frame == before_pause)
		# A goalkeeper action is visible as multiple real raster poses;
		# entering idle after the action resets to the approved resting pose.
		keeper.play_action("tackle", 0.58)
		var action_observed: Dictionary = {}
		for tick in range(31):
			keeper.visual.frame = 0
			presenter.sync_presentation(1.0 / 60.0, "broadcast")
			assert(sprite.animation == &"tackle")
			action_observed[sprite.frame] = true
		assert(action_observed.size() >= 4)
		keeper.action_lock_seconds = 0.0
		keeper.velocity = Vector2.ZERO
		keeper._sync_locomotion(false)
		presenter.sync_presentation(1.0 / 60.0, "broadcast")
		assert(sprite.animation == &"idle")
		assert(sprite.frame == 0)
		print("KEEPER_ANIM_TEAM=%d RUN_POSES=%d TACKLE_POSES=%d LEAN=%.1f SWAY=%.3f LIFT=%.3f" % [
			team_id, observed.size(), action_observed.size(),
			max_lean - min_lean, max_sway - min_sway, max_lift - min_lift
		])
	print("chess-football keeper frame-advance smoke: OK")
	quit(0)
