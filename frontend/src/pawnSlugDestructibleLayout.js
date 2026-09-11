const freezeReward = (reward) => Object.freeze({
  ...reward,
  ammo: reward?.ammo ? Object.freeze({ ...reward.ammo }) : undefined,
});

const freeze = (entry) => Object.freeze({ ...entry, reward: freezeReward(entry.reward || {}) });

export const PAWN_SLUG_DESTRUCTIBLE_LAYOUT = Object.freeze([
  freeze({ id: 'forest-cache', scenario: 'fallen-forest', type: 'crate', x: 16.2, reward: { credits: 14 } }),
  freeze({ id: 'forest-barrel', scenario: 'fallen-forest', type: 'barrel', x: 25.2, reward: { grenades: 1 } }),
  freeze({ id: 'ruins-cache', scenario: 'gambit-ruins', type: 'crate', x: 35.7, reward: { ammo: { shotgun: 6 }, credits: 8 } }),
  freeze({ id: 'ruins-barrel', scenario: 'gambit-ruins', type: 'barrel', x: 42.1, reward: { credits: 18 } }),
  freeze({ id: 'dungeon-cache', scenario: 'castle-dungeon', type: 'crate', x: 49.7, reward: { grenades: 2, credits: 10 } }),
  freeze({ id: 'dungeon-barrel', scenario: 'castle-dungeon', type: 'barrel', x: 54.2, reward: { ammo: { machinegun: 22 } } }),
  freeze({ id: 'fortress-cache', scenario: 'fortress-approach', type: 'crate', x: 67.4, reward: { ammo: { machinegun: 30 }, credits: 16 } }),
  freeze({ id: 'fortress-barrel', scenario: 'fortress-approach', type: 'barrel', x: 91.5, reward: { credits: 24 } }),
  freeze({ id: 'last-line-cache', scenario: 'fortress-approach', type: 'crate', x: 103.0, reward: { ammo: { panzerfaust: 1 }, credits: 20 }, secret: true }),
]);

export function pawnSlugDestructiblesAhead(rightEdge, destroyedIds = new Set()) {
  const edge = Number(rightEdge) || 0;
  return PAWN_SLUG_DESTRUCTIBLE_LAYOUT.filter((entry) => entry.x <= edge && !destroyedIds.has(entry.id));
}

export function pawnSlugDestructibleById(id) {
  return PAWN_SLUG_DESTRUCTIBLE_LAYOUT.find((entry) => entry.id === id) || null;
}

export const PAWN_SLUG_DESTRUCTIBLE_LAYOUT_META = Object.freeze({
  placement: 'diegetic-biome-authored',
  rewardRule: 'physical-coherent-one-shot',
  secrets: 'sparse',
});
