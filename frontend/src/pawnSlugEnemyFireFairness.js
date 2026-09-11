export const PAWN_SLUG_ENEMY_FIRE_FAIRNESS = Object.freeze({
  edgePaddingRatio: 0.035,
  entryArmSeconds: 0.22,
});

export function pawnSlugEnemyCombatVisible(enemyX, cameraX, viewWidth) {
  const width = Math.max(1, Number(viewWidth) || 1);
  const half = width * 0.5;
  const padding = width * PAWN_SLUG_ENEMY_FIRE_FAIRNESS.edgePaddingRatio;
  const x = Number(enemyX) || 0;
  const center = Number(cameraX) || 0;
  return x >= center - half + padding && x <= center + half - padding;
}

export function pawnSlugEnemyFireReadiness({
  enemyX,
  cameraX,
  viewWidth,
  wasVisible = false,
  cooldown = 0,
} = {}) {
  const visible = pawnSlugEnemyCombatVisible(enemyX, cameraX, viewWidth);
  if (!visible) return Object.freeze({ visible: false, cooldown: Number(cooldown) || 0, canFire: false });
  const safeCooldown = Number(cooldown) || 0;
  const armedCooldown = wasVisible
    ? safeCooldown
    : Math.max(safeCooldown, PAWN_SLUG_ENEMY_FIRE_FAIRNESS.entryArmSeconds);
  return Object.freeze({ visible: true, cooldown: armedCooldown, canFire: armedCooldown <= 0 });
}
