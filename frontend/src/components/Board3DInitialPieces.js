import { isMatthiasRivalKing } from './MatthiasKing3D.js';
import { addCoarsePieceHitTarget, buildPiece } from './Board3DPieces.js';
import { squarePosition } from './Board3DBoardMath.js';

export function buildInitialBoard3DPieces({
  state,
  pieces,
  skinId,
  orientation = 'white',
  matthiasKingColor = null,
} = {}) {
  if (!state?.pieceGroup || !state?.pieceMeshes || !Array.isArray(pieces)) return 0;

  let built = 0;
  for (const piece of pieces) {
    const matthiasKing = isMatthiasRivalKing(piece, matthiasKingColor);
    const mesh = buildPiece(piece.type, piece.color, skinId, state.renderLite, {
      matthiasKing,
      faceTowardCamera: orientation !== 'black',
    });
    const { x, z } = squarePosition(piece.square);
    mesh.position.set(x, 0.1, z);
    mesh.userData.square = piece.square;
    mesh.userData.type = piece.type;
    mesh.userData.color = piece.color;
    mesh.userData.baseY = 0.1;
    mesh.userData.baseScale = mesh.scale.clone();
    if (matthiasKing) mesh.userData.matthiasKing = true;
    mesh.traverse((object) => { object.userData.square = piece.square; });
    addCoarsePieceHitTarget(mesh, piece.square, state.coarsePointer);
    state.pieceGroup.add(mesh);
    state.pieceMeshes.set(piece.square, mesh);
    built += 1;
  }
  return built;
}
