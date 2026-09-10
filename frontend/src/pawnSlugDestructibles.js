export const PAWN_SLUG_DESTRUCTIBLES = Object.freeze([
  Object.freeze({ id: 'forest-field-crate', scenario: 'fallen-forest', x: 16.9, kind: 'ammo-crate', hp: 34, reward: Object.freeze({ credits: 14, ammo: Object.freeze({ machinegun: 18 }) }) }),
  Object.freeze({ id: 'ruins-cracked-rook', scenario: 'gambit-ruins', x: 35.7, kind: 'rook-relief', hp: 58, reward: Object.freeze({ credits: 24 }) }),
  Object.freeze({ id: 'ruins-supply-cache', scenario: 'gambit-ruins', x: 41.4, kind: 'supply-cache', hp: 44, reward: Object.freeze({ grenades: 1, ammo: Object.freeze({ shotgun: 4 }) }) }),
  Object.freeze({ id: 'dungeon-chained-locker', scenario: 'castle-dungeon', x: 50.8, kind: 'chained-locker', hp: 72, reward: Object.freeze({ credits: 36, ammo: Object.freeze({ panzerfaust: 1 }) }) }),
  Object.freeze({ id: 'fortress-officer-cache', scenario: 'fortress-approach', x: 108.8, kind: 'officer-cache', hp: 86, reward: Object.freeze({ credits: 52, grenades: 2 }) }),
]);

export function pawnSlugDestructibleById(id) {
  return PAWN_SLUG_DESTRUCTIBLES.find((entry) => entry.id === id) || null;
}

export function pawnSlugDamageDestructible(entry, damage = 0) {
  if (!entry) return Object.freeze({ destroyed: false, hp: 0, reward: null });
  const remaining = Math.max(0, Number(entry.hp) - Math.max(0, Number(damage) || 0));
  return Object.freeze({ destroyed: remaining <= 0, hp: remaining, reward: remaining <= 0 ? entry.reward : null });
}

export function pawnSlugDestructiblesForScenario(scenario) {
  return Object.freeze(PAWN_SLUG_DESTRUCTIBLES.filter((entry) => entry.scenario === scenario));
}

export const PAWN_SLUG_DESTRUCTIBLE_META = Object.freeze({
  philosophy: 'diegetic-secrets-not-random-loot-boxes',
  deterministic: true,
  rewards: Object.freeze(['credits', 'ammo', 'grenades']),
});
