// Region identity belongs to authored world content, not the starting dungeon.
// Legacy maps remain dungeons until they explicitly opt into a new region kind.
export const CHRONICLES_REGION_KINDS = Object.freeze(['settlement', 'wilderness', 'dungeon']);
export const CHRONICLES_CANONICAL_CRYPT_MAP_ID = 'crypt-eight-squares';

export function chroniclesRegionKind(map) {
  const kind = map?.regionKind ?? 'dungeon';
  if (!CHRONICLES_REGION_KINDS.includes(kind)) {
    throw new Error(`Unknown Chronicles region kind: ${String(kind)}`);
  }
  return kind;
}

export function chroniclesRegionSceneMetadata(map) {
  const regionKind = chroniclesRegionKind(map);
  return Object.freeze({
    regionKind,
    isSafeZone: regionKind === 'settlement',
    isDungeon: regionKind === 'dungeon',
  });
}
