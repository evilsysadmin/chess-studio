import { describe, expect, it } from 'vitest';
import {
  HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE,
  resolveHansBoardPeekApproachDistance,
} from './WarRoomHansBoardPeekPose.js';

function projectTowardBoard(x, z, distance) {
  const radius = Math.hypot(x, z);
  if (radius <= 1e-9 || distance <= 0) return { x, z };
  const scale = Math.max(0, (radius - distance) / radius);
  return { x: x * scale, z: z * scale };
}

describe('Hans board peek square keep-out', () => {
  it('preserves the old cardinal-axis distances', () => {
    expect(resolveHansBoardPeekApproachDistance({ x: 5.7, z: 0 })).toBeCloseTo(0.22, 8);
    expect(resolveHansBoardPeekApproachDistance({ x: 4.95, z: 0 })).toBeCloseTo(0.1, 8);
    expect(resolveHansBoardPeekApproachDistance({ x: 4.7, z: 0 })).toBe(0);
  });

  it('does not confuse radial distance with being outside the square board footprint', () => {
    // Radius is ~6.79 here, so the old circular test wrongly granted the full
    // 0.22 step even though both axes are already inside the 4.85 keep-out.
    expect(resolveHansBoardPeekApproachDistance({ x: 4.8, z: 4.8 })).toBe(0);
  });

  it('clips a diagonal peek exactly at the square boundary instead of stepping through it', () => {
    const start = { x: 5, z: 5 };
    const distance = resolveHansBoardPeekApproachDistance(start);
    const projected = projectTowardBoard(start.x, start.z, distance);

    expect(distance).toBeLessThan(0.22);
    expect(Math.max(Math.abs(projected.x), Math.abs(projected.z)))
      .toBeCloseTo(HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE, 8);
  });
});
