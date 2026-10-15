import { describe, expect, it } from 'vitest';
import { shouldPaintPvpHallResize } from './PvpDuelHallScene3D.jsx';

describe('PvP Duel Hall WebGL resize budget', () => {
  const size = { width: 1100, height: 690 };

  it('paints initialization and actual width/height changes', () => {
    expect(shouldPaintPvpHallResize({ width: 0, height: 0 }, size)).toBe(true);
    expect(shouldPaintPvpHallResize(size, { width: 1101, height: 690 })).toBe(true);
    expect(shouldPaintPvpHallResize(size, { width: 1100, height: 691 })).toBe(true);
  });

  it('does not paint when the canvas dimensions are unchanged', () => {
    expect(shouldPaintPvpHallResize(size, size)).toBe(false);
    // ResizeObserver and window resize supply a callback parameter, not a
    // deliberate force-paint request. Only the exact boolean true forces it.
    expect(shouldPaintPvpHallResize(size, size, [])).toBe(false);
    expect(shouldPaintPvpHallResize(size, size, { type: 'resize' })).toBe(false);
  });

  it('always renders the newly loaded scene once at the existing size', () => {
    expect(shouldPaintPvpHallResize(size, size, true)).toBe(true);
  });
});
