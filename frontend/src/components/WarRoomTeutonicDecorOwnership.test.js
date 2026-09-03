import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { registerPremiumRoomFinalization } from './WarRoomTeutonicDecor.js';

function buildFixture() {
  const root = new THREE.Group();

  const driver = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
  );
  driver.name = 'war-room-premium-painting-canvas';
  root.add(driver);

  const sofas = [];
  for (const [name, side] of [['war-room-sofa-left', -1], ['war-room-sofa-right', 1]]) {
    const sofa = new THREE.Group();
    sofa.name = name;
    sofa.position.set(side * 2.37, 0.31, -1.91);
    sofa.rotation.set(0.07, side * 0.44, -0.03);
    sofa.userData.warRoomOffsetFromWall = 77;
    sofa.userData.warRoomFurniturePlacement = 'sentinel-sofa-layout';
    sofa.userData.facesWarTable = false;
    root.add(sofa);
    sofas.push(sofa);
  }

  const consoles = [];
  for (const [name, side] of [['war-room-side-console-left', -1], ['war-room-side-console-right', 1]]) {
    const consoleGroup = new THREE.Group();
    consoleGroup.name = name;
    consoleGroup.position.set(side * 1.13, 0.14, -0.72);
    consoleGroup.rotation.set(-0.04, side * 0.19, 0.02);
    consoleGroup.userData.warRoomOffsetFromWall = 88;
    consoleGroup.userData.warRoomFurniturePlacement = 'sentinel-console-layout';
    root.add(consoleGroup);
    consoles.push(consoleGroup);
  }

  const fireCore = new THREE.Group();
  fireCore.name = 'war-room-fire-core';
  fireCore.add(new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.62, 8),
    new THREE.MeshPhysicalMaterial({
      color: 0xffa43a,
      emissive: 0xff6a14,
      emissiveIntensity: 1.2,
    }),
  ));
  root.add(fireCore);

  return { root, driver, sofas, consoles, fireCore };
}

function snapshotLayout(object) {
  return {
    position: object.position.toArray(),
    rotation: object.rotation.toArray(),
    offset: object.userData.warRoomOffsetFromWall,
    placement: object.userData.warRoomFurniturePlacement,
    facesWarTable: object.userData.facesWarTable,
  };
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

describe('War Room Teutonic premium-pass layout ownership', () => {
  it('desktop aplica acabado premium sin tocar transforms ni metadata de layout', () => {
    const { root, driver, sofas, consoles, fireCore } = buildFixture();
    const furniture = [...sofas, ...consoles];
    const before = furniture.map(snapshotLayout);

    expect(registerPremiumRoomFinalization(root, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    })).toBe(1);
    expect(typeof driver.onBeforeRender).toBe('function');

    driver.onBeforeRender();

    expect(furniture.map(snapshotLayout)).toEqual(before);
    expect(root.userData.warRoomPremiumDesktopLayoutWritesRetired).toBe(true);
    expect(root.userData.warRoomFurnitureGap).toBeUndefined();
    expect(root.userData.warRoomMobileForegroundSofaX).toBeUndefined();
    expect(root.userData.warRoomMobileForegroundSofaOffset).toBeUndefined();
    expect(sofas[0].userData.warRoomPremiumUpholstery).toBe('club-tufted-v2');
    expect(consoles[0].userData.warRoomPremiumConsole).toBe('campaign-table-v2');
    expect(fireCore.userData.warRoomPremiumFire).toBe('lathed-licks-v2');
    expect(fireCore.children[0].geometry.type).toBe('LatheGeometry');

    dispose(root);
  });

  it('coarse/mobile conserva su layout premium actual', () => {
    const { root, driver, sofas, consoles } = buildFixture();
    const wallZ = -7.6;
    const towardBoard = 1;

    expect(registerPremiumRoomFinalization(root, {
      wallZ,
      towardBoard,
      coarsePointer: true,
    })).toBe(1);

    driver.onBeforeRender();

    expect(sofas[0].position.toArray()).toEqual([-4.75, 0.02, 1.75]);
    expect(sofas[1].position.toArray()).toEqual([4.75, 0.02, 1.75]);
    expect(sofas[0].rotation.y).toBeCloseTo(0.72, 8);
    expect(sofas[1].rotation.y).toBeCloseTo(-0.72, 8);
    for (const sofa of sofas) {
      expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(9.35, 8);
      expect(sofa.userData.warRoomFurniturePlacement).toBe('mobile-foreground-safe-frame-v5');
      expect(sofa.userData.facesWarTable).toBe(true);
    }

    expect(consoles[0].position.x).toBeCloseTo(-1.13, 8);
    expect(consoles[1].position.x).toBeCloseTo(1.13, 8);
    for (const consoleGroup of consoles) {
      expect(consoleGroup.position.z).toBeCloseTo(-4.3, 8);
      expect(consoleGroup.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 8);
      expect(consoleGroup.userData.warRoomFurniturePlacement).toBe('rear-console-premium-spaced-v4');
    }

    expect(root.userData.warRoomFurnitureGap).toBeCloseTo(6.05, 8);
    expect(root.userData.warRoomMobileForegroundSofaX).toBeCloseTo(4.75, 8);
    expect(root.userData.warRoomMobileForegroundSofaOffset).toBeCloseTo(9.35, 8);
    expect(root.userData.warRoomPremiumDesktopLayoutWritesRetired).toBeUndefined();

    dispose(root);
  });
});
