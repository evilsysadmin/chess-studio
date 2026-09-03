import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomApprovedMockContract,
  installWarRoomApprovedMockContract,
  WAR_ROOM_APPROVED_MOCK_VERSION,
} from './WarRoomApprovedMockContract.js';
import { applyWarRoomUserPolish } from './WarRoomUserPolish.js';

function namedGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function addStaticRoomObjects(root) {
  for (const name of [
    'war-room-side-console-left',
    'war-room-side-console-right',
    'war-room-teutonic-armor-left',
    'war-room-teutonic-armor-right',
    'war-room-sofa-left',
    'war-room-sofa-right',
  ]) root.add(namedGroup(name));

  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  wall.name = 'war-room-castle-wall-left';
  root.add(wall);

  for (const name of [
    'war-room-armor-alcove-left',
    'war-room-armor-alcove-right',
    'war-room-gallery-picture-rail',
    'war-room-gallery-picture-rail-brass-line',
    'war-room-hammerbeam-side-tie',
    'war-room-hammerbeam-corbel',
  ]) root.add(namedGroup(name));

  for (let index = 0; index < 4; index += 1) {
    const fold = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 1.9, 3, 8),
      new THREE.MeshPhysicalMaterial({ color: 0x5b2028, roughness: 0.9, sheen: 0.55 }),
    );
    fold.name = 'war-room-velvet-curtain-fold';
    fold.rotation.z = index % 2 ? 0.18 : -0.16;
    root.add(fold);
  }

  const pelmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 16, 10),
    new THREE.MeshPhysicalMaterial({ color: 0x5b2028, roughness: 0.86, sheen: 0.58 }),
  );
  pelmet.scale.set(1.45, 0.34, 0.34);
  pelmet.name = 'legacy-curtain-upper-doublet';
  root.add(pelmet);
  return { wall, pelmet };
}

function mockRoom() {
  const root = new THREE.Group();
  const { wall, pelmet } = addStaticRoomObjects(root);
  return { root, wall, pelmet };
}

function nestedRuntimeRoom() {
  const scene = new THREE.Scene();
  const room = new THREE.Group();
  room.name = 'premium-war-room-layer';
  const castle = new THREE.Group();
  castle.name = 'war-room-castle-architecture';
  scene.add(room);
  room.add(castle);

  for (const name of [
    'war-room-side-console-left',
    'war-room-side-console-right',
    'war-room-teutonic-armor-left',
    'war-room-teutonic-armor-right',
  ]) castle.add(namedGroup(name));
  for (const name of ['war-room-sofa-left', 'war-room-sofa-right']) room.add(namedGroup(name));

  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  wall.name = 'war-room-castle-wall-left';
  castle.add(wall);
  return { scene, room, castle, wall };
}

function addLateLegacyLayoutDriver(castle, sofa) {
  const driver = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  driver.name = 'war-room-armor-visor';
  driver.userData.warRoomFinalRefinementDriver = true;
  let executions = 0;
  driver.onBeforeRender = () => {
    executions += 1;
    sofa.position.set(-6.28, 0.02, -0.55);
    sofa.userData.warRoomOffsetFromWall = 7.05;
    sofa.userData.warRoomFurniturePlacement = 'side-wall-centered-v3';
  };
  castle.add(driver);
  return { driver, executions: () => executions };
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

describe('War Room approved mock contract', () => {
  it('separa mesas, armaduras y sofás en profundidad y deja los sofás en primer plano', () => {
    const { root, pelmet } = mockRoom();
    const changed = applyWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1 });
    const leftTable = root.getObjectByName('war-room-side-console-left');
    const leftArmor = root.getObjectByName('war-room-teutonic-armor-left');
    const leftSofa = root.getObjectByName('war-room-sofa-left');
    const folds = [];
    root.traverse((object) => {
      if (object.name === 'war-room-velvet-curtain-fold') folds.push(object);
    });

    expect(changed).toBeGreaterThan(0);
    expect(leftTable.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
    expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
    expect(leftSofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
    expect(leftTable.position.z).toBeLessThan(leftArmor.position.z - 4.5);
    expect(leftSofa.position.z).toBeGreaterThan(leftArmor.position.z + 3.5);
    expect(Math.abs(leftArmor.position.x)).toBeLessThan(Math.abs(leftTable.position.x));
    expect(Math.abs(leftSofa.position.x)).toBeGreaterThan(Math.abs(leftArmor.position.x));
    expect(leftArmor.userData.warRoomArmorPlacement).toBe('approved-mock-lower-sentry-v27');
    expect(leftSofa.userData.warRoomFurniturePlacement).toBe('approved-mock-front-corner-sofa-v27');
    expect(root.userData.warRoomFurnitureLayoutOwner).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    expect(root.getObjectByName('war-room-armor-alcove-left').visible).toBe(false);
    expect(root.getObjectByName('war-room-hammerbeam-side-tie').visible).toBe(false);
    expect(root.userData.warRoomApprovedMockWallStyle).toBe('plain-dark-castle-panel-v27');
    expect(folds.every((fold) => fold.rotation.z === 0)).toBe(true);
    expect(pelmet.visible).toBe(false);
    expect(root.userData.warRoomApprovedMockCurtainStyle).toBe('straight-no-upper-doubling-v27');
    expect(root.userData.warRoomApprovedMockVersion).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    dispose(root);
  });

  it('jubila en primer paint un refinador legacy creado después de instalar el contrato', () => {
    const { scene, room, castle, wall } = nestedRuntimeRoom();
    const sofa = room.getObjectByName('war-room-sofa-left');
    const armor = castle.getObjectByName('war-room-teutonic-armor-left');

    expect(installWarRoomApprovedMockContract(castle, { wallZ: -7.6, towardBoard: 1 })).toBe(1);
    expect(castle.userData.warRoomApprovedMockExecution).toBe('shared-finalizer-marker-driver-retirement-v6');
    const { driver, executions } = addLateLegacyLayoutDriver(castle, sofa);
    expect(driver.userData.warRoomApprovedMockLayoutDriverRetired).toBeUndefined();

    wall.onBeforeRender();
    expect(driver.userData.warRoomApprovedMockLayoutDriverRetired).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    expect(driver.userData.warRoomApprovedMockLayoutDriverRetirement).toBe('marker-owned-one-shot-v27');
    expect(scene.userData.warRoomLegacyLayoutDriversRetired).toContain('war-room-armor-visor');

    driver.onBeforeRender();
    expect(executions()).toBe(0);
    expect(sofa.position.z).toBeCloseTo(4.75, 5);
    expect(sofa.position.x).toBeCloseTo(-6.95, 5);
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
    expect(sofa.userData.warRoomFurniturePlacement).toBe('approved-mock-front-corner-sofa-v27');
    expect(armor.userData.warRoomArmorPlacement).toBe('approved-mock-lower-sentry-v27');
    expect(scene.userData.warRoomFurnitureLayoutOwner).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    dispose(scene);
  });

  it('mantiene v27 como autoridad final después de UserPolish y retira cualquier refinador marcado', () => {
    const { root, wall } = mockRoom();
    const armor = root.getObjectByName('war-room-teutonic-armor-left');
    const table = root.getObjectByName('war-room-side-console-left');
    const sofa = root.getObjectByName('war-room-sofa-left');

    expect(applyWarRoomUserPolish(root, { wallZ: -7.6, towardBoard: 1 })).toBeGreaterThan(0);
    expect(installWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1 })).toBe(1);
    const { driver, executions } = addLateLegacyLayoutDriver(root, sofa);

    armor.position.set(-1, 0, -3);
    table.position.set(-1, 0, -3);
    sofa.position.set(-1, 0, -3);
    wall.onBeforeRender();
    driver.onBeforeRender();

    expect(executions()).toBe(0);
    expect(root.userData.warRoomDeferredFinalizedTasks).toEqual(['user-polish-v24', 'approved-mock-v27']);
    expect(armor.userData.warRoomArmorPlacement).toBe('approved-mock-lower-sentry-v27');
    expect(armor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
    expect(table.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
    expect(armor.position.z).toBeCloseTo(0.75, 5);
    expect(table.position.z).toBeCloseTo(-4.3, 5);
    expect(sofa.position.z).toBeCloseTo(4.75, 5);
    expect(driver.userData.warRoomApprovedMockLayoutDriverRetired).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    dispose(root);
  });

  it('no añade el contrato desktop ni jubila refinadores en coarse/mobile', () => {
    const { root } = mockRoom();
    const sofa = root.getObjectByName('war-room-sofa-left');
    const { driver, executions } = addLateLegacyLayoutDriver(root, sofa);

    expect(applyWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(installWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    driver.onBeforeRender();

    expect(executions()).toBe(1);
    expect(sofa.userData.warRoomFurniturePlacement).toBe('side-wall-centered-v3');
    expect(driver.userData.warRoomApprovedMockLayoutDriverRetired).toBeUndefined();
    expect(root.userData.warRoomApprovedMockVersion).toBeUndefined();
    dispose(root);
  });
});