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

  it('brings the canonical central chess table forward without affecting the back wall', () => {
    const tableCenter = canonicalHallDepth(0.5, 0.31);
    const tableEdge = canonicalHallDepth(0.26, 0.31);
    const wallAbove = canonicalHallDepth(0.5, 0.56);

    expect(tableCenter).toBeGreaterThan(tableEdge + 0.04);
    expect(tableCenter).toBeLessThan(0.07);
    expect(wallAbove).toBeCloseTo(0, 6);
  });

  it('adds restrained local depth to the fireplace and right foreground only', () => {
    const hearth = canonicalHallDepth(0.87, 0.21);
    const nearbyFloor = canonicalHallDepth(0.68, 0.21);
    const leftMirror = canonicalHallDepth(0.13, 0.21);

    expect(hearth).toBeGreaterThan(nearbyFloor + 0.025);
    expect(hearth).toBeGreaterThan(leftMirror + 0.02);
    expect(hearth - nearbyFloor).toBeLessThan(0.06);
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
