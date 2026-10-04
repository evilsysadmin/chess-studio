import { Chess } from 'chess.js';
import { resolveBoard3DPointerSquare } from './Board3DTileInstances.js';

let movableCache = { fen: null, squares: null };

// Squares of the side to move that have at least one legal move.
export function board3DMovableSquares(fen) {
  if (!fen) return null;
  if (movableCache.fen === fen) return movableCache.squares;
  let squares = null;
  try {
    squares = new Set(new Chess(fen).moves({ verbose: true }).map((move) => move.from));
  } catch {
    squares = null;
  }
  movableCache = { fen, squares };
  return squares;
}

export function pickBoard3DSquare({
  event,
  canvas,
  pointer,
  raycaster,
  camera,
  pickTargets,
  latestProps,
  preferLegalTargets = false,
}) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  return resolveBoard3DPointerSquare(
    raycaster.intersectObjects(pickTargets, true),
    {
      selectedSquare: latestProps?.selectedSquare,
      legalTargets: latestProps?.legalTargets,
      preferLegalTargets,
      movableSquares: board3DMovableSquares(latestProps?.fen),
    },
  );
}
