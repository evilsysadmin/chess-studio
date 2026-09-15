import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_NAVIGATION_CLEAR_LANE_HALF_EXTENT,
  warRoomHansSafeRoomLoop,
} from './WarRoomHansNavigation.js';

const BOARD_SAFE_HALF_EXTENT = 5.10;
// The old 0.32u synthetic radius covered Hans' trunk but not the rendered
// shoulder/arm envelope once the canonical elder body is scaled and animated.
// Keep enough budget for the visible body instead of validating only his root.
const HANS_VISIBLE_FOOTPRINT_RADIUS = 0.45;

function footprintOutsideBoard(point) {
  return Math.abs(Number(point?.x || 0)) - HANS_VISIBLE_FOOTPRINT_RADIUS >= BOARD_SAFE_HALF_EXTENT
    || Math.abs(Number(point?.z || 0)) - HANS_VISIBLE_FOOTPRINT_RADIUS >= BOARD_SAFE_HALF_EXTENT;
}

describe('Hans navigation footprint clearance', () => {
  it('keeps Hans visible footprint outside the board instead of only his root point', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.09, 13.6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, -0.305, 0);
    root.add(parent, floor);
    root.updateMatrixWorld(true);

    expect(WAR_ROOM_HANS_NAVIGATION_CLEAR_LANE_HALF_EXTENT)
      .toBeGreaterThanOrEqual(BOARD_SAFE_HALF_EXTENT + HANS_VISIBLE_FOOTPRINT_RADIUS);

    const loop = warRoomHansSafeRoomLoop(floor, parent);
    expect(loop).toHaveLength(8);

    for (let index = 0; index < loop.length; index += 1) {
      const from = loop[index];
      const to = loop[(index + 1) % loop.length];
      for (let step = 0; step <= 24; step += 1) {
        const t = step / 24;
        const point = new THREE.Vector3(
          THREE.MathUtils.lerp(from.x, to.x, t),
          THREE.MathUtils.lerp(from.y, to.y, t),
          THREE.MathUtils.lerp(from.z, to.z, t),
        );
        expect(footprintOutsideBoard(point)).toBe(true);
      }
    }
  });
});
