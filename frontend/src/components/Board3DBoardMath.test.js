import { describe, expect, it } from 'vitest';
import { isLightSquare, parseFen } from './Board3DBoardMath.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('Board3D board math', () => {
  it('uses canonical chessboard square colors', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('d1')).toBe(true);
    expect(isLightSquare('d8')).toBe(false);
    expect(isLightSquare('e8')).toBe(true);
  });

  it('keeps queens and kings on their canonical starting squares', () => {
    const pieces = parseFen(START_FEN);
    expect(pieces).toEqual(expect.arrayContaining([
      { square: 'd8', type: 'q', color: 'b' },
      { square: 'e8', type: 'k', color: 'b' },
      { square: 'd1', type: 'q', color: 'w' },
      { square: 'e1', type: 'k', color: 'w' },
    ]));
  });
});
