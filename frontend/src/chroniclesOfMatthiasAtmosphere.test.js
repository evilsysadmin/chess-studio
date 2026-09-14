import { describe, expect, it } from 'vitest';
import { buildChroniclesDungeonAtmosphere } from './chroniclesOfMatthiasAtmosphere.js';

describe('Chronicles of Matthias dungeon atmosphere', () => {
  it('keeps the desktop atmosphere richer than the coarse-pointer budget', () => {
    const desktop = buildChroniclesDungeonAtmosphere();
    const coarse = buildChroniclesDungeonAtmosphere({ coarsePointer: true });

    expect(desktop.userData.chroniclesAtmosphereStats).toEqual({ dustCount: 84, mistCount: 3 });
    expect(coarse.userData.chroniclesAtmosphereStats).toEqual({ dustCount: 24, mistCount: 0 });
    expect(desktop.getObjectByName('chronicles-gate-mist')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-gate-mist')).toBeFalsy();
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
