import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ensureWarRoomCat, WAR_ROOM_CAT_VERSION } from './WarRoomCatDecor.js';

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

function addFloor(root) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 12), new THREE.MeshBasicMaterial());
  floor.name = 'war-room-castle-floor-slab';
  floor.position.y = -0.5;
  root.add(floor);
  return floor;
}

function addSofa(root, side) {
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 1.25), new THREE.MeshBasicMaterial());
  sofa.name = `war-room-sofa-${side}`;
  sofa.position.set(side === 'left' ? -6.2 : 6.2, 0.1, 3.8);
  root.add(sofa);
  return sofa;
}

describe('War Room cat decor', () => {
  it('sleeps on the sofa opposite the canonical plant so ambient props do not stack', () => {
    const root = new THREE.Group();
    addFloor(root);
    const left = addSofa(root, 'left');
    addSofa(root, 'right');
    const plant = new THREE.Group();
    plant.name = 'war-room-hans-plant';
    plant.userData.warRoomPlantSide = 'right';
    root.add(plant);
    root.updateMatrixWorld(true);

    const cat = ensureWarRoomCat(root);
    expect(cat.name).toBe('war-room-cat');
    expect(cat.userData.warRoomDecor).toBe(WAR_ROOM_CAT_VERSION);
    expect(cat.userData.warRoomCatState).toBe('sleeping');
    expect(cat.userData.warRoomCatPlacement).toBe('left-sofa-sleeper-v1');
    expect(cat.userData.warRoomCatSofaSide).toBe('left');
    expect(cat.position.x).toBeLessThan(0);
    expect(cat.position.y).toBeGreaterThan(left.position.y);
    expect(root.userData.warRoomCat).toBe(WAR_ROOM_CAT_VERSION);

    dispose(root);
  });

  it('is idempotent and keeps a single low-key cat actor in the room', () => {
    const root = new THREE.Group();
    addFloor(root);
    addSofa(root, 'right');
    root.updateMatrixWorld(true);

    const first = ensureWarRoomCat(root);
    const second = ensureWarRoomCat(root);
    expect(second).toBe(first);
    expect(root.getObjectsByProperty('name', 'war-room-cat')).toHaveLength(1);
    expect(first.getObjectByName('war-room-cat-body')).toBeTruthy();
    expect(first.getObjectByName('war-room-cat-tail')).toBeTruthy();

    dispose(root);
  });

  it('falls back to a quiet floor corner when sofas are not available yet', () => {
    const root = new THREE.Group();
    const floor = addFloor(root);
    root.updateMatrixWorld(true);

    const cat = ensureWarRoomCat(root);
    expect(cat.userData.warRoomCatPlacement).toBe('floor-corner-fallback-v1');
    expect(cat.position.y).toBeGreaterThan(floor.position.y);
    expect(cat.scale.x).toBeCloseTo(0.88, 5);

    dispose(root);
  });
});
