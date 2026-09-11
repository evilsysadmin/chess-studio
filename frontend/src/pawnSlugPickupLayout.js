const freezePickup = (pickup) => Object.freeze({ ...pickup });

const freezeScenario = (entries) => Object.freeze(entries.map(freezePickup));

export const PAWN_SLUG_PICKUPS_BY_SCENARIO = Object.freeze({
  'fallen-forest': freezeScenario([
    { x: 920, type: 'machinegun' },
  ]),
  'gambit-ruins': freezeScenario([
    { x: 1810, type: 'grenade' },
  ]),
  'castle-dungeon': freezeScenario([
    { x: 2470, type: 'shotgun' },
  ]),
  'fortress-approach': freezeScenario([
    { x: 3300, type: 'medkit' },
    { x: 3500, type: 'panzerfaust' },
    { x: 4310, type: 'grenade' },
  ]),
});

export const PAWN_SLUG_PICKUPS = Object.freeze(
  Object.values(PAWN_SLUG_PICKUPS_BY_SCENARIO).flat(),
);

export function pawnSlugPickupsForScenario(scenario) {
  return PAWN_SLUG_PICKUPS_BY_SCENARIO[scenario] || Object.freeze([]);
}
