extends RefCounted

const BISHOP_SUPPRESSION_LANES := [
    {"height": 50.0, "speed": 668.0},
    {"height": 134.0, "speed": 652.0},
    {"height": 86.0, "speed": 676.0},
]

const ENEMY_TYPES := {
    "pawn": {"hp": 34, "speed": 54.0, "width": 45.0, "height": 73.0, "standoff": 270.0},
    "knight": {"hp": 62, "speed": 92.0, "width": 57.0, "height": 80.0, "standoff": 225.0},
    "rook": {"hp": 112, "speed": 0.0, "width": 68.0, "height": 90.0, "standoff": 420.0},
    "bishop": {"hp": 310, "speed": 42.0, "width": 90.0, "height": 128.0, "standoff": 430.0},
    "queen": {"hp": 156, "speed": 74.0, "width": 62.0, "height": 96.0, "standoff": 345.0},
    "grenadier": {"hp": 82, "speed": 50.0, "width": 54.0, "height": 82.0, "standoff": 470.0},
    "scout": {"hp": 46, "speed": 84.0, "width": 48.0, "height": 76.0, "standoff": 245.0},
    "commando": {"hp": 78, "speed": 76.0, "width": 58.0, "height": 84.0, "standoff": 300.0},
    "shield": {"hp": 168, "speed": 32.0, "width": 72.0, "height": 94.0, "standoff": 255.0},
}

const ENEMY_FIRE_PROFILES := {
    "pistol": {"range": 720.0, "min_range": 0.0, "cooldown_min": 1.55, "cooldown_max": 2.25, "speed": 500.0, "pellets": 1, "spread": 0.085, "explosive": false},
    "machinegun": {"range": 840.0, "min_range": 0.0, "cooldown_min": 1.35, "cooldown_max": 1.95, "speed": 560.0, "pellets": 1, "spread": 0.105, "explosive": false},
    "shotgun": {"range": 545.0, "min_range": 0.0, "cooldown_min": 1.85, "cooldown_max": 2.50, "speed": 470.0, "pellets": 5, "spread": 0.20, "explosive": false},
    "panzerfaust": {"range": 1200.0, "min_range": 290.0, "cooldown_min": 2.50, "cooldown_max": 3.35, "speed": 390.0, "pellets": 1, "spread": 0.035, "explosive": true},
}
