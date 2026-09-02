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
  return { root, wall, pelmet };
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

describe('War Room approved mock contract', () => {
  it('baja mesas y armaduras, limpia paredes y deja cortinas rectas sin pelmet', () => {
    const { root, pelmet } = mockRoom();
    const changed = applyWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1 });
    const leftTable = root.getObjectByName('war-room-side-console-left');
    const leftArmor = root.getObjectByName('war-room-teutonic-armor-left');
    const folds = [];
    root.traverse((object) => {
      if (object.name === 'war-room-velvet-curtain-fold') folds.push(object);
    });

    expect(changed).toBeGreaterThan(0);
    expect(leftTable.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
    expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
    expect(leftTable.position.z).toBeLessThan(leftArmor.position.z - 4.5);
    expect(Math.abs(leftArmor.position.x)).toBeLessThan(Math.abs(leftTable.position.x));
    expect(leftArmor.userData.warRoomArmorPlacement).toBe('approved-mock-lower-sentry-v25');
    expect(root.getObjectByName('war-room-armor-alcove-left').visible).toBe(false);
    expect(root.getObjectByName('war-room-hammerbeam-side-tie').visible).toBe(false);
    expect(root.userData.warRoomApprovedMockWallStyle).toBe('plain-dark-castle-panel-v25');
    expect(folds.every((fold) => fold.rotation.z === 0)).toBe(true);
    expect(pelmet.visible).toBe(false);
    expect(root.userData.warRoomApprovedMockCurtainStyle).toBe('straight-no-upper-doubling-v25');
    expect(root.userData.warRoomApprovedMockVersion).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    dispose(root);
  });

  it('se ejecuta después de un driver legado y recupera el mock en el mismo frame', () => {
    const { root, wall } = mockRoom();
    const armor = root.getObjectByName('war-room-teutonic-armor-left');
    const fold = root.getObjectByName('war-room-velvet-curtain-fold');
    wall.onBeforeRender = () => {
      armor.position.z = -5.8;
      fold.rotation.z = 0.42;
      root.getObjectByName('war-room-armor-alcove-left').visible = true;
    };

    expect(installWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1 })).toBe(1);
    wall.onBeforeRender();

    expect(armor.position.z).toBeCloseTo(0.75, 5);
    expect(fold.rotation.z).toBe(0);
    expect(root.getObjectByName('war-room-armor-alcove-left').visible).toBe(false);
    expect(root.userData.warRoomApprovedMockDriver).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    dispose(root);
  });

  it('no añade el contrato desktop al perfil coarse/mobile', () => {
    const { root } = mockRoom();
    expect(applyWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(installWarRoomApprovedMockContract(root, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(root.userData.warRoomApprovedMockVersion).toBeUndefined();
    dispose(root);
  });
});
