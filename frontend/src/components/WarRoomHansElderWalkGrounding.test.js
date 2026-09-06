import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installWarRoomHansElderWalk } from './WarRoomHansElderWalk.js';

function makeRig(step = 0.11) {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  root.add(hans);

  const part = () => {
    const group = new THREE.Group();
    hans.add(group);
    return group;
  };
  const leftLeg = part();
  const rightLeg = part();
  const torso = part();
  const head = part();
  const leftArm = part();
  const rightArm = part();
  const carriedLog = part();
  const carriedPoker = part();
  carriedLog.position.z = 0.22;
  carriedPoker.position.z = 0.22;
  carriedLog.visible = false;
  carriedPoker.visible = false;
  hans.userData.refs = { leftLeg, rightLeg, torso, head, leftArm, rightArm, carriedLog, carriedPoker };

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.onBeforeRender = () => {
    hans.position.x += step;
    hans.userData.warRoomHansMotionState = 'walk';
  };
  root.add(driver);
  return { root, hans, driver, leftLeg, rightLeg };
}

describe('Hans elder-walk grounding', () => {
  it('advances gait by real body travel instead of clamping low-FPS frames', () => {
    const { root, hans, driver } = makeRig(0.11);
    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansGaitDistance).toBeCloseTo(0.22, 6);
    expect(hans.userData.warRoomHansGaitGrounding).toBe('real-distance-foot-plant-v3');
  });

  it('adds longitudinal foot planting as well as lift', () => {
    const { root, driver, leftLeg, rightLeg } = makeRig(0.05);
    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();
    const planted = Math.abs(leftLeg.position.z) + Math.abs(rightLeg.position.z);
    const lifted = Math.abs(leftLeg.position.y) + Math.abs(rightLeg.position.y);
    expect(planted).toBeGreaterThan(0.02);
    expect(lifted).toBeGreaterThan(0.005);
  });

  it('suppresses genuine teleports instead of trying to animate them as steps', () => {
    const { root, hans, driver } = makeRig(0.6);
    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansGaitDistance).toBeUndefined();
    expect(hans.userData.warRoomHansGaitTeleportSuppressed).toBe(true);
  });
});
