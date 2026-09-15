import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WAR_ROOM_CAT_VERSION } from './WarRoomCatDecor.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

function sofa(name, x) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.85, 1.25),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = name;
  mesh.position.set(x, 0.1, 3.8);
  return mesh;
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

describe('War Room cat deferred ownership', () => {
  it.each([false, true])('installs the permanent cat after the complete room exists (coarse=%s)', (coarsePointer) => {
    const scene = new THREE.Scene();
    const architecture = new THREE.Group();
    architecture.name = 'war-room-castle-architecture';

    const driver = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    driver.name = 'war-room-castle-wall-left';
    architecture.add(driver);
    scene.add(architecture);

    const left = sofa('war-room-sofa-left', -6.2);
    const right = sofa('war-room-sofa-right', 6.2);
    scene.add(left, right);

    const plant = new THREE.Group();
    plant.name = 'war-room-hans-plant';
    plant.userData.warRoomPlantSide = 'right';
    scene.add(plant);
    scene.updateMatrixWorld(true);

    expect(registerWarRoomDeferredFinalizer(architecture, {
      key: 'premium-room-pass-v4',
      coarsePointer,
      allowCoarse: true,
      run: () => 1,
    })).toBe(1);

    expect(scene.getObjectByName('war-room-cat')).toBeFalsy();
    driver.onBeforeRender();

    const cat = scene.getObjectByName('war-room-cat');
    expect(cat).toBeTruthy();
    expect(cat.userData.warRoomDecor).toBe(WAR_ROOM_CAT_VERSION);
    expect(cat.userData.warRoomCatPlacement).toBe('left-sofa-sleeper-v1');
    expect(cat.userData.warRoomCatSofaSide).toBe('left');
    expect(cat.parent).toBe(left);
    expect(scene.getObjectsByProperty('name', 'war-room-cat')).toHaveLength(1);

    dispose(scene);
  });
});
