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
  it('cierra placas y pulgar sobre la empuñadura para que la espada lea como agarrada, no flotando', () => {
    const armor = armorFixture('war-room-teutonic-armor-left');
    const leftHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x < 0);
    const rightHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x > 0);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(6);
    expect(armor.userData.warRoomGauntletArticulation).toBe('parented-finger-plates-grip-v2');
    expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
    expect(armor.userData.warRoomGauntletThumbPlateCount).toBe(2);
    expect(armor.userData.warRoomGauntletGrip).toBe('zweihander-contact-v2');

    const leftPlates = leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-finger-plate');
    expect(leftPlates).toHaveLength(3);
    expect(leftPlates.every((plate) => plate.userData.warRoomArticulation === 'gauntlet-local-v2')).toBe(true);
    expect(leftPlates.every((plate) => plate.userData.warRoomGripContact === 'zweihander-contact-v2')).toBe(true);
    expect(leftPlates[0].position.x).toBeGreaterThan(0.03);
    expect(leftPlates[0].position.z).toBeGreaterThan(0.06);

    const leftThumb = leftHand.getObjectByName('war-room-armor-gauntlet-thumb-plate');
    const rightThumb = rightHand.getObjectByName('war-room-armor-gauntlet-thumb-plate');
    expect(leftThumb).toBeTruthy();
    expect(rightThumb).toBeTruthy();
    expect(leftThumb.userData.warRoomGripContact).toBe('zweihander-contact-v2');

    armor.updateMatrixWorld(true);
    const leftThumbWorld = leftThumb.getWorldPosition(new THREE.Vector3());
    const rightThumbWorld = rightThumb.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(leftThumbWorld.x)).toBeLessThan(0.035);
    expect(Math.abs(rightThumbWorld.x)).toBeLessThan(0.035);
    expect(leftThumbWorld.z).toBeCloseTo(0.445, 3);
    expect(rightThumbWorld.z).toBeCloseTo(0.445, 3);

    const before = new THREE.Vector3();
    leftPlates[0].getWorldPosition(before);
    leftHand.position.y = 1.5;
    armor.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    leftPlates[0].getWorldPosition(after);
    expect(after.y - before.y).toBeCloseTo(0.61, 5);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(0);
    expect(leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-thumb-plate')).toHaveLength(1);
    dispose(armor);
  });

  it('articula las dos armaduras de la sala con una sola llamada de setup', () => {
    const root = new THREE.Group();
    root.add(armorFixture('war-room-teutonic-armor-left'));
    root.add(armorFixture('war-room-teutonic-armor-right'));

    expect(bindWarRoomArmorArticulation(root, 1)).toBe(12);
    expect(root.userData.warRoomArmorArticulation).toBe('gauntlet-zweihander-grip-v2');
    for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
      const armor = root.getObjectByName(name);
      expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
      expect(armor.userData.warRoomGauntletThumbPlateCount).toBe(2);
      expect(armor.userData.warRoomGauntletGrip).toBe('zweihander-contact-v2');
      const loose = armor.children.filter((child) => child.name === 'war-room-armor-gauntlet-finger-plate');
      expect(loose).toHaveLength(0);
      const thumbs = [];
      armor.traverse((child) => {
        if (child.name === 'war-room-armor-gauntlet-thumb-plate') thumbs.push(child);
      });
      expect(thumbs).toHaveLength(2);
    }

    dispose(root);
  });
});
