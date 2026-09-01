import { describe, expect, it } from 'vitest';
import { bubblePlacement, materiallyDifferentAnchor } from './Board3DOverlayAnchor.js';

describe('Board3DOverlayAnchor', () => {
  it('places a bubble on the opposite side of a king near the right edge', () => {
    const placement = bubblePlacement({ x: 820, y: 190, width: 900, height: 620 });
    expect(placement.tail).toBe('right');
    expect(placement.left).toBeLessThan(820);
    expect(placement.left + placement.width).toBeLessThanOrEqual(890);
  });

  it('keeps a left-side king bubble inside the viewport', () => {
    const placement = bubblePlacement({ x: 80, y: 120, width: 760, height: 520 });
    expect(placement.tail).toBe('left');
    expect(placement.left).toBeGreaterThanOrEqual(10);
    expect(placement.top).toBeGreaterThanOrEqual(10);
  });

  it('does not publish sub-pixel-ish anchor noise every render', () => {
    const previous = { x: 100, y: 100, width: 800, height: 600 };
    expect(materiallyDifferentAnchor(previous, { ...previous, x: 101, y: 101 })).toBe(false);
    expect(materiallyDifferentAnchor(previous, { ...previous, x: 104 })).toBe(true);
  });
});
