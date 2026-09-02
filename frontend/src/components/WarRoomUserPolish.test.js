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
  it('separa claramente mesas y sofás y saca las armaduras de encima de las mesas', () => {
    const room = makeRoom();
    expect(applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 })).toBeGreaterThan(0);

    const sofa = room.getObjectByName('war-room-sofa-left');
    const table = room.getObjectByName('war-room-side-console-left');
    const armor = room.getObjectByName('war-room-teutonic-armor-left');
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(9.15, 5);
    expect(table.userData.warRoomOffsetFromWall).toBeCloseTo(.82, 5);
    expect(room.userData.warRoomFurnitureGap).toBeGreaterThan(8);
    expect(armor.userData.warRoomArmorPlacement).toBe('floor-sentry-facing-board-v16');
    expect(armor.position.z).toBeGreaterThan(table.position.z + 2);
    expect(armor.position.z).toBeLessThan(sofa.position.z - 4);
    expect(Math.abs(armor.rotation.y)).toBeGreaterThan(.6);
    expect(armor.userData.facesWarTable).toBe(true);
    dispose(room);
  });

  it('elimina la lectura de M diagonal en las paredes sin retirar la estructura', () => {
    const room = makeRoom();
    applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 });
    const braces = [];
    room.traverse((object) => { if (object.name === 'war-room-hammerbeam-brace') braces.push(object); });
    expect(braces).toHaveLength(6);
    expect(braces.every((brace) => brace.rotation.z === 0)).toBe(true);
    expect(braces.every((brace) => brace.userData.warRoomBraceStyle === 'horizontal-hammerbeam-v16')).toBe(true);
    expect(room.userData.warRoomDiagonalMonogramsRetired).toBe(6);
    dispose(room);
  });

  it('lleva el ladrillo al fondo, lo ennegrece y convierte ambos cuadros en paisajes inequívocos', () => {
    const room = makeRoom();
    applyWarRoomUserPolish(room, { wallZ: -7.6, towardBoard: 1 });
    const fire = room.getObjectByName('war-room-fireplace');
    const back = fire.getObjectByName('war-room-fireplace-refractory-back');
    expect(back.position.z).toBeCloseTo(.018, 5);
    expect(back.material.color.getHex()).toBe(0x8f5548);
    expect(back.material.emissive.getHex()).toBe(0x210604);
    expect(fire.userData.warRoomFirebrickPalette).toBe('red-black-sooted-v16');

    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');
    expect(left.userData.warRoomLandscapeSubject).toBe('rhine-valley-castle-v16');
    expect(right.userData.warRoomLandscapeSubject).toBe('alpine-lake-fortress-v16');
    expect(left.getObjectByName('war-room-premium-painting-canvas').material.map.image.width).toBe(256);
    expect(right.getObjectByName('war-room-premium-painting-canvas').material.map.image.height).toBe(160);
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
