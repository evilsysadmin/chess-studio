import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installWarRoomHansMotionPolish } from './WarRoomHansMotionPolishV2.js';

const DOOR_X = 2.65;
const BASKET_X = -1.62;
const DOOR_DEPTH = 6;
const WORK_DEPTH = 0.72;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeEntryRig() {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(-4.95, 0, 0);
  root.add(fireplace);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;

  const refs = {};
  for (const name of ['leftLeg', 'rightLeg', 'torso', 'head', 'leftArm', 'rightArm', 'carriedLog', 'carriedPoker']) {
    refs[name] = new THREE.Group();
    hans.add(refs[name]);
  }
  refs.carriedLog.position.z = 0.22;
  refs.carriedPoker.position.z = 0.22;
  refs.carriedLog.visible = false;
  refs.carriedPoker.visible = false;
  hans.userData.refs = refs;
  fireplace.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  fireplace.add(driver);

  const door = new THREE.Group();
  door.name = 'war-room-hans-service-door';
  door.userData.refs = { side: -1, doorZ: DOOR_DEPTH };
  door.userData.warRoomHansDoorWorldZ = DOOR_DEPTH;
  root.add(door);

  let progress = 0;
  let quickRoute = true;
  driver.onBeforeRender = () => {
    const logicalX = lerp(DOOR_X, BASKET_X, progress);
    hans.position.set(-logicalX, -0.34, lerp(DOOR_DEPTH, WORK_DEPTH, progress));
    driver.userData.warRoomHansPhase = quickRoute ? 'fire-dimming' : 'walk-to-basket';
    hans.userData.warRoomHansRoute = quickRoute ? 'entry' : null;
  };
  driver.onBeforeRender();

  return {
    root,
    hans,
    driver,
    setProgress(value) {
      progress = value;
    },
    setQuickRoute(value) {
      quickRoute = value;
    },
  };
}

describe('Hans safe entry path', () => {
  it('enters via door, armor bypass and rear wall instead of cutting diagonally across the board', () => {
    const { root, hans, driver, setProgress } = makeEntryRig();

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    expect(driver.userData.warRoomHansEntryPath).toBe('door-bypass-rear-wall-v1');
    expect(hans.userData.warRoomHansEntryRouteStage).toBe('entry-door');
    expect(hans.position.z).toBeCloseTo(DOOR_DEPTH, 6);

    setProgress(0.35);
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansEntryRouteStage).toBe('entry-bypass');
    expect(Math.abs(hans.position.x)).toBeCloseTo(1.42, 6);
    expect(hans.position.z).toBeGreaterThan(WORK_DEPTH + 1);

    setProgress(0.7);
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansEntryRouteStage).toBe('entry-rear-wall');
    expect(hans.position.z).toBeCloseTo(WORK_DEPTH, 6);
    expect(hans.position.x).toBeLessThan(0);

    setProgress(0.85);
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansEntryRouteStage).toBe('entry-rear-wall');
    expect(hans.position.z).toBeCloseTo(WORK_DEPTH, 6);
    expect(hans.position.x).toBeGreaterThan(0);
    expect(hans.userData.warRoomHansMovementFacing).toBe('velocity-vector');
  });

  it('also reroutes the normal walk-to-basket choreography, not only quick iteration', () => {
    const { root, hans, driver, setProgress, setQuickRoute } = makeEntryRig();
    setQuickRoute(false);
    setProgress(0.5);
    driver.onBeforeRender();

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    expect(hans.userData.warRoomHansEntryPath).toBe('door-bypass-rear-wall-v1');
    expect(hans.userData.warRoomHansEntryRouteStage).toBe('entry-bypass');
    expect(Math.abs(hans.position.x)).toBeCloseTo(1.42, 6);
    expect(hans.position.z).toBeGreaterThan(WORK_DEPTH);
  });
});
