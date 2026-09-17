import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';
import { chroniclesMapById } from './chronicles/chroniclesMapCatalog.js';
import { buildChroniclesDungeonAtmosphere } from './chroniclesOfMatthiasAtmosphere.js';

describe('Chronicles of Matthias dungeon atmosphere', () => {
  it('keeps the desktop atmosphere richer than the coarse-pointer budget', () => {
    const desktop = buildChroniclesDungeonAtmosphere();
    const coarse = buildChroniclesDungeonAtmosphere({ coarsePointer: true });

    expect(desktop.userData.chroniclesAtmosphereStats).toEqual({ dustCount: 84, mistCount: 3, readabilityLightCount: 8 });
    expect(coarse.userData.chroniclesAtmosphereStats).toEqual({ dustCount: 24, mistCount: 0, readabilityLightCount: 8 });
    expect(desktop.getObjectByName('chronicles-gate-mist')).toBeTruthy();
    expect(desktop.getObjectByName('chronicles-surface-patina')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-surface-patina')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-gate-mist')).toBeFalsy();
  });

  it('shares the active scene topology between ceiling and deterministic dust', () => {
    const scenePlan = chroniclesIsometricScenePlan(chroniclesMapById('gallery-of-forks'));
    const atmosphere = buildChroniclesDungeonAtmosphere({ scenePlan });
    const dustPositions = atmosphere
      .getObjectByName('chronicles-dungeon-dust')
      .geometry
      .getAttribute('position');
    const slabCenters = scenePlan.floors.map((_, index) => {
      const slab = atmosphere.getObjectByName(`chronicles-ceiling-slab-${index}`);
      expect(slab).toBeTruthy();
      return { x: slab.position.x, z: slab.position.z };
    });

    expect(slabCenters).toHaveLength(scenePlan.floors.length);
    for (let index = 0; index < dustPositions.count; index += 1) {
      const x = dustPositions.getX(index);
      const z = dustPositions.getZ(index);
      expect(slabCenters.some((center) => (
        Math.abs(x - center.x) <= 1.53 && Math.abs(z - center.z) <= 1.53
      ))).toBe(true);
    }
  });

  it('adds layered non-shadowing bounce light so authored stone remains readable', () => {
    const desktop = buildChroniclesDungeonAtmosphere();
    const ambient = desktop.getObjectByName('chronicles-readability-ambient');
    const entryBounce = desktop.getObjectByName('chronicles-readability-entry-bounce');
    const cryptBounce = desktop.getObjectByName('chronicles-readability-crypt-bounce');
    const floorBounce = desktop.getObjectByName('chronicles-readability-floor-bounce');
    const corridorFill = desktop.getObjectByName('chronicles-readability-corridor-fill');
    const farFill = desktop.getObjectByName('chronicles-readability-far-fill');

    expect(ambient?.isAmbientLight).toBe(true);
    expect(ambient?.intensity).toBeGreaterThanOrEqual(0.7);
    expect(entryBounce?.isPointLight).toBe(true);
    expect(cryptBounce?.isPointLight).toBe(true);
    expect(floorBounce?.isPointLight).toBe(true);
    expect(corridorFill?.isPointLight).toBe(true);
    expect(farFill?.isPointLight).toBe(true);
    expect(entryBounce?.castShadow).toBe(false);
    expect(cryptBounce?.castShadow).toBe(false);
    expect(floorBounce?.castShadow).toBe(false);
    expect(corridorFill?.castShadow).toBe(false);
    expect(farFill?.castShadow).toBe(false);
    expect(entryBounce?.distance).toBeLessThanOrEqual(14);
    expect(cryptBounce?.distance).toBeLessThanOrEqual(17);
    expect(floorBounce?.position.y).toBeLessThan(0.5);
    expect(floorBounce?.distance).toBeLessThanOrEqual(11);
    expect(floorBounce?.decay).toBeGreaterThan(2);
    expect(corridorFill?.distance).toBeGreaterThanOrEqual(18);
    expect(corridorFill?.decay).toBeLessThan(2);
    expect(farFill?.intensity).toBeLessThan(corridorFill?.intensity);
  });

  it('carries a warm torch with the party camera instead of relying on wall lights', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(67, 1, 0.08, 70);
    camera.position.set(-8, 1.62, 8);
    camera.rotation.y = -Math.PI / 2;
    const atmosphere = buildChroniclesDungeonAtmosphere();
    scene.add(camera, atmosphere);

    const key = atmosphere.getObjectByName('chronicles-party-torch-key');
    const bounce = atmosphere.getObjectByName('chronicles-party-torch-bounce');
    atmosphere.userData.updateChroniclesAtmosphere(1.4);

    expect(key?.isPointLight).toBe(true);
    expect(bounce?.isPointLight).toBe(true);
    expect(key?.castShadow).toBe(false);
    expect(bounce?.castShadow).toBe(false);
    expect(key?.intensity).toBeGreaterThan(4.7);
    expect(key?.distance).toBeGreaterThanOrEqual(12);
    expect(key?.position.distanceTo(camera.position)).toBeLessThan(1.2);
    expect(bounce?.position.y).toBeLessThan(camera.position.y);

    const before = key.position.clone();
    camera.position.set(-4, 1.62, 8);
    camera.rotation.y = 0;
    atmosphere.userData.updateChroniclesAtmosphere(2.1);
    expect(key.position.distanceTo(before)).toBeGreaterThan(3.5);
    expect(key.position.distanceTo(camera.position)).toBeLessThan(1.2);
  });

  it('keeps the carried torch attached when reduced motion disables flicker', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(67, 1, 0.08, 70);
    camera.position.set(0, 1.62, 8);
    const atmosphere = buildChroniclesDungeonAtmosphere({ reducedMotion: true });
    scene.add(camera, atmosphere);
    const key = atmosphere.getObjectByName('chronicles-party-torch-key');

    atmosphere.userData.updateChroniclesAtmosphere(1);
    const intensity = key.intensity;
    camera.position.z = 4;
    atmosphere.userData.updateChroniclesAtmosphere(9);

    expect(key.intensity).toBe(intensity);
    expect(key.position.distanceTo(camera.position)).toBeLessThan(1.2);
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
