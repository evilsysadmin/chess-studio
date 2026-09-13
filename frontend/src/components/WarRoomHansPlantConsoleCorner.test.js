import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ensureWarRoomHansPlant } from './WarRoomHansPlantDecor.js';

function makeRoom({ side = 'right' } = {}) {
  const root = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.5, 12),
    new THREE.MeshBasicMaterial(),
  );
  floor.name = 'war-room-castle-floor-slab';
  floor.position.y = -0.5;
  root.add(floor);

  const consoleGroup = new THREE.Group();
  consoleGroup.name = `war-room-side-console-${side}`;
  consoleGroup.position.set(side === 'right' ? 6.72 : -6.72, 0, side === 'right' ? 2.3 : -2.3);
  root.add(consoleGroup);

  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(side === 'right' ? -4.95 : 4.95, 0, -6.67);
  root.add(fireplace);

  root.updateMatrixWorld(true);
  return { root, consoleGroup };
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

describe('War Room plant console-corner placement', () => {
  it('keeps the canonical right plant tucked under the side console and outside the board footprint', () => {
    const { root, consoleGroup } = makeRoom({ side: 'right' });
    const plant = ensureWarRoomHansPlant(root);

    expect(plant.userData.warRoomPlantPlacement).toBe('under-right-side-console-v14');
    expect(plant.userData.warRoomPlantOcclusionFix).toBe('console-corner-board-clearance-v14');
    expect(plant.userData.warRoomPlantBoardClearance).toBe('outside-table-footprint');
    expect(plant.position.x).toBeCloseTo(6.64, 5);
    expect(plant.position.z).toBeCloseTo(2.46, 5);
    expect(plant.position.x).toBeGreaterThan(6.5);
    expect(Math.abs(plant.position.x)).toBeGreaterThan(Math.abs(consoleGroup.position.x) - 0.15);

    dispose(root);
  });

  it('mirrors the console-corner anchor instead of drifting toward the board', () => {
    const { root } = makeRoom({ side: 'left' });
    const plant = ensureWarRoomHansPlant(root);

    expect(plant.userData.warRoomPlantPlacement).toBe('under-left-side-console-v14');
    expect(plant.position.x).toBeCloseTo(-6.64, 5);
    expect(plant.position.z).toBeCloseTo(-2.46, 5);
    expect(plant.position.x).toBeLessThan(-6.5);

    dispose(root);
  });
});
