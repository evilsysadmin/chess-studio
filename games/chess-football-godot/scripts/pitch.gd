class_name FootballPitch
extends Node2D

const LINE := Color(0.94, 0.96, 0.91, 0.94)
const GRASS_A := Color(0.075, 0.31, 0.13)
const GRASS_B := Color(0.09, 0.36, 0.15)
const GRASS_C := Color(0.11, 0.39, 0.17)
const GOLD := Color(0.78, 0.61, 0.25)

func _ready() -> void:
	z_index = -4000
	queue_redraw()

func _draw() -> void:
	var pitch := ChessFootballMath.PITCH_RECT
	var arena := pitch.grow(185.0)
	draw_rect(arena, Color(0.025, 0.045, 0.04), true)
	_draw_stands(arena, pitch)
	_draw_ad_boards(pitch)
	_draw_grass(pitch)
	_draw_wear(pitch)
	_draw_markings(pitch)
	_draw_goal(false, pitch)
	_draw_goal(true, pitch)

func _draw_stands(arena: Rect2, pitch: Rect2) -> void:
	var stand_h := 112.0
	var top := Rect2(arena.position.x, arena.position.y, arena.size.x, stand_h)
	var bottom := Rect2(arena.position.x, arena.end.y - stand_h, arena.size.x, stand_h)
	draw_rect(top, Color(0.045, 0.055, 0.065), true)
	draw_rect(bottom, Color(0.045, 0.055, 0.065), true)
	draw_line(Vector2(top.position.x, top.end.y), Vector2(top.end.x, top.end.y), GOLD, 4.0)
	draw_line(Vector2(bottom.position.x, bottom.position.y), Vector2(bottom.end.x, bottom.position.y), GOLD, 4.0)
	for i in range(96):
		var x := arena.position.x + 18.0 + float((i * 83) % int(arena.size.x - 36.0))
		var row := float((i * 29) % 4)
		var crowd_color := Color(0.36, 0.39, 0.43, 0.75) if i % 3 else Color(0.74, 0.62, 0.30, 0.75)
		draw_circle(Vector2(x, arena.position.y + 22.0 + row * 18.0), 3.0, crowd_color)
		draw_circle(Vector2(x + 17.0, arena.end.y - 22.0 - row * 18.0), 3.0, crowd_color)
	var bench_y := pitch.end.y + 54.0
	draw_rect(Rect2(pitch.get_center().x - 190.0, bench_y, 160.0, 44.0), Color(0.08, 0.10, 0.12), true)
	draw_rect(Rect2(pitch.get_center().x + 30.0, bench_y, 160.0, 44.0), Color(0.08, 0.10, 0.12), true)

func _draw_ad_boards(pitch: Rect2) -> void:
	var panel_w := pitch.size.x / 12.0
	for i in range(12):
		var panel_color := Color(0.12, 0.16, 0.18) if i % 2 == 0 else Color(0.16, 0.12, 0.10)
		var x := pitch.position.x + panel_w * i
		draw_rect(Rect2(x, pitch.position.y - 24.0, panel_w - 3.0, 16.0), panel_color, true)
		draw_rect(Rect2(x, pitch.end.y + 8.0, panel_w - 3.0, 16.0), panel_color, true)
		draw_line(Vector2(x + 5.0, pitch.position.y - 16.0), Vector2(x + panel_w - 8.0, pitch.position.y - 16.0), GOLD, 1.5)
		draw_line(Vector2(x + 5.0, pitch.end.y + 16.0), Vector2(x + panel_w - 8.0, pitch.end.y + 16.0), GOLD, 1.5)

func _draw_grass(pitch: Rect2) -> void:
	draw_rect(pitch, GRASS_B, true)
	var stripe_w := pitch.size.x / 16.0
	for i in range(16):
		var color := GRASS_A if i % 2 == 0 else GRASS_C
		draw_rect(Rect2(pitch.position.x + stripe_w * i, pitch.position.y, stripe_w, pitch.size.y), color, true)
	for i in range(6):
		var y := pitch.position.y + pitch.size.y * (float(i) + 0.5) / 6.0
		draw_rect(Rect2(pitch.position.x, y - 18.0, pitch.size.x, 36.0), Color(1, 1, 1, 0.012), true)

func _draw_wear(pitch: Rect2) -> void:
	var center := pitch.get_center()
	draw_circle(center, 145.0, Color(0.16, 0.31, 0.12, 0.08), true)
	draw_circle(Vector2(pitch.position.x + 175.0, center.y), 95.0, Color(0.18, 0.28, 0.11, 0.08), true)
	draw_circle(Vector2(pitch.end.x - 175.0, center.y), 95.0, Color(0.18, 0.28, 0.11, 0.08), true)

func _draw_markings(pitch: Rect2) -> void:
	var center := pitch.get_center()
	draw_rect(pitch, LINE, false, 4.0)
	draw_line(Vector2(center.x, pitch.position.y), Vector2(center.x, pitch.end.y), LINE, 3.0)
	draw_circle(center, 105.0, LINE, false, 3.0)
	draw_circle(center, 5.0, LINE)
	_draw_penalty_area(false, pitch)
	_draw_penalty_area(true, pitch)
	var radius := 28.0
	draw_arc(pitch.position, radius, 0.0, PI * 0.5, 16, LINE, 2.5)
	draw_arc(Vector2(pitch.position.x, pitch.end.y), radius, -PI * 0.5, 0.0, 16, LINE, 2.5)
	draw_arc(Vector2(pitch.end.x, pitch.position.y), radius, PI * 0.5, PI, 16, LINE, 2.5)
	draw_arc(pitch.end, radius, PI, PI * 1.5, 16, LINE, 2.5)

func _draw_penalty_area(right_side: bool, pitch: Rect2) -> void:
	var center_y := pitch.get_center().y
	var direction := -1.0 if right_side else 1.0
	var edge_x := pitch.end.x if right_side else pitch.position.x
	var penalty_w := 265.0
	var penalty_h := 430.0
	var goal_w := 92.0
	var goal_h := 245.0
	var penalty_x := edge_x - penalty_w if right_side else edge_x
	var goal_x := edge_x - goal_w if right_side else edge_x
	draw_rect(Rect2(penalty_x, center_y - penalty_h * 0.5, penalty_w, penalty_h), LINE, false, 3.0)
	draw_rect(Rect2(goal_x, center_y - goal_h * 0.5, goal_w, goal_h), LINE, false, 3.0)
	var spot := Vector2(edge_x + direction * 175.0, center_y)
	draw_circle(spot, 4.5, LINE)
	var start_angle := -0.9 if not right_side else PI - 0.9
	var end_angle := 0.9 if not right_side else PI + 0.9
	draw_arc(spot, 78.0, start_angle, end_angle, 24, LINE, 2.5)

func _draw_goal(right_side: bool, pitch: Rect2) -> void:
	var center_y := pitch.get_center().y
	var goal_h := ChessFootballMath.GOAL_HALF_HEIGHT * 2.0
	var goal_top := center_y - ChessFootballMath.GOAL_HALF_HEIGHT
	var depth := 42.0
	var x := pitch.end.x if right_side else pitch.position.x
	var rect_x := x if right_side else x - depth
	var net := Rect2(rect_x, goal_top, depth, goal_h)
	draw_rect(net, Color(0.88, 0.91, 0.90, 0.10), true)
	draw_rect(net, Color(0.91, 0.94, 0.93, 0.82), false, 3.0)
	for i in range(1, 4):
		var gx := rect_x + depth * float(i) / 4.0
		draw_line(Vector2(gx, goal_top), Vector2(gx, goal_top + goal_h), Color(1, 1, 1, 0.34), 1.0)
	for i in range(1, 6):
		var gy := goal_top + goal_h * float(i) / 6.0
		draw_line(Vector2(rect_x, gy), Vector2(rect_x + depth, gy), Color(1, 1, 1, 0.34), 1.0)
