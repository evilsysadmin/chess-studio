import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansFacingGuard,
  WAR_ROOM_HANS_FACING_GUARD_VERSION,
} from './WarRoomHansFacingGuard.js';

function makeRig(forwardSign = 1, phase = 'carry-log') {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  root.add(fireplace);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(0, -0.34, 0.72);
  hans.userData.warRoomHansLocalForwardZ = forwardSign;
  fireplace.add(hans);

  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1, 0.3),
    new THREE.MeshBasicMaterial(),
  );
  bodyMesh.name = 'fixture-hans-visible-body';
  bodyMesh.position.y = 1;
  hans.add(bodyMesh);

  const head = new THREE.Group();
  head.name = 'war-room-hans-head';
  head.position.y = 2.12;
  const skull = new THREE.Object3D();
  skull.position.set(0, 0, 0);
  const face = new THREE.Object3D();
  face.name = 'fixture-hans-face-anchor';
  face.position.set(0, -0.1, forwardSign * 0.29);
  const sideHair = new THREE.Object3D();
  sideHair.position.set(0.2, 0.1, -forwardSign * 0.03);
  // Deliberately extends farther in |Z| than the face. The old heuristic picked
  // whichever head child protruded most and could therefore teach the guard that
  // Hans' back was his face after harmless modelling changes.
  const rearDecoration = new THREE.Object3D();
  rearDecoration.name = 'fixture-hans-rear-decoration';
  rearDecoration.position.set(0, 0.16, -forwardSign * 0.52);
  head.add(skull, face, sideHair, rearDecoration);
  hans.add(head);
  hans.userData.refs = { head };

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansPhase = phase;
  fireplace.add(driver);

  let x = 0;
  driver.onBeforeRender = () => {
    x -= 0.18;
    hans.position.set(x, -0.34, 0.72);
    driver.userData.warRoomHansPhase = phase;
    hans.rotation.y = forwardSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  };

  return { root, fireplace, hans, bodyMesh, head, face, driver };
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

describe('Hans rendered facing guard', () => {
  it.each([1, -1])('corrige el moonwalk usando el frontal canónico %s aunque otro mesh sobresalga más', (forwardSign) => {
    const { root, hans, head, face, driver } = makeRig(forwardSign, 'carry-log');
    const before = hans.position.clone();
    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    driver.onBeforeRender();
    const movement = hans.position.clone().sub(before);
    expect(renderedFaceDotTravel(hans, head, face, movement)).toBeGreaterThan(0.98);
    expect(hans.userData.warRoomHansFacingGuard).toBe(WAR_ROOM_HANS_FACING_GUARD_VERSION);
    expect(hans.userData.warRoomHansFacingGuardCorrections).toBe(1);
  });

  it.each(['carry-log', 'take-poker', 'stoke-fire', 'return-poker'])(
    'aplica el contrato de frente al desplazarse durante %s',
    (phase) => {
      const { root, hans, head, face, driver } = makeRig(-1, phase);
      const before = hans.position.clone();
      expect(installWarRoomHansFacingGuard(root)).toBe(1);
      driver.onBeforeRender();
      expect(renderedFaceDotTravel(hans, head, face, hans.position.clone().sub(before))).toBeGreaterThan(0.98);
    },
  );

  it('restaura el frente de marcha justo antes del mesh visible si un writer tardío lo invierte', () => {
    const { root, hans, bodyMesh, head, face, driver } = makeRig(1, 'carry-log');
    const before = hans.position.clone();
    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    driver.onBeforeRender();
    const movement = hans.position.clone().sub(before);
    hans.rotation.y = Math.PI / 2;
    hans.updateMatrixWorld(true);
    expect(renderedFaceDotTravel(hans, head, face, movement)).toBeLessThan(-0.98);
    paintVisible(bodyMesh, 17);
    expect(renderedFaceDotTravel(hans, head, face, movement)).toBeGreaterThan(0.98);
    expect(hans.userData.warRoomHansFacingGuardSource).toBe('visible-mesh-pre-render');
  });

  it('cede la orientación a work-target cuando una fase nominalmente móvil ya está parada', () => {
    const { root, hans, bodyMesh, driver } = makeRig(1, 'carry-log');
    driver.onBeforeRender = () => {
      driver.userData.warRoomHansPhase = 'carry-log';
      hans.userData.warRoomHansMovementFacing = 'work-target';
      hans.userData.warRoomHansMotionState = 'carry-log';
      hans.rotation.y = 0.73;
    };
    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    driver.onBeforeRender();
    expect(hans.rotation.y).toBeCloseTo(0.73, 8);
    hans.rotation.y = -0.41;
    paintVisible(bodyMesh, 18);
    expect(hans.rotation.y).toBeCloseTo(-0.41, 8);
  });

  it('no roba la orientación de trabajo cuando Hans está quieto', () => {
    const { root, hans, driver } = makeRig(1, 'place-log');
    driver.onBeforeRender = () => {
      hans.position.set(0, -0.34, 0.72);
      hans.rotation.y = 0.47;
      driver.userData.warRoomHansPhase = 'place-log';
    };
    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    driver.onBeforeRender();
    expect(hans.rotation.y).toBeCloseTo(0.47, 8);
  });

  it('es idempotente y no apila wrappers', () => {
    const { root } = makeRig(1, 'carry-log');
    expect(installWarRoomHansFacingGuard(root)).toBe(1);
    expect(installWarRoomHansFacingGuard(root)).toBe(0);
  });
});
