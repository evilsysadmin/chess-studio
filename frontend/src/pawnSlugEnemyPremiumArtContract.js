const freeze = (value) => Object.freeze(value);

export const PAWN_SLUG_PREMIUM_ENEMY_TYPES = freeze(['pawn', 'knight', 'rook']);

export const PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT = freeze({
  sourceFacing: 'left',
  runtimeFacings: freeze(['left', 'right']),
  mirrorSafeActions: freeze(['idle', 'run', 'jump', 'crouch', 'hurt', 'climb', 'death']),
  authoredFacingsByAction: freeze({
    attack: freeze(['left', 'right']),
  }),
  asymmetricDetails: freeze(['weapon-hand', 'shield-side', 'cape-flow', 'rim-light']),
  atlasPolicy: 'shared-premium-raster-with-authored-attack-facings',
  fallbackPolicy: 'mirror-left-source-only-when-action-is-mirror-safe',
});

export function pawnSlugEnemyFacingName(dir = 1) {
  return Number(dir) < 0 ? 'left' : 'right';
}

export function pawnSlugEnemyFacingStrategy(action = 'idle') {
  if (PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT.authoredFacingsByAction[action]) return 'authored';
  return 'mirror';
}

export function pawnSlugEnemyFacingWindow(action = 'idle', dir = 1) {
  const facing = pawnSlugEnemyFacingName(dir);
  const strategy = pawnSlugEnemyFacingStrategy(action);
  const sourceFacing = PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT.sourceFacing;

  return freeze({
    action,
    facing,
    strategy,
    sourceFacing,
    mirrored: strategy === 'mirror' && facing !== sourceFacing,
    authored: strategy === 'authored',
  });
}

export function pawnSlugEnemyActionNeedsAuthoredFacing(action = 'idle') {
  return pawnSlugEnemyFacingStrategy(action) === 'authored';
}
