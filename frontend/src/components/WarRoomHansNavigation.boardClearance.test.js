import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  warRoomHansBuildSafeRoute,
  warRoomHansSafeRoomLoop,
} from './WarRoomHansNavigation.js';

const BOARD_SAFE_HALF_EXTENT = 5.10;

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

  it('routes espresso from the service corridor to the desk without a diagonal through the board', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, -0.305, 0);
    root.add(parent, floor);
    root.updateMatrixWorld(true);

    // Canonical desk sits at z=-6.15 and the service target is offset toward
    // the room by +0.74, so Hans stops around z=-5.41 beside the desk.
    const serviceDoor = new THREE.Vector3(6.7, -0.34, -6.0);
    const espressoTarget = new THREE.Vector3(-1.78, -0.34, -5.41);
    const route = warRoomHansBuildSafeRoute(floor, parent, serviceDoor, espressoTarget);

    expect(route.length).toBeGreaterThan(1);
    const path = [serviceDoor, ...route];
    for (let index = 1; index < path.length; index += 1) {
      expectSegmentOutsideBoard(path[index - 1], path[index]);
    }
    expect(route.at(-1)?.x).toBeCloseTo(espressoTarget.x, 6);
    expect(route.at(-1)?.z).toBeCloseTo(espressoTarget.z, 6);
  });
});
