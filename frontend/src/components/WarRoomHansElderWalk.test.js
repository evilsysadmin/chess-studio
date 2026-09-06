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
  let mode = 'walk';
  driver.onBeforeRender = () => {
    if (mode === 'walk') {
      x -= 0.07;
      hans.position.x = x;
      hans.userData.warRoomHansMotionState = 'walk';
      // Representative MotionPolish-owned pose. Elder gait must add to it,
      // never replace it with installation-time bases.
      leftLeg.rotation.set(0.08, 0, 0.006);
      rightLeg.rotation.set(-0.08, 0, -0.006);
      torso.position.set(0, 1.36, 0);
      torso.rotation.set(0.02, 0.01, -0.004);
      head.position.set(0, 2.12, 0);
      head.rotation.set(0.01, -0.006, 0.002);
      leftArm.rotation.set(-0.04, 0, 0);
      rightArm.rotation.set(0.03, 0, 0);
      return;
    }

    hans.userData.warRoomHansMotionState = 'stoke-fire-action';
    torso.position.set(0.01, 1.33, 0.03);
    torso.rotation.set(0.22, 0.07, -0.03);
    leftLeg.rotation.set(0.11, 0, -0.02);
    rightLeg.rotation.set(-0.035, 0, 0.018);
    leftArm.rotation.set(-0.31, 0, 0.04);
    rightArm.rotation.set(-0.76, 0, -0.05);
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
    setMode(next) { mode = next; },
  };
}

describe('Hans elder walk', () => {
  it('layers eight weighted phases over the canonical gait inside the shared pipeline', () => {
    const { root, hans, driver, torso, head, leftLeg, rightLeg } = makeRig();

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    expect(driver.userData.warRoomHansElderWalk).toBe(WAR_ROOM_HANS_ELDER_WALK_VERSION);
    expect(driver.userData.warRoomHansGaitFrames).toBe(8);
    expect(driver.userData.warRoomHansLocomotionOwnership).toBe('motion-polish-primary-elder-additive-v2');
    expect(driver.userData.warRoomHansPostRenderStageCount).toBe(1);
    expect(driver.userData.warRoomHansPostRenderStages).toContain(WAR_ROOM_HANS_ELDER_WALK_VERSION);

    driver.onBeforeRender();
    const firstBlend = hans.userData.warRoomHansGaitBlend;
    driver.onBeforeRender();
    driver.onBeforeRender();
    const settledBlend = hans.userData.warRoomHansGaitBlend;

    expect(hans.userData.warRoomHansGaitFrameCount).toBe(8);
    expect(hans.userData.warRoomHansGaitFrame).toBeGreaterThanOrEqual(0);
    expect(hans.userData.warRoomHansGaitFrame).toBeLessThan(8);
    expect(hans.userData.warRoomHansGaitStyle).toBe('elder-butler-layered-v2');
    expect(hans.userData.warRoomHansHunchRadians).toBeGreaterThan(0.035);
    expect(hans.userData.warRoomHansHunchRadians).toBeLessThan(0.06);
    expect(firstBlend).toBeGreaterThan(0);
    expect(firstBlend).toBeLessThan(1);
    expect(settledBlend).toBeGreaterThan(firstBlend);

    // Canonical MotionPolish values survive underneath the correction.
    expect(torso.rotation.x).toBeGreaterThan(0.02);
    expect(torso.rotation.x).toBeLessThan(0.09);
    expect(Math.abs(head.rotation.x - 0.01)).toBeLessThan(0.04);
    expect(Math.abs(leftLeg.rotation.x - 0.08)).toBeLessThan(0.05);
    expect(Math.abs(rightLeg.rotation.x + 0.08)).toBeLessThan(0.05);
    expect(Math.abs(leftLeg.rotation.x - rightLeg.rotation.x)).toBeGreaterThan(0.12);
  });

  it('hands complete authority back to articulated work poses when walking stops', () => {
    const { root, hans, driver, torso, leftLeg, rightLeg, setMode } = makeRig();

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansGaitBlend).toBeGreaterThan(0);

    setMode('action');
    driver.onBeforeRender();

    expect(torso.position.x).toBeCloseTo(0.01, 6);
    expect(torso.position.y).toBeCloseTo(1.33, 6);
    expect(torso.rotation.x).toBeCloseTo(0.22, 6);
    expect(torso.rotation.y).toBeCloseTo(0.07, 6);
    expect(leftLeg.rotation.x).toBeCloseTo(0.11, 6);
    expect(rightLeg.rotation.x).toBeCloseTo(-0.035, 6);
    expect(hans.userData.warRoomHansGaitBlend).toBe(0);
    expect(hans.userData.warRoomHansGaitFrame).toBeUndefined();
  });

  it('keeps carried-object arm poses under the canonical driver', () => {
    const { root, driver, leftArm, rightArm, carriedLog } = makeRig();
    carriedLog.visible = true;

    expect(installWarRoomHansElderWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();

    expect(leftArm.rotation.x).toBeCloseTo(-0.04, 6);
    expect(rightArm.rotation.x).toBeCloseTo(0.03, 6);
  });
});
