import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { faceWarRoomHansTowardObject } from './WarRoomHansTaskVisualGuard.js';

function canonicalForwardVector(hans, forward) {
  return new THREE.Vector3(0, 0, forward)
    .applyQuaternion(hans.quaternion)
    .setY(0)
    .normalize();
}

describe('WarRoomHansTaskVisualGuard canonical task facing', () => {
  it.each([1, -1])('uses declared local forward %s instead of the deepest head child', (forward) => {
    const parent = new THREE.Group();
    const hans = new THREE.Group();
    hans.userData.warRoomHansLocalForwardZ = forward;
    parent.add(hans);

    const head = new THREE.Group();
    head.position.y = 2;
    hans.add(head);

    const visibleFace = new THREE.Group();
    visibleFace.position.z = forward * 0.29;
    head.add(visibleFace);

    const rearDecoration = new THREE.Group();
    rearDecoration.position.z = -forward * 0.62;
    head.add(rearDecoration);

    const target = new THREE.Group();
    target.name = 'task-target';
    target.position.set(0, 0, forward * 4);
    parent.add(target);

    parent.updateMatrixWorld(true);
    expect(faceWarRoomHansTowardObject(hans, head, target)).toBe(true);

    const facing = canonicalForwardVector(hans, forward);
    const towardTarget = target.position.clone().sub(head.position).setY(0).normalize();
    expect(facing.dot(towardTarget)).toBeGreaterThan(0.999);
    expect(Math.abs(hans.rotation.y)).toBeLessThan(1e-6);
    expect(hans.userData.warRoomHansTaskFacingContract).toBe('canonical-local-forward-v1');
    expect(hans.userData.warRoomHansTaskFacingDotAfter).toBeGreaterThan(0.999);
  });

  it('rotates the canonical forward toward the task target when correction is required', () => {
    const parent = new THREE.Group();
    const hans = new THREE.Group();
    hans.userData.warRoomHansLocalForwardZ = 1;
    parent.add(hans);

    const head = new THREE.Group();
    head.position.y = 2;
    hans.add(head);

    const target = new THREE.Group();
    target.name = 'side-target';
    target.position.set(4, 0, 0);
    parent.add(target);

    parent.updateMatrixWorld(true);
    expect(faceWarRoomHansTowardObject(hans, head, target)).toBe(true);

    const facing = canonicalForwardVector(hans, 1);
    expect(facing.x).toBeGreaterThan(0.999);
    expect(Math.abs(facing.z)).toBeLessThan(0.001);
    expect(hans.userData.warRoomHansTaskFacingDotAfter).toBeGreaterThan(0.999);
  });
});
