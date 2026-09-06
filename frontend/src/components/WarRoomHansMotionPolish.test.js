import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installWarRoomHansMotionPolish,
  safeHansDoorFrameX,
  WAR_ROOM_HANS_MOTION_POLISH_VERSION,
} from './WarRoomHansMotionPolish.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

function makeRig() {
  const root = new THREE.Group();
  const floor = new THREE.Group();
  floor.name = 'war-room-castle-floor-slab';
  root.add(floor);

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
  door.userData.warRoomHansDoorOpen = 0;
  root.add(door);

  return { root, floor, fireplace, hans, driver, door };
}

afterEach(() => vi.restoreAllMocks());

describe('Hans grounded motion polish', () => {
  it('slows the visible stride, adds secondary body motion and keeps the feet planted', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    const { root, hans, driver } = makeRig();
    let logicalX = -0.4;
    driver.onBeforeRender = () => {
      hans.position.x = logicalX;
      driver.userData.warRoomHansPhase = 'take-poker';
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    logicalX = -1.2;
    now.mockReturnValue(1200);
    driver.onBeforeRender();

    const visualRoot = hans.getObjectByName('war-room-hans-visual-root');
    expect(visualRoot).toBeTruthy();
    expect(hans.userData.refs.leftLeg.parent).toBe(visualRoot);
    expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeLessThanOrEqual(0.106);
    expect(Math.abs(hans.userData.refs.rightLeg.rotation.x)).toBeLessThanOrEqual(0.106);
    expect(visualRoot.position.y).toBeLessThanOrEqual(0);
    expect(Math.abs(hans.userData.refs.torso.rotation.y)).toBeGreaterThan(0);
    expect(hans.userData.warRoomHansMotionState).toBe('walk');
    expect(hans.userData.warRoomHansGrounded).toBe(true);
    expect(hans.userData.warRoomHansVisualLag).toBeGreaterThan(0.2);
    expect(hans.userData.warRoomHansVisualLag).toBeLessThanOrEqual(0.421);
  });

  it('keeps the visible body inside the wall until the service door is actually open', () => {
    vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    const { root, hans, driver, door } = makeRig();
    driver.onBeforeRender = () => {
      driver.userData.warRoomHansPhase = 'leave';
      hans.userData.warRoomHansRoute = 'leave-corridor';
      hans.position.set(-2.65, -0.34, 5.2);
      hans.rotation.y = 0;
      door.userData.warRoomHansDoorOpen = 1;
    };

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    driver.onBeforeRender();

    const visualRoot = hans.getObjectByName('war-room-hans-visual-root');
    const visibleFrameX = (hans.position.x + visualRoot.position.x) / -1;
    expect(visibleFrameX).toBeLessThanOrEqual(2.081);
    expect(visibleFrameX).toBeGreaterThan(1.8);
    expect(hans.userData.warRoomHansWallClearanceApplied).toBe(true);
    expect(safeHansDoorFrameX(2.65, { doorOpen: 0, nearDoor: true })).toBeCloseTo(1.82, 6);
    expect(safeHansDoorFrameX(2.65, { doorOpen: 1, nearDoor: true })).toBeCloseTo(2.08, 6);
  });

  it('is installed automatically after the shared Hans deferred finalizer on desktop or coarse input', () => {
    vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    const root = new THREE.Group();
    const floor = new THREE.Group();
    floor.name = 'war-room-castle-floor-slab';
    root.add(floor);

    expect(registerWarRoomDeferredFinalizer(root, {
      key: 'hans-fireplace-scene-install-v2',
      coarsePointer: true,
      allowCoarse: true,
      run: (sceneRoot) => {
        const rig = makeRig();
        const fireplace = rig.fireplace;
        const door = rig.door;
        rig.root.remove(fireplace);
        rig.root.remove(door);
        sceneRoot.add(fireplace, door);
        return 1;
      },
    })).toBe(1);

    expect(typeof floor.onAfterRender).toBe('function');
    floor.onAfterRender();

    const hans = root.getObjectByName('war-room-hans-butler');
    const driver = root.getObjectByName('war-room-hans-fireplace-driver');
    expect(hans).toBeTruthy();
    expect(driver).toBeTruthy();
    expect(driver.userData.warRoomHansMotionPolish).toBe(WAR_ROOM_HANS_MOTION_POLISH_VERSION);
    expect(hans.userData.warRoomHansVisualRoot).toBe('war-room-hans-visual-root');
  });
});
