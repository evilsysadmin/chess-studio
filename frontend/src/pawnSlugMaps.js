function freezeEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({
    ...entry,
    reward: entry.reward ? Object.freeze({ ...entry.reward }) : null,
  })));
}

function spawnEntries(entries) {
  return Object.freeze(entries.map(([x, type], index) => Object.freeze({ id: `${type}-${index}`, x, type })));
}

export const PAWN_SLUG_MAPS = Object.freeze({
  frontline: Object.freeze({
    id: 'frontline',
    label: 'Frontline',
    width: 5200,
    groundY: 420,
    bossX: 4580,
    extractionX: 5050,
    checkpoints: Object.freeze([110, 1480, 2980, 4140]),
    pickups: freezeEntries([
      { id: 'pickup-mg-1', x: 920, type: 'machinegun' },
      { id: 'pickup-grenade-1', x: 1810, type: 'grenade' },
      { id: 'pickup-shotgun-1', x: 2470, type: 'shotgun' },
      { id: 'pickup-medkit-1', x: 3300, type: 'medkit' },
      { id: 'pickup-panzerfaust-1', x: 3500, type: 'panzerfaust' },
      { id: 'pickup-grenade-2', x: 4310, type: 'grenade' },
    ]),
    spawns: spawnEntries([
      [620, 'pawn'], [790, 'pawn'], [1080, 'pawn'], [1210, 'knight'], [1380, 'pawn'],
      [1560, 'rook'], [1710, 'pawn'], [1940, 'knight'], [2110, 'pawn'], [2250, 'pawn'],
      [2380, 'bishop'], [2590, 'rook'], [2730, 'pawn'], [2890, 'knight'], [3070, 'pawn'], [3210, 'pawn'],
      [3430, 'rook'], [3560, 'knight'], [3740, 'bishop'], [3950, 'pawn'], [4070, 'knight'],
      [4190, 'rook'], [4380, 'pawn'],
    ]),
    destructibles: freezeEntries([
      { id: 'crate-intro-1', type: 'crate', x: 760, y: 0, reward: { kind: 'ammo', weapon: 'machinegun', amount: 18 } },
      { id: 'barrel-trench-1', type: 'barrel', x: 1540, y: 0, reward: null },
      { id: 'crate-rise-1', type: 'crate', x: 2310, y: 0, reward: { kind: 'grenade', amount: 1 } },
      { id: 'barrel-approach-1', type: 'barrel', x: 3370, y: 0, reward: null },
    ]),
    rescues: Object.freeze([]),
    secrets: Object.freeze([]),
    setPieces: Object.freeze([]),
  }),
});

export const PAWN_SLUG_DEFAULT_MAP_ID = 'frontline';

export function pawnSlugMap(mapId = PAWN_SLUG_DEFAULT_MAP_ID) {
  return PAWN_SLUG_MAPS[mapId] || PAWN_SLUG_MAPS[PAWN_SLUG_DEFAULT_MAP_ID];
}

export function pawnSlugMapContent(mapId, kind) {
  const value = pawnSlugMap(mapId)?.[kind];
  return Array.isArray(value) ? value : [];
}

export function pawnSlugMapContentForRange(mapId, kind, minX, maxX) {
  const lo = Math.min(minX, maxX);
  const hi = Math.max(minX, maxX);
  return pawnSlugMapContent(mapId, kind).filter((entry) => entry.x >= lo && entry.x <= hi);
}

export function pawnSlugMapDestructibles(mapId = PAWN_SLUG_DEFAULT_MAP_ID) {
  return pawnSlugMapContent(mapId, 'destructibles');
}

export function pawnSlugMapDestructiblesForRange(mapId, minX, maxX) {
  return pawnSlugMapContentForRange(mapId, 'destructibles', minX, maxX);
}

export function pawnSlugMapDestructibleReward(mapId, destructibleId, claimedIds) {
  if (claimedIds?.has(destructibleId)) return null;
  const entry = pawnSlugMapDestructibles(mapId).find((item) => item.id === destructibleId);
  return entry?.reward ? { ...entry.reward } : null;
}
