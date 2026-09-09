import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansBoardCollisionGuard,
  WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION,
} from './WarRoomHansBoardCollisionGuard.js';
import {
  installWarRoomHansFacingGuard,
  WAR_ROOM_HANS_FACING_GUARD_VERSION,
} from './WarRoomHansFacingGuard.js';
import { getWarRoomHansPostRenderStageKeys } from './WarRoomHansPostRenderPipeline.js';

function makeRig({ worldX = 0, worldY = -0.34, worldZ = 0, fireplaceX = -4.95, fireplaceZ = -7.1 } = {}) {
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
    hans.position.set(worldX - fireplace.position.x, worldY, worldZ - fireplace.position.z);
    driver.userData.warRoomHansPhase = 'fire-dimming';
    hans.userData.warRoomHansRoute = 'entry';
    hans.userData.warRoomHansMotionState = 'walk';
  };

  return { root, fireplace, hans, driver };
}

function addRenderedFace(hans, forwardSign = 1) {
  const head = new THREE.Group();
  head.name = 'war-room-hans-head';
  head.position.y = 2.12;

  const skull = new THREE.Object3D();
  const face = new THREE.Object3D();
  face.name = 'fixture-hans-face-anchor';
  face.position.set(0, -0.1, forwardSign * 0.29);
  const sideHair = new THREE.Object3D();
  sideHair.position.set(0.2, 0.1, -forwardSign * 0.03);
  head.add(skull, face, sideHair);
  hans.add(head);
  hans.userData.refs = { head };
  return { head, face };
}

function worldPosition(object) {
  const out = new THREE.Vector3();
  object.getWorldPosition(out);
  return out;
}

function renderedFaceDotTravel(hans, head, face, movement) {
  hans.parent.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = face.getWorldPosition(new THREE.Vector3());
  const parent = hans.parent;
  const headLocal = parent.worldToLocal(headWorld.clone());
  const faceLocal = parent.worldToLocal(faceWorld.clone());
  const faceVector = faceLocal.sub(headLocal);
  faceVector.y = 0;
  faceVector.normalize();
  const travel = movement.clone();
  travel.y = 0;
  travel.normalize();
  return faceVector.dot(travel);
}

describe('Hans board collision guard', () => {
  it('keeps Hans behind the board, grounded, without changing choreography X', () => {
    const { root, fireplace, hans, driver } = makeRig({ worldX: 0, worldY: 0.22, worldZ: 0 });
    const expectedLocalX = 0 - fireplace.position.x;

    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);
    driver.onBeforeRender();

    const world = worldPosition(hans);
    expect(world.x).toBeCloseTo(0, 6);
    expect(world.z).toBeCloseTo(-5.1, 6);
    expect(hans.position.x).toBeCloseTo(expectedLocalX, 6);
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(hans.userData.warRoomHansBoardCollisionApplied).toBe(true);
    expect(hans.userData.warRoomHansBoardCollisionAxis).toBe('z');
    expect(hans.userData.warRoomHansBoardGroundedY).toBeCloseTo(-0.34, 6);
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

  it('runs before facing so Hans faces the rendered path instead of the unclamped route', () => {
    const root = new THREE.Group();
    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(-4.95, 0, -7.1);
    root.add(fireplace);

    const hans = new THREE.Group();
    hans.name = 'war-room-hans-butler';
    hans.visible = true;
    hans.position.set(0.6 - fireplace.position.x, -0.34, -5.1 - fireplace.position.z);
    fireplace.add(hans);
    const { head, face } = addRenderedFace(hans, 1);

    const driver = new THREE.Group();
    driver.name = 'war-room-hans-fireplace-driver';
    driver.userData.warRoomHansPhase = 'fire-dimming';
    fireplace.add(driver);

    driver.onBeforeRender = () => {
      hans.position.set(0.35 - fireplace.position.x, 0.18, 0 - fireplace.position.z);
      hans.rotation.y = Math.PI / 2;
      driver.userData.warRoomHansPhase = 'fire-dimming';
      hans.userData.warRoomHansRoute = 'entry';
      hans.userData.warRoomHansMotionState = 'walk';
    };

    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);

    const stages = getWarRoomHansPostRenderStageKeys(driver);
    expect(stages.indexOf(WAR_ROOM_HANS_BOARD_COLLISION_GUARD_VERSION))
      .toBeLessThan(stages.indexOf(WAR_ROOM_HANS_FACING_GUARD_VERSION));

    const before = worldPosition(hans);
    driver.onBeforeRender();
    const after = worldPosition(hans);
    const travel = after.clone().sub(before);

    expect(after.z).toBeCloseTo(-5.1, 6);
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(renderedFaceDotTravel(hans, head, face, travel)).toBeGreaterThan(0.98);
    expect(hans.userData.warRoomHansFacingGuardCorrections).toBe(1);
  });

  it('does not disturb a transit position that is already outside the board, except to ground Hans', () => {
    const { root, hans, driver } = makeRig({ worldX: -5.4, worldY: 0.12, worldZ: -5.8 });

    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);
    driver.onBeforeRender();

    const world = worldPosition(hans);
    expect(world.x).toBeCloseTo(-5.4, 6);
    expect(world.z).toBeCloseTo(-5.8, 6);
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(hans.userData.warRoomHansBoardCollisionApplied).toBe(false);
    expect(hans.userData.warRoomHansBoardGroundedY).toBeCloseTo(-0.34, 6);
  });
});
