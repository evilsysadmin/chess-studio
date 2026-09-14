export const PAWN_SLUG_ENEMY_READABILITY = Object.freeze({
  renderOrder: 30,
  depthTest: false,
  depthWrite: false,
  prewarmPremiumSources: true,
  reason: 'combat-sprites-must-remain-readable-over-2.5d-scenery',
});

export function applyPawnSlugEnemyReadability(sprite) {
  if (!sprite) return sprite;
  sprite.renderOrder = PAWN_SLUG_ENEMY_READABILITY.renderOrder;
  if (sprite.material) {
    sprite.material.depthTest = PAWN_SLUG_ENEMY_READABILITY.depthTest;
    sprite.material.depthWrite = PAWN_SLUG_ENEMY_READABILITY.depthWrite;
    if (sprite.material.map) sprite.material.visible = true;
    sprite.material.needsUpdate = true;
  }
  sprite.userData ||= {};
  sprite.userData.pawnSlugEnemyReadability = true;
  return sprite;
}
