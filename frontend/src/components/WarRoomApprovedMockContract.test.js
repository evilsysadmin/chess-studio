import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomApprovedMockContract,
  installWarRoomApprovedMockContract,
  WAR_ROOM_APPROVED_MOCK_VERSION,
} from './WarRoomApprovedMockContract.js';

function namedGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function mockRoom() {
  const root = new THREE.Group();
  for (const name of [
    'war-room-teutonic-armor-left',
    'war-room-teutonic-armor-right',
    'war-room-sofa-left',
    'war-room-sofa-right',
    'command-cabinet',
  ]) root.add(namedGroup(name));

  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  wall.name = 'war-room-castle-wall-left';
  root.add(wall);

  const folds = [];
  for (let index = 0; index < 4; index += 1) {
    const fold = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 1.9, 3, 8),
      new THREE.MeshPhysicalMaterial({ color: 0x5b2028, roughness: 0.9, sheen: 0.55 }),
    );
    fold.name = 'war-room-velvet-curtain-fold';
    fold.rotation.z = index % 2 ? 0.18 : -0.16;
    root.add(fold);
    folds.push(fold);
  }
  return { root, wall, folds };
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material?.dispose?.();
    }
  });
}

describe('War Room approved mock contract', () => {
  it('aplica sólo el layout vivo y endereza las cortinas actuales', () => {
    const { root, folds } = mockRoom();
    expect(applyWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1 })).toBeGreaterThan(0);

    const desk = root.getObjectByName('command-cabinet');
    const chair = root.getObjectByName('war-room-teutonic-command-chair');
    const armor = root.getObjectByName('war-room-teutonic-armor-left');
    const sofa = root.getObjectByName('war-room-sofa-left');

    expect(root.getObjectByName('war-room-side-console-left')).toBeUndefined();
    expect(root.getObjectByName('war-room-side-console-right')).toBeUndefined();
    expect(desk.userData.warRoomOffsetFromWall).toBeCloseTo(1.45, 5);
    expect(chair.userData.warRoomOffsetFromWall).toBeCloseTo(0.55, 5);
    expect(armor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.55, 5);
    expect(sofa.position.z - armor.position.z).toBeCloseTo(5.6, 5);
    expect(folds.every((fold) => fold.rotation.z === 0)).toBe(true);
    expect(root.userData.warRoomApprovedMockCurtainFolds).toBe(4);
    expect(root.userData.warRoomApprovedMockCurtainStyle).toBe('straight-no-upper-doubling-v28');
    expect(root.userData.warRoomApprovedMockWallStyle).toBe('plain-dark-castle-panel-v28');
    expect(root.userData.warRoomApprovedMockVersion).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    expect(root.userData.warRoomApprovedMockSideTablesRetired).toBeUndefined();
    expect(root.userData.warRoomApprovedMockCurtainPelmetsRetired).toBeUndefined();
    expect(root.userData.warRoomLegacyLayoutDriversRetired).toBeUndefined();
    dispose(root);
  });

  it('reaplica el layout vivo en el finalizador compartido sin barrer drivers legacy', () => {
    const { root, wall } = mockRoom();
    const sofa = root.getObjectByName('war-room-sofa-left');
    const armor = root.getObjectByName('war-room-teutonic-armor-left');

    expect(installWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1 })).toBe(1);
    expect(root.userData.warRoomApprovedMockExecution).toBe('shared-finalizer-layout-v8');

    sofa.position.set(-1, 0, -3);
    armor.position.set(-1, 0, -3);
    sofa.userData.warRoomOffsetFromWall = -1;
    armor.userData.warRoomOffsetFromWall = -1;
    wall.onBeforeRender();

    expect(sofa.position.x).toBeCloseTo(-6.55, 5);
    expect(sofa.position.z).toBeCloseTo(4.95, 5);
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.55, 5);
    expect(armor.position.x).toBeCloseTo(-7.08, 5);
    expect(armor.position.z).toBeCloseTo(-0.65, 5);
    expect(armor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(root.userData.warRoomDeferredFinalizedTasks).toContain('approved-mock-v28');
    dispose(root);
  });

  it('no instala el contrato desktop en coarse/mobile', () => {
    const { root, folds } = mockRoom();
    const before = folds.map((fold) => fold.rotation.z);

    expect(applyWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(installWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(folds.map((fold) => fold.rotation.z)).toEqual(before);
    expect(root.userData.warRoomApprovedMockVersion).toBeUndefined();
    dispose(root);
  });
});
