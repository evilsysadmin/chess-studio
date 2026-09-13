import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  bindArmorGauntletFingerPlates,
  bindWarRoomArmorArticulation,
  closeArmorGauntletsOnHilt,
} from './WarRoomArmorArticulation.js';

function addMesh(parent, name, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addSword(armor) {
  const sword = new THREE.Group();
  sword.name = 'war-room-zweihander';
  sword.position.set(0, 0.7, 0.44);
  addMesh(sword, 'war-room-zweihander-grip', [0, 0.63, 0], [0.9, 4.7, 0.75]);
  armor.add(sword);
  return sword;
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
  addSword(armor);
  return armor;
}

function dispose(root) {
  const disposedMaterials = new Set();
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material || disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      material.dispose?.();
    });
  });
}

describe('War Room armor articulation', () => {
  it('keeps the visible clamp around the hilt and then closes the gauntlet bodies onto it', () => {
    const armor = armorFixture('war-room-teutonic-armor-left');
    const leftHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x < 0);
    const rightHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x > 0);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(6);
    expect(armor.userData.warRoomGauntletArticulation).toBe('parented-finger-plates-grip-v5');
    expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
    expect(armor.userData.warRoomGauntletThumbPlateCount).toBe(2);
    expect(armor.userData.warRoomGauntletGripBandCount).toBe(6);
    expect(armor.userData.warRoomGauntletGripPalmCount).toBe(2);
    expect(armor.userData.warRoomGauntletGrip).toBe('zweihander-body-clamp-v5');

    const leftBands = leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-band');
    const rightBands = rightHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-band');
    expect(leftBands).toHaveLength(3);
    expect(rightBands).toHaveLength(3);
    expect(leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-finger')).toHaveLength(0);
    expect(rightHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-finger')).toHaveLength(0);

    armor.updateMatrixWorld(true);
    for (const band of [...leftBands, ...rightBands]) {
      const center = band.getWorldPosition(new THREE.Vector3());
      const bounds = new THREE.Box3().setFromObject(band);
      expect(Math.abs(center.x)).toBeLessThan(0.002);
      expect(center.z).toBeCloseTo(0.44, 3);
      expect(bounds.min.x).toBeLessThan(-0.04);
      expect(bounds.max.x).toBeGreaterThan(0.04);
      expect(bounds.min.z).toBeLessThan(0.41);
      expect(bounds.max.z).toBeGreaterThan(0.47);
      expect(band.material.userData.warRoomGauntletGripAccent).toBe('visible-steel-v5');
      expect(band.userData.warRoomGripContact).toBe('zweihander-body-clamp-v5');
    }

    expect(closeArmorGauntletsOnHilt(armor, 1)).toBe(2);
    armor.updateMatrixWorld(true);
    const grip = armor.getObjectByName('war-room-zweihander-grip');
    const gripCenter = grip.getWorldPosition(new THREE.Vector3());

    for (const hand of [leftHand, rightHand]) {
      const handCenter = hand.getWorldPosition(new THREE.Vector3());
      const xzDistance = Math.hypot(handCenter.x - gripCenter.x, handCenter.z - gripCenter.z);
      expect(xzDistance).toBeLessThan(0.05);
      expect(hand.scale.x).toBeCloseTo(1.08, 5);
      expect(hand.scale.y).toBeCloseTo(0.76, 5);
      expect(hand.scale.z).toBeCloseTo(0.9, 5);
      expect(hand.userData.warRoomGauntletGripBody).toBe('body-on-hilt-v5');

      const palm = hand.getObjectByName('war-room-armor-gauntlet-grip-palm');
      const thumb = hand.getObjectByName('war-room-armor-gauntlet-thumb-plate');
      expect(palm).toBeTruthy();
      expect(thumb).toBeTruthy();
      expect(palm.userData.warRoomGripContact).toBe('zweihander-body-clamp-v5');
      expect(thumb.userData.warRoomGripContact).toBe('zweihander-body-clamp-v5');

      for (const band of hand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-band')) {
        const bandCenter = band.getWorldPosition(new THREE.Vector3());
        expect(Math.abs(bandCenter.x - gripCenter.x)).toBeLessThan(0.002);
        expect(Math.abs(bandCenter.z - gripCenter.z)).toBeLessThan(0.002);
      }
    }

    expect(leftHand.position.y).toBeCloseTo(1.49, 2);
    expect(rightHand.position.y).toBeCloseTo(1.32, 2);
    expect(armor.userData.warRoomGauntletBodyClamp).toBe('body-on-hilt-v5');
    expect(armor.userData.warRoomGauntletBodyClampCount).toBe(2);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(0);
    expect(leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-band')).toHaveLength(3);
    expect(leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-palm')).toHaveLength(1);
    dispose(armor);
  });

  it('runs the body clamp after the shared before-render layout finalizers', () => {
    const root = new THREE.Group();
    root.add(armorFixture('war-room-teutonic-armor-left'));
    root.add(armorFixture('war-room-teutonic-armor-right'));
    const driver = addMesh(root, 'war-room-premium-painting-canvas', [0, 0, 0]);

    expect(bindWarRoomArmorArticulation(root, 1)).toBe(12);
    expect(root.userData.warRoomArmorArticulation).toBe('gauntlet-zweihander-body-clamp-v5');
    expect(root.userData.warRoomGauntletBodyClampFinalizer).toBe('after-approved-mock-v1');
    expect(driver.userData.warRoomGauntletBodyClampFinalizer).toBe('after-approved-mock-v1');

    for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
      const armor = root.getObjectByName(name);
      expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
      expect(armor.userData.warRoomGauntletThumbPlateCount).toBe(2);
      expect(armor.userData.warRoomGauntletGripBandCount).toBe(6);
      expect(armor.userData.warRoomGauntletGripPalmCount).toBe(2);
      expect(armor.userData.warRoomGauntletGrip).toBe('zweihander-body-clamp-v5');
    }

    driver.onAfterRender();
    expect(root.userData.warRoomGauntletBodyClampFinalized).toBe('body-on-hilt-v5');
    expect(root.userData.warRoomGauntletBodyClampCount).toBe(4);
    expect(driver.userData.warRoomGauntletBodyClampFinalized).toBe(true);

    driver.onAfterRender();
    expect(root.userData.warRoomGauntletBodyClampCount).toBe(4);
    dispose(root);
  });
});
