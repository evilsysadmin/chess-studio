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

  const basket = new THREE.Group();
  basket.name = 'war-room-hearth-log-basket';
  basket.position.set(-1.6, 0, 0.1);
  fireplace.add(basket);

  const tools = new THREE.Group();
  tools.name = 'war-room-hearth-tool-stand';
  tools.position.set(1.7, 0, 0.15);
  fireplace.add(tools);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(1, 0, 0.8);
  fireplace.add(hans);

  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1, 0.3),
    new THREE.MeshBasicMaterial(),
  );
  bodyMesh.name = 'fixture-hans-visible-body';
  bodyMesh.position.y = 1;
  hans.add(bodyMesh);

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

  return { root, hans, bodyMesh, driver, head, fire, basket, tools };
}

function faceDotPoint(hans, head, point) {
  hans.parent.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const faceWorld = head.children[0].getWorldPosition(new THREE.Vector3());
  const face = faceWorld.sub(headWorld).setY(0).normalize();
  const target = point.clone().sub(head.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
  return face.dot(target);
}

function objectWorldPosition(object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function paintVisibleMesh(mesh, frame) {
  mesh.onBeforeRender(
    { info: { render: { frame } } },
    null,
    null,
    mesh.geometry,
    mesh.material,
    null,
  );
}

describe('Hans hearth-facing guard', () => {
  it.each([
    ['take-log', 'basket', 'basket'],
    ['carry-log', 'hearth', 'fire'],
    ['place-log', 'fire', 'fire'],
    ['take-poker', 'tools', 'tools'],
    ['stoke-fire', 'fire', 'fire'],
    ['return-poker', 'tools', 'tools'],
    ['satisfied', 'fire', 'fire'],
  ])('reafirma el objetivo de trabajo estacionario en %s justo antes de pintar', (phase, facingTarget, targetKey) => {
    globalThis.document = { querySelector: vi.fn(() => null) };
    const scene = makeScene();
    const { root, hans, bodyMesh, driver, head } = scene;
    expect(installWarRoomHansHearthFacingGuard(root)).toBe(1);

    driver.userData.warRoomHansPhase = phase;
    hans.userData.warRoomHansMovementFacing = 'work-target';
    hans.userData.warRoomHansFacingTarget = facingTarget;
    hans.rotation.y = Math.PI;
    hans.updateMatrixWorld(true);

    driver.onBeforeRender();
    const target = scene[targetKey];
    expect(faceDotPoint(hans, head, objectWorldPosition(target))).toBeGreaterThan(0.99);

    hans.rotation.y += Math.PI;
    hans.updateMatrixWorld(true);
    expect(faceDotPoint(hans, head, objectWorldPosition(target))).toBeLessThan(-0.99);

    paintVisibleMesh(bodyMesh, 30 + phase.length);
    expect(faceDotPoint(hans, head, objectWorldPosition(target))).toBeGreaterThan(0.99);
    expect(hans.userData.warRoomHansHearthFacingSource).toBe('visible-mesh-pre-render');
  });

  it('turns Hans toward the board only while the board-side conversation is holding him', () => {
    globalThis.document = {
      querySelector: vi.fn(() => ({ dataset: { warRoomHansNarrativePhase: 'peek' } })),
    };
    const { root, hans, bodyMesh, driver, head } = makeScene();
    driver.userData.warRoomHansPhase = 'leave';
    expect(installWarRoomHansHearthFacingGuard(root)).toBe(1);
    driver.onBeforeRender();

    expect(hans.userData.warRoomHansHearthFacingTarget).toBe('board-center-world');
    expect(faceDotPoint(hans, head, new THREE.Vector3(0, 0, 0))).toBeGreaterThan(0.99);

    hans.rotation.y += Math.PI;
    hans.updateMatrixWorld(true);
    expect(faceDotPoint(hans, head, new THREE.Vector3(0, 0, 0))).toBeLessThan(-0.99);

    paintVisibleMesh(bodyMesh, 52);
    expect(faceDotPoint(hans, head, new THREE.Vector3(0, 0, 0))).toBeGreaterThan(0.99);
    expect(hans.userData.warRoomHansHearthFacingSource).toBe('visible-mesh-pre-render');
  });
});
