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

export function resolveBoardTap(start, end, { coarsePointer = false } = {}) {
  if (!start || !end || start.id !== end.id) return null;
  const tolerance = coarsePointer ? 18 : 8;
  const distance = Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y));
  if (!Number.isFinite(distance) || distance > tolerance) return null;

  // A click or tap belongs to the square under initial contact. Small release
  // drift can cross a projected tile edge (especially with perspective) and
  // trigger a different move. Larger drags are already rejected above.
  return { x: Number(start.x), y: Number(start.y) };
}


export function selectBoardSquareOnTouch({
  event,
  canvas,
  squareFromPointer,
  setFocusedSquare,
  onSquareClick,
}) {
  if (canvas?.dataset?.warRoomPinching === 'true') return false;
  const square = squareFromPointer(event);
  if (canvas?.dataset) canvas.dataset.warRoomLastSquare = square || '';
  if (!square) return false;
  setFocusedSquare(square);
  onSquareClick?.(square);
  return true;
}
