import { describe, expect, it } from 'vitest';
import { findMatthiasKingSquare, projectMatthiasKingAnchor } from './Matthias3DBubbleAnchor.js';

describe('Matthias3DBubbleAnchor', () => {
  it('encuentra el rey rival real dentro del FEN', () => {
    const fen = '8/8/8/8/8/8/6K1/4k3 w - - 0 1';
    expect(findMatthiasKingSquare(fen, 'w')).toBe('g2');
    expect(findMatthiasKingSquare(fen, 'b')).toBe('e1');
  });

  it('mueve el ancla horizontal cuando Matthias mueve su rey', () => {
    const e1 = projectMatthiasKingAnchor({
      fen: '8/8/8/8/8/8/8/4K2k w - - 0 1',
      matthiasKingColor: 'w',
      orientation: 'black',
      width: 1064,
      height: 610,
      viewportWidth: 1064,
    });
    const g1 = projectMatthiasKingAnchor({
      fen: '8/8/8/8/8/8/8/6Kk w - - 0 1',
      matthiasKingColor: 'w',
      orientation: 'black',
      width: 1064,
      height: 610,
      viewportWidth: 1064,
    });

    expect(e1.square).toBe('e1');
    expect(g1.square).toBe('g1');
    expect(Math.abs(g1.left - e1.left)).toBeGreaterThan(8);
    expect(Math.abs(g1.top - e1.top)).toBeLessThan(0.1);
  });

  it('sigue siendo proyectable con el framing móvil de la War Room', () => {
    const anchor = projectMatthiasKingAnchor({
      fen: '8/8/8/8/8/8/5K2/7k w - - 0 1',
      matthiasKingColor: 'w',
      orientation: 'black',
      width: 390,
      height: 368,
      coarsePointer: true,
      viewportWidth: 390,
    });

    expect(anchor.square).toBe('f2');
    expect(Number.isFinite(anchor.left)).toBe(true);
    expect(Number.isFinite(anchor.top)).toBe(true);
  });
});
