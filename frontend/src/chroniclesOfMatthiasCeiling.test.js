import { describe, expect, it } from 'vitest';
import { buildChroniclesDungeonCeiling } from './chroniclesOfMatthiasCeiling.js';

describe('Chronicles of Matthias dungeon ceiling', () => {
  it('covers every walkable cell with physically relieved textured stone', () => {
    const ceiling = buildChroniclesDungeonCeiling();
    const first = ceiling.getObjectByName('chronicles-ceiling-slab-0');

    expect(ceiling.userData.chroniclesCeilingStats.slabCount).toBe(19);
    expect(ceiling.getObjectByName('chronicles-ceiling-slab-18')).toBeTruthy();
    expect(first?.material?.map?.isDataTexture).toBe(true);
    expect(first?.material?.bumpMap?.isDataTexture).toBe(true);
    expect(first?.material?.roughnessMap?.isDataTexture).toBe(true);
    expect(first?.material?.normalMap?.isDataTexture).toBe(true);
    expect(first?.material?.normalMap?.colorSpace).toBe('');
    expect(first?.material?.bumpScale).toBeGreaterThan(0);
    expect(first?.material?.normalScale?.x).toBeGreaterThan(0.4);
    expect(first?.material?.normalScale?.x).toBeLessThan(0.7);
  });

  it('keeps normal relief cheaper on coarse pointers without removing it', () => {
    const desktop = buildChroniclesDungeonCeiling();
    const coarse = buildChroniclesDungeonCeiling({ coarsePointer: true });
    const desktopSlab = desktop.getObjectByName('chronicles-ceiling-slab-0');
    const coarseSlab = coarse.getObjectByName('chronicles-ceiling-slab-0');

    expect(coarseSlab?.material?.normalMap?.isDataTexture).toBe(true);
    expect(coarseSlab?.material?.normalScale?.x).toBeLessThan(desktopSlab?.material?.normalScale?.x || 0);
  });

  it('keeps carved coffers and ceiling bosses as desktop detail only', () => {
    const desktop = buildChroniclesDungeonCeiling();
    const coarse = buildChroniclesDungeonCeiling({ coarsePointer: true });

    expect(desktop.userData.chroniclesCeilingStats.cofferCount).toBe(19);
    expect(desktop.userData.chroniclesCeilingStats.bossCount).toBeGreaterThan(0);
    expect(desktop.getObjectByName('chronicles-ceiling-coffer-0')).toBeTruthy();
    expect(coarse.userData.chroniclesCeilingStats).toEqual({ slabCount: 19, cofferCount: 0, bossCount: 0 });
    expect(coarse.getObjectByName('chronicles-ceiling-coffer-0')).toBeFalsy();
  });
});
