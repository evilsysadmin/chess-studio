const RAW_DESTRUCTIBLES = Object.freeze([
  Object.freeze({ id: 'crate-intro-1', type: 'crate', x: 760, y: 0, reward: Object.freeze({ kind: 'ammo', weapon: 'machinegun', amount: 18 }) }),
  Object.freeze({ id: 'barrel-trench-1', type: 'barrel', x: 1540, y: 0, reward: null }),
  Object.freeze({ id: 'crate-rise-1', type: 'crate', x: 2310, y: 0, reward: Object.freeze({ kind: 'grenade', amount: 1 }) }),
  Object.freeze({ id: 'barrel-approach-1', type: 'barrel', x: 3370, y: 0, reward: null }),
]);

export const PAWN_SLUG_DESTRUCTIBLE_PLAN = RAW_DESTRUCTIBLES;

export function pawnSlugDestructiblesForRange(minX, maxX) {
  const lo = Math.min(minX, maxX);
  const hi = Math.max(minX, maxX);
  return RAW_DESTRUCTIBLES.filter((entry) => entry.x >= lo && entry.x <= hi);
}

export function pawnSlugDestructibleReward(entry, claimedIds) {
  if (!entry?.reward || claimedIds?.has(entry.id)) return null;
  return { ...entry.reward };
}

export function pawnSlugClaimDestructibleId(claimedIds, id) {
  if (!claimedIds || !id) return false;
  if (claimedIds.has(id)) return false;
  claimedIds.add(id);
  return true;
}
