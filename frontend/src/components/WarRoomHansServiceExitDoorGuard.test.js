import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';

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

  it('does not interfere while Hans is walking an unrelated route', () => {
    const { root, floor, hans, refs } = makeScene();
    hans.userData.warRoomHansRoute = 'service-espresso';
    expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
    root.updateMatrixWorld(true);
    floor.onAfterRender();
    expect(refs.group.userData.warRoomHansDoorOpen).toBeUndefined();
    expect(refs.pivot.rotation.y).toBe(0);
  });
});
