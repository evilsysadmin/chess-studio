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
  it('puts a visible armored clamp around the hilt instead of hiding tiny fingers inside the hand', () => {
    const armor = armorFixture('war-room-teutonic-armor-left');
    const leftHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x < 0);
    const rightHand = armor.children.find((child) => child.name === 'war-room-armor-gauntlet' && child.position.x > 0);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(6);
    expect(armor.userData.warRoomGauntletArticulation).toBe('parented-finger-plates-grip-v4');
    expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
    expect(armor.userData.warRoomGauntletThumbPlateCount).toBe(2);
    expect(armor.userData.warRoomGauntletGripBandCount).toBe(6);
    expect(armor.userData.warRoomGauntletGripPalmCount).toBe(2);
    expect(armor.userData.warRoomGauntletGrip).toBe('zweihander-visible-clamp-v4');

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
      expect(band.material.userData.warRoomGauntletGripAccent).toBe('visible-steel-v4');
      expect(band.userData.warRoomGripContact).toBe('zweihander-visible-clamp-v4');
    }

    for (const hand of [leftHand, rightHand]) {
      const palm = hand.getObjectByName('war-room-armor-gauntlet-grip-palm');
      const thumb = hand.getObjectByName('war-room-armor-gauntlet-thumb-plate');
      expect(palm).toBeTruthy();
      expect(thumb).toBeTruthy();
      const palmBounds = new THREE.Box3().setFromObject(palm);
      expect(palmBounds.min.x).toBeLessThan(0);
      expect(palmBounds.max.x).toBeGreaterThan(0);
      expect(palm.userData.warRoomGripContact).toBe('zweihander-visible-clamp-v4');
      expect(thumb.userData.warRoomGripContact).toBe('zweihander-visible-clamp-v4');
    }

    const before = new THREE.Vector3();
    leftBands[0].getWorldPosition(before);
    leftHand.position.y = 1.5;
    armor.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    leftBands[0].getWorldPosition(after);
    expect(after.y - before.y).toBeCloseTo(0.61, 5);

    expect(bindArmorGauntletFingerPlates(armor, 1)).toBe(0);
    expect(leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-band')).toHaveLength(3);
    expect(leftHand.children.filter((child) => child.name === 'war-room-armor-gauntlet-grip-palm')).toHaveLength(1);
    dispose(armor);
  });

  it('articulates both suits with the same visible-clamp contract', () => {
    const root = new THREE.Group();
    root.add(armorFixture('war-room-teutonic-armor-left'));
    root.add(armorFixture('war-room-teutonic-armor-right'));

    expect(bindWarRoomArmorArticulation(root, 1)).toBe(12);
    expect(root.userData.warRoomArmorArticulation).toBe('gauntlet-zweihander-visible-clamp-v4');
    for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
      const armor = root.getObjectByName(name);
      expect(armor.userData.warRoomGauntletFingerPlateCount).toBe(6);
      expect(armor.userData.warRoomGauntletThumbPlateCount).toBe(2);
      expect(armor.userData.warRoomGauntletGripBandCount).toBe(6);
      expect(armor.userData.warRoomGauntletGripPalmCount).toBe(2);
      expect(armor.userData.warRoomGauntletGrip).toBe('zweihander-visible-clamp-v4');
      const bands = [];
      const palms = [];
      armor.traverse((child) => {
        if (child.name === 'war-room-armor-gauntlet-grip-band') bands.push(child);
        if (child.name === 'war-room-armor-gauntlet-grip-palm') palms.push(child);
      });
      expect(bands).toHaveLength(6);
      expect(palms).toHaveLength(2);
    }

    dispose(root);
  });
});
