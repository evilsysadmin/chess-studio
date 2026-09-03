import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bindArmorGauntletFingerPlates, bindWarRoomArmorArticulation } from './WarRoomArmorArticulation.js';

function addMesh(parent, name, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function armorFixture(name) {
  const armor = new THREE.Group();
  armor.name = name;
  for (const handSide of [-1, 1]) {
    addMesh(armor, 'war-room-armor-gauntlet', [handSide * 0.08, handSide < 0 ? 0.89 : 0.76, 0.39], [1, 0.72, 0.82]);
    const baseY = handSide < 0 ? 0.89 : 0.76;
    for (let finger = 0; finger < 3; finger += 1) {
      addMesh(
        armor,
        'war-room-armor-gauntlet-finger-plate',
        [handSide * (0.075 - finger * 0.007), baseY - 0.03 - finger * 0.018, 0.425 + finger * 0.015],
      );
    }
  }
  return armor;
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

describe('War Room armor articulation', () => {
  it('parenta las placas de dedos al guantelete para que sigan cualquier pose posterior', () => {
    const armor = armorFixture('war-room-teutonic-armor-left');
    const leftHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x < 0);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(6);
    expect(armor.userData.warRoomGauntletArticulation).toBe('parented-finger-plates-v1');
    expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);

    const leftPlates = leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-finger-plate');
    expect(leftPlates).toHaveLength(3);
    expect(leftPlates.every((plate) => plate.userData.warRoomArticulation === 'gauntlet-local-v1')).toBe(true);

    armor.updateMatrixWorld(true);
    const before = new THREE.Vector3();
    leftPlates[0].getWorldPosition(before);
    leftHand.position.y = 1.5;
    armor.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    leftPlates[0].getWorldPosition(after);
    expect(after.y - before.y).toBeCloseTo(0.61, 5);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(0);
    dispose(armor);
  });

  it('articula las dos armaduras de la sala con una sola llamada de setup', () => {
    const root = new THREE.Group();
    root.add(armorFixture('war-room-teutonic-armor-left'));
    root.add(armorFixture('war-room-teutonic-armor-right'));

    expect(bindWarRoomArmorArticulation(root, 1)).toBe(12);
    expect(root.userData.warRoomArmorArticulation).toBe('gauntlet-local-v1');
    for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
      const armor = root.getObjectByName(name);
      expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
      const loose = armor.children.filter((child) => child.name === 'war-room-armor-gauntlet-finger-plate');
      expect(loose).toHaveLength(0);
    }

    dispose(root);
  });
});
