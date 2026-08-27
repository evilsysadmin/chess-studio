import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { applyPuzzleSolutionMove, matchesExpectedPuzzleMove } from './puzzleMoveValidation.js';

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

  it('aplica respuestas canónicas de forma segura', () => {
    const fen = new Chess().fen();
    const result = applyPuzzleSolutionMove(fen, 'e4');
    expect(result?.move?.san).toBe('e4');
    expect(result?.fen).toContain(' b ');
  });

  it('una respuesta corrupta devuelve null en vez de dejar atrapada la UI', () => {
    const fen = new Chess().fen();
    expect(applyPuzzleSolutionMove(fen, 'Qh9??')).toBeNull();
    expect(applyPuzzleSolutionMove('fen imposible', 'e4')).toBeNull();
  });

});
