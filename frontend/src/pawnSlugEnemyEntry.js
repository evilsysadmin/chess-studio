const REGULAR_SOLDIERS = new Set(['pawn', 'knight', 'rook']);

export const PAWN_SLUG_ENEMY_ENTRY_META = Object.freeze({
  spawnMargin: 1.35,
  combatReadyDepth: 2.1,
  fireGrace: 0.55,
  sprintMultiplierByType: Object.freeze({ pawn: 2.15, knight: 1.95, rook: 1.7 }),
});

export function pawnSlugRegularEnemyType(type) {
  return REGULAR_SOLDIERS.has(String(type || ''));
}

export function pawnSlugEnemyEntrySpawnX(authoredX, cameraX, viewWidth) {
  const authored = Number(authoredX) || 0;
  const camera = Number(cameraX) || 0;
  const width = Math.max(0, Number(viewWidth) || 0);
  const offscreenRight = camera + width * 0.5 + PAWN_SLUG_ENEMY_ENTRY_META.spawnMargin;
  return Math.max(authored, offscreenRight);
}

export function pawnSlugEnemyEntryCombatReady(enemyX, cameraX, viewWidth) {
  const x = Number(enemyX) || 0;
  const camera = Number(cameraX) || 0;
  const width = Math.max(0, Number(viewWidth) || 0);
  const readyLine = camera + width * 0.5 - PAWN_SLUG_ENEMY_ENTRY_META.combatReadyDepth;
  return x <= readyLine;
}

export function pawnSlugEnemyEntrySprintSpeed(type, baseSpeed) {
  const base = Math.max(0, Number(baseSpeed) || 0);
  const multiplier = PAWN_SLUG_ENEMY_ENTRY_META.sprintMultiplierByType[type]
    || PAWN_SLUG_ENEMY_ENTRY_META.sprintMultiplierByType.pawn;
  return base * multiplier;
}
