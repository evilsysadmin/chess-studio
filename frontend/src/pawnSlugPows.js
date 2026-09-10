const freeze = (value) => Object.freeze(value);

export const PAWN_SLUG_POWS = freeze([
  freeze({ id: 'pow-forest-scout', scenario: 'fallen-forest', x: 19.6, pose: 'kneeling', reward: freeze({ credits: 18, ammo: freeze({ machinegun: 24 }) }) }),
  freeze({ id: 'pow-ruins-engineer', scenario: 'gambit-ruins', x: 38.8, pose: 'bound', reward: freeze({ grenades: 2, credits: 12 }) }),
  freeze({ id: 'pow-dungeon-quartermaster', scenario: 'castle-dungeon', x: 52.4, pose: 'caged', reward: freeze({ ammo: freeze({ shotgun: 8 }), credits: 28 }) }),
  freeze({ id: 'pow-fortress-artilleryman', scenario: 'fortress-approach', x: 109.9, pose: 'bound', reward: freeze({ ammo: freeze({ panzerfaust: 2 }), credits: 42 }) }),
]);

export function pawnSlugPowById(id) {
  return PAWN_SLUG_POWS.find((pow) => pow.id === id) || null;
}

export function pawnSlugPowsForScenario(scenario) {
  return freeze(PAWN_SLUG_POWS.filter((pow) => pow.scenario === scenario));
}

export function pawnSlugCanRescuePow(pow, rescuedIds = new Set()) {
  return Boolean(pow?.id && !rescuedIds.has(pow.id));
}

export function pawnSlugRescuePow(pow, rescuedIds = new Set()) {
  if (!pawnSlugCanRescuePow(pow, rescuedIds)) return freeze({ ok: false, reward: null, rescuedId: null });
  return freeze({ ok: true, reward: pow.reward, rescuedId: pow.id });
}

export function pawnSlugPowMissionBonus(rescuedCount = 0) {
  const count = Math.max(0, Math.floor(Number(rescuedCount) || 0));
  return count * 350 + (count >= PAWN_SLUG_POWS.length ? 1200 : 0);
}

export const PAWN_SLUG_POW_META = freeze({
  rescueMode: 'contact-one-shot',
  total: PAWN_SLUG_POWS.length,
  hiddenBehindDestructiblesAllowed: true,
  rewardKinds: freeze(['credits', 'ammo', 'grenades']),
  allRescuedBonus: 1200,
});
