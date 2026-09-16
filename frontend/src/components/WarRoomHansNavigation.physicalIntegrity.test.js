import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_NAVIGATION_BOARD_SAFE_HALF_EXTENT,
  warRoomHansBuildSafeRoute,
} from './WarRoomHansNavigation.js';

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
  });

  it('fails closed when room geometry cannot provide a safe circulation loop', () => {
    const parent = new THREE.Group();
    const invalidFloor = new THREE.Group();
    const from = new THREE.Vector3(6, -0.34, -6);
    const to = new THREE.Vector3(-6, -0.34, 6);

    expect(warRoomHansBuildSafeRoute(invalidFloor, parent, from, to)).toEqual([]);
  });
});
