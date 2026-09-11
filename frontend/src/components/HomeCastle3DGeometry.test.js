import { describe, expect, it } from 'vitest';
import { canonicalHallDepth, createCanonicalHallGeometry } from './HomeCastle3DGeometry.js';

describe('HomeCastle3DGeometry', () => {
  it('keeps the center wall almost flat while bringing floor and side architecture forward', () => {
    const center = canonicalHallDepth(0.5, 0.55);
    const floor = canonicalHallDepth(0.5, 0.02);
    const side = canonicalHallDepth(0.98, 0.55);

    expect(center).toBeCloseTo(0, 6);
    expect(floor).toBeGreaterThan(0.15);
    expect(side).toBeGreaterThan(center);
  });

  it('creates a segmented mesh with a non-flat depth field', () => {
    const geometry = createCanonicalHallGeometry({ widthSegments: 4, heightSegments: 4 });
    const position = geometry.attributes.position;
    const depths = Array.from({ length: position.count }, (_, index) => position.getZ(index));

    expect(position.count).toBe(25);
    expect(Math.max(...depths)).toBeGreaterThan(Math.min(...depths));
    geometry.dispose();
  });
});
