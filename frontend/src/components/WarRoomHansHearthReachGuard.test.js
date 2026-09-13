import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansHearthReachGuard,
  orientHansHearthReachRotation,
  WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION,
} from './WarRoomHansHearthReachGuard.js';

function makeRig(forward = -1) {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const carriedLog = new THREE.Group();
  carriedLog.position.z = forward * 0.22;
  hans.add(leftArm, rightArm, carriedLog);
  hans.userData.refs = { leftArm, rightArm, carriedLog };
  root.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansPhase = 'place-log';
  driver.onBeforeRender = () => {
    // Reproduce the bad upstream pose: both arms always flex toward +Z.
    leftArm.rotation.x = -0.73;
    rightArm.rotation.x = -0.9;
  };
  root.add(driver);

  return { root, hans, driver, leftArm, rightArm };
}

describe('Hans hearth reach direction guard', () => {
  it('mirrors the place-log arm flexion when Hans local forward points toward -Z', () => {
    const { root, hans, driver, leftArm, rightArm } = makeRig(-1);

    expect(installWarRoomHansHearthReachGuard(root)).toBe(1);
    driver.onBeforeRender();

    expect(leftArm.rotation.x).toBeCloseTo(0.73, 6);
    expect(rightArm.rotation.x).toBeCloseTo(0.9, 6);
    expect(hans.userData.warRoomHansHearthReachForward).toBe(-1);
    expect(hans.userData.warRoomHansHearthReachPose).toBe('arms-toward-hearth');
    expect(driver.userData.warRoomHansHearthReachGuard).toBe(WAR_ROOM_HANS_HEARTH_REACH_GUARD_VERSION);
  });

  it('keeps the canonical negative flexion when local forward points toward +Z', () => {
    const { root, driver, leftArm, rightArm } = makeRig(1);

    expect(installWarRoomHansHearthReachGuard(root)).toBe(1);
    driver.onBeforeRender();

    expect(leftArm.rotation.x).toBeCloseTo(-0.73, 6);
    expect(rightArm.rotation.x).toBeCloseTo(-0.9, 6);
  });

  it('preserves magnitude while choosing the sign from the hearth-facing axis', () => {
    expect(orientHansHearthReachRotation(-0.8, -1)).toBeCloseTo(0.8, 6);
    expect(orientHansHearthReachRotation(0.8, 1)).toBeCloseTo(-0.8, 6);
  });
});
