import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE,
  warRoomHansBuildSafeRoute,
  warRoomHansSafeRoomLoop,
} from './WarRoomHansNavigation.js';

const BOARD_SAFE_HALF_EXTENT = 5.10;
const CANONICAL_RIGHT_ARMOR = Object.freeze({ x: 6.68, z: -3.12 });
const HANS_ARMOR_KEEP_OUT_RADIUS = 1.12;

function outsideBoard(point) {
  return Math.abs(Number(point?.x || 0)) >= BOARD_SAFE_HALF_EXTENT
    || Math.abs(Number(point?.z || 0)) >= BOARD_SAFE_HALF_EXTENT;
}

function expectSegmentOutsideBoard(from, to) {
  for (let step = 0; step <= 24; step += 1) {
    const t = step / 24;
    const point = new THREE.Vector3(
      THREE.MathUtils.lerp(from.x, to.x, t),
      THREE.MathUtils.lerp(from.y, to.y, t),
      THREE.MathUtils.lerp(from.z, to.z, t),
    );
    expect(outsideBoard(point)).toBe(true);
  }
}

function expectOrthogonalSegments(path) {
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const sameX = Math.abs(Number(from.x) - Number(to.x)) <= 1e-6;
    const sameZ = Math.abs(Number(from.z) - Number(to.z)) <= 1e-6;
    expect(sameX || sameZ).toBe(true);
  }
}

function planarDistanceToSegment(point, from, to) {
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const wx = point.x - from.x;
  const wz = point.z - from.z;
  const lengthSquared = vx * vx + vz * vz;
  if (lengthSquared <= 1e-10) return Math.hypot(wx, wz);
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lengthSquared));
  const nearestX = from.x + vx * t;
  const nearestZ = from.z + vz * t;
  return Math.hypot(point.x - nearestX, point.z - nearestZ);
}

function addCanonicalDesk(root) {
  const deskArt = new THREE.Group();
  deskArt.name = 'war-room-teutonic-command-desk-v28';
  deskArt.position.z = -6.15;
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(3.05, 0.16, 1),
    new THREE.MeshBasicMaterial(),
  );
  deskTop.name = 'war-room-command-desk-top';
  deskTop.position.y = 1.03;
  deskArt.add(deskTop);
  root.add(deskArt);
  return deskArt;
}

function insidePaddedDesk(point) {
  const halfWidth = 3.05 * 0.5 + WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE;
  const minZ = -6.15 - 0.5 - WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE;
  const maxZ = -6.15 + 0.5 + WAR_ROOM_HANS_NAVIGATION_FURNITURE_CLEARANCE;
  return Math.abs(Number(point.x)) < halfWidth - 1e-4
    && Number(point.z) > minZ + 1e-4
    && Number(point.z) < maxZ - 1e-4;
}

function expectSegmentOutsideDesk(from, to) {
  for (let step = 0; step <= 36; step += 1) {
    const t = step / 36;
    const point = new THREE.Vector3(
      THREE.MathUtils.lerp(from.x, to.x, t),
      THREE.MathUtils.lerp(from.y, to.y, t),
      THREE.MathUtils.lerp(from.z, to.z, t),
    );
    expect(insidePaddedDesk(point)).toBe(false);
  }
}

describe('Hans room navigation board clearance', () => {
  it('keeps the canonical room loop outside the board-safe footprint', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, -0.305, 0);
    root.add(parent, floor);
    root.updateMatrixWorld(true);

    const loop = warRoomHansSafeRoomLoop(floor, parent);
    expect(loop).toHaveLength(8);
    for (const point of loop) expect(outsideBoard(point)).toBe(true);
  });

  it('removes the rear-center waypoint when the padded command desk occupies it', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, -0.305, 0);
    root.add(parent, floor);
    addCanonicalDesk(root);
    root.updateMatrixWorld(true);

    const loop = warRoomHansSafeRoomLoop(floor, parent);
    expect(loop).toHaveLength(7);
    for (const point of loop) {
      expect(outsideBoard(point)).toBe(true);
      expect(insidePaddedDesk(point)).toBe(false);
    }
  });

  it('routes espresso around the desk instead of through its rear corridor', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, -0.305, 0);
    root.add(parent, floor);
    addCanonicalDesk(root);
    root.updateMatrixWorld(true);

    const serviceDoor = new THREE.Vector3(6.7, -0.34, -6.0);
    const espressoTarget = new THREE.Vector3(-2.12, -0.34, -5.41);
    const route = warRoomHansBuildSafeRoute(floor, parent, serviceDoor, espressoTarget);

    expect(route.length).toBeGreaterThan(4);
    const path = [serviceDoor, ...route];
    for (let index = 1; index < path.length; index += 1) {
      expectSegmentOutsideBoard(path[index - 1], path[index]);
      expectSegmentOutsideDesk(path[index - 1], path[index]);
    }
    expectOrthogonalSegments(path);
    expect(route.at(-1)?.x).toBeCloseTo(espressoTarget.x, 6);
    expect(route.at(-1)?.z).toBeCloseTo(espressoTarget.z, 6);
  });

  it('keeps side-wall transit clear of the canonical right armour and zweihander', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, -0.305, 0);
    root.add(parent, floor);
    root.updateMatrixWorld(true);

    const serviceDoor = new THREE.Vector3(6.7, -0.34, -6.0);
    const frontRightTarget = new THREE.Vector3(6.0, -0.34, 2.8);
    const route = warRoomHansBuildSafeRoute(floor, parent, serviceDoor, frontRightTarget);
    const path = [serviceDoor, ...route];
    expectOrthogonalSegments(path);
    const minimumClearance = Math.min(...path.slice(1).map((point, index) => planarDistanceToSegment(
      CANONICAL_RIGHT_ARMOR,
      path[index],
      point,
    )));

    expect(minimumClearance).toBeGreaterThan(HANS_ARMOR_KEEP_OUT_RADIUS);
  });
});
