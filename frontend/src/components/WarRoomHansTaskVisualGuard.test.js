import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  captureWarRoomHansTaskGroundSurfaces,
  faceWarRoomHansTowardObject,
  groundWarRoomHansTaskActor,
} from './WarRoomHansTaskVisualGuard.js';

function renderedFaceVector(hans, head, faceAnchor) {
  hans.parent.updateMatrixWorld(true);
  head.updateMatrixWorld(true);
  faceAnchor.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = faceAnchor.getWorldPosition(new THREE.Vector3());
  return faceWorld.sub(headWorld).setY(0).normalize();
}

describe('WarRoomHansTaskVisualGuard', () => {
  it('grounds Hans from the rendered shoe bottoms after a task moved him', () => {
    const root = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.2, 10),
      new THREE.MeshBasicMaterial(),
    );
    floor.name = 'war-room-castle-floor-slab';
    floor.position.y = -0.1;
    root.add(floor);

    const hans = new THREE.Group();
    hans.visible = true;
    hans.position.set(1, 0.5, 1);
    root.add(hans);

    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), new THREE.MeshBasicMaterial());
    const rightShoe = leftShoe.clone();
    leftShoe.position.x = -0.12;
    rightShoe.position.x = 0.12;
    hans.add(leftShoe, rightShoe);

    const surfaces = captureWarRoomHansTaskGroundSurfaces(root);
    expect(groundWarRoomHansTaskActor(hans, { leftShoe, rightShoe }, surfaces)).toBe(true);

    root.updateMatrixWorld(true);
    leftShoe.geometry.computeBoundingBox();
    const box = new THREE.Box3().copy(leftShoe.geometry.boundingBox).applyMatrix4(leftShoe.matrixWorld);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(hans.userData.warRoomHansTaskGroundSurface).toBe('war-room-castle-floor-slab');
  });

  it('turns the rendered face toward the chore target instead of preserving arrival heading', () => {
    const root = new THREE.Group();
    const hans = new THREE.Group();
    hans.visible = true;
    root.add(hans);

    const head = new THREE.Group();
    head.position.y = 1.5;
    const faceAnchor = new THREE.Object3D();
    faceAnchor.position.z = 0.22;
    head.add(faceAnchor);
    hans.add(head);

    const target = new THREE.Object3D();
    target.name = 'armor-target';
    target.position.set(3, 1.5, 0);
    root.add(target);

    expect(faceWarRoomHansTowardObject(hans, head, target)).toBe(true);
    const face = renderedFaceVector(hans, head, faceAnchor);
    const toward = target.getWorldPosition(new THREE.Vector3())
      .sub(head.getWorldPosition(new THREE.Vector3()))
      .setY(0)
      .normalize();

    expect(face.dot(toward)).toBeGreaterThan(0.99);
    expect(hans.userData.warRoomHansTaskFacingTarget).toBe('armor-target');
  });
});
