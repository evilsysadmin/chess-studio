export const PAWN_SLUG_RUNTIME_HOT_PATH = 'scalar-collision-index-loops-v1';

export function pawnSlugRectsOverlap(
  ax,
  ay,
  aw,
  ah,
  bx,
  by,
  bw,
  bh,
) {
  return ax < bx + bw
    && ax + aw > bx
    && ay < by + bh
    && ay + ah > by;
}

export function pawnSlugFirstHitEnemyIndex(
  enemies,
  bulletLeft,
  bulletTop,
  bulletWidth,
  bulletHeight,
) {
  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    if (!enemy || enemy.dead) continue;
    if (pawnSlugRectsOverlap(
      bulletLeft,
      bulletTop,
      bulletWidth,
      bulletHeight,
      enemy.x - enemy.w / 2,
      enemy.y,
      enemy.w,
      enemy.h,
    )) return index;
  }
  return -1;
}
