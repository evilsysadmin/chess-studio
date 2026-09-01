from pathlib import Path

premium = Path('frontend/src/components/PremiumWarRoomScene.js')
text = premium.read_text(encoding='utf-8')

def once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing PremiumWarRoomScene marker: {label}')
    text = text.replace(old, new, 1)

once(
    "import * as THREE from 'three';\n",
    "import * as THREE from 'three';\nimport { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';\n",
    'mobile decor import',
)
once(
    "  const glow = new THREE.PointLight(0xffc76b, coarsePointer ? 2.1 : 3.8, 5.6, 2);\n",
    "  const glow = new THREE.PointLight(0xffc76b, warRoomDecorProfile(coarsePointer).bankerLamp, 5.6, 2);\n",
    'banker lamp',
)
once(
    "  const light = new THREE.PointLight(0xffad4f, coarsePointer ? 2.5 : 4.5, 6.8, 2);\n",
    "  const light = new THREE.PointLight(0xffad4f, warRoomDecorProfile(coarsePointer).wallSconce, 6.8, 2);\n",
    'wall sconce',
)
once(
    "function addCurtain(group, x, y, z, towardBoard, side, compact = false) {\n  const folds = compact ? 4 : 7;\n",
    "function addCurtain(group, x, y, z, towardBoard, side, compact = false) {\n  const folds = compact ? 4 : 7;\n  const decor = warRoomDecorProfile(compact);\n",
    'curtain profile',
)
once(
    "    addBox(group, [width, 2.72 - index * 0.07, 0.14], index % 2 ? COLORS.burgundyDark : COLORS.burgundy, [px, y - index * 0.03, pz], {\n",
    "    addBox(group, [width, 2.72 - index * 0.07, 0.14], index % 2 ? decor.curtainDark : decor.curtainLight, [px, y - index * 0.03, pz], {\n",
    'curtain colors',
)
once(
    "function addCinematicAccentLights(group, theme, wallZ, towardBoard, coarsePointer) {\n  const target = new THREE.Object3D();\n",
    "function addCinematicAccentLights(group, theme, wallZ, towardBoard, coarsePointer) {\n  const decor = warRoomDecorProfile(coarsePointer);\n  const target = new THREE.Object3D();\n",
    'accent profile',
)
once(
    "  const crestSpot = new THREE.SpotLight(0xffd08a, coarsePointer ? 5 : 8.5, 15, Math.PI / 7, 0.6, 2);\n",
    "  const crestSpot = new THREE.SpotLight(0xffd08a, decor.crest, 15, Math.PI / 7, 0.6, 2);\n",
    'crest light',
)
once(
    "  const moonFill = new THREE.PointLight(0x6ca7c7, coarsePointer ? 1.1 : 2.2, 10.5, 2);\n",
    "  const moonFill = new THREE.PointLight(0x6ca7c7, decor.moon, 10.5, 2);\n",
    'moon fill',
)
once(
    "  const paletteFill = new THREE.PointLight(theme?.felt ?? COLORS.teal, coarsePointer ? 1.2 : 2.3, 10.5, 2);\n",
    "  const paletteFill = new THREE.PointLight(theme?.felt ?? COLORS.teal, decor.palette, 10.5, 2);\n",
    'palette fill',
)
premium.write_text(text, encoding='utf-8')

board = Path('frontend/src/components/Board3D.jsx')
text = board.read_text(encoding='utf-8')

def board_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing Board3D marker: {label}')
    text = text.replace(old, new, 1)

board_once(
    "import { COARSE_PIECE_HIT_TARGET, resolveBoardTap } from './WarRoom3DTouch.js';\n",
    "import { COARSE_PIECE_HIT_TARGET, resolveBoardTap } from './WarRoom3DTouch.js';\nimport { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';\n",
    'mobile decor import',
)
board_once(
    "  const brass = 0xb88a35;\n\n  addBox(room, [19, 0.38, 18], 0x100b08, [0, -0.55, 0], { roughness: 0.82, metalness: 0.02 });\n",
    "  const brass = 0xb88a35;\n  const decor = warRoomDecorProfile(coarsePointer);\n\n  addBox(room, [19, 0.38, 18], 0x100b08, [0, -0.55, 0], { roughness: 0.82, metalness: 0.02 });\n",
    'base decor profile',
)
board_once(
    "  addBox(room, [2.25, 3.25, 0.12], 0x171c2a, [bannerX, 3.25, wallZ + towardBoard * 0.31], { roughness: 0.88 });\n",
    "  addBox(room, [2.25, 3.25, 0.12], decor.banner, [bannerX, 3.25, wallZ + towardBoard * 0.31], { roughness: 0.88 });\n",
    'banner color',
)
board.write_text(text, encoding='utf-8')
