import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
  warRoomHansBuildSafeRoute,
  warRoomHansSafeRoomLoop,
} from './WarRoomHansNavigation.js';

const GEOMETRY_EPSILON = 1e-4;

function paddedPlanarBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return {
    minX: box.min.x - WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
    maxX: box.max.x + WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
    minZ: box.min.z - WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
    maxZ: box.max.z + WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
  };
}

function pointInsideRect(point, rect) {
  return point.x > rect.minX + GEOMETRY_EPSILON
    && point.x < rect.maxX - GEOMETRY_EPSILON
    && point.z > rect.minZ + GEOMETRY_EPSILON
    && point.z < rect.maxZ - GEOMETRY_EPSILON;
}

function segmentIntersectsRectInterior(from, to, rect) {
  const minX = rect.minX + GEOMETRY_EPSILON;
  const maxX = rect.maxX - GEOMETRY_EPSILON;
  const minZ = rect.minZ + GEOMETRY_EPSILON;
  const maxZ = rect.maxZ - GEOMETRY_EPSILON;
  let tMin = 0;
  let tMax = 1;

  for (const [origin, delta, min, max] of [
    [from.x, to.x - from.x, minX, maxX],
    [from.z, to.z - from.z, minZ, maxZ],
  ]) {
    if (Math.abs(delta) <= GEOMETRY_EPSILON) {
      if (origin <= min || origin >= max) return false;
      continue;
    }
    let enter = (min - origin) / delta;
    let exit = (max - origin) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, exit);
    if (tMin > tMax) return false;
  }

  return tMax >= 0 && tMin <= 1 && tMax >= tMin;
}

describe('Hans command-chair route clearance', () => {
  it('treats the chair as a routed obstacle, not only as a safe final target', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.name = 'war-room-castle-floor-slab';
    floor.position.set(0, -0.305, 0);

    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 2.2, 0.8),
      new THREE.MeshBasicMaterial(),
    );
    chair.name = 'war-room-teutonic-command-chair';
    chair.position.set(0, 1.1, -5.4);

    root.add(parent, floor, chair);
    root.updateMatrixWorld(true);

    const paddedChair = paddedPlanarBounds(chair);
    const loop = warRoomHansSafeRoomLoop(floor, parent);
    expect(loop.length).toBeGreaterThanOrEqual(6);
    expect(loop.every((point) => !pointInsideRect(point, paddedChair))).toBe(true);

    // Reproduce the visible failure mode: a same-side rear-lane transit used to
    // choose the shortest straight segment and pass directly through the chair.
    const from = new THREE.Vector3(-4.6, -0.34, -5.55);
    const to = new THREE.Vector3(4.6, -0.34, -5.55);
    const route = warRoomHansBuildSafeRoute(floor, parent, from, to);

    expect(route.length).toBeGreaterThan(2);
    let previous = from;
    for (const point of route) {
      expect(segmentIntersectsRectInterior(previous, point, paddedChair)).toBe(false);
      previous = point;
    }
  });
});
