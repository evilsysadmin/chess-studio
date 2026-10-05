import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createChroniclesCaveWallDressing } from './chroniclesOfMatthiasCaveWallArt.js';

describe('Chronicles cave surface dressing', () => {
  it('stays disabled outside cave-water scenes', () => {
    expect(createChroniclesCaveWallDressing({
      sceneStyleId: 'crypt-stone',
      wallCells: new Set(),
    })).toBeNull();
  });

  it('adds an irregular visual floor crust without replacing logical floor targets', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const dressing = createChroniclesCaveWallDressing({
      sceneStyleId: 'cave-water',
      coarsePointer: false,
      wallCells: new Set(['0,0']),
      cellSize: 1,
    });

    expect(dressing?.decorateFloor({
      root,
      material,
      x: 2,
      y: 3,
      world: { x: 2, z: 3 },
    })).toBe(true);

    const surface = root.getObjectByName('chronicles-iso-floor-crust-2-3');
    expect(surface?.isMesh).toBe(true);
    expect(surface.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(surface.geometry.parameters.width).toBeGreaterThan(1);
    expect(surface.geometry.parameters.height).toBeGreaterThan(1);

    root.traverse((node) => node.geometry?.dispose?.());
    material.dispose();
  });
});
