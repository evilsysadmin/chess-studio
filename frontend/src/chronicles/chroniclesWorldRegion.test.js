import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_CANONICAL_CRYPT_MAP_ID,
  chroniclesRegionKind,
  chroniclesRegionSceneMetadata,
} from './chroniclesWorldRegion.js';

describe('Chronicles authored world regions', () => {
  it('preserves dungeon semantics for all legacy maps', () => {
    expect(CHRONICLES_CANONICAL_CRYPT_MAP_ID).toBe('crypt-eight-squares');
    expect(chroniclesRegionKind({ id: 'gallery-of-forks' })).toBe('dungeon');
    expect(chroniclesRegionSceneMetadata({ id: 'gallery-of-forks' })).toEqual({
      regionKind: 'dungeon', isSafeZone: false, isDungeon: true,
    });
  });

  it('distinguishes settlements and wilderness without inventing dungeon depth', () => {
    expect(chroniclesRegionSceneMetadata({ regionKind: 'settlement' })).toEqual({
      regionKind: 'settlement', isSafeZone: true, isDungeon: false,
    });
    expect(chroniclesRegionSceneMetadata({ regionKind: 'wilderness' })).toEqual({
      regionKind: 'wilderness', isSafeZone: false, isDungeon: false,
    });
  });

  it('fails closed on unknown authored region kinds', () => {
    expect(() => chroniclesRegionKind({ regionKind: 'market' })).toThrow(/Unknown Chronicles region kind/);
  });
});
