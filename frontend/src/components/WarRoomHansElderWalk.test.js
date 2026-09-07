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
  it('uses eight weighted gait phases with a clearly readable elderly lateral stoop', () => {
    const { root, hans, driver, torso, head, leftLeg, rightLeg, leftArm } = makeRig();

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    expect(driver.userData.warRoomHansElderWalk).toBe(WAR_ROOM_HANS_ELDER_WALK_VERSION);
    expect(driver.userData.warRoomHansGaitFrames).toBe(8);

    let maxLegSeparation = 0;
    let maxArmSwing = 0;
    let maxStepSeparation = 0;
    for (let frame = 0; frame < 14; frame += 1) {
      driver.onBeforeRender();
      maxLegSeparation = Math.max(
        maxLegSeparation,
        Math.abs(leftLeg.rotation.x - rightLeg.rotation.x),
      );
      maxArmSwing = Math.max(maxArmSwing, Math.abs(leftArm.rotation.x));
      maxStepSeparation = Math.max(maxStepSeparation, Math.abs(leftLeg.position.z - rightLeg.position.z));
    }

    expect(hans.userData.warRoomHansGaitFrameCount).toBe(8);
    expect(hans.userData.warRoomHansGaitFrame).toBeGreaterThanOrEqual(0);
    expect(hans.userData.warRoomHansGaitFrame).toBeLessThan(8);
    expect(hans.userData.warRoomHansGaitStyle).toBe('elder-butler-readable-v3-stoop-arms-steps');
    expect(hans.userData.warRoomHansHorizontalWalkBlend).toBeGreaterThan(0.98);
    expect(hans.userData.warRoomHansHunchRadians).toBeGreaterThan(0.16);
    expect(hans.userData.warRoomHansHunchRadians).toBeLessThan(0.18);
    expect(Math.abs(torso.rotation.x)).toBeGreaterThan(0.15);
    expect(torso.position.z).toBeGreaterThan(0.055);
    expect(head.position.z).toBeGreaterThan(torso.position.z);
    expect(maxLegSeparation).toBeGreaterThan(0.22);
    expect(maxStepSeparation).toBeGreaterThan(0.12);
    expect(maxArmSwing).toBeGreaterThan(0.13);
  });

  it('leans, steps and swings clearly more in horizontal travel than longitudinal travel', () => {
    const horizontal = makeRig({ axis: 'x' });
    const longitudinal = makeRig({ axis: 'z' });

    expect(installWarRoomHansElderWalk(horizontal.root)).toBe(1);
    expect(installWarRoomHansElderWalk(longitudinal.root)).toBe(1);

    let horizontalMaxArm = 0;
    let longitudinalMaxArm = 0;
    let horizontalMaxLeg = 0;
    let longitudinalMaxLeg = 0;
    for (let frame = 0; frame < 18; frame += 1) {
      horizontal.driver.onBeforeRender();
      longitudinal.driver.onBeforeRender();
      horizontalMaxArm = Math.max(horizontalMaxArm, Math.abs(horizontal.leftArm.rotation.x));
      longitudinalMaxArm = Math.max(longitudinalMaxArm, Math.abs(longitudinal.leftArm.rotation.x));
      horizontalMaxLeg = Math.max(
        horizontalMaxLeg,
        Math.abs(horizontal.leftLeg.rotation.x - horizontal.rightLeg.rotation.x),
      );
      longitudinalMaxLeg = Math.max(
        longitudinalMaxLeg,
        Math.abs(longitudinal.leftLeg.rotation.x - longitudinal.rightLeg.rotation.x),
      );
    }

    expect(horizontal.hans.userData.warRoomHansHorizontalWalkBlend).toBeGreaterThan(0.99);
    expect(longitudinal.hans.userData.warRoomHansHorizontalWalkBlend).toBeLessThan(0.05);
    expect(horizontal.hans.userData.warRoomHansHunchRadians)
      .toBeGreaterThan(longitudinal.hans.userData.warRoomHansHunchRadians + 0.09);
    expect(horizontalMaxArm).toBeGreaterThan(longitudinalMaxArm * 2.4);
    expect(horizontalMaxArm).toBeGreaterThan(0.13);
    expect(horizontalMaxArm).toBeLessThan(0.18);
    expect(horizontalMaxLeg).toBeGreaterThan(longitudinalMaxLeg * 1.45);
    expect(horizontal.hans.userData.warRoomHansLegSwingGain).toBeGreaterThan(1.5);
    expect(horizontal.hans.userData.warRoomHansStepGain).toBeGreaterThan(1.45);
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