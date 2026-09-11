import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_DEFAULT_MAP_ID,
  pawnSlugMap,
  pawnSlugMapContentForRange,
  pawnSlugMapDestructibleReward,
  pawnSlugMapDestructiblesForRange,
} from '../pawnSlugMaps.js';

describe('Pawn Slug maps', () => {
  it('owns the mission content instead of scattering coordinates through runtime code', () => {
    const map = pawnSlugMap(PAWN_SLUG_DEFAULT_MAP_ID);
    expect(map).toMatchObject({ id: 'frontline', width: 5200, bossX: 4580, extractionX: 5050 });
    expect(map.pickups).toHaveLength(6);
    expect(map.spawns).toHaveLength(23);
    expect(map.destructibles).toHaveLength(4);
    expect(map.rescues).toEqual([]);
    expect(map.secrets).toEqual([]);
    expect(map.setPieces).toEqual([]);
  });

  it('keeps ids unique for authored map entities', () => {
    const map = pawnSlugMap('frontline');
    for (const kind of ['pickups', 'spawns', 'destructibles']) {
      const ids = map[kind].map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('queries any map-authored content by world range', () => {
    expect(pawnSlugMapContentForRange('frontline', 'spawns', 1500, 2000).map((entry) => entry.type)).toEqual([
      'rook', 'pawn', 'knight',
    ]);
    expect(pawnSlugMapDestructiblesForRange('frontline', 700, 1600).map((entry) => entry.id)).toEqual([
      'crate-intro-1',
      'barrel-trench-1',
    ]);
  });

  it('keeps destructible rewards map-authored and claim-once aware', () => {
    expect(pawnSlugMapDestructibleReward('frontline', 'crate-intro-1', new Set())).toEqual({
      kind: 'ammo', weapon: 'machinegun', amount: 18,
    });
    expect(pawnSlugMapDestructibleReward('frontline', 'crate-intro-1', new Set(['crate-intro-1']))).toBeNull();
  });
});
