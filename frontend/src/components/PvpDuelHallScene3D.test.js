import { describe, expect, it } from 'vitest';
import { shouldPaintPvpHallResize } from './PvpDuelHallScene3D.jsx';

describe('PvP Duel Hall WebGL resize budget', () => {
  const same = { width: 1100, height: 690 };

  it('always paints the first initialized canvas', () => {
    expect(shouldPaintPvpHallResize({ width: 0, height: 0 }, same)).toBe(true);
  });

  it('skips redundant ResizeObserver notifications without a real size change', () => {
    expect(shouldPaintPvpHallResize(same, same)).toBe(false);
    expect(shouldPaintPvpHallResize(same, { width: 1101, height: 690 })).toBe(true);
    expect(shouldPaintPvpHallResize(same, { width: 1100, height: 691 })).toBe(true);
  });

  it('forces a model-ready paint even at identical dimensions', () => {
    expect(shouldPaintPvpHallResize(same, same, true)).toBe(true);
    // ResizeObserver supplies an entries array, not an explicit paint request.
    expect(shouldPaintPvpHallResize(same, same, [])).toBe(false);
  });
});
