import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansArticulatedWalk,
  WAR_ROOM_HANS_ARTICULATED_WALK_VERSION,
} from './WarRoomHansArticulatedWalk.js';
import { HANS_WALK_CYCLE_VERSION } from './HansWalkCycle.js';

function makeRigidLeg(x, material) {
  const leg = new THREE.Group();
  leg.position.set(x, 0.82, 0);
  const rigid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.72, 9), material);
  rigid.position.y = -0.34;
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), material);
  shoe.position.set(0, -0.74, 0.07);
  leg.add(rigid, shoe);
  return leg;
}

function makeRig() {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(0, -0.34, 0.72);
  const material = new THREE.MeshBasicMaterial();
  const leftLeg = makeRigidLeg(-0.17, material);
  const rightLeg = makeRigidLeg(0.17, material);
  const carriedLog = new THREE.Group();
  const carriedPoker = new THREE.Group();
  carriedLog.position.z = 0.22;
  carriedPoker.position.z = 0.22;
  carriedLog.visible = false;
  carriedPoker.visible = false;
  hans.add(leftLeg, rightLeg, carriedLog, carriedPoker);
  hans.userData.refs = { leftLeg, rightLeg, carriedLog, carriedPoker };
  root.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  let mode = 'walk';
  driver.onBeforeRender = () => {
    if (mode === 'walk') {
      hans.position.x -= 0.065;
      hans.userData.warRoomHansMotionState = 'walk';
    } else if (mode === 'teleport') {
      hans.position.x -= 0.6;
      hans.userData.warRoomHansMotionState = 'walk';
    } else {
      hans.userData.warRoomHansMotionState = 'stoke-fire-action';
    }
  };
  root.add(driver);

  return { root, hans, driver, setMode(value) { mode = value; } };
}

function footWorldPitch(body, side) {
  return body[`${side}Leg`].rotation.x
    + body[`${side}Knee`].rotation.x
    + body[`${side}Ankle`].rotation.x;
}

describe('War Room Hans articulated walk adapter', () => {
  it('uses one local foot-target IK contract instead of a second War Room leg animation', () => {
    const { root, hans, driver } = makeRig();
    expect(installWarRoomHansArticulatedWalk(root)).toBe(1);
    expect(driver.userData.warRoomHansArticulatedWalk).toBe(WAR_ROOM_HANS_ARTICULATED_WALK_VERSION);
    expect(driver.userData.warRoomHansWalkCycle).toBe(HANS_WALK_CYCLE_VERSION);

    driver.onBeforeRender();
    driver.onBeforeRender();

    expect(hans.userData.refs.leftAnkle).toBeTruthy();
    expect(hans.userData.refs.rightAnkle).toBeTruthy();
    expect(hans.userData.warRoomHansGaitSolver).toBe('local-foot-target-ik-v1');
    expect(hans.userData.warRoomHansLegRigInternal).toBe('thigh-knee-shin-ankle-foot-v2');
    expect(hans.userData.warRoomHansWalkCycleDistance).toBeCloseTo(0.13, 6);
    expect(Math.max(
      hans.userData.warRoomHansKneeFlexLeft,
      hans.userData.warRoomHansKneeFlexRight,
    )).toBeLessThanOrEqual(0.72);
  });

  it('lets the ankle roll the shoe instead of flattening it through knee counter-rotation', () => {
    const { root, hans, driver } = makeRig();
    expect(installWarRoomHansArticulatedWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();

    const leftPitch = footWorldPitch(hans.userData.refs, 'left');
    const rightPitch = footWorldPitch(hans.userData.refs, 'right');
    expect(Math.max(Math.abs(leftPitch), Math.abs(rightPitch))).toBeGreaterThan(0.02);
    expect(Math.abs(leftPitch)).toBeLessThan(0.2);
    expect(Math.abs(rightPitch)).toBeLessThan(0.2);
    expect(hans.userData.warRoomHansFootDirection).toBe('toe-forward-v4-ankle-roll');
  });

  it('drops the complete gait pose when Hans enters a non-walking action', () => {
    const { root, hans, driver, setMode } = makeRig();
    expect(installWarRoomHansArticulatedWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();
    expect(Math.max(
      Math.abs(hans.userData.refs.leftKnee.rotation.x),
      Math.abs(hans.userData.refs.rightKnee.rotation.x),
    )).toBeGreaterThan(0.1);

    setMode('action');
    driver.onBeforeRender();
    expect(hans.userData.refs.leftLeg.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.rightLeg.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.leftKnee.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.rightKnee.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.leftAnkle.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.rightAnkle.rotation.x).toBeCloseTo(0, 6);
  });

  it('suppresses genuine teleports instead of converting them into giant gait steps', () => {
    const { root, hans, driver, setMode } = makeRig();
    expect(installWarRoomHansArticulatedWalk(root)).toBe(1);
    setMode('teleport');
    driver.onBeforeRender();

    expect(hans.userData.warRoomHansWalkCycleDistance).toBeUndefined();
    expect(hans.userData.warRoomHansArticulatedTeleportSuppressed).toBe(true);
    expect(hans.userData.warRoomHansGaitTeleportSuppressed).toBe(true);
    expect(hans.userData.refs.leftKnee.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.rightKnee.rotation.x).toBeCloseTo(0, 6);
  });
});
