import { describe, expect, it } from 'vitest';
import { buildChroniclesDungeonAtmosphere } from './chroniclesOfMatthiasAtmosphere.js';

describe('Chronicles of Matthias dungeon atmosphere', () => {
  it('keeps the desktop atmosphere richer than the coarse-pointer budget', () => {
    const desktop = buildChroniclesDungeonAtmosphere();
    const coarse = buildChroniclesDungeonAtmosphere({ coarsePointer: true });

    expect(desktop.userData.chroniclesAtmosphereStats).toEqual({ dustCount: 84, mistCount: 3, readabilityLightCount: 3 });
    expect(coarse.userData.chroniclesAtmosphereStats).toEqual({ dustCount: 24, mistCount: 0, readabilityLightCount: 3 });
    expect(desktop.getObjectByName('chronicles-gate-mist')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-gate-mist')).toBeFalsy();
  });

  it('adds restrained non-shadowing bounce light so authored stone remains readable', () => {
    const desktop = buildChroniclesDungeonAtmosphere();
    const ambient = desktop.getObjectByName('chronicles-readability-ambient');
    const entryBounce = desktop.getObjectByName('chronicles-readability-entry-bounce');
    const cryptBounce = desktop.getObjectByName('chronicles-readability-crypt-bounce');

    expect(ambient?.isAmbientLight).toBe(true);
    expect(ambient?.intensity).toBeGreaterThanOrEqual(0.2);
    expect(entryBounce?.isPointLight).toBe(true);
    expect(cryptBounce?.isPointLight).toBe(true);
    expect(entryBounce?.castShadow).toBe(false);
    expect(cryptBounce?.castShadow).toBe(false);
    expect(entryBounce?.distance).toBeLessThanOrEqual(13);
    expect(cryptBounce?.distance).toBeLessThanOrEqual(16);
  });

  it('generates deterministic dust only across the authored dungeon volume', () => {
    const first = buildChroniclesDungeonAtmosphere();
    const second = buildChroniclesDungeonAtmosphere();
    const firstPositions = first.getObjectByName('chronicles-dungeon-dust').geometry.getAttribute('position');
    const secondPositions = second.getObjectByName('chronicles-dungeon-dust').geometry.getAttribute('position');

    expect(firstPositions.count).toBe(84);
    expect([...firstPositions.array.slice(0, 18)]).toEqual([...secondPositions.array.slice(0, 18)]);
    for (let index = 0; index < firstPositions.count; index += 1) {
      expect(firstPositions.getY(index)).toBeGreaterThan(0.3);
      expect(firstPositions.getY(index)).toBeLessThan(3.2);
    }
  });

  it('animates dust subtly but stays static when reduced motion is requested', () => {
    const animated = buildChroniclesDungeonAtmosphere();
    const still = buildChroniclesDungeonAtmosphere({ reducedMotion: true });
    const animatedPosition = animated.getObjectByName('chronicles-dungeon-dust').geometry.getAttribute('position');
    const stillPosition = still.getObjectByName('chronicles-dungeon-dust').geometry.getAttribute('position');
    const animatedBefore = animatedPosition.getY(0);
    const stillBefore = stillPosition.getY(0);

    animated.userData.updateChroniclesAtmosphere(4.2);
    still.userData.updateChroniclesAtmosphere(4.2);

    expect(animatedPosition.getY(0)).not.toBe(animatedBefore);
    expect(stillPosition.getY(0)).toBe(stillBefore);
  });
});
