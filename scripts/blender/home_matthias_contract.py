"""Hard visual/structural contract for canonical Home Matthias.

This is deliberately stricter than a loose asset manifest. Matthias is a chess
pawn first: compact, dark-bodied, ivory-headed, permanently stern, and free of
human-officer drift. Keep product-specific art rules here; the shared Blender
setup must remain agnostic.
"""

CANONICAL_IDENTITY = "stern-no-moustache-pawn"
CANONICAL_REFERENCE = "classic-pawn-first-avatar"
CANONICAL_POSE_LANGUAGE = "permanently-stern"

REQUIRED_ACTIONS = {
    "Idle",
    "Speak",
    "Think",
    "Read",
    "Write",
    "Dossier",
    "Sip",
    "Bite",
    "Sleep",
}

REQUIRED_OBJECTS = {
    "Classic lower pawn",
    "Classic navy tunic",
    "Classic cap crown",
    "Classic cap top",
    "Classic cap band",
    "Classic cap visor",
    "Head",
    "Eye.L",
    "Eye.R",
    "Brow.L",
    "Brow.R",
    "Mouth.L",
    "Mouth.R",
    "Classic chest crest vertical",
    "Classic chest crest horizontal",
    "RoutineBook",
    "RoutineCup",
    "RoutinePen",
}

# Any of these names returning to the canonical blend is a regression toward
# the rejected humanoid / toy-officer variants.
FORBIDDEN_NAME_TOKENS = (
    "moustache",
    "mustache",
    "beard",
    "goatee",
    "epaulette",
    "shoulder pad",
    "chest strap",
    "sash",
    "uniform chest",
    "shirt bib",
    "cream panel",
    "white skirt",
    "field cap crown",
    "crest field",
)

# Rest-pose silhouette constraints derived from the approved canonical image:
# squat heavy pawn, large ivory head and a cap with real visual presence.
HEAD_TO_BASE_WIDTH = (0.56, 0.72)
HEAD_TO_BODY_HEIGHT = (0.30, 0.44)
CAP_TO_HEAD_WIDTH = (1.08, 1.34)
BODY_HEIGHT_TO_BASE_WIDTH = (1.42, 1.82)

# The approved peaked cap is structured, not a flat beret. The top must be
# wider than the crown and biased rearward so the visor reads clearly in front.
CAP_TOP_TO_CROWN_WIDTH = (1.08, 1.28)
CAP_TOP_MIN_REAR_OFFSET = 0.025
CAP_TOP_MIN_VERTICAL_SEPARATION = 0.045

# Material language from the approved canonical reference.
DARK_BODY_MAX_LUMA = 0.10
IVORY_HEAD_MIN_LUMA = 0.42
BRASS_MIN_METALLIC = 0.55

# Neutral hands/forearms must live behind the pawn silhouette. They may animate
# into view for authored actions, but Idle must not read as a doll with arms.
REST_ARM_MIN_Y = 0.08

# Matthias is angry by default. The eyebrows must slope downward toward the
# centre of the face, and the mouth must form a shallow frown.
MIN_BROW_TILT_DEGREES = 18.0
MAX_BROW_TILT_DEGREES = 42.0
