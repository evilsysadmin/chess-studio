export const PAWN_SLUG_ENEMY_HIT_FLASH_META = Object.freeze({
  hotSeconds: 0.025,
  sustained: Object.freeze({ r: 1, g: 0.72, b: 0.72, opacity: 0.78 }),
});

const NEUTRAL_TINT = Object.freeze({
  active: false,
  hot: 0,
  r: 1,
  g: 1,
  b: 1,
  opacity: 1,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugEnemyHitFlash(age = Number.POSITIVE_INFINITY, { hurt = false } = {}) {
  if (!hurt) return NEUTRAL_TINT;

  const seconds = Number(age);
  const hot = Number.isFinite(seconds) && seconds >= 0
    ? 1 - clamp01(seconds / PAWN_SLUG_ENEMY_HIT_FLASH_META.hotSeconds)
    : 0;
  const sustained = PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained;

  return Object.freeze({
    active: true,
    hot,
    r: sustained.r + hot * 0.18,
    g: sustained.g + hot * 0.4,
    b: sustained.b + hot * 0.36,
    opacity: sustained.opacity + hot * (1 - sustained.opacity),
  });
}
