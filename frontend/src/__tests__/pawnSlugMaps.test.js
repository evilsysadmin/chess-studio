import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_DEFAULT_MAP_ID,
  pawnSlugMap,
  pawnSlugMapDestructibleReward,
  pawnSlugMapDestructiblesForRange,
} from '../pawnSlugMaps.js';

describe('Pawn Slug maps', () => {
  it('owns destructible placement inside the map definition', () => {
    const map = pawnSlugMap(PAWN_SLUG_DEFAULT_MAP_ID);
    expect(map.destructibles.map((entry) => entry.id)).toEqual([
      'crate-intro-1',
      'barrel-trench-1',
      'crate-rise-1',
      'barrel-approach-1',
    ]);
    expect(new Set(map.destructibles.map((entry) => entry.id)).size).toBe(map.destructibles.length);
  });

  it('queries destructibles by map and world range', () => {
    expect(pawnSlugMapDestructiblesForRange('frontline', 700, 1600).map((entry) => entry.id)).toEqual([
      'crate-intro-1',
      'barrel-trench-1',
    ]);
  });

  it('keeps rewards map-authored and claim-once aware', () => {
    expect(pawnSlugMapDestructibleReward('frontline', 'crate-intro-1', new Set())).toEqual({
      kind: 'ammo', weapon: 'machinegun', amount: 18,
    });
    expect(pawnSlugMapDestructibleReward('frontline', 'crate-intro-1', new Set(['crate-intro-1']))).toBeNull();
  });
});
