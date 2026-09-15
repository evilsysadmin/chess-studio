import { describe, expect, it } from 'vitest';
import { chroniclesIsoWorldForCell, chroniclesIsometricCameraPose } from './chroniclesOfMatthiasIsometric.js';

describe('Chronicles canonical isometric viewport', () => {
  it('maps dungeon cells to a stable square world grid', () => {
    const centre = chroniclesIsoWorldForCell(3, 3);
    const east = chroniclesIsoWorldForCell(4, 3);
    const south = chroniclesIsoWorldForCell(3, 4);

    expect([centre.x, centre.y, centre.z]).toEqual([0, 0, 0]);
    expect(east.x).toBeGreaterThan(centre.x);
    expect(east.z).toBe(centre.z);
    expect(south.z).toBeGreaterThan(centre.z);
    expect(south.x).toBe(centre.x);
    expect(east.x - centre.x).toBeCloseTo(south.z - centre.z, 6);
  });

  it('keeps the camera above and diagonally offset from its focus', () => {
    const pose = chroniclesIsometricCameraPose({ x: 2, z: -3 });

    expect(pose.position.y).toBeGreaterThan(8);
    expect(pose.position.x).toBeGreaterThan(pose.target.x);
    expect(pose.position.z).toBeGreaterThan(pose.target.z);
    expect(pose.target.y).toBeGreaterThan(0);
    expect(pose.fov).toBeGreaterThanOrEqual(34);
    expect(pose.fov).toBeLessThanOrEqual(42);
  });
});
