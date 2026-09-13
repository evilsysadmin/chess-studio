import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomHansTaskVisualGuard } from './WarRoomHansTaskVisualGuard.js';
import { WAR_ROOM_HANS_CHORE_EVENTS } from './WarRoomHansChoreContract.js';

const CHORE_TARGETS = Object.freeze({
  'dust-armor': 'war-room-teutonic-armor-right',
  'dust-board': 'war-room-command-desk-top',
  'bring-book': 'war-room-command-desk-top',
  mail: 'war-room-command-desk-top',
  'straighten-room': 'war-room-teutonic-command-chair',
  'sweep-ashes': 'war-room-fireplace',
  'polish-brass': 'war-room-command-desk-brass-rim',
});

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

function paintVisible(mesh, frame) {
  mesh.onBeforeRender(
    { info: { render: { frame } } },
    null,
    null,
    mesh.geometry,
    mesh.material,
    null,
  );
}

function addTarget(root, name, x, z) {
  const target = new THREE.Group();
  target.name = name;
  target.position.set(x, 0.6, z);
  root.add(target);
  return target;
}

function makeScene() {
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

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  fireplace.add(driver);

  const targets = {
    'war-room-teutonic-armor-right': addTarget(root, 'war-room-teutonic-armor-right', -2.2, 0.4),
    'war-room-command-desk-top': addTarget(root, 'war-room-command-desk-top', 2.1, 1.1),
    'war-room-teutonic-command-chair': addTarget(root, 'war-room-teutonic-command-chair', -1.4, 2.1),
    'war-room-command-carpet': addTarget(root, 'war-room-command-carpet', 0.4, 2.4),
    'war-room-command-desk-brass-rim': addTarget(root, 'war-room-command-desk-brass-rim', 2.3, -1.1),
    'war-room-hans-plant': addTarget(root, 'war-room-hans-plant', -2.1, -1.5),
    'war-room-fireplace': fireplace,
  };

  return { root, floor, carpet, hans, head, faceAnchor, leftShoe, targets };
}

function expectFacingTarget(scene, targetName) {
  const { hans, head, faceAnchor, targets } = scene;
  const target = targets[targetName];
  const toward = target.getWorldPosition(new THREE.Vector3())
    .sub(head.getWorldPosition(new THREE.Vector3()))
    .setY(0)
    .normalize();
  expect(renderedFaceVector(hans, head, faceAnchor).dot(toward)).toBeGreaterThan(0.99);
  expect(hans.userData.warRoomHansTaskFacingTarget).toBe(targetName);
}

describe('Hans task visual guard · every ambient routine', () => {
  it('keeps all seven chore targets grounded and facing their real scene object', () => {
    const scene = makeScene();
    const { root, hans, leftShoe } = scene;
    expect(Object.keys(CHORE_TARGETS)).toEqual([...WAR_ROOM_HANS_CHORE_EVENTS]);
    expect(installWarRoomHansTaskVisualGuard(root)).toBe(1);

    let frame = 100;
    for (const eventName of WAR_ROOM_HANS_CHORE_EVENTS) {
      hans.userData.warRoomHansActiveTask = `chore-${eventName}`;
      hans.userData.warRoomHansActiveTaskKind = 'chore';
      hans.userData.warRoomHansTaskPhase = 'acting';
      hans.userData.warRoomHansChoreEvent = eventName;
      hans.userData.warRoomHansServiceEvent = '';
      hans.position.y = -0.34;
      hans.rotation.y = Math.PI;
      hans.updateMatrixWorld(true);

      paintVisible(leftShoe, frame++);

      expect(shoeBottomWorldY(leftShoe)).toBeCloseTo(-0.221, 5);
      expectFacingTarget(scene, CHORE_TARGETS[eventName]);
      expect(hans.userData.warRoomHansTaskVisualSource).toBe('visible-mesh-pre-render');
    }
  });

  it.each([
    ['water-plant', 'war-room-hans-plant'],
    ['espresso', 'war-room-command-desk-top'],
  ])('keeps service %s grounded and facing %s', (eventName, targetName) => {
    const scene = makeScene();
    const { root, hans, leftShoe } = scene;
    expect(installWarRoomHansTaskVisualGuard(root)).toBe(1);

    hans.userData.warRoomHansActiveTask = `service-${eventName}`;
    hans.userData.warRoomHansActiveTaskKind = 'service';
    hans.userData.warRoomHansTaskPhase = 'acting';
    hans.userData.warRoomHansServiceEvent = eventName;
    hans.position.y = -0.34;
    hans.rotation.y = Math.PI;
    hans.updateMatrixWorld(true);

    paintVisible(leftShoe, 220 + eventName.length);

    expect(shoeBottomWorldY(leftShoe)).toBeCloseTo(-0.221, 5);
    expectFacingTarget(scene, targetName);
  });

  it('keeps mop grounded without inventing an external facing target', () => {
    const scene = makeScene();
    const { root, hans, leftShoe } = scene;
    expect(installWarRoomHansTaskVisualGuard(root)).toBe(1);

    hans.userData.warRoomHansActiveTask = 'mop-room';
    hans.userData.warRoomHansActiveTaskKind = 'mop';
    hans.userData.warRoomHansTaskPhase = 'mopping';
    hans.userData.warRoomHansTaskFacingTarget = '';
    hans.position.y = -0.34;
    hans.updateMatrixWorld(true);

    paintVisible(leftShoe, 300);

    expect(shoeBottomWorldY(leftShoe)).toBeCloseTo(-0.221, 5);
    expect(hans.userData.warRoomHansTaskFacingTarget).toBe('');
    expect(hans.userData.warRoomHansTaskVisualSource).toBe('visible-mesh-pre-render');
  });
});
