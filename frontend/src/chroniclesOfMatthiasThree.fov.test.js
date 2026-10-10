import { describe, expect, it } from 'vitest';
import { chroniclesFirstPersonFov } from './chroniclesOfMatthiasThree.js';

const hfov = (vfov, aspect) => 2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * (180 / Math.PI);

describe('Chronicles first-person field of view', () => {
  it('keeps 67° vertical on 4:3, 16:9 and portrait phones', () => {
    for (const aspect of [390 / 844, 1, 4 / 3, 1.6]) expect(chroniclesFirstPersonFov(aspect)).toBe(67);
  });

  it('caps the horizontal FOV on wide desktop canvases instead of a fisheye', () => {
    for (const aspect of [16 / 9, 2.2, 2.5, 3]) {
      const vfov = chroniclesFirstPersonFov(aspect);
      expect(vfov).toBeLessThanOrEqual(67);
      expect(hfov(vfov, aspect)).toBeLessThanOrEqual(96.0001);
    }
    // The reported 1600×640 game canvas: ~117° before, 96° now.
    expect(hfov(67, 2.5)).toBeGreaterThan(115);
    expect(hfov(chroniclesFirstPersonFov(2.5), 2.5)).toBeCloseTo(96, 3);
  });

  it('falls back safely on a degenerate aspect', () => {
    expect(chroniclesFirstPersonFov(0)).toBe(67);
    expect(chroniclesFirstPersonFov(Number.NaN)).toBe(67);
  });
});
