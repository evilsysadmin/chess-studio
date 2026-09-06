import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansElderWalk,
  WAR_ROOM_HANS_ELDER_WALK_VERSION,
} from './WarRoomHansElderWalk.js';

function makeRig({ axis = 'x' } = {}) {
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
  let distance = 0;
  driver.onBeforeRender = () => {
    distance -= 0.07;
    if (axis === 'z') hans.position.z = 0.72 + distance;
    else hans.position.x = distance;
    hans.userData.warRoomHansMotionState = 'walk';
  };
  root.add(driver);
  return {
    root,
    hans,
    driver,
    torso,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    carriedLog,
    carriedPoker,
  };
}

describe('Hans elder walk', () => {
  it('uses eight weighted gait phases with a visibly elderly lateral stoop', () => {
    const { root, hans, driver, torso, head, leftLeg, rightLeg } = makeRig();

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    expect(driver.userData.warRoomHansElderWalk).toBe(WAR_ROOM_HANS_ELDER_WALK_VERSION);
    expect(driver.userData.warRoomHansGaitFrames).toBe(8);

    for (let frame = 0; frame < 10; frame += 1) driver.onBeforeRender();

    expect(hans.userData.warRoomHansGaitFrameCount).toBe(8);
    expect(hans.userData.warRoomHansGaitFrame).toBeGreaterThanOrEqual(0);
    expect(hans.userData.warRoomHansGaitFrame).toBeLessThan(8);
    expect(hans.userData.warRoomHansGaitStyle).toBe('elder-butler-weighted-v2-horizontal-stoop');
    expect(hans.userData.warRoomHansHorizontalWalkBlend).toBeGreaterThan(0.85);
    expect(hans.userData.warRoomHansHunchRadians).toBeGreaterThan(0.09);
    expect(hans.userData.warRoomHansHunchRadians).toBeLessThan(0.12);
    expect(Math.abs(torso.rotation.x)).toBeGreaterThan(0.085);
    expect(Math.abs(head.rotation.x)).toBeGreaterThan(0.01);
    expect(Math.abs(leftLeg.rotation.x - rightLeg.rotation.x)).toBeGreaterThan(0.02);
  });

  it('leans more and swings the arms slightly more in horizontal travel than longitudinal travel', () => {
    const horizontal = makeRig({ axis: 'x' });
    const longitudinal = makeRig({ axis: 'z' });

    expect(installWarRoomHansElderWalk(horizontal.root)).toBe(1);
    expect(installWarRoomHansElderWalk(longitudinal.root)).toBe(1);

    let horizontalMaxArm = 0;
    let longitudinalMaxArm = 0;
    for (let frame = 0; frame < 18; frame += 1) {
      horizontal.driver.onBeforeRender();
      longitudinal.driver.onBeforeRender();
      horizontalMaxArm = Math.max(horizontalMaxArm, Math.abs(horizontal.leftArm.rotation.x));
      longitudinalMaxArm = Math.max(longitudinalMaxArm, Math.abs(longitudinal.leftArm.rotation.x));
    }

    expect(horizontal.hans.userData.warRoomHansHorizontalWalkBlend).toBeGreaterThan(0.95);
    expect(longitudinal.hans.userData.warRoomHansHorizontalWalkBlend).toBeLessThan(0.05);
    expect(horizontal.hans.userData.warRoomHansHunchRadians)
      .toBeGreaterThan(longitudinal.hans.userData.warRoomHansHunchRadians + 0.035);
    expect(horizontalMaxArm).toBeGreaterThan(longitudinalMaxArm * 1.35);
    expect(horizontalMaxArm).toBeLessThan(0.09);
  });

  it('owns carrying-arm poses while walking so the extra braceo never touches a carried log', () => {
    const {
      root,
      hans,
      driver,
      leftArm,
      rightArm,
      carriedLog,
    } = makeRig();
    carriedLog.visible = true;
    driver.onBeforeRender = (() => {
      let x = 0;
      return () => {
        x -= 0.07;
        hans.position.x = x;
        hans.userData.warRoomHansMotionState = 'walk-carry-log';
      };
    })();

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();

    expect(leftArm.rotation.x).toBeCloseTo(-0.43, 6);
    expect(leftArm.rotation.z).toBeCloseTo(0.035, 6);
    expect(rightArm.rotation.x).toBeCloseTo(-0.5, 6);
    expect(rightArm.rotation.z).toBeCloseTo(-0.025, 6);
    expect(hans.userData.warRoomHansGaitFrame).toBeGreaterThanOrEqual(0);
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