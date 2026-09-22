"""Hard visual/structural contract for canonical Home Matthias.

Matthias is a chess pawn first: compact, dark-bodied, ivory-headed,
permanently stern, and free of humanoid-officer drift. These rules are
Home-specific; the shared Blender setup remains product-agnostic.
"""

CANONICAL_IDENTITY = "stern-no-moustache-pawn"
CANONICAL_REFERENCE = "home-3d-pawn-approved-2026-09-23"
CANONICAL_REFERENCE_FILE = "frontend/art-source/matthias-home-canonical-reference.webp"
CANONICAL_REFERENCE_SHA256 = "0b5c32eaae136c1e4e6d85a253b606437599b06dd7a4d4d4d0d637a39ead5707"
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
    "Nose",
    "Eye.L",
    "Eye.R",
    "Brow.L",
    "Brow.R",
    "Mouth",
    "Classic chest cross brass",
    "Classic chest cross inset",
    "RoutineBook",
    "RoutineCup",
    "RoutinePen",
    "RoutineSandwichBread",
    "RoutineSandwichFilling",
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

# Tight silhouette envelope from the approved 512x512 canonical reference.
HEAD_TO_BASE_WIDTH = (0.54, 0.62)
HEAD_TO_BODY_HEIGHT = (0.34, 0.40)
CAP_TO_HEAD_WIDTH = (1.08, 1.20)
BODY_HEIGHT_TO_BASE_WIDTH = (1.40, 1.60)

# Broad, tilted, curved officer cap; never a flat beret or cylindrical kepi.
CAP_TOP_TO_CROWN_WIDTH = (1.08, 1.18)
CAP_TOP_MIN_REAR_OFFSET = 0.040
CAP_TOP_MIN_VERTICAL_SEPARATION = 0.080
CAP_VISOR_TO_HEAD_WIDTH = (0.62, 0.82)

# The approved black/brass iron cross has real visual weight.
CHEST_CREST_HEIGHT_TO_HEAD_WIDTH = (0.42, 0.52)
CHEST_CREST_WIDTH_TO_HEAD_WIDTH = (0.42, 0.52)

DARK_BODY_MAX_LUMA = 0.10
IVORY_HEAD_MIN_LUMA = 0.42
IVORY_HEAD_RED = (0.60, 0.68)
IVORY_HEAD_GREEN = (0.49, 0.57)
IVORY_HEAD_BLUE = (0.33, 0.42)
IVORY_HEAD_WARMTH = (0.20, 0.30)
IVORY_HEAD_CHROMA = (0.18, 0.30)
BRASS_MIN_METALLIC = 0.55
REST_ARM_MIN_Y = 0.10
BITE_PROP_FACE_CLEARANCE_MIN = 0.025

MIN_BROW_TILT_DEGREES = 22.0
MAX_BROW_TILT_DEGREES = 40.0
EYE_TO_HEAD_WIDTH = (0.055, 0.095)
EYE_VERTICALITY = (1.25, 1.90)
MOUTH_TO_HEAD_WIDTH = (0.22, 0.29)
MOUTH_EYE_VERTICAL_GAP_TO_HEAD_HEIGHT = (0.16, 0.25)
FACE_SYMMETRY_TOLERANCE = 0.018
TUNIC_TO_HEAD_WIDTH = (0.96, 1.12)
NECK_TO_HEAD_WIDTH = (0.96, 1.08)
