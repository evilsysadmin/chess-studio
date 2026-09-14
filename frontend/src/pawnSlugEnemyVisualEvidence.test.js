import { describe, expect, it, vi } from 'vitest';
import {
  inspectPawnSlugEnemyImage,
  pawnSlugEnemyAlphaCoverage,
} from './pawnSlugEnemyVisualEvidence.js';

function rgba(width, height, opaquePixels = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of opaquePixels) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

function fakeDocument(data, width, height) {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
  };
  return {
    context,
    createElement: vi.fn(() => ({
      width,
      height,
      getContext: vi.fn(() => context),
    })),
  };
}

describe('Pawn Slug enemy visual evidence', () => {
  it('rejects an atlas whose authored row is fully transparent', () => {
    const data = rgba(4, 2, [[0, 0], [1, 0]]);
    const coverage = pawnSlugEnemyAlphaCoverage(data, 4, 2, { axis: 'y', segments: 2 });

    expect(coverage.overall).toBeGreaterThan(0);
    expect(coverage.segments[0]).toBeGreaterThan(0);
    expect(coverage.segments[1]).toBe(0);
    expect(coverage.minSegment).toBe(0);
  });

  it('accepts only decoded enemy art with opaque pixels in every required segment', () => {
    const width = 6;
    const height = 2;
    const data = rgba(width, height, [[0, 0], [2, 0], [4, 0], [1, 1], [3, 1], [5, 1]]);
    const documentRef = fakeDocument(data, width, height);
    const evidence = inspectPawnSlugEnemyImage(
      { width, height },
      { axis: 'x', segments: 3, documentRef },
    );

    expect(evidence).toMatchObject({ checked: true, opaque: true, reason: 'opaque-pixels' });
    expect(evidence.minSegment).toBeGreaterThan(0);
    expect(documentRef.context.drawImage).toHaveBeenCalledTimes(1);
  });

  it('marks a transparent decoded source as checked but unusable', () => {
    const width = 6;
    const height = 2;
    const documentRef = fakeDocument(rgba(width, height), width, height);
    const evidence = inspectPawnSlugEnemyImage(
      { width, height },
      { axis: 'x', segments: 3, documentRef },
    );

    expect(evidence).toEqual(expect.objectContaining({
      checked: true,
      opaque: false,
      reason: 'transparent-source',
      overall: 0,
      minSegment: 0,
    }));
  });

  it('keeps runtime rendering fail-open when canvas readback is unavailable', () => {
    const evidence = inspectPawnSlugEnemyImage({ width: 384, height: 128 }, { documentRef: null });
    expect(evidence).toEqual(expect.objectContaining({
      checked: false,
      opaque: true,
      reason: 'probe-unavailable',
    }));
  });
});
