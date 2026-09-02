import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyWarRoomUserPolish, WAR_ROOM_USER_POLISH_VERSION } from './WarRoomUserPolish.js';

function namedGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function painting(index) {
  const frame = namedGroup(`war-room-premium-painting-${index}`);
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.7 }),
  );
  canvas.name = 'war-room-premium-painting-canvas';
  frame.add(canvas);
  return frame;
}

function fireplace() {
  const group = namedGroup('war-room-fireplace');
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x000000 });
  for (const name of [
    'war-room-fireplace-refractory-back',
    'war-room-fireplace-refractory-hearth',
    'war-room-fireplace-refractory-return-left',
    'war-room-fireplace-refractory-return-right',
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = name;
    group.add(mesh);
  }
  return group;
}

function makeRoom() {
  const room = new THREE.Group();
  for (const name of [
    'war-room-sofa-left', 'war-room-sofa-right',
    'war-room-side-console-left', 'war-room-side-console-right',
    'war-room-teutonic-armor-left', 'war-room-teutonic-armor-right',
  ]) room.add(namedGroup(name));
  room.add(painting(0), painting(1), fireplace());

  for (let index = 0; index < 6; index += 1) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.92, .16, .16), new THREE.MeshBasicMaterial());
    brace.name = 'war-room-hammerbeam-brace';
    brace.rotation.z = index % 2 ? .58 : -.58;
    brace.position.y = 5.02;
    room.add(brace);
  }
  for (let index = 0; index < 4; index += 1) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.36, .1), new THREE.MeshBasicMaterial());
    arch.name = 'war-room-armor-alcove-pointed-arch';
    arch.rotation.x = index % 2 ? .79 : -.79;
    room.add(arch);
  }
  return room;
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material?.map?.dispose?.();
      material?.dispose?.();
    });
  });
}

describe('War Room user polish', () => {
  it('ordena mesas abajo del fondo, armaduras centradas en medio y sofás en el borde delantero', () => {
    const room = makeRoom();
    expect(applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 })).toBeGreaterThan(0);

    const sofa = room.getObjectByName('war-room-sofa-left');
    const table = room.getObjectByName('war-room-side-console-left');
    const armor = room.getObjectByName('war-room-teutonic-armor-left');
    expect(table.userData.warRoomOffsetFromWall).toBeCloseTo(1.75, 5);
    expect(armor.userData.warRoomOffsetFromWall).toBeCloseTo(5.45, 5);
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
    expect(room.userData.warRoomFurnitureGap).toBeGreaterThan(10);
    expect(room.userData.warRoomFurnitureOrder).toBe('tables-rear-armors-middle-sofas-front-v23');
    expect(table.position.z).toBeLessThan(armor.position.z - 3.5);
    expect(armor.position.z).toBeLessThan(sofa.position.z - 6.5);
    expect(Math.abs(armor.position.x)).toBeLessThan(Math.abs(table.position.x));
    expect(armor.userData.warRoomArmorPlacement).toBe('centered-middle-sentry-facing-board-v23');
    expect(Math.abs(armor.rotation.y)).toBeGreaterThan(.65);
    expect(armor.userData.facesWarTable).toBe(true);
    dispose(room);
  });

  it('elimina por completo cualquier tirante o arco diagonal heredado que lea como M', () => {
    const room = makeRoom();
    applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 });
    const diagonals = [];
    room.traverse((object) => {
      if (['war-room-hammerbeam-brace', 'war-room-armor-alcove-pointed-arch'].includes(object.name)) diagonals.push(object);
    });
    expect(diagonals).toHaveLength(10);
    expect(diagonals.every((object) => object.visible === false)).toBe(true);
    expect(diagonals.every((object) => object.userData.warRoomBraceStyle === 'retired-no-monogram-v23')).toBe(true);
    expect(room.userData.warRoomDiagonalMonogramsRetired).toBe(10);
    expect(room.userData.warRoomMonogramFree).toBe(true);
    dispose(room);
  });

  it('mantiene la chimenea enrasada y monta bosque y mar con acabado premium', () => {
    const room = makeRoom();
    applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 });
    const fire = room.getObjectByName('war-room-fireplace');
    const back = fire.getObjectByName('war-room-fireplace-refractory-back');
    expect(back.position.z).toBeCloseTo(.018, 5);
    expect(back.material.color.getHex()).toBe(0x8f5548);
    expect(back.material.emissive.getHex()).toBe(0x210604);
    expect(fire.userData.warRoomFirebrickPalette).toBe('red-black-sooted-v20');

    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');
    const leftCanvas = left.getObjectByName('war-room-premium-painting-canvas');
    const rightCanvas = right.getObjectByName('war-room-premium-painting-canvas');
    expect(left.userData.warRoomLandscapeSubject).toBe('black-forest-lake-dusk-v20');
    expect(right.userData.warRoomLandscapeSubject).toBe('north-sea-cliffs-v20');
    expect(leftCanvas.material.map.image.width).toBe(384);
    expect(rightCanvas.material.map.image.height).toBe(240);
    expect(leftCanvas.material.map.userData.warRoomGalleryFinish).toBe('layered-canvas-v20');
    expect(leftCanvas.material.clearcoat).toBeGreaterThanOrEqual(.14);
    expect(leftCanvas.material.roughness).toBeLessThan(.7);
    expect(room.userData.warRoomUserPolishVersion).toBe(WAR_ROOM_USER_POLISH_VERSION);
    dispose(room);
  });

  it('es idempotente y no añade el pase pesado en coarse/mobile', () => {
    const room = makeRoom();
    expect(applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(room.userData.warRoomUserPolishVersion).toBeUndefined();
    expect(applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 })).toBeGreaterThan(0);
    expect(applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 })).toBe(0);
    dispose(room);
  });
});
