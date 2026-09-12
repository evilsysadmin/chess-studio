import { describe, expect, it } from 'vitest';
import { createCanonicalHallGeometry } from './HomeCastle3DGeometry.js';
import { applyCanonicalHallOcclusion, canonicalHallOcclusion } from './HomeCastle3DOcclusion.js';

describe('HomeCastle3DOcclusion', () => {
  it('keeps the open central wall essentially neutral', () => {
    expect(canonicalHallOcclusion(0.5, 0.65, 0)).toBeGreaterThanOrEqual(0.98);
  });

  it('darkens deep floor edges without exceeding the restrained budget', () => {
    const shade = canonicalHallOcclusion(0.05, 0.1, 0.2);
    expect(shade).toBeLessThan(0.92);
    expect(shade).toBeGreaterThanOrEqual(0.82);
  });

  it('adds a subtle floor-wall joint cue', () => {
    expect(canonicalHallOcclusion(0.5, 0.34, 0)).toBeLessThan(1);
  });

  it('writes bounded grayscale vertex colors onto the canonical mesh', () => {
    const geometry = applyCanonicalHallOcclusion(createCanonicalHallGeometry({ widthSegments: 8, heightSegments: 4 }));
    const color = geometry.getAttribute('color');
    expect(color).toBeTruthy();
    expect(color.count).toBe(geometry.getAttribute('position').count);
    for (let index = 0; index < color.count; index += 1) {
      expect(color.getX(index)).toBeGreaterThanOrEqual(0.82);
      expect(color.getX(index)).toBeLessThanOrEqual(1);
      expect(color.getY(index)).toBe(color.getX(index));
      expect(color.getZ(index)).toBe(color.getX(index));
    }
    geometry.dispose();
  });
});
