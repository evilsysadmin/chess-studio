import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansServiceInfrastructure,
  moveWarRoomHansToward,
  warRoomHansServiceHome,
  warRoomHansTargetNearObject,
} from './WarRoomHansServiceRoute.js';
import { WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION } from './WarRoomHansServiceExitDoorGuard.js';

describe('Hans service routing', () => {
  it('does not treat a missing destination as an arrival', () => {
    const hans = new THREE.Group();
    const motion = moveWarRoomHansToward(hans, null, 0.5);

    expect(motion.arrived).toBe(false);
    expect(motion.travelled).toBe(0);
    expect(motion.blocked).toBe(true);
  });

  it('builds and walks toward a real command-desk target without stealing rendered Y grounding', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 1), new THREE.MeshBasicMaterial());
    deskTop.name = 'war-room-command-desk-top';
    deskTop.position.set(0, 1.03, -2);
    root.add(parent, deskTop);
    root.updateMatrixWorld(true);

    const target = warRoomHansTargetNearObject(deskTop, parent, { offsetX: -1.78, offsetZ: 0.74 });
    expect(target).toBeTruthy();

    const hans = new THREE.Group();
    hans.position.set(4, -0.612, 4);
    parent.add(hans);
    const groundedY = hans.position.y;
    const beforePlanar = Math.hypot(target.x - hans.position.x, target.z - hans.position.z);
    const motion = moveWarRoomHansToward(hans, target, 0.5);
    const afterPlanar = Math.hypot(target.x - hans.position.x, target.z - hans.position.z);

    expect(motion.blocked).toBe(false);
    expect(motion.travelled).toBeGreaterThan(0);
    expect(afterPlanar).toBeLessThan(beforePlanar);
    expect(hans.position.y).toBeCloseTo(groundedY, 6);
  });

  it('keeps service-home lookup pure and installs the exit guard explicitly', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    floor.name = 'war-room-castle-floor-slab';
    const originalAfterRender = () => {};
    floor.onAfterRender = originalAfterRender;

    const hans = new THREE.Group();
    hans.name = 'war-room-hans-butler';
    parent.add(hans);

    const door = new THREE.Group();
    door.name = 'war-room-hans-service-door';
    door.position.set(2.4, 0, 4.2);
    const recess = new THREE.Group();
    recess.name = 'war-room-hans-service-door-recess';
    recess.position.set(0.15, 0.2, -0.3);
    door.add(recess);
    const doorRefs = { group: door, recess };
    door.userData.refs = doorRefs;
    root.add(parent, floor, door);
    root.updateMatrixWorld(true);

    const service = warRoomHansServiceHome(root, parent);
    expect(service?.point).toBeTruthy();
    expect(service?.doorRefs).toBe(doorRefs);
    expect(floor.onAfterRender).toBe(originalAfterRender);
    expect(floor.userData.warRoomHansServiceExitDoorGuard).toBeUndefined();

    expect(installWarRoomHansServiceInfrastructure(root)).toBe(1);
    expect(floor.onAfterRender).not.toBe(originalAfterRender);
    expect(floor.userData.warRoomHansServiceExitDoorGuard)
      .toBe(WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION);
    expect(installWarRoomHansServiceInfrastructure(root)).toBe(0);
  });
});
