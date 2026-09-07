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
    } else {
      hans.userData.warRoomHansMotionState = 'stoke-fire-action';
    }
  };
  root.add(driver);

  return {
    root,
    hans,
    driver,
    setMode(value) { mode = value; },
  };
}

describe('War Room Hans articulated walk adapter', () => {
  it('turns real travelled distance into visible knee motion without owning pathing', () => {
    const { root, hans, driver } = makeRig();
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
    expect(hans.userData.warRoomHansWalkCycleDistance).toBeGreaterThan(0.1);
    expect(Math.abs(hans.userData.refs.leftKnee.rotation.x - hans.userData.refs.rightKnee.rotation.x)).toBeGreaterThan(0.12);
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
});
