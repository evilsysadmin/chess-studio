import { describe, expect, it } from 'vitest';
import { COARSE_PIECE_HIT_TARGET, resolveBoardTap } from './WarRoom3DTouch.js';

describe('War Room 3D touch targeting', () => {
  it('tolera la deriva normal del dedo y conserva el punto de contacto inicial', () => {
    const start = { x: 120, y: 310, id: 7 };
    const end = { x: 132, y: 319, id: 7 };

    expect(resolveBoardTap(start, end, { coarsePointer: true })).toEqual({ x: 120, y: 310 });
    expect(resolveBoardTap(start, end, { coarsePointer: false })).toBeNull();
  });

  it('rechaza un arrastre real incluso en táctil', () => {
    const start = { x: 100, y: 100, id: 3 };
    const end = { x: 128, y: 120, id: 3 };
    expect(resolveBoardTap(start, end, { coarsePointer: true })).toBeNull();
  });

  it('usa un hit target que cabe dentro de una casilla pero amplía claramente la pieza', () => {
    expect(COARSE_PIECE_HIT_TARGET.radius).toBeGreaterThan(0.4);
    expect(COARSE_PIECE_HIT_TARGET.radius).toBeLessThan(0.5);
    expect(COARSE_PIECE_HIT_TARGET.height).toBeGreaterThan(1.2);
  });
});
