import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES, randomPuzzle } from './puzzles.js';
import { validateLabPosition } from './labPosition.js';
import { curatedPuzzleTacticalIssues } from './puzzleTacticalQuality.js';

const FILES = 'abcdefgh';
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function fenWithTurn(fen, turn) {
  const fields = fen.trim().split(/\s+/);
  fields[1] = turn;
  return fields.join(' ');
}

function pieces(chess) {
  return chess.board().flat().filter(Boolean);
}

function squareDistance(a, b) {
  const file = (sq) => FILES.indexOf(sq[0]);
  const rank = (sq) => Number(sq[1]);
  return Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
}

function validatePositionShape(chess) {
  const all = pieces(chess);
  const white = all.filter((p) => p.color === 'w');
  const black = all.filter((p) => p.color === 'b');
  const whiteKings = white.filter((p) => p.type === 'k');
  const blackKings = black.filter((p) => p.type === 'k');

  expect(whiteKings, 'debe haber exactamente un rey blanco').toHaveLength(1);
  expect(blackKings, 'debe haber exactamente un rey negro').toHaveLength(1);
  expect(white.length, 'blancas no pueden tener más de 16 piezas').toBeLessThanOrEqual(16);
  expect(black.length, 'negras no pueden tener más de 16 piezas').toBeLessThanOrEqual(16);
  expect(white.filter((p) => p.type === 'p').length).toBeLessThanOrEqual(8);
  expect(black.filter((p) => p.type === 'p').length).toBeLessThanOrEqual(8);

  // Dos reyes adyacentes no pueden proceder de una partida legal.
  expect(squareDistance(whiteKings[0].square, blackKings[0].square)).toBeGreaterThan(1);

  // Un peón nunca puede existir legalmente en la primera u octava fila.
  for (const pawn of all.filter((p) => p.type === 'p')) {
    expect(['1', '8']).not.toContain(pawn.square[1]);
  }
}

function matingMoves(chess) {
  return chess.moves().filter((san) => {
    const next = new Chess(chess.fen());
    next.move(san);
    return next.isCheckmate();
  });
}

function canForceMateWithin(chess, attacker, remainingHumanMoves) {
  if (chess.isCheckmate()) return chess.turn() !== attacker;
  if (remainingHumanMoves <= 0 || chess.isGameOver()) return false;
  const moves = chess.moves();
  if (chess.turn() === attacker) {
    return moves.some((san) => {
      const next = new Chess(chess.fen());
      next.move(san);
      return canForceMateWithin(next, attacker, remainingHumanMoves - 1);
    });
  }
  return moves.length > 0 && moves.every((san) => {
    const next = new Chess(chess.fen());
    next.move(san);
    return canForceMateWithin(next, attacker, remainingHumanMoves);
  });
}

function keyForcesMate(puzzle, humanMoves) {
  const chess = new Chess(puzzle.fen);
  const attacker = chess.turn();
  chess.move(puzzle.solution[0]);
  return canForceMateWithin(chess, attacker, humanMoves - 1);
}

describe('banco de puzzles curados', () => {
  it('no contiene IDs duplicados', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tiene variedad real de dificultad, técnica y profundidad', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.kind))).toEqual(new Set(['mate1', 'mate2', 'mate3', 'material', 'combination']));
    expect(new Set(PUZZLES.map((puzzle) => puzzle.difficulty))).toEqual(new Set(['easy', 'medium', 'hard', 'brutal']));
    expect(new Set(PUZZLES.map((puzzle) => puzzle.technique)).size).toBeGreaterThanOrEqual(12);
    expect([...new Set(PUZZLES.filter((puzzle) => puzzle.kind === 'material').map((puzzle) => puzzle.solution[0][0]))]).toEqual(expect.arrayContaining(['B', 'N', 'Q', 'R', 'g', 'e']));

    const multiMove = PUZZLES.filter((puzzle) => Math.ceil(puzzle.solution.length / 2) >= 2);
    const deep = PUZZLES.filter((puzzle) => Math.ceil(puzzle.solution.length / 2) >= 3);
    expect(multiMove.length, 'debe haber suficientes puzzles que exijan calcular más de una jugada propia').toBeGreaterThanOrEqual(9);
    expect(deep.length, 'debe existir un núcleo serio de cálculo a tres o más jugadas propias').toBeGreaterThanOrEqual(3);
  });

  it('la selección evita recientes y no repite tipo/dificultad cuando hay alternativa', () => {
    const recent = PUZZLES.filter((puzzle) => puzzle.kind === 'material').slice(0, 5).map((puzzle) => puzzle.id);
    const next = randomPuzzle(recent, 'material', 'easy');
    expect(recent).not.toContain(next.id);
    expect(next.kind).not.toBe('material');
    expect(next.difficulty).not.toBe('easy');
  });

  it.each(PUZZLES)('$id tiene sentido táctico, no sólo un FEN válido', (puzzle) => {
    expect(curatedPuzzleTacticalIssues(puzzle), `${puzzle.id}: solución tácticamente dudosa`).toEqual([]);
  });

  it.each(PUZZLES)('$id pasa el gate completo de integridad', (puzzle) => {
    expect(() => new Chess(puzzle.fen)).not.toThrow();
    const legalPosition = validateLabPosition(puzzle.fen);
    expect(legalPosition.errors, `${puzzle.id}: FEN imposible`).toEqual([]);
    const chess = new Chess(puzzle.fen);
    validatePositionShape(chess);

    const humanTurn = chess.turn();
    const opponentTurn = humanTurn === 'w' ? 'b' : 'w';

    // Si al cambiar artificialmente el turno el rival aparece ya en jaque,
    // el FEN entrega el turno al bando equivocado: fue exactamente la clase
    // de posición corrupta que permitió "capturar" al rey en el bug original.
    const opponentToMove = new Chess(fenWithTurn(puzzle.fen, opponentTurn));
    expect(opponentToMove.inCheck(), 'el rey rival no puede empezar ya atacado').toBe(false);

    expect(Array.isArray(puzzle.solution)).toBe(true);
    expect(puzzle.solution.length).toBeGreaterThan(0);

    expect(chess.isGameOver(), `${puzzle.id} no puede empezar ya terminado`).toBe(false);

    if (puzzle.kind === 'mate1') {
      expect(puzzle.solution).toHaveLength(1);
      expect(matingMoves(new Chess(puzzle.fen)).length, `${puzzle.id} debe tener al menos un mate en 1`).toBeGreaterThan(0);
    }
    if (puzzle.kind === 'mate2') {
      expect(puzzle.solution).toHaveLength(3);
      expect(matingMoves(new Chess(puzzle.fen)), `${puzzle.id} no puede ser ya mate en 1`).toHaveLength(0);
      expect(keyForcesMate(puzzle, 2), `${puzzle.id}: la clave debe forzar mate en 2 contra cualquier defensa`).toBe(true);
    }
    if (puzzle.kind === 'mate3') {
      expect(puzzle.solution).toHaveLength(5);
      expect(matingMoves(new Chess(puzzle.fen)), `${puzzle.id} no puede ser ya mate en 1`).toHaveLength(0);
      expect(keyForcesMate(puzzle, 3), `${puzzle.id}: la clave debe forzar mate en 3 contra cualquier defensa`).toBe(true);
    }

    if (puzzle.kind === 'combination') {
      const humanMoves = Math.ceil(puzzle.solution.length / 2);
      expect(keyForcesMate(puzzle, humanMoves), `${puzzle.id}: la combinación no puede depender de que el rival acepte una trampa inferior`).toBe(true);
    }

    const played = [];
    for (const san of puzzle.solution) {
      const legal = chess.moves();
      expect(legal, `${puzzle.id}: ${san} debe ser legal`).toContain(san);
      const move = chess.move(san);
      expect(move.captured, 'un movimiento legal nunca puede capturar un rey').not.toBe('k');
      played.push(move);
    }

    if (['mate1', 'mate2', 'mate3', 'combination'].includes(puzzle.kind)) {
      expect(chess.isCheckmate(), `${puzzle.id} promete una línea de mate y debe acabar en mate`).toBe(true);
    }


    if (puzzle.kind === 'material') {
      const humanCaptures = played
        .filter((_, i) => i % 2 === 0)
        .reduce((sum, move) => sum + (PIECE_VALUE[move.captured] || 0), 0);
      const opponentCaptures = played
        .filter((_, i) => i % 2 === 1)
        .reduce((sum, move) => sum + (PIECE_VALUE[move.captured] || 0), 0);
      expect(humanCaptures, `${puzzle.id} debe ganar material real`).toBeGreaterThan(opponentCaptures);
    }
  });
});
