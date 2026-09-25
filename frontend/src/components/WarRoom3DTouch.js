export const COARSE_PIECE_HIT_TARGET = Object.freeze({
  // Keep the synthetic touch helper down at the base of the piece. A tall
  // almost-full-square cylinder looks generous on paper, but in a perspective
  // camera it overlaps the next rank and steals taps from the piece the user
  // actually touched. The visible piece geometry remains raycastable; this
  // small base target only closes the awkward gaps around the foot.
  radius: 0.31,
  height: 0.28,
  centerY: 0.22,
});

export const COARSE_PIECE_SNAP_RADIUS_PX = 28;

export function resolveCoarsePieceIntent({
  directSquare = null,
  selectedSquare = null,
  pointer = null,
  projectedPieces = [],
  radius = COARSE_PIECE_SNAP_RADIUS_PX,
} = {}) {
  if (selectedSquare) return directSquare;
  if (projectedPieces.some((piece) => piece.square === directSquare)) return directSquare;
  if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return directSquare;

  let nearest = null;
  for (const piece of projectedPieces) {
    const distance = Math.hypot(Number(piece.x) - pointer.x, Number(piece.y) - pointer.y);
    if (!Number.isFinite(distance) || (nearest && distance >= nearest.distance)) continue;
    nearest = { square:piece.square, distance };
  }

  return nearest && nearest.distance <= radius ? nearest.square : directSquare;
}

export function resolveBoardTap(start, end, { coarsePointer = false } = {}) {
  if (!start || !end || start.id !== end.id) return null;
  const tolerance = coarsePointer ? 18 : 8;
  const distance = Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y));
  if (!Number.isFinite(distance) || distance > tolerance) return null;

  // On touch, use the contact point, not finger-up. The few pixels of normal
  // release drift are enough to cross a projected rank in the 3D camera.
  return coarsePointer
    ? { x: Number(start.x), y: Number(start.y) }
    : { x: Number(end.x), y: Number(end.y) };
}
