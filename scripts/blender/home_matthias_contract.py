"""Hard visual/structural contract for canonical Home Matthias.

Matthias is a chess pawn first: compact, dark-bodied, ivory-headed,
permanently stern, and free of humanoid-officer drift. These rules are
Home-specific; the shared Blender setup remains product-agnostic.
"""

CANONICAL_IDENTITY = "stern-no-moustache-pawn"
CANONICAL_REFERENCE = "war-room-stern-pawn-2026-09-16"
CANONICAL_REFERENCE_FILE = "frontend/art-source/matthias-home-canonical-reference.webp"
CANONICAL_REFERENCE_SHA256 = "24ce1e4da043ce32ded8cd2b7ee8a901494c15806f9489cd5625d7b6c2ce9650"
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
    "Canonical cap top piping",
    "Head",
    "Nose",
    "Eye.L",
    "Eye.R",
    "Canonical eye white.L",
    "Canonical eye white.R",
    "Canonical iris.L",
    "Canonical iris.R",
    "Brow.L",
    "Brow.R",
    "Mouth.L",
    "Mouth.R",
    "Classic chest cross brass",
    "Classic chest cross inset",
    "Classic cap badge",
    "Classic cap badge inset",
    "Canonical cap badge pawn head",
    "Canonical service cord",
    "Canonical service button.L",
    "Canonical service button.R",
    "RoutineBook",
    "RoutineCup",
    "RoutinePen",
}

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

# Pawn silhouette envelope. The approved full Home reference is the visual
# source of truth; these ratios keep the generated model recognizably chess-first.
HEAD_TO_BASE_WIDTH = (0.54, 0.62)
HEAD_TO_BODY_HEIGHT = (0.34, 0.40)
CAP_TO_HEAD_WIDTH = (1.18, 1.30)
BODY_HEIGHT_TO_BASE_WIDTH = (1.40, 1.60)

# Broad, tilted, curved officer cap; never a flat beret or cylindrical kepi.
CAP_TOP_TO_CROWN_WIDTH = (1.08, 1.18)
CAP_TOP_MIN_REAR_OFFSET = 0.040
CAP_TOP_MIN_VERTICAL_SEPARATION = 0.080
CAP_VISOR_TO_HEAD_WIDTH = (0.62, 0.82)

# The refined black/brass iron cross is intentionally subordinate to the face
# while remaining clearly readable at the Home avatar scale.
CHEST_CREST_HEIGHT_TO_HEAD_WIDTH = (0.30, 0.39)
CHEST_CREST_WIDTH_TO_HEAD_WIDTH = (0.30, 0.39)

DARK_BODY_MAX_LUMA = 0.10
IVORY_HEAD_MIN_LUMA = 0.42
BRASS_MIN_METALLIC = 0.55
REST_ARM_MIN_Y = 0.10

MIN_BROW_TILT_DEGREES = 22.0
MAX_BROW_TILT_DEGREES = 40.0
EYE_TO_HEAD_WIDTH = (0.045, 0.075)
EYE_VERTICALITY = (1.05, 1.45)
