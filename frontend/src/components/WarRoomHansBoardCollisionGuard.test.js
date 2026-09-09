import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansBoardCollisionGuard,
  WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION,
} from './WarRoomHansBoardCollisionGuard.js';

function makeRig({ worldX = 0, worldZ = 0, fireplaceX = -4.95, fireplaceZ = -7.1 } = {}) {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(fireplaceX, 0, fireplaceZ);
  root.add(fireplace);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  fireplace.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  fireplace.add(driver);

  driver.onBeforeRender = () => {
    hans.position.set(worldX - fireplace.position.x, -0.34, worldZ - fireplace.position.z);
    driver.userData.warRoomHansPhase = 'fire-dimming';
    hans.userData.warRoomHansRoute = 'entry';
  };

  return { root, fireplace, hans, driver };
}

function worldPosition(object) {
  const out = new THREE.Vector3();
  object.getWorldPosition(out);
  return out;
}

describe('Hans board collision guard', () => {
  it('keeps Hans behind the board without changing choreography X', () => {
    const { root, fireplace, hans, driver } = makeRig({ worldX: 0, worldZ: 0 });
    const expectedLocalX = 0 - fireplace.position.x;

    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);
    driver.onBeforeRender();

    const world = worldPosition(hans);
    expect(world.x).toBeCloseTo(0, 6);
    expect(world.z).toBeCloseTo(-5.1, 6);
    expect(hans.position.x).toBeCloseTo(expectedLocalX, 6);
    expect(hans.userData.warRoomHansBoardCollisionApplied).toBe(true);
    expect(hans.userData.warRoomHansBoardCollisionAxis).toBe('z');
    expect(driver.userData.warRoomHansBoardCollisionGuard).toBe(WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION);
  });

  it('never steals X progression even when the fireplace is side-dominant', () => {
    const { root, fireplace, hans, driver } = makeRig({ worldX: 0.7, worldZ: 0, fireplaceX: -7.1, fireplaceZ: -3.2 });
    const expectedLocalX = 0.7 - fireplace.position.x;

    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);
    driver.onBeforeRender();

    const world = worldPosition(hans);
    expect(world.x).toBeCloseTo(0.7, 6);
    expect(world.z).toBeCloseTo(-5.1, 6);
    expect(hans.position.x).toBeCloseTo(expectedLocalX, 6);
    expect(hans.userData.warRoomHansBoardCollisionAxis).toBe('z');
  });

  it('does not disturb a transit position that is already outside the board', () => {
    const { root, hans, driver } = makeRig({ worldX: -5.4, worldZ: -5.8 });

    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);
    driver.onBeforeRender();

    const world = worldPosition(hans);
    expect(world.x).toBeCloseTo(-5.4, 6);
    expect(world.z).toBeCloseTo(-5.8, 6);
    expect(hans.userData.warRoomHansBoardCollisionApplied).toBe(false);
  });
});
