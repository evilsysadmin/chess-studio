import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansMotionPolish,
  WAR_ROOM_HANS_CANONICAL_SCALE,
  WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION,
} from './WarRoomHansMotionPolishV2.js';

function makeRig() {
  const root = new THREE.Group();

  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(-4.95, 0, 0);
  root.add(fireplace);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(-0.4, -0.34, 0.72);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  const torso = new THREE.Group();
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const head = new THREE.Group();
  const carriedLog = new THREE.Group();
  const carriedPoker = new THREE.Group();
  torso.position.y = 1.36;
  leftArm.position.y = 1.62;
  rightArm.position.y = 1.62;
  head.position.y = 2.12;
  carriedLog.visible = false;
  carriedPoker.visible = false;
  hans.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, carriedLog, carriedPoker);
  hans.userData.refs = {
    leftLeg,
    rightLeg,
    torso,
    leftArm,
    rightArm,
    head,
    carriedLog,
    carriedPoker,
  };
  fireplace.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansPhase = 'take-poker';
  driver.onBeforeRender = () => {};
  fireplace.add(driver);

  const door = new THREE.Group();
  door.name = 'war-room-hans-service-door';
  door.userData.refs = { side: -1, doorZ: 6 };
  const recess = new THREE.Group();
  recess.name = 'war-room-hans-service-door-recess';
  recess.position.x = -7.745;
  door.add(recess);
  root.add(door);

  return { root, fireplace, hans, driver, door };
}

describe('Hans motion polish v2', () => {
  it('uses canonical environmental scale and never offsets the whole body behind the FSM', () => {
    const { root, hans, driver } = makeRig();
    let x = -0.4;
    driver.onBeforeRender = () => {
      hans.position.set(x, -0.34, 0.72);
      driver.userData.warRoomHansPhase = 'take-poker';
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();
    x = -1.1;
    driver.onBeforeRender();

    const visualRoot = hans.getObjectByName('war-room-hans-visual-root');
    expect(hans.scale.x).toBeCloseTo(WAR_ROOM_HANS_CANONICAL_SCALE, 6);
    expect(hans.scale.y).toBeCloseTo(WAR_ROOM_HANS_CANONICAL_SCALE, 6);
    expect(hans.scale.z).toBeCloseTo(WAR_ROOM_HANS_CANONICAL_SCALE, 6);
    expect(hans.position.x).toBeCloseTo(-1.1, 6);
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(visualRoot.position.x).toBe(0);
    expect(visualRoot.position.y).toBe(0);
    expect(visualRoot.position.z).toBe(0);
    expect(hans.userData.warRoomHansVisualLag).toBe(0);
    expect(driver.userData.warRoomHansMotionPolishV2).toBe(WAR_ROOM_HANS_MOTION_POLISH_V2_VERSION);
  });

  it('drives the walking pose from travelled distance so lateral movement cannot read as levitation', () => {
    const { root, hans, driver } = makeRig();
    let x = -0.4;
    driver.onBeforeRender = () => {
      hans.position.set(x, -0.34, 0.72);
      driver.userData.warRoomHansPhase = 'carry-log';
      hans.userData.refs.carriedLog.visible = true;
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();
    x = -0.52;
    driver.onBeforeRender();

    expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeGreaterThan(0.02);
    expect(hans.userData.refs.rightLeg.rotation.x).toBeCloseTo(-hans.userData.refs.leftLeg.rotation.x, 6);
    expect(hans.getObjectByName('war-room-hans-visual-root').position.y).toBe(0);
    expect(hans.userData.warRoomHansMotionState).toBe('walk-carry-log');
    expect(hans.userData.warRoomHansGrounded).toBe(true);
  });

  it('derives exit clearance from the actual service-door wall plane after scaling Hans', () => {
    const { root, hans, driver } = makeRig();
    driver.onBeforeRender = () => {
      hans.position.set(-2.65, -0.34, 5.2);
      driver.userData.warRoomHansPhase = 'leave';
      hans.userData.warRoomHansRoute = 'leave-corridor';
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    const safeFrameX = hans.position.x / -1;
    expect(safeFrameX).toBeGreaterThan(2.25);
    expect(safeFrameX).toBeLessThan(2.34);
    expect(hans.userData.warRoomHansDoorSafeFrameX).toBeCloseTo(safeFrameX, 6);
    expect(hans.userData.warRoomHansWallClearanceApplied).toBe(true);
    expect(hans.getObjectByName('war-room-hans-visual-root').position.x).toBe(0);
  });
});
