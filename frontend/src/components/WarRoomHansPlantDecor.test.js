import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ensureWarRoomHansPlant } from './WarRoomHansPlantDecor.js';

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

describe('War Room Hans plant placement', () => {
  it('realigns the existing plant when the right gallery painting arrives after fallback placement', () => {
    const root = new THREE.Group();
    root.position.set(3.5, 0, -1.75);
    root.rotation.y = Math.PI / 9;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.5, 12),
      new THREE.MeshBasicMaterial(),
    );
    floor.name = 'war-room-castle-floor-slab';
    floor.position.y = -0.5;
    root.add(floor);
    root.updateMatrixWorld(true);

    const plant = ensureWarRoomHansPlant(root);
    const fallbackZ = plant.position.z;
    expect(plant.userData.warRoomPlantPlacement).toBe('gallery-aligned-fallback-v2');
    expect(plant.position.x).toBeGreaterThan(0);

    const painting = new THREE.Group();
    painting.name = 'war-room-campaign-painting-right';
    painting.position.set(7.66, 3.28, 2.75);
    root.add(painting);
    root.updateMatrixWorld(true);

    const realigned = ensureWarRoomHansPlant(root);
    expect(realigned).toBe(plant);
    expect(plant.userData.warRoomPlantPlacement).toBe('under-right-gallery-painting-v2');
    expect(plant.position.z).toBeCloseTo(painting.position.z, 5);
    expect(plant.position.z).not.toBeCloseTo(fallbackZ, 3);

    painting.position.z = -0.8;
    root.updateMatrixWorld(true);
    expect(ensureWarRoomHansPlant(root)).toBe(plant);
    expect(plant.position.z).toBeCloseTo(-0.8, 5);

    dispose(root);
  });
});
