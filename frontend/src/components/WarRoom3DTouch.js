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

  // On touch, use the contact point, not finger-up. The few pixels of normal
  // release drift are enough to cross a projected rank in the 3D camera.
  return coarsePointer
    ? { x: Number(start.x), y: Number(start.y) }
    : { x: Number(end.x), y: Number(end.y) };
}
