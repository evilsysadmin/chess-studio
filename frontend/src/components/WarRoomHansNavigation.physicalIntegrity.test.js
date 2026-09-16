import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  warRoomHansChoreCanMoveTarget,
  warRoomHansChoreForEvent,
} from './WarRoomHansChoreContract.js';
import {
  WAR_ROOM_HANS_NAVIGATION_BOARD_SAFE_HALF_EXTENT,
  WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
  warRoomHansBuildSafeRoute,
} from './WarRoomHansNavigation.js';
import {
  HANS_SERVICE_FURNITURE_CLEARANCE,
  warRoomHansTargetNearObject,
} from './WarRoomHansServiceRoute.js';

function makeRoom() {
  const root = new THREE.Group();
  const parent = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(16.5, 0.09, 13.6),
    new THREE.MeshBasicMaterial(),
  );
  floor.name = 'war-room-castle-floor-slab';
  floor.position.set(0, -0.305, 0);
  root.add(parent, floor);
  root.updateMatrixWorld(true);
  return { root, parent, floor };
}

function insideBoard(point) {
  const half = WAR_ROOM_HANS_NAVIGATION_BOARD_SAFE_HALF_EXTENT;
  return Math.abs(Number(point?.x || 0)) < half - 1e-4
    && Math.abs(Number(point?.z || 0)) < half - 1e-4;
}

function addSofa(root, name, x, z) {
  const sofa = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.85, 1.25),
    new THREE.MeshBasicMaterial(),
  );
  sofa.name = name;
  sofa.position.set(x, 0.02, z);
  root.add(sofa);
  root.updateMatrixWorld(true);
  return sofa;
}

function pointInsideExpandedObject(point, object, padding) {
  const box = new THREE.Box3().setFromObject(object);
  return Number(point.x) > box.min.x - padding + 1e-4
    && Number(point.x) < box.max.x + padding - 1e-4
    && Number(point.z) > box.min.z - padding + 1e-4
    && Number(point.z) < box.max.z + padding - 1e-4;
}

function expectRouteOutsideBoard(from, route) {
  const path = [from, ...route];
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    for (let sample = 0; sample <= 32; sample += 1) {
      const t = sample / 32;
      const point = new THREE.Vector3(
        THREE.MathUtils.lerp(start.x, end.x, t),
        -0.34,
        THREE.MathUtils.lerp(start.z, end.z, t),
      );
      expect(insideBoard(point)).toBe(false);
    }
  }
}

describe('Hans physical navigation integrity', () => {
  it('rejects a task target inside the board keep-out instead of routing onto the board', () => {
    const { parent, floor } = makeRoom();
    const serviceDoor = new THREE.Vector3(6.7, -0.34, -6.0);
    const brokenTarget = new THREE.Vector3(0, -0.34, 0);

    expect(warRoomHansBuildSafeRoute(floor, parent, serviceDoor, brokenTarget)).toEqual([]);
  });

  it('keeps every sampled segment of an accepted cross-room route outside the board keep-out', () => {
    const { parent, floor } = makeRoom();
    const from = new THREE.Vector3(6.7, -0.34, -6.0);
    const to = new THREE.Vector3(-6.0, -0.34, 2.8);
    const route = warRoomHansBuildSafeRoute(floor, parent, from, to);

    expect(route.length).toBeGreaterThan(0);
    expectRouteOutsideBoard(from, route);
  });

  it('keeps straighten-room routable when the chair is absent by targeting the carpet perimeter from inside the room', () => {
    const { root, parent, floor } = makeRoom();
    const carpetKey = new THREE.Mesh(
      new THREE.BoxGeometry(12.82, 0.012, 0.045),
      new THREE.MeshBasicMaterial(),
    );
    carpetKey.name = 'war-room-command-carpet-brass-key';
    carpetKey.position.set(0, -0.215, 6.18);
    root.add(carpetKey);
    root.updateMatrixWorld(true);

    const chore = warRoomHansChoreForEvent('straighten-room');
    expect(chore?.targetNames).toEqual([
      'war-room-teutonic-command-chair',
      'war-room-command-carpet-brass-key',
    ]);
    expect(warRoomHansChoreCanMoveTarget('straighten-room', chore.targetNames[0])).toBe(true);
    expect(warRoomHansChoreCanMoveTarget('straighten-room', chore.targetNames[1])).toBe(false);

    const targetObject = root.getObjectByName(chore.targetNames[1]);
    const target = warRoomHansTargetNearObject(targetObject, parent, {
      offsetX: chore.offsetX,
      offsetZ: chore.offsetZ,
    });
    const serviceDoor = new THREE.Vector3(6.7, -0.34, -6.0);
    const route = warRoomHansBuildSafeRoute(floor, parent, serviceDoor, target);

    expect(target).toBeTruthy();
    expect(Math.abs(target.z)).toBeLessThan(Math.abs(carpetKey.position.z));
    expect(Math.abs(carpetKey.position.z) - Math.abs(target.z)).toBeGreaterThanOrEqual(
      HANS_SERVICE_FURNITURE_CLEARANCE,
    );
    expect(insideBoard(target)).toBe(false);
    expect(route.length).toBeGreaterThan(0);
    expectRouteOutsideBoard(serviceDoor, route);
  });

  it('routes around a side sofa instead of sending Hans through the upholstery lane', () => {
    const { root, parent, floor } = makeRoom();
    const sofa = addSofa(root, 'war-room-sofa-right', 5.55, 0);
    const from = new THREE.Vector3(6.7, -0.34, -6.0);
    const to = new THREE.Vector3(6.7, -0.34, 6.0);
    const route = warRoomHansBuildSafeRoute(floor, parent, from, to);

    expect(route.length).toBeGreaterThan(0);
    const path = [from, ...route];
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1];
      const end = path[index];
      for (let sample = 0; sample <= 48; sample += 1) {
        const t = sample / 48;
        const point = new THREE.Vector3(
          THREE.MathUtils.lerp(start.x, end.x, t),
          -0.34,
          THREE.MathUtils.lerp(start.z, end.z, t),
        );
        expect(pointInsideExpandedObject(
          point,
          sofa,
          WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
        )).toBe(false);
      }
    }
  });

  it('fails closed when room geometry cannot provide a safe circulation loop', () => {
    const parent = new THREE.Group();
    const invalidFloor = new THREE.Group();
    const from = new THREE.Vector3(6, -0.34, -6);
    const to = new THREE.Vector3(-6, -0.34, 6);

    expect(warRoomHansBuildSafeRoute(invalidFloor, parent, from, to)).toEqual([]);
  });
});
