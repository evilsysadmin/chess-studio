const OFFICER_TYPES = Object.freeze(['pawn', 'knight', 'rook']);

function stableHash(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pawnSlugWantedOfficerFor({ id = '', type = 'pawn' } = {}) {
  if (!OFFICER_TYPES.includes(type)) return null;
  const hash = stableHash(`${id}:${type}:wanted`);
  if (hash % 7 !== 0) return null;
  const rank = 1 + (hash % 3);
  return Object.freeze({
    wanted: true,
    rank,
    insignia: rank === 3 ? 'gold-rook-chevron' : rank === 2 ? 'silver-crossed-pawns' : 'red-knight-tab',
    aggression: 1 + rank * 0.06,
    cadence: 1 - rank * 0.035,
    mobility: 1 + rank * 0.025,
    creditBonus: 18 + rank * 12,
  });
}

export function pawnSlugWantedCreditBonus(officer) {
  return officer?.wanted ? Math.max(0, Math.floor(Number(officer.creditBonus) || 0)) : 0;
}

export function pawnSlugWantedCombatProfile(officer) {
  if (!officer?.wanted) return Object.freeze({ aggression: 1, cadence: 1, mobility: 1 });
  return Object.freeze({
    aggression: Math.max(1, Math.min(PAWN_SLUG_WANTED_META.maxAggressionMultiplier, Number(officer.aggression) || 1)),
    cadence: Math.max(PAWN_SLUG_WANTED_META.minCadenceMultiplier, Math.min(1, Number(officer.cadence) || 1)),
    mobility: Math.max(1, Math.min(PAWN_SLUG_WANTED_META.maxMobilityMultiplier, Number(officer.mobility) || 1)),
  });
}

export const PAWN_SLUG_WANTED_META = Object.freeze({
  frequency: 'rare-deterministic',
  eligibleTypes: OFFICER_TYPES,
  rule: 'behavior-and-bounty-not-hp-sponge',
  maxAggressionMultiplier: 1.18,
  minCadenceMultiplier: 0.895,
  maxMobilityMultiplier: 1.075,
});
