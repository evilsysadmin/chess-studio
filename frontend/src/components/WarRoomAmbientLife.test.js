import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_AMBIENT_LIFE_VERSION,
  applyWarRoomAmbientLife,
  installWarRoomAmbientLife,
} from './WarRoomAmbientLife.js';

function makeRoom({ sharedMaterial = true } = {}) {
  const room = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  wall.name = 'war-room-castle-wall-left';
  room.add(wall);

  const driver = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  driver.name = 'war-room-castle-floor-slab';
  room.add(driver);

  const shared = new THREE.MeshPhysicalMaterial({
    color: 0x481821,
    roughness: 0.92,
    sheen: 0.5,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });

  for (let index = 0; index < 4; index += 1) {
    const material = sharedMaterial ? shared : shared.clone();
    const fold = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 1.8, 2, 8), material);
    fold.name = 'war-room-velvet-curtain-fold';
    fold.position.set(index < 2 ? -2 - index * 0.15 : 2 + index * 0.15, 1.4 - index * 0.02, 0);
    fold.rotation.z = (index - 1.5) * 0.01;
    room.add(fold);
  }

  return { room, driver, wall };
}

function countSceneBudget(root) {
  let meshes = 0;
  let lights = 0;
  root.traverse((object) => {
    if (object.isMesh) meshes += 1;
    if (object.isLight) lights += 1;
  });
  return { meshes, lights };
}

describe('War Room ambient life', () => {
  it('moves existing curtain folds subtly without adding scene objects', () => {
    const { room } = makeRoom();
    const before = countSceneBudget(room);
    const fold = room.getObjectByName('war-room-velvet-curtain-fold');
    const baseRotation = fold.rotation.z;
    const baseY = fold.position.y;

    expect(applyWarRoomAmbientLife(room, { now: 2800, reducedMotion: false })).toBe(4);
    expect(fold.rotation.z).not.toBe(baseRotation);
    expect(fold.position.y).not.toBe(baseY);
    expect(Math.abs(fold.rotation.z - baseRotation)).toBeLessThan(0.009);
    expect(Math.abs(fold.position.y - baseY)).toBeLessThan(0.006);
    expect(countSceneBudget(room)).toEqual(before);
    expect(room.userData.warRoomAmbientLifeVersion).toBe(WAR_ROOM_AMBIENT_LIFE_VERSION);
    expect(room.userData.warRoomAmbientLifeFoldCount).toBe(4);
    expect(room.userData.warRoomAmbientLifeMaterialCount).toBe(1);
  });

  it('caches curtain and material refs instead of traversing the castle every heartbeat', () => {
    const { room, driver } = makeRoom({ sharedMaterial: false });
    const originalTraverse = room.traverse.bind(room);
    let traversals = 0;
    room.traverse = (callback) => {
      traversals += 1;
      return originalTraverse(callback);
    };

    expect(installWarRoomAmbientLife(room)).toBe(1);
    expect(traversals).toBe(1);
    expect(room.userData.warRoomAmbientLifeRefCache).toBe('warm');
    expect(room.userData.warRoomAmbientLifeFoldCount).toBe(4);
    expect(room.userData.warRoomAmbientLifeMaterialCount).toBe(4);

    driver.onBeforeRender();
    driver.onBeforeRender();
    driver.onBeforeRender();
    expect(traversals).toBe(1);
  });

  it('adds only a restrained warm response to the existing velvet material', () => {
    const { room } = makeRoom();
    const fold = room.getObjectByName('war-room-velvet-curtain-fold');
    const material = fold.material;

    applyWarRoomAmbientLife(room, { now: 1200, reducedMotion: false });
    const first = material.emissiveIntensity;
    expect(material.emissive.getHex()).toBe(0x43130a);
    expect(first).toBeGreaterThan(0.04);
    expect(first).toBeLessThan(0.08);

    applyWarRoomAmbientLife(room, { now: 4200, reducedMotion: false });
    expect(material.emissiveIntensity).not.toBe(first);
    expect(material.emissiveIntensity).toBeLessThan(0.08);
  });

  it('restores curtain geometry under reduced motion while keeping static warmth', () => {
    const { room } = makeRoom();
    const fold = room.getObjectByName('war-room-velvet-curtain-fold');
    const baseRotation = fold.rotation.z;
    const baseY = fold.position.y;

    applyWarRoomAmbientLife(room, { now: 2400, reducedMotion: false });
    expect(fold.rotation.z).not.toBe(baseRotation);

    applyWarRoomAmbientLife(room, { now: 3600, reducedMotion: true });
    expect(fold.rotation.z).toBe(baseRotation);
    expect(fold.position.y).toBe(baseY);
    expect(fold.material.emissiveIntensity).toBeCloseTo(0.055, 6);
  });

  it('chains the dynamic floor driver and leaves the static wall hook untouched', () => {
    const { room, driver, wall } = makeRoom();
    let previousCalls = 0;
    let wallCalls = 0;
    driver.onBeforeRender = () => { previousCalls += 1; };
    wall.onBeforeRender = () => { wallCalls += 1; };
    const wallHook = wall.onBeforeRender;

    expect(installWarRoomAmbientLife(room)).toBe(1);
    expect(installWarRoomAmbientLife(room)).toBe(0);
    expect(driver.userData.warRoomAmbientLifeDriver).toBe(WAR_ROOM_AMBIENT_LIFE_VERSION);
    expect(room.userData.warRoomAmbientLifeAnchor).toBe('war-room-castle-floor-slab');
    expect(wall.onBeforeRender).toBe(wallHook);
    expect(typeof driver.onBeforeRender).toBe('function');

    driver.onBeforeRender();
    expect(previousCalls).toBe(1);
    expect(wallCalls).toBe(0);
    expect(room.userData.warRoomAmbientLifeVersion).toBe(WAR_ROOM_AMBIENT_LIFE_VERSION);
  });

  it('is completely disabled for coarse/mobile scenes', () => {
    const { room, driver } = makeRoom();
    const previous = driver.onBeforeRender;
    expect(installWarRoomAmbientLife(room, { coarsePointer: true })).toBe(0);
    expect(driver.onBeforeRender).toBe(previous);
    expect(room.userData.warRoomAmbientLifeDriver).toBeUndefined();
  });
});
