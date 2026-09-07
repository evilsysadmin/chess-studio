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

  return {
    root,
    hans,
    driver,
    leftLeg,
    rightLeg,
    setMode(value) { mode = value; },
  };
}

function worldKneeFlex(root, body, side) {
  root.updateMatrixWorld(true);
  const hip = new THREE.Vector3();
  const knee = new THREE.Vector3();
  const shoe = new THREE.Vector3();
  body[`${side}Leg`].getWorldPosition(hip);
  body[`${side}Knee`].getWorldPosition(knee);
  body[`${side}Shoe`].getWorldPosition(shoe);
  const thigh = hip.sub(knee).normalize();
  const shin = shoe.sub(knee).normalize();
  return Math.PI - thigh.angleTo(shin);
}

function worldToeForwardDot(root, hans, body, side) {
  root.updateMatrixWorld(true);
  const shoeForward = new THREE.Vector3(0, 0, 1).transformDirection(body[`${side}Shoe`].matrixWorld);
  const hansForward = new THREE.Vector3(0, 0, 1).transformDirection(hans.matrixWorld);
  return shoeForward.dot(hansForward);
}

describe('War Room Hans articulated walk adapter', () => {
  it('keeps real world-space knee flex visible without turning the gait into a cartoon high-step', () => {
    const { root, hans, driver, leftLeg, rightLeg } = makeRig();
    expect(installWarRoomHansArticulatedWalk(root)).toBe(1);
    expect(driver.userData.warRoomHansArticulatedWalk).toBe(WAR_ROOM_HANS_ARTICULATED_WALK_VERSION);
    expect(driver.userData.warRoomHansWalkCycle).toBe(HANS_WALK_CYCLE_VERSION);

    const beforeX = hans.position.x;
    driver.onBeforeRender();
    driver.onBeforeRender();

    expect(hans.position.x).toBeLessThan(beforeX);
    expect(hans.userData.refs.leftKnee).toBeTruthy();
    expect(hans.userData.refs.rightKnee).toBeTruthy();
    expect(hans.userData.warRoomHansLegRig).toBe('thigh-knee-shin-foot-v1');
    expect(hans.userData.warRoomHansWalkCycleDistance).toBeCloseTo(0.13, 6);
    expect(hans.userData.warRoomHansWalkCyclePhaseDistance).toBeGreaterThan(hans.userData.warRoomHansWalkCycleDistance);
    expect(hans.userData.warRoomHansGaitGrounding).toBe('real-distance-foot-plant-v3');

    const visibleExtraFlex = Math.max(
      hans.userData.warRoomHansVisibleKneeFlexLeft,
      hans.userData.warRoomHansVisibleKneeFlexRight,
    );
    expect(visibleExtraFlex).toBeGreaterThan(0.4);
    expect(visibleExtraFlex).toBeLessThan(0.8);

    const geometricFlex = Math.max(
      worldKneeFlex(root, hans.userData.refs, 'left'),
      worldKneeFlex(root, hans.userData.refs, 'right'),
    );
    expect(geometricFlex).toBeGreaterThan(0.65);
    expect(geometricFlex).toBeLessThan(0.9);

    const kneeSeparation = Math.abs(
      hans.userData.refs.leftKnee.rotation.x - hans.userData.refs.rightKnee.rotation.x,
    );
    expect(kneeSeparation).toBeGreaterThan(0.3);
    expect(kneeSeparation).toBeLessThan(1.2);
    expect(Math.abs(leftLeg.position.z) + Math.abs(rightLeg.position.z)).toBeGreaterThan(0.02);

    const totalLift = Math.abs(leftLeg.position.y - 0.82) + Math.abs(rightLeg.position.y - 0.82);
    expect(totalLift).toBeGreaterThan(0.025);
    expect(totalLift).toBeLessThan(0.12);
  });

  it('keeps shoes forward without flattening the airborne foot into a full-length side silhouette', () => {
    const { root, hans, driver } = makeRig();
    expect(installWarRoomHansArticulatedWalk(root)).toBe(1);
    driver.onBeforeRender();
    driver.onBeforeRender();

    expect(hans.userData.warRoomHansFootDirection).toBe('toe-forward-v3-natural-pitch');
    expect(worldToeForwardDot(root, hans, hans.userData.refs, 'left')).toBeGreaterThan(0.82);
    expect(worldToeForwardDot(root, hans, hans.userData.refs, 'right')).toBeGreaterThan(0.82);

    const leftPitch = hans.userData.refs.leftLeg.rotation.x
      + hans.userData.refs.leftKnee.rotation.x
      + hans.userData.refs.leftShoe.rotation.x;
    const rightPitch = hans.userData.refs.rightLeg.rotation.x
      + hans.userData.refs.rightKnee.rotation.x
      + hans.userData.refs.rightShoe.rotation.x;
    expect(Math.abs(leftPitch)).toBeLessThan(0.65);
    expect(Math.abs(rightPitch)).toBeLessThan(0.65);

    const swingPitch = hans.userData.warRoomHansVisibleFootLiftLeft
      > hans.userData.warRoomHansVisibleFootLiftRight
      ? leftPitch
      : rightPitch;
    expect(Math.abs(swingPitch)).toBeGreaterThan(0.14);
    expect(Math.abs(swingPitch)).toBeLessThan(0.55);
  });

  it('drops the walking knee pose as soon as Hans enters a non-walking action', () => {
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
    expect(hans.userData.refs.leftKnee.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.refs.rightKnee.rotation.x).toBeCloseTo(0, 6);
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
