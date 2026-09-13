import { describe, expect, it } from 'vitest';
import { lockWarRoomCanonicalPlantPlacement } from './WarRoomPlantCanonicalPlacement.js';

describe('canonical plant placement smoke', () => {
  it('is a no-op without scene objects', () => {
    expect(lockWarRoomCanonicalPlantPlacement({ getObjectByName: () => null, userData: {} })).toBe(0);
  });
});
