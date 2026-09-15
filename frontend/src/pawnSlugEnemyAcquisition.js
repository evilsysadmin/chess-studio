export function pawnSlugEnemyAcquisitionStep({
  acquired = false,
  canEngage = false,
  fireCooldown = 0,
} = {}) {
  const alreadyAcquired = Boolean(acquired);
  const visible = Boolean(canEngage);
  const acquiredNow = visible && !alreadyAcquired;
  const numericCooldown = Number(fireCooldown);
  return Object.freeze({
    acquired: alreadyAcquired || visible,
    acquiredNow,
    fireCooldown: acquiredNow ? 0 : (Number.isFinite(numericCooldown) ? numericCooldown : 0),
  });
}

export const PAWN_SLUG_ENEMY_ACQUISITION_META = Object.freeze({
  firstSightCancelsSpawnDelay: true,
  reacquireAfterFirstSight: false,
  dangerousWeaponsKeepPrefireTelegraph: true,
});
