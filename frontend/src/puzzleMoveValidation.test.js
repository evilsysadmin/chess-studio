import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { matchesExpectedPuzzleMove } from './puzzleMoveValidation.js';

describe('matchesExpectedPuzzleMove', () => {
  it('acepta la horquilla curada de caballo por identidad de movimiento', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
    const board = new Chess(fen);
    const move = board.move({ from: 'b5', to: 'c7' });
    expect(move.san).toBe('Nc7+');
    expect(matchesExpectedPuzzleMove(fen, 'Nc7+', move)).toBe(true);
  });

  it('tolera SAN histórica sin sufijo de jaque si representa la misma jugada legal', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
    const board = new Chess(fen);
    const move = board.move({ from: 'b5', to: 'c7' });
    // chess.js admite SAN permisiva al resolver la jugada esperada; lo que
    // importa al usuario es haber movido la misma pieza a la misma casilla.
    expect(matchesExpectedPuzzleMove(fen, 'Nc7', move)).toBe(true);
  });

  it('sigue rechazando una jugada legal diferente', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
    const board = new Chess(fen);
    const move = board.move({ from: 'b5', to: 'd6' });
    expect(matchesExpectedPuzzleMove(fen, 'Nc7+', move)).toBe(false);
  });
});
