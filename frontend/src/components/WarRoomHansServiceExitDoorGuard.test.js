import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

function makeScene() {
  const root = new THREE.Scene();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial());
  floor.name = 'war-room-castle-floor-slab';
  root.add(floor);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.position.set(0, -0.34, 0.45);
  hans.userData.warRoomHansRoute = 'service-return';
  root.add(hans);

  const group = new THREE.Group();
  group.name = 'war-room-hans-service-door';
  const pivot = new THREE.Group();
  group.add(pivot);
  root.add(group);
  const refs = {
    group,
    pivot,
    closedRotation: 0,
    openRotation: 0.96,
  };
  return { root, floor, hans, refs };
}

describe('Hans service exit door guard', () => {
  it('opens the service door while Hans approaches on a return route', () => {
    const { root, floor, refs } = makeScene();
    expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
    root.updateMatrixWorld(true);
    floor.onAfterRender();
    expect(refs.group.userData.warRoomHansDoorOpen).toBeGreaterThan(0);
    expect(Math.abs(refs.pivot.rotation.y)).toBeGreaterThan(0);
  });

  it.each(['service-espresso', 'chore-dust-board', 'mop-room', 'entry', 'leave-door'])(
    'keeps the service door clear during inbound/outbound transit route %s',
    (route) => {
      const { root, floor, hans, refs } = makeScene();
      hans.userData.warRoomHansRoute = route;
      expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
      root.updateMatrixWorld(true);
      floor.onAfterRender();
      expect(refs.group.userData.warRoomHansDoorOpen).toBeGreaterThan(0);
      expect(Math.abs(refs.pivot.rotation.y)).toBeGreaterThan(0);
    },
  );

  it('does not interfere with an unrelated non-door route', () => {
    const { root, floor, hans, refs } = makeScene();
    hans.userData.warRoomHansRoute = 'idle-hearth';
    expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
    root.updateMatrixWorld(true);
    floor.onAfterRender();
    expect(refs.group.userData.warRoomHansDoorOpen).toBeUndefined();
    expect(refs.pivot.rotation.y).toBe(0);
  });

  it('fully closes its own latch after a finished routine was reopened by the guard', () => {
    const { root, floor, hans, refs } = makeScene();
    const now = vi.spyOn(globalThis.performance, 'now');
    try {
      now.mockReturnValue(1000);
      expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
      root.updateMatrixWorld(true);
      floor.onAfterRender();
      const guardOpen = refs.group.userData.warRoomHansDoorOpen;
      expect(guardOpen).toBeGreaterThan(0);

      // Producer finishes in onBeforeRender and closes the door. The physical
      // guard is allowed to keep it open briefly so the leaf cannot clip Hans.
      hans.userData.warRoomHansRoute = '';
      setWarRoomHansServiceDoorOpen(refs, 0);
      now.mockReturnValue(1100);
      floor.onAfterRender();
      expect(refs.group.userData.warRoomHansDoorOpen).toBeCloseTo(guardOpen, 6);

      // Once hold + close have elapsed, the guard must release its own write all
      // the way back to zero instead of abandoning the last fractional angle.
      now.mockReturnValue(2300);
      floor.onAfterRender();
      expect(refs.group.userData.warRoomHansDoorOpen).toBe(0);
      expect(refs.pivot.rotation.y).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it('treats performance.now() === 0 as a valid latch timestamp', () => {
    const { root, floor, hans, refs } = makeScene();
    const now = vi.spyOn(globalThis.performance, 'now');
    try {
      now.mockReturnValue(0);
      expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
      root.updateMatrixWorld(true);
      floor.onAfterRender();
      const guardOpen = refs.group.userData.warRoomHansDoorOpen;
      expect(guardOpen).toBeGreaterThan(0);

      hans.userData.warRoomHansRoute = '';
      setWarRoomHansServiceDoorOpen(refs, 0);
      now.mockReturnValue(100);
      floor.onAfterRender();
      expect(refs.group.userData.warRoomHansDoorOpen).toBeCloseTo(guardOpen, 6);
    } finally {
      now.mockRestore();
    }
  });
});
