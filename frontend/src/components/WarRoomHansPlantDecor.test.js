import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_WINDOW_CORNER_POSE_VERSION,
  ensureWarRoomHansPlant,
} from './WarRoomHansPlantDecor.js';

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

function addFloor(root) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.5, 12),
    new THREE.MeshBasicMaterial(),
  );
  floor.name = 'war-room-castle-floor-slab';
  floor.position.y = -0.5;
  root.add(floor);
  return floor;
}

function addPainting(root, side, z) {
  const painting = new THREE.Group();
  painting.name = `war-room-campaign-painting-${side}`;
  painting.position.set(side === 'left' ? -7.66 : 7.66, 3.28, z);
  root.add(painting);
  return painting;
}

function addWeatherWindow(root, anchorX, anchorZ, side = 'right') {
  const window = new THREE.Group();
  window.name = 'war-room-weather-window';
  window.userData.side = side;
  window.userData.warRoomPlantAnchor = { x: anchorX, z: anchorZ };
  window.position.x = side === 'left' ? -6.96 : 6.96;

  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(1.66, 4.33, 0.28),
    new THREE.MeshBasicMaterial(),
  );
  opening.position.set(0, 3.46, side === 'left' ? 6.42 : -6.42);
  window.add(opening);
  root.add(window);
  return window;
}

describe('War Room Hans plant placement', () => {
  it('corners the canonical weather window and keeps the plant beside it', () => {
    const root = new THREE.Group();
    addFloor(root);
    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(-4.95, 0, -6.67);
    root.add(fireplace);
    addPainting(root, 'right', 1.9);
    const window = addWeatherWindow(root, 6.84, -5.52);
    root.updateMatrixWorld(true);

    const plant = ensureWarRoomHansPlant(root);
    expect(window.userData.warRoomCornerPose).toBe(WAR_ROOM_WINDOW_CORNER_POSE_VERSION);
    expect(THREE.MathUtils.radToDeg(window.rotation.y)).toBeCloseTo(-26, 5);
    expect(window.scale.x).toBeCloseTo(1.28, 5);
    expect(root.userData.warRoomCanonicalComposition).toBe('hearth-left-gallery-right-corner-window-plant-v6');

    root.updateMatrixWorld(true);
    const windowBounds = new THREE.Box3().setFromObject(window);
    expect(windowBounds.max.x).toBeLessThan(8.0);
    expect(windowBounds.min.x).toBeGreaterThan(5.7);

    expect(plant.userData.warRoomPlantSide).toBe('right');
    expect(plant.userData.warRoomPlantHearthRelation).toBe('opposite');
    expect(plant.userData.warRoomPlantPlacement).toBe('beside-right-weather-window-v6');
    expect(plant.userData.warRoomPlantLightRelation).toBe('window-daylight');
    expect(plant.position.x).toBeCloseTo(6.84, 5);
    expect(plant.position.z).toBeCloseTo(-5.52, 5);

    const firstPosition = window.position.clone();
    expect(ensureWarRoomHansPlant(root)).toBe(plant);
    expect(window.position.distanceTo(firstPosition)).toBeCloseTo(0, 8);

    dispose(root);
  });

  it('mirrors the corner pose with board orientation', () => {
    const root = new THREE.Group();
    addFloor(root);
    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(4.95, 0, 6.67);
    root.add(fireplace);
    const window = addWeatherWindow(root, -6.84, 5.52, 'left');
    root.updateMatrixWorld(true);

    const plant = ensureWarRoomHansPlant(root);
    expect(THREE.MathUtils.radToDeg(window.rotation.y)).toBeCloseTo(26, 5);
    expect(window.scale.x).toBeCloseTo(1.28, 5);
    expect(plant.userData.warRoomPlantSide).toBe('left');
    expect(plant.position.x).toBeCloseTo(-6.84, 5);
    expect(plant.position.z).toBeCloseTo(5.52, 5);

    dispose(root);
  });

  it('realigns the existing plant when its gallery painting arrives after fallback placement', () => {
    const root = new THREE.Group();
    root.position.set(3.5, 0, -1.75);
    root.rotation.y = Math.PI / 9;
    addFloor(root);
    root.updateMatrixWorld(true);

    const plant = ensureWarRoomHansPlant(root);
    const fallbackZ = plant.position.z;
    expect(plant.userData.warRoomPlantPlacement).toBe('gallery-aligned-right-fallback-v3-opposite-hearth');
    expect(plant.userData.warRoomPlantSide).toBe('right');
    expect(plant.position.x).toBeGreaterThan(0);

    const painting = addPainting(root, 'right', 2.75);
    root.updateMatrixWorld(true);

    const realigned = ensureWarRoomHansPlant(root);
    expect(realigned).toBe(plant);
    expect(plant.userData.warRoomPlantPlacement).toBe('under-right-gallery-painting-v3-opposite-hearth');
    expect(plant.position.z).toBeCloseTo(painting.position.z, 5);
    expect(plant.position.z).not.toBeCloseTo(fallbackZ, 3);

    painting.position.z = -0.8;
    root.updateMatrixWorld(true);
    expect(ensureWarRoomHansPlant(root)).toBe(plant);
    expect(plant.position.z).toBeCloseTo(-0.8, 5);

    dispose(root);
  });

  it('keeps the plant opposite the mirrored fireplace so Hans service route cannot cross it without a window anchor', () => {
    const root = new THREE.Group();
    addFloor(root);
    const leftPainting = addPainting(root, 'left', 1.15);
    const rightPainting = addPainting(root, 'right', 2.45);
    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(4.95, 0, -7.1);
    root.add(fireplace);
    root.updateMatrixWorld(true);

    const plant = ensureWarRoomHansPlant(root);
    expect(plant.userData.warRoomPlantSide).toBe('left');
    expect(plant.userData.warRoomPlantHearthRelation).toBe('opposite');
    expect(plant.position.x).toBeLessThan(0);
    expect(plant.position.z).toBeCloseTo(leftPainting.position.z, 5);

    fireplace.position.x = -4.95;
    root.updateMatrixWorld(true);
    expect(ensureWarRoomHansPlant(root)).toBe(plant);
    expect(plant.userData.warRoomPlantSide).toBe('right');
    expect(plant.position.x).toBeGreaterThan(0);
    expect(plant.position.z).toBeCloseTo(rightPainting.position.z, 5);

    dispose(root);
  });
});
