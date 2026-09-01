from pathlib import Path

path = Path('frontend/src/components/Board3D.jsx')
text = path.read_text(encoding='utf-8')

def once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing marker: {label}')
    text = text.replace(old, new, 1)

once(
    "import { adaptiveRenderScale, clamp01, deriveMoveKinetics, easeOutCubic, inferCapturedPiece, reactiveLightProfile, smoothstep } from './WarRoom3DMotion.js';\n",
    "import { adaptiveRenderScale, clamp01, deriveMoveKinetics, easeOutCubic, inferCapturedPiece, reactiveLightProfile, smoothstep } from './WarRoom3DMotion.js';\nimport { COARSE_PIECE_HIT_TARGET, resolveBoardTap } from './WarRoom3DTouch.js';\n",
    'touch import',
)

marker = "function addSignatureDetail(group, type, accent, coarsePointer = false) {"
helper = """function addCoarsePieceHitTarget(group, square, coarsePointer = false) {
  if (!coarsePointer || !square) return;
  const target = new THREE.Mesh(
    new THREE.CylinderGeometry(
      COARSE_PIECE_HIT_TARGET.radius,
      COARSE_PIECE_HIT_TARGET.radius,
      COARSE_PIECE_HIT_TARGET.height,
      16,
    ),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      toneMapped: false,
    }),
  );
  target.position.y = COARSE_PIECE_HIT_TARGET.centerY;
  target.castShadow = false;
  target.receiveShadow = false;
  target.userData.square = square;
  target.userData.touchHitTarget = true;
  group.add(target);
}

"""
once(marker, helper + marker, 'touch hit helper')

once(
    "    mesh.traverse((object) => { object.userData.square = piece.square; });\n    state.pieceGroup.add(mesh);\n",
    "    mesh.traverse((object) => { object.userData.square = piece.square; });\n    addCoarsePieceHitTarget(mesh, piece.square, state.coarsePointer);\n    state.pieceGroup.add(mesh);\n",
    'piece hit target',
)

once(
    "      pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };\n",
    "      pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId, pointerType: event.pointerType };\n",
    'pointer start',
)

once(
    "      if (!start || start.id !== event.pointerId) return;\n      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;\n      const square = squareFromPointer(event);\n",
    "      const touchLike = coarsePointer || start?.pointerType === 'touch';\n      const tap = resolveBoardTap(\n        start,\n        { x: event.clientX, y: event.clientY, id: event.pointerId },\n        { coarsePointer: touchLike },\n      );\n      if (!tap) return;\n      const square = squareFromPointer({ clientX: tap.x, clientY: tap.y });\n",
    'pointer release',
)

path.write_text(text, encoding='utf-8')
