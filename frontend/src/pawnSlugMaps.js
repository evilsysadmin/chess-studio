function freezeEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({
    ...entry,
    reward: entry.reward ? Object.freeze({ ...entry.reward }) : null,
  })));
}

export const PAWN_SLUG_MAPS = Object.freeze({
  frontline: Object.freeze({
    id: 'frontline',
    label: 'Frontline',
    width: 5200,
    bossX: 4580,
    extractionX: 5050,
    destructibles: freezeEntries([
      { id: 'crate-intro-1', type: 'crate', x: 760, y: 0, reward: { kind: 'ammo', weapon: 'machinegun', amount: 18 } },
      { id: 'barrel-trench-1', type: 'barrel', x: 1540, y: 0, reward: null },
      { id: 'crate-rise-1', type: 'crate', x: 2310, y: 0, reward: { kind: 'grenade', amount: 1 } },
      { id: 'barrel-approach-1', type: 'barrel', x: 3370, y: 0, reward: null },
    ]),
  }),
});

export const PAWN_SLUG_DEFAULT_MAP_ID = 'frontline';

export function pawnSlugMap(mapId = PAWN_SLUG_DEFAULT_MAP_ID) {
  return PAWN_SLUG_MAPS[mapId] || PAWN_SLUG_MAPS[PAWN_SLUG_DEFAULT_MAP_ID];
}

export function pawnSlugMapDestructibles(mapId = PAWN_SLUG_DEFAULT_MAP_ID) {
  return pawnSlugMap(mapId).destructibles;
}

export function pawnSlugMapDestructiblesForRange(mapId, minX, maxX) {
  const lo = Math.min(minX, maxX);
  const hi = Math.max(minX, maxX);
  return pawnSlugMapDestructibles(mapId).filter((entry) => entry.x >= lo && entry.x <= hi);
}

export function pawnSlugMapDestructibleReward(mapId, destructibleId, claimedIds) {
  if (claimedIds?.has(destructibleId)) return null;
  const entry = pawnSlugMapDestructibles(mapId).find((item) => item.id === destructibleId);
  return entry?.reward ? { ...entry.reward } : null;
}
