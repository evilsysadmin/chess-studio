export const PAWN_SLUG_PANZER_ROOK_ENTRY = Object.freeze({
  duration: 0.82,
  dropHeight: 0.22,
  squashX: 0.075,
  squashY: 0.11,
  maxTilt: 0.028,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugPanzerRookEntryPose(age = 0, { reducedMotion = false } = {}) {
  if (reducedMotion) {
    return Object.freeze({ active: false, progress: 1, x: 0, y: 0, sx: 1, sy: 1, rz: 0 });
  }

  const progress = clamp01((Number(age) || 0) / PAWN_SLUG_PANZER_ROOK_ENTRY.duration);
  if (progress >= 1) {
    return Object.freeze({ active: false, progress: 1, x: 0, y: 0, sx: 1, sy: 1, rz: 0 });
  }

  const remaining = 1 - progress;
  const impact = Math.sin(progress * Math.PI) * remaining;
  const settle = remaining * remaining;
  return Object.freeze({
    active: true,
    progress,
    x: -0.055 * settle,
    y: PAWN_SLUG_PANZER_ROOK_ENTRY.dropHeight * settle - 0.045 * impact,
    sx: 1 + PAWN_SLUG_PANZER_ROOK_ENTRY.squashX * impact,
    sy: 1 - PAWN_SLUG_PANZER_ROOK_ENTRY.squashY * impact,
    rz: PAWN_SLUG_PANZER_ROOK_ENTRY.maxTilt * Math.sin(progress * Math.PI * 1.35) * remaining,
  });
}
