export const PAWN_SLUG_DESTRUCTIBLE_TYPES = Object.freeze({
  crate: Object.freeze({ hp: 45, material: 'wood', explosive: false, score: 60 }),
  barrel: Object.freeze({ hp: 30, material: 'metal', explosive: true, blastRadius: 2.4, blastDamage: 72, score: 90 }),
});

export function pawnSlugCreateDestructibleState(type, overrides = {}) {
  const spec = PAWN_SLUG_DESTRUCTIBLE_TYPES[type];
  if (!spec) throw new Error(`Unknown Pawn Slug destructible type: ${type}`);
  return {
    type,
    hp: spec.hp,
    destroyed: false,
    rewardClaimed: false,
    ...overrides,
  };
}

export function pawnSlugDamageDestructible(prop, amount) {
  if (!prop || prop.destroyed || !(amount > 0)) {
    return { destroyedNow: false, explosion: null, score: 0 };
  }
  const spec = PAWN_SLUG_DESTRUCTIBLE_TYPES[prop.type];
  if (!spec) throw new Error(`Unknown Pawn Slug destructible type: ${prop.type}`);
  prop.hp = Math.max(0, prop.hp - amount);
  if (prop.hp > 0) return { destroyedNow: false, explosion: null, score: 0 };
  prop.destroyed = true;
  return {
    destroyedNow: true,
    explosion: spec.explosive
      ? { radius: spec.blastRadius, damage: spec.blastDamage }
      : null,
    score: spec.score,
  };
}

export function pawnSlugClaimDestructibleReward(prop, reward) {
  if (!prop?.destroyed || prop.rewardClaimed || !reward) return null;
  prop.rewardClaimed = true;
  return { ...reward };
}
