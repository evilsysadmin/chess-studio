import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installWarRoomHansHearthFacingGuard,
  WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION,
} from './WarRoomHansHearthFacingGuard.js';

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

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

function faceDotPoint(hans, head, point) {
  hans.parent.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = head.children[0].getWorldPosition(new THREE.Vector3());
  const face = faceWorld.sub(headWorld).setY(0).normalize();
  const target = point.clone().sub(head.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
  return face.dot(target);
}

function fireWorldPosition(fire) {
  return fire.getWorldPosition(new THREE.Vector3());
}

describe('Hans hearth-facing guard', () => {
  it('turns the rendered face toward the fire during place-log with reusable scratch vectors', () => {
    globalThis.document = { querySelector: vi.fn(() => null) };
    const { root, hans, driver, head, fire } = makeScene();
    expect(faceDotPoint(hans, head, fireWorldPosition(fire))).toBeLessThan(0);
    expect(installWarRoomHansHearthFacingGuard(root)).toBe(1);
    expect(driver.userData.warRoomHansHearthFacingHotPath).toBe('preallocated-scratch-v5-board-world');
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansHearthFacingGuard).toBe(WAR_ROOM_HANS_HEARTH_FACING_GUARD_VERSION);
    expect(hans.userData.warRoomHansHearthFacingTarget).toBe('fire-core-rendered');
    expect(faceDotPoint(hans, head, fireWorldPosition(fire))).toBeGreaterThan(0.99);
  });

  it('turns Hans toward the board only while the board-side conversation is holding him', () => {
    globalThis.document = {
      querySelector: vi.fn(() => ({ dataset: { warRoomHansNarrativePhase: 'peek' } })),
    };
    const { root, hans, driver, head } = makeScene();
    driver.userData.warRoomHansPhase = 'leave';
    expect(installWarRoomHansHearthFacingGuard(root)).toBe(1);
    driver.onBeforeRender();

    expect(hans.userData.warRoomHansHearthFacingTarget).toBe('board-center-world');
    expect(faceDotPoint(hans, head, new THREE.Vector3(0, 0, 0))).toBeGreaterThan(0.99);
  });
});