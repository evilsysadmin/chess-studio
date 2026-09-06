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
  carriedLog.position.z = 0.22;
  carriedPoker.position.z = 0.22;
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

  it('faces the real travel vector while walking so horizontal movement cannot moonwalk', () => {
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

    const faceX = Math.sin(hans.rotation.y);
    const faceZ = Math.cos(hans.rotation.y);
    expect(faceX).toBeLessThan(-0.99);
    expect(Math.abs(faceZ)).toBeLessThan(0.02);
    expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeGreaterThan(0.01);
    expect(hans.userData.refs.rightLeg.rotation.x).toBeCloseTo(-hans.userData.refs.leftLeg.rotation.x, 6);
    expect(hans.getObjectByName('war-room-hans-visual-root').position.y).toBe(0);
    expect(hans.userData.warRoomHansMotionState).toBe('walk-carry-log');
    expect(hans.userData.warRoomHansMovementFacing).toBe('velocity-vector');
  });

  it('uses the real armor bounding box plus Hans radius while crossing the bypass lane', () => {
    const { root, hans, driver } = makeRig();
    const armor = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.4, 0.8),
      new THREE.MeshBasicMaterial(),
    );
    armor.name = 'war-room-teutonic-armor-left';
    armor.position.set(-6.68, 1.2, 4.5);
    root.add(armor);

    driver.onBeforeRender = () => {
      hans.position.set(-1.42, -0.34, 4.4);
      driver.userData.warRoomHansPhase = 'leave';
      hans.userData.warRoomHansRoute = 'leave-bypass';
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    const safeFrameX = hans.position.x / -1;
    const hansWorldX = -4.95 + hans.position.x;
    const armorInnerEdge = armor.position.x + 0.7;
    const scaledHalfWidth = 0.49 * WAR_ROOM_HANS_CANONICAL_SCALE;
    expect(safeFrameX).toBeGreaterThan(0.45);
    expect(safeFrameX).toBeLessThan(0.6);
    expect(hansWorldX - scaledHalfWidth).toBeGreaterThan(armorInnerEdge + 0.15);
    expect(hans.userData.warRoomHansArmorClearanceApplied).toBe(true);
    expect(driver.userData.warRoomHansArmorClearance).toBe('box3-expanded-by-hans-v1');
  });

  it('picks up a log by folding at the hips with asymmetric weight instead of sinking the whole rig', () => {
    const { root, hans, driver } = makeRig();
    driver.onBeforeRender = () => {
      hans.position.set(-1.62, -0.49, 0.72);
      driver.userData.warRoomHansPhase = 'take-log';
      hans.userData.refs.carriedLog.visible = false;
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    const { torso, head, leftLeg, rightLeg, leftArm, rightArm } = hans.userData.refs;
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(Math.abs(torso.rotation.x)).toBeGreaterThan(0.25);
    expect(Math.abs(head.rotation.x)).toBeGreaterThan(0.1);
    expect(leftLeg.rotation.x).toBeGreaterThan(0.1);
    expect(rightLeg.rotation.x).toBeLessThan(0);
    expect(rightArm.rotation.x).toBeLessThan(leftArm.rotation.x - 0.35);
    expect(hans.userData.warRoomHansMotionState).toBe('pick-log');
    expect(hans.userData.warRoomHansActionPose).toBe('pick-log');
  });

  it('places the log with a forward reach and staggered stance instead of repeating the pickup squat', () => {
    const { root, hans, driver } = makeRig();
    driver.onBeforeRender = () => {
      hans.position.set(-0.9, -0.45, 0.72);
      driver.userData.warRoomHansPhase = 'place-log';
      hans.userData.refs.carriedLog.visible = true;
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    const { torso, leftLeg, rightLeg, leftArm, rightArm } = hans.userData.refs;
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(Math.abs(torso.rotation.x)).toBeGreaterThan(0.15);
    expect(Math.abs(torso.position.z)).toBeGreaterThan(0.015);
    expect(leftLeg.rotation.x).toBeGreaterThan(0.05);
    expect(rightLeg.rotation.x).toBeLessThan(0);
    expect(rightArm.rotation.x).toBeLessThan(leftArm.rotation.x - 0.1);
    expect(hans.userData.warRoomHansMotionState).toBe('place-log');
  });

  it('stokes from a planted stance with arm thrust rather than a full-body genuflection', () => {
    const { root, hans, driver } = makeRig();
    driver.onBeforeRender = () => {
      hans.position.set(-0.92, -0.34, 0.72);
      driver.userData.warRoomHansPhase = 'stoke-fire';
      hans.userData.refs.carriedPoker.visible = true;
      hans.userData.refs.carriedPoker.rotation.z = 0.18;
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    const { torso, leftLeg, rightLeg, leftArm, rightArm, carriedPoker } = hans.userData.refs;
    expect(hans.position.y).toBeCloseTo(-0.34, 6);
    expect(Math.abs(torso.rotation.x)).toBeGreaterThan(0.1);
    expect(leftLeg.rotation.x).toBeGreaterThan(0);
    expect(rightLeg.rotation.x).toBeLessThan(0);
    expect(rightArm.rotation.x).toBeLessThan(leftArm.rotation.x - 0.35);
    expect(Math.abs(carriedPoker.rotation.z)).toBeGreaterThan(0.05);
    expect(hans.userData.warRoomHansMotionState).toBe('stoke-fire-action');
  });

  it('derives exit clearance from the actual service-door wall plane after scaling Hans', () => {
    const { root, hans, driver } = makeRig();
    driver.onBeforeRender = () => {
      hans.position.set(-2.65, -0.34, 5.2);
      driver.userData.warRoomHansPhase = 'leave';
      hans.userData.warRoomHansRoute = 'leave-door';
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
