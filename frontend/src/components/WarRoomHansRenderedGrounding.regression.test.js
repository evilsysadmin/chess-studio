import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installWarRoomHansBoardCollisionGuard } from './WarRoomHansBoardCollisionGuard.js';
import { installWarRoomHansFacingGuard } from './WarRoomHansFacingGuard.js';

function shoe(material, x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), material);
  mesh.position.set(x, 0.08, 0.07);
  return mesh;
}

function shoeBottomWorldY(mesh) {
  mesh.geometry.computeBoundingBox();
  mesh.updateMatrixWorld(true);
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.y;
}

function renderedFaceDotTravel(hans, head, face, movement) {
  hans.parent.updateMatrixWorld(true);
  head.updateMatrixWorld(true);
  face.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = face.getWorldPosition(new THREE.Vector3());
  const parent = hans.parent;
  const headLocal = parent.worldToLocal(headWorld.clone());
  const faceLocal = parent.worldToLocal(faceWorld.clone());
  const faceVector = faceLocal.sub(headLocal);
  faceVector.y = 0;
  faceVector.normalize();
  const travel = movement.clone();
  travel.y = 0;
  travel.normalize();
  return faceVector.dot(travel);
}

describe('Hans rendered fire-routine contract', () => {
  it('plants the rendered shoes on the actual War Room carpet instead of trusting local root Y', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();

    const floor = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.09, 13.6), material);
    floor.name = 'war-room-castle-floor-slab';
    floor.position.set(0, -0.305, 0);
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
    fireplace.add(hans);

    const leftShoe = shoe(material, -0.17);
    const rightShoe = shoe(material, 0.17);
    hans.add(leftShoe, rightShoe);
    hans.userData.refs = { leftShoe, rightShoe };

    const driver = new THREE.Group();
    driver.name = 'war-room-hans-fireplace-driver';
    fireplace.add(driver);
    driver.onBeforeRender = () => {
      hans.position.set(4.95, -0.34, 7.1);
      driver.userData.warRoomHansPhase = 'walk-to-basket';
      hans.userData.warRoomHansRoute = 'entry';
      hans.userData.warRoomHansMotionState = 'walk';
    };

    expect(installWarRoomHansBoardCollisionGuard(root)).toBe(1);
    driver.onBeforeRender();

    const renderedBottom = Math.min(shoeBottomWorldY(leftShoe), shoeBottomWorldY(rightShoe));
    const carpetTop = -0.221;
    expect(renderedBottom).toBeCloseTo(carpetTop, 5);
    expect(hans.position.y).toBeLessThan(-0.5);
    expect(hans.userData.warRoomHansGroundSurface).toBe('war-room-command-carpet-inner-field');
    expect(hans.userData.warRoomHansWorldGrounding).toBe('shoe-bottom-to-rendered-surface-v1');
  });

  it('keeps transit facing tied to route/motion even when a narrative phase masks the fire phase', () => {
    const root = new THREE.Group();
    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    root.add(fireplace);

    const hans = new THREE.Group();
    hans.name = 'war-room-hans-butler';
    hans.visible = true;
    fireplace.add(hans);

    const head = new THREE.Group();
    head.name = 'war-room-hans-head';
    head.position.y = 2.12;
    const skull = new THREE.Object3D();
    const face = new THREE.Object3D();
    face.position.set(0, -0.1, 0.29);
    head.add(skull, face);
    hans.add(head);
    hans.userData.refs = { head };

    const driver = new THREE.Group();
    driver.name = 'war-room-hans-fireplace-driver';
    fireplace.add(driver);

    driver.onBeforeRender = () => {
      hans.position.x -= 0.18;
      hans.position.y = -0.34;
      hans.position.z = 0.72;
      hans.rotation.y = Math.PI / 2;
      driver.userData.warRoomHansPhase = 'idle';
      hans.userData.warRoomHansRoute = 'entry';
      hans.userData.warRoomHansMotionState = 'walk';
    };

    const before = hans.position.clone();
    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    driver.onBeforeRender();
    const movement = hans.position.clone().sub(before);

    expect(renderedFaceDotTravel(hans, head, face, movement)).toBeGreaterThan(0.98);
    expect(hans.userData.warRoomHansFacingGuardTravelContract).toBe('phase-motion-route-v1');
    expect(hans.userData.warRoomHansFacingGuardCorrections).toBe(1);
  });
});
