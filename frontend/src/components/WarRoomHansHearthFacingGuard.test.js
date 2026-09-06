import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansHearthFacingGuard,
  WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION,
} from './WarRoomHansHearthFacingGuard.js';

function makeScene() {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  root.add(fireplace);

  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
  fire.name = 'war-room-fire-core';
  fire.position.set(0, 0, 0);
  fireplace.add(fire);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(1, 0, 0.8);
  fireplace.add(hans);

  const head = new THREE.Group();
  head.position.y = 2;
  hans.add(head);
  const faceAnchor = new THREE.Object3D();
  faceAnchor.position.z = 0.3;
  head.add(faceAnchor);
  hans.userData.refs = { head };

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansPhase = 'place-log';
  driver.onBeforeRender = () => {};
  fireplace.add(driver);

  return { root, hans, driver, head, fire };
}

function faceDotTarget(hans, head, fire) {
  hans.parent.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = head.children[0].getWorldPosition(new THREE.Vector3());
  const fireWorld = fire.getWorldPosition(new THREE.Vector3());
  const face = faceWorld.sub(headWorld).setY(0).normalize();
  const target = fireWorld.sub(head.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
  return face.dot(target);
}

describe('Hans hearth-facing guard', () => {
  it('turns the rendered face toward the fire during place-log with reusable scratch vectors', () => {
    const { root, hans, driver, head, fire } = makeScene();
    expect(faceDotTarget(hans, head, fire)).toBeLessThan(0);
    expect(installWarRoomHansHearthFacingGuard(root)).toBe(1);
    expect(driver.userData.warRoomHansHearthFacingHotPath).toBe('preallocated-scratch-v2');
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansHearthFacingGuard).toBe(WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION);
    expect(hans.userData.warRoomHansHearthFacingTarget).toBe('fire-core-rendered');
    expect(hans.userData.warRoomHansHearthFacingHotPath).toBe('preallocated-scratch-v2');
    expect(faceDotTarget(hans, head, fire)).toBeGreaterThan(0.99);
  });
});
