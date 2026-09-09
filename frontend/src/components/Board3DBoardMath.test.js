import { describe, expect, it } from 'vitest';
import { adjacentSquare, isLightSquare, parseFen, squarePosition } from './Board3DBoardMath.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';

function pieceAt(pieces, square) {
  return pieces.find((piece) => piece.square === square) || null;
}

describe('Board3D board math', () => {
  it('keeps canonical chessboard parity across all 64 squares', () => {
    const lightSquares = [];
    for (let rank = 1; rank <= 8; rank += 1) {
      for (let file = 0; file < FILES.length; file += 1) {
        const square = `${FILES[file]}${rank}`;
        if (isLightSquare(square)) lightSquares.push(square);

        if (file < FILES.length - 1) {
          expect(isLightSquare(square)).not.toBe(isLightSquare(`${FILES[file + 1]}${rank}`));
        }
        if (rank < 8) {
          expect(isLightSquare(square)).not.toBe(isLightSquare(`${FILES[file]}${rank + 1}`));
        }
      }
    }

    expect(lightSquares).toHaveLength(32);
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('a8')).toBe(true);
    expect(isLightSquare('h8')).toBe(false);
    expect(isLightSquare('d1')).toBe(true);
    expect(isLightSquare('d8')).toBe(false);
    expect(isLightSquare('e8')).toBe(true);
  });

  it('keeps the complete canonical back ranks, including queen-on-own-color', () => {
    const pieces = parseFen(START_FEN);
    const expected = {
      a1: ['r', 'w'], b1: ['n', 'w'], c1: ['b', 'w'], d1: ['q', 'w'], e1: ['k', 'w'], f1: ['b', 'w'], g1: ['n', 'w'], h1: ['r', 'w'],
      a8: ['r', 'b'], b8: ['n', 'b'], c8: ['b', 'b'], d8: ['q', 'b'], e8: ['k', 'b'], f8: ['b', 'b'], g8: ['n', 'b'], h8: ['r', 'b'],
    };

    for (const [square, [type, color]] of Object.entries(expected)) {
      expect(pieceAt(pieces, square)).toEqual({ square, type, color });
    }

    expect(isLightSquare('d1')).toBe(true);
    expect(isLightSquare('d8')).toBe(false);
  });

  it('maps board coordinates without mirroring files or ranks', () => {
    expect(squarePosition('a1')).toEqual({ x: -3.5, z: 3.5 });
    expect(squarePosition('h1')).toEqual({ x: 3.5, z: 3.5 });
    expect(squarePosition('a8')).toEqual({ x: -3.5, z: -3.5 });
    expect(squarePosition('h8')).toEqual({ x: 3.5, z: -3.5 });
    expect(squarePosition('d8')).toEqual({ x: -0.5, z: -3.5 });
    expect(squarePosition('e8')).toEqual({ x: 0.5, z: -3.5 });
  });

  it('keeps keyboard movement screen-relative for both orientations', () => {
    expect(adjacentSquare('e1', 'ArrowUp', 'white')).toBe('e2');
    expect(adjacentSquare('e1', 'ArrowRight', 'white')).toBe('f1');
    expect(adjacentSquare('e8', 'ArrowUp', 'black')).toBe('e7');
    expect(adjacentSquare('e8', 'ArrowRight', 'black')).toBe('d8');
    expect(adjacentSquare('a8', 'ArrowLeft', 'white')).toBeNull();
    expect(adjacentSquare('h1', 'ArrowLeft', 'black')).toBeNull();
  });
});
