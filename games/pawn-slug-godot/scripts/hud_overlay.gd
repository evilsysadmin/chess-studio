extends CanvasLayer

const WEAPON_LABELS := {
    "pistol": "PST",
    "machinegun": "MG",
    "shotgun": "SG",
    "panzerfaust": "PZF",
}
const EXTRACTION_X := 5050.0

var _root: Node
var _player: Node
var _primary: Label
var _secondary: Label
var _objective_panel: ColorRect
var _objective: Label
var _last_signature := ""

func _ready() -> void:
    _root = get_parent()
    _player = _root.get_node_or_null("Player")
    _upgrade_existing_panel()
    _build_labels()
    _refresh(true)

func _process(_delta: float) -> void:
    _refresh(false)

func _upgrade_existing_panel() -> void:
    var panel := get_node_or_null("Panel") as ColorRect
    if panel != null:
        panel.offset_right = 386.0
        panel.offset_bottom = 112.0
        panel.color = Color(0.02, 0.025, 0.03, 0.80)

func _build_labels() -> void:
    _primary = Label.new()
    _primary.name = "PrimaryStatus"
    _primary.position = Vector2(42.0, 56.0)
    _primary.size = Vector2(330.0, 24.0)
    _primary.add_theme_font_size_override("font_size", 15)
    _primary.add_theme_color_override("font_color", Color("e7d3a1"))
    add_child(_primary)

    _secondary = Label.new()
    _secondary.name = "SecondaryStatus"
    _secondary.position = Vector2(42.0, 79.0)
    _secondary.size = Vector2(330.0, 22.0)
    _secondary.add_theme_font_size_override("font_size", 13)
    _secondary.add_theme_color_override("font_color", Color("aeb7bc"))
    add_child(_secondary)

    _objective_panel = ColorRect.new()
    _objective_panel.name = "ObjectivePanel"
    _objective_panel.anchor_left = 1.0
    _objective_panel.anchor_right = 1.0
    _objective_panel.offset_left = -386.0
    _objective_panel.offset_top = 24.0
    _objective_panel.offset_right = -28.0
    _objective_panel.offset_bottom = 78.0
    _objective_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _objective_panel.color = Color(0.02, 0.025, 0.03, 0.72)
    add_child(_objective_panel)

    _objective = Label.new()
    _objective.name = "Objective"
    _objective.anchor_right = 1.0
    _objective.anchor_bottom = 1.0
    _objective.offset_left = 14.0
    _objective.offset_top = 8.0
    _objective.offset_right = -14.0
    _objective.offset_bottom = -8.0
    _objective.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
    _objective.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
    _objective.add_theme_font_size_override("font_size", 14)
    _objective.add_theme_color_override("font_color", Color("d5c69d"))
    _objective_panel.add_child(_objective)

func _refresh(force: bool) -> void:
    if _player == null or not is_instance_valid(_player):
        return

    var hp := int(_player.get("hp"))
    var lives := int(_player.get("lives"))
    var grenades := int(_player.get("grenades"))
    var weapon := String(_player.get("weapon"))
    var ammo := int(_player.call("current_ammo")) if _player.has_method("current_ammo") else -1
    var checkpoint := float(_player.call("current_checkpoint_x")) if _player.has_method("current_checkpoint_x") else 110.0
    var progress := clampf(_player.global_position.x / EXTRACTION_X, 0.0, 1.0)
    var boss_spawned := bool(_root.get("boss_spawned"))
    var boss_defeated := bool(_root.get("boss_defeated"))
    var mission_complete := bool(_root.get("mission_complete"))
    var boss_data = _root.get("boss")
    var boss_hp := -1
    var boss_max_hp := -1
    if boss_data is Dictionary and not boss_data.is_empty():
        boss_hp = int(boss_data.get("hp", -1))
        boss_max_hp = int(boss_data.get("max_hp", -1))

    var signature := "%d:%d:%d:%s:%d:%d:%d:%d:%d:%d" % [
        hp,
        lives,
        grenades,
        weapon,
        ammo,
        int(checkpoint),
        int(round(progress * 100.0)),
        int(boss_spawned),
        int(boss_defeated),
        boss_hp,
    ]
    if not force and signature == _last_signature:
        return
    _last_signature = signature

    var ammo_text := "∞" if ammo < 0 else str(ammo)
    _primary.text = "HP %d/3   ·   VIDAS %d   ·   GR %d" % [hp, lives, grenades]
    _secondary.text = "%s %s   ·   CP %d   ·   %d%%" % [
        String(WEAPON_LABELS.get(weapon, weapon.to_upper())),
        ammo_text,
        int(checkpoint),
        int(round(progress * 100.0)),
    ]

    if mission_complete:
        _objective.text = "OPERACIÓN COMPLETA"
        _objective.add_theme_color_override("font_color", Color("f0d57b"))
    elif boss_defeated:
        _objective.text = "EXTRACCIÓN  →"
        _objective.add_theme_color_override("font_color", Color("75d997"))
    elif boss_spawned and boss_hp >= 0:
        _objective.text = "PANZER ROOK   %d / %d" % [boss_hp, boss_max_hp]
        _objective.add_theme_color_override("font_color", Color("e47a62"))
    else:
        _objective.text = "AVANZA   ·   %d%%" % int(round(progress * 100.0))
        _objective.add_theme_color_override("font_color", Color("d5c69d"))
