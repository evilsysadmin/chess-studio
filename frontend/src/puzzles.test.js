import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES } from './puzzles.js';

function fenWithTurn(fen, turn) {
  const fields = fen.split(' ');
  fields[1] = turn;
  return fields.join(' ');
}

describe('banco de puzzles curados', () => {
  it.each(PUZZLES)('$id empieza en una posición coherente y reproduce su solución', (puzzle) => {
    const chess = new Chess(puzzle.fen);
    const humanTurn = chess.turn();
    const opponentTurn = humanTurn === 'w' ? 'b' : 'w';

    // Un puzzle no puede arrancar con el rey rival ya atacado por el bando
    // que va a mover: esa posición no puede proceder de una partida legal y
    // chess.js puede acabar ofreciendo capturas del rey en FENs imposibles.
    const opponentToMove = new Chess(fenWithTurn(puzzle.fen, opponentTurn));
    expect(opponentToMove.inCheck()).toBe(false);

    expect(Array.isArray(puzzle.solution)).toBe(true);
    expect(puzzle.solution.length).toBeGreaterThan(0);
    for (const san of puzzle.solution) {
      expect(() => chess.move(san)).not.toThrow();
    }

    if (puzzle.kind === 'mate1' || puzzle.kind === 'mate2') {
      expect(chess.isCheckmate()).toBe(true);
    }
  });
});
