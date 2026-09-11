const freezeReward = (reward) => Object.freeze({
  ...reward,
  ammo: reward?.ammo ? Object.freeze({ ...reward.ammo }) : undefined,
});

const freeze = (entry) => Object.freeze({ ...entry, reward: freezeReward(entry.reward || {}) });
const freezeScenarioEntries = (scenario, entries) => Object.freeze(entries.map((entry) => freeze({ scenario, ...entry })));

export const PAWN_SLUG_DESTRUCTIBLES_BY_SCENARIO = Object.freeze({
  'fallen-forest': freezeScenarioEntries('fallen-forest', [
    { id: 'forest-cache', type: 'crate', x: 16.2, reward: { credits: 14 } },
    { id: 'forest-barrel', type: 'barrel', x: 25.2, reward: { grenades: 1 } },
  ]),
  'gambit-ruins': freezeScenarioEntries('gambit-ruins', [
    { id: 'ruins-cache', type: 'crate', x: 35.7, reward: { ammo: { shotgun: 6 }, credits: 8 } },
    { id: 'ruins-barrel', type: 'barrel', x: 42.1, reward: { credits: 18 } },
  ]),
  'castle-dungeon': freezeScenarioEntries('castle-dungeon', [
    { id: 'dungeon-cache', type: 'crate', x: 49.7, reward: { grenades: 2, credits: 10 } },
    { id: 'dungeon-barrel', type: 'barrel', x: 54.2, reward: { ammo: { machinegun: 22 } } },
  ]),
  'fortress-approach': freezeScenarioEntries('fortress-approach', [
    { id: 'fortress-cache', type: 'crate', x: 67.4, reward: { ammo: { machinegun: 30 }, credits: 16 } },
    { id: 'fortress-barrel', type: 'barrel', x: 91.5, reward: { credits: 24 } },
    { id: 'last-line-cache', type: 'crate', x: 103.0, reward: { ammo: { panzerfaust: 1 }, credits: 20 }, secret: true },
  ]),
});

export const PAWN_SLUG_DESTRUCTIBLE_LAYOUT = Object.freeze(
  Object.values(PAWN_SLUG_DESTRUCTIBLES_BY_SCENARIO).flat(),
);

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
