import { scheduleWarRoomAfterFirstPaint } from './WarRoomAfterFirstPaint.js';
import { isMatthiasRivalKing } from './MatthiasKing3D.js';
import { addCoarsePieceHitTarget, applyMatthiasCheckPose, buildPiece } from './Board3DPieces.js';
import { squarePosition } from './Board3DBoardMath.js';

export function buildBoard3DPieceMesh({
  state,
  piece,
  skinId,
  orientation = 'white',
  matthiasKingColor = null,
} = {}) {
  const matthiasKing = isMatthiasRivalKing(piece, matthiasKingColor);
  const mesh = buildPiece(piece.type, piece.color, skinId, state.renderLite, {
    matthiasKing,
    faceTowardCamera: orientation !== 'black',
  });
  const { x, z } = squarePosition(piece.square);
  mesh.position.set(x, 0.1, z);
  Object.assign(mesh.userData, {
    square: piece.square,
    type: piece.type,
    color: piece.color,
    baseY: 0.1,
    baseScale: mesh.scale.clone(),
  });
  if (matthiasKing) mesh.userData.matthiasKing = true;
  mesh.traverse((object) => { object.userData.square = piece.square; });
  addCoarsePieceHitTarget(mesh, piece.square, state.coarsePointer);
  return mesh;
}

export function buildInitialBoard3DPieces(options = {}) {
  const { state, pieces } = options;
  if (!state?.pieceGroup || !state?.pieceMeshes || !Array.isArray(pieces)) return 0;
  for (const piece of pieces) {
    const mesh = buildBoard3DPieceMesh({ ...options, piece });
    state.pieceGroup.add(mesh);
    state.pieceMeshes.set(piece.square, mesh);
  }
  return pieces.length;
}

export function scheduleInitialBoard3DPieces({
  state,
  pieces,
  skinId,
  orientation,
  matthiasKingColor,
  pieceBuildSignature,
  fen,
  checkSquare,
  pieceBuildSignatureRef,
  previousFenRef,
  isCurrent = () => true,
  scheduleAfterFirstPaint = scheduleWarRoomAfterFirstPaint,
} = {}) {
  if (!state?.renderer?.domElement) return () => {};
  state.renderer.domElement.dataset.board3dPiecesReady = 'false';
  return scheduleAfterFirstPaint(() => {
    if (!isCurrent() || state.pieceMeshes.size > 0) return;
    const built = buildInitialBoard3DPieces({
      state, pieces, skinId, orientation, matthiasKingColor,
    });
    if (pieceBuildSignatureRef) pieceBuildSignatureRef.current = pieceBuildSignature;
    if (previousFenRef) previousFenRef.current = fen;
    Object.assign(state.renderer.domElement.dataset, {
      board3dPieceReconcile: 'cold-after-paint-v1',
      board3dPieceReused: '0',
      board3dPieceBuilt: String(built),
      board3dPieceDisposed: '0',
      board3dPiecesReady: 'true',
    });
    applyMatthiasCheckPose(state, checkSquare, orientation);
    state.render();
    state.ambientScheduler?.wake();
  });
}
