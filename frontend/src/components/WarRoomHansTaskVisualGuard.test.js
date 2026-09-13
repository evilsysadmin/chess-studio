import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  captureWarRoomHansTaskGroundSurfaces,
  faceWarRoomHansTowardObject,
  groundWarRoomHansTaskActor,
  installWarRoomHansTaskVisualGuard,
} from './WarRoomHansTaskVisualGuard.js';

function renderedFaceVector(hans, head, faceAnchor) {
  hans.parent.updateMatrixWorld(true);
  head.updateMatrixWorld(true);
  faceAnchor.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = faceAnchor.getWorldPosition(new THREE.Vector3());
  return faceWorld.sub(headWorld).setY(0).normalize();
}

function shoeBottomWorldY(shoe) {
  shoe.geometry.computeBoundingBox();
  shoe.updateMatrixWorld(true);
  return new THREE.Box3().copy(shoe.geometry.boundingBox).applyMatrix4(shoe.matrixWorld).min.y;
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

  it('reconciles armor-polish grounding and facing on the visible Hans mesh after a late reset', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();

    const floor = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.09, 13.6), material);
    floor.name = 'war-room-castle-floor-slab';
    floor.position.set(0, -0.305, 0);
    floor.onBeforeRender = () => {};
    root.add(floor);

    const carpet = new THREE.Mesh(new THREE.BoxGeometry(12.95, 0.01, 12.4), material);
    carpet.name = 'war-room-command-carpet-inner-field';
    carpet.position.set(0, -0.226, 0);
    root.add(carpet);

    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(-4.95, 0.34, -7.1);
    root.add(fireplace);

    const hans = new THREE.Group();
    hans.name = 'war-room-hans-butler';
    hans.visible = true;
    hans.scale.setScalar(0.74);
    hans.position.set(4.95, -0.34, 7.1);
    fireplace.add(hans);

    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), material);
    const rightShoe = leftShoe.clone();
    leftShoe.position.set(-0.17, 0.08, 0.07);
    rightShoe.position.set(0.17, 0.08, 0.07);
    hans.add(leftShoe, rightShoe);

    const head = new THREE.Group();
    head.position.y = 2.12;
    const skull = new THREE.Object3D();
    const faceAnchor = new THREE.Object3D();
    faceAnchor.position.set(0, -0.02, 0.29);
    head.add(skull, faceAnchor);
    hans.add(head);

    hans.userData.refs = {
      head,
      leftShoe,
      rightShoe,
      torso: new THREE.Group(),
    };
    hans.userData.warRoomHansActiveTask = 'chore-dust-armor';
    hans.userData.warRoomHansActiveTaskKind = 'chore';
    hans.userData.warRoomHansTaskPhase = 'acting';
    hans.userData.warRoomHansChoreEvent = 'dust-armor';

    const driver = new THREE.Group();
    driver.name = 'war-room-hans-fireplace-driver';
    fireplace.add(driver);

    const armor = new THREE.Group();
    armor.name = 'war-room-teutonic-armor-right';
    armor.position.set(-1.2, 0.8, 0);
    root.add(armor);

    expect(installWarRoomHansTaskVisualGuard(root)).toBe(1);

    // Let the normal task-producer pass resolve once, then reproduce the real
    // failure: a later writer restores legacy root Y and arrival heading before
    // the visible Hans mesh is painted.
    floor.onBeforeRender();
    hans.position.y = -0.34;
    hans.rotation.y = Math.PI / 2;
    hans.updateMatrixWorld(true);

    const carpetTop = -0.221;
    expect(shoeBottomWorldY(leftShoe)).toBeGreaterThan(carpetTop + 0.15);

    const towardBefore = armor.getWorldPosition(new THREE.Vector3())
      .sub(head.getWorldPosition(new THREE.Vector3()))
      .setY(0)
      .normalize();
    expect(renderedFaceVector(hans, head, faceAnchor).dot(towardBefore)).toBeLessThan(0);

    const renderer = { info: { render: { frame: 41 } } };
    leftShoe.onBeforeRender(renderer, null, null, leftShoe.geometry, leftShoe.material, null);

    expect(shoeBottomWorldY(leftShoe)).toBeCloseTo(carpetTop, 5);
    const towardAfter = armor.getWorldPosition(new THREE.Vector3())
      .sub(head.getWorldPosition(new THREE.Vector3()))
      .setY(0)
      .normalize();
    expect(renderedFaceVector(hans, head, faceAnchor).dot(towardAfter)).toBeGreaterThan(0.99);
    expect(hans.userData.warRoomHansTaskVisualSource).toBe('visible-mesh-pre-render');
    expect(hans.userData.warRoomHansTaskFacingTarget).toBe('war-room-teutonic-armor-right');
    expect(hans.userData.warRoomHansVisibleTaskVisualHooks).toBeGreaterThanOrEqual(2);
  });
});
