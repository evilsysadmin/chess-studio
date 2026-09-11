function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - ((1 - t) ** 3);
}

const IDENTITY = Object.freeze({ x: 0, y: 0, rz: 0, sx: 1, sy: 1, active: false });
const ENTRY_MOTION_SECONDS = 0.48;

export const PAWN_SLUG_ENEMY_ENTRY_STAGGER = Object.freeze({
  pawn: 0,
  knight: 0.055,
  rook: 0.095,
});

export const PAWN_SLUG_ENEMY_ENTRY_DURATION = ENTRY_MOTION_SECONDS + PAWN_SLUG_ENEMY_ENTRY_STAGGER.rook;

export function pawnSlugEnemyEntryPose(type = 'pawn', age = 0, { reducedMotion = false, enabled = true } = {}) {
  if (!enabled || reducedMotion) return IDENTITY;
  const safeAge = Math.max(0, Number(age) || 0);
  if (safeAge >= PAWN_SLUG_ENEMY_ENTRY_DURATION) return IDENTITY;

  const delay = PAWN_SLUG_ENEMY_ENTRY_STAGGER[type] ?? PAWN_SLUG_ENEMY_ENTRY_STAGGER.pawn;
  const localAge = Math.max(0, safeAge - delay);
  const progress = easeOutCubic(localAge / ENTRY_MOTION_SECONDS);
  const remaining = 1 - progress;

  if (type === 'knight') {
    return Object.freeze({
      x: 0.18 * remaining,
      y: 0.72 * remaining,
      rz: -0.085 * remaining,
      sx: 1 + 0.035 * remaining,
      sy: 0.9 + 0.1 * progress,
      active: true,
    });
  }

  if (type === 'rook') {
    return Object.freeze({
      x: 0.08 * remaining,
      y: 0.24 * remaining,
      rz: -0.025 * remaining,
      sx: 1.08 - 0.08 * progress,
      sy: 0.84 + 0.16 * progress,
      active: true,
    });
  }

  return Object.freeze({
    x: 0.52 * remaining,
    y: 0.035 * Math.sin(progress * Math.PI),
    rz: -0.055 * remaining,
    sx: 1.04 - 0.04 * progress,
    sy: 0.96 + 0.04 * progress,
    active: true,
  });
}

export const PAWN_SLUG_ENEMY_ENTRY_META = Object.freeze({
  duration: PAWN_SLUG_ENEMY_ENTRY_DURATION,
  motionSeconds: ENTRY_MOTION_SECONDS,
  staggerByType: PAWN_SLUG_ENEMY_ENTRY_STAGGER,
  pawn: 'short-rush-in',
  knight: 'drop-and-settle',
  rook: 'heavy-settle',
  addsPopulation: false,
  touchesAi: false,
  reducedMotion: 'identity-pose',
});