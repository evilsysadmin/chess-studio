import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansElderWalk,
  WAR_ROOM_HANS_ELDER_WALK_VERSION,
} from './WarRoomHansElderWalk.js';

function makeRig() {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(0, -0.34, 0.72);

  const part = (y = 0) => {
    const group = new THREE.Group();
    group.position.y = y;
    hans.add(group);
    return group;
  };

  const leftLeg = part();
  const rightLeg = part();
  const torso = part(1.36);
  const head = part(2.12);
  const leftArm = part(1.62);
  const rightArm = part(1.62);
  const carriedLog = part();
  const carriedPoker = part();
  carriedLog.position.z = 0.22;
  carriedPoker.position.z = 0.22;
  carriedLog.visible = false;
  carriedPoker.visible = false;
  hans.userData.refs = {
    leftLeg,
    rightLeg,
    torso,
    head,
    leftArm,
    rightArm,
    carriedLog,
    carriedPoker,
  };
  root.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  let x = 0;
  driver.onBeforeRender = () => {
    x -= 0.07;
    hans.position.x = x;
    hans.userData.warRoomHansMotionState = 'walk';
  };
  root.add(driver);
  return { root, hans, driver, torso, head, leftLeg, rightLeg };
}

describe('Hans elder walk', () => {
  it('uses eight weighted gait phases with a restrained tired hunch', () => {
    const { root, hans, driver, torso, head, leftLeg, rightLeg } = makeRig();

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    expect(driver.userData.warRoomHansElderWalk).toBe(WAR_ROOM_HANS_ELDER_WALK_VERSION);
    expect(driver.userData.warRoomHansGaitFrames).toBe(8);

    driver.onBeforeRender();
    driver.onBeforeRender();
    driver.onBeforeRender();

    expect(hans.userData.warRoomHansGaitFrameCount).toBe(8);
    expect(hans.userData.warRoomHansGaitFrame).toBeGreaterThanOrEqual(0);
    expect(hans.userData.warRoomHansGaitFrame).toBeLessThan(8);
    expect(hans.userData.warRoomHansGaitStyle).toBe('elder-butler-weighted-v1');
    expect(hans.userData.warRoomHansHunchRadians).toBeGreaterThan(0.04);
    expect(hans.userData.warRoomHansHunchRadians).toBeLessThan(0.07);
    expect(Math.abs(torso.rotation.x)).toBeGreaterThan(0.04);
    expect(Math.abs(head.rotation.x)).toBeGreaterThan(0.01);
    expect(Math.abs(leftLeg.rotation.x - rightLeg.rotation.x)).toBeGreaterThan(0.02);
  });

  it('does not overwrite articulated non-walking action poses', () => {
    const { root, hans, driver, torso } = makeRig();
    driver.onBeforeRender = () => {
      hans.userData.warRoomHansMotionState = 'stoke-fire-action';
      torso.rotation.x = 0.22;
    };

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    expect(torso.rotation.x).toBeCloseTo(0.22, 6);
    expect(hans.userData.warRoomHansGaitFrame).toBeUndefined();
  });
});
