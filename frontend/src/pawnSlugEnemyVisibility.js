const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const PAWN_SLUG_ENEMY_VISIBILITY = Object.freeze({
  fireInsetRatio: 0.03,
});

export function pawnSlugEnemyVisibleForFire(
  enemyX,
  cameraX,
  cameraLeft,
  cameraRight,
  insetRatio = PAWN_SLUG_ENEMY_VISIBILITY.fireInsetRatio,
) {
  const x = Number(enemyX);
  const center = Number(cameraX);
  const left = Number(cameraLeft);
  const right = Number(cameraRight);
  if (![x, center, left, right].every(Number.isFinite) || right <= left) return false;

  const width = right - left;
  const inset = width * clamp(Number(insetRatio) || 0, 0, 0.2);
  const visibleLeft = center + left + inset;
  const visibleRight = center + right - inset;
  return x >= visibleLeft && x <= visibleRight;
}
