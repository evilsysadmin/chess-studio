import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES } from './puzzles.js';

const FORCED_KINDS = new Set(['mate1', 'mate2', 'mate3', 'combination']);

function transpositionKey(board, attacker, attackerMovesLeft) {
  // Halfmove/fullmove counters do not change the tactical answer inside this
  // tiny horizon, but including them fragments equivalent transpositions.
  const position = board.fen().split(' ').slice(0, 4).join(' ');
  return `${attacker}|${attackerMovesLeft}|${position}`;
}

// Exact mate distance in attacker moves under optimal play, bounded by the
// puzzle's promised horizon. Attacker minimizes distance; defender maximizes
// it and immediately refutes the proof if any legal reply escapes the bound.
function forcedMateDistance(board, attacker, attackerMovesLeft, memo) {
  if (board.isCheckmate()) return board.turn() !== attacker ? 0 : null;
  if (board.isGameOver() || attackerMovesLeft <= 0) return null;

  const key = transpositionKey(board, attacker, attackerMovesLeft);
  if (memo.has(key)) return memo.get(key);

  const moves = board.moves();
  let result = null;

  if (board.turn() === attacker) {
    let best = null;
    for (const san of moves) {
      board.move(san);
      const child = forcedMateDistance(board, attacker, attackerMovesLeft - 1, memo);
      board.undo();

      if (child == null) continue;
      const cost = child + 1;
      if (best == null || cost < best) best = cost;
      if (best === 1) break; // mate inmediato: no existe una ruta más corta.
    }
    result = best;
  } else {
    let worst = 0;
    let escaped = false;
    for (const san of moves) {
      board.move(san);
      const child = forcedMateDistance(board, attacker, attackerMovesLeft, memo);
      board.undo();

      if (child == null) {
        escaped = true;
        break;
      }
      if (child > worst) worst = child;
    }
    result = escaped ? null : worst;
  }

  memo.set(key, result);
  return result;
}

function mateMoveCostAfter(board, san, attacker, attackerMovesAvailable, memo) {
  const attackerToMove = board.turn() === attacker;
  try {
    if (!board.move(san)) return null;
  } catch {
    return null;
  }

  const childBudget = attackerMovesAvailable - (attackerToMove ? 1 : 0);
  const childCost = childBudget >= 0
    ? forcedMateDistance(board, attacker, childBudget, memo)
    : null;
  board.undo();

  if (childCost == null) return null;
  return childCost + (attackerToMove ? 1 : 0);
}

function curatedForcedLineOptimalityIssues(puzzle) {
  if (!FORCED_KINDS.has(puzzle?.kind)) return [];
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || !puzzle.solution.length) return ['puzzle forzado incompleto'];

  let board;
  try {
    board = new Chess(puzzle.fen);
  } catch {
    return ['FEN no evaluable'];
  }

  const attacker = board.turn();
  const issues = [];
  const memo = new Map();

  for (let index = 0; index < puzzle.solution.length; index += 1) {
    const san = puzzle.solution[index];
    const remainingPlies = puzzle.solution.length - index;
    const attackerMovesAvailable = board.turn() === attacker
      ? Math.ceil(remainingPlies / 2)
      : Math.floor(remainingPlies / 2);
    const legal = board.moves();
    if (!legal.includes(san)) {
      issues.push(`la línea almacenada contiene una jugada ilegal: ${san}`);
      break;
    }

    const scored = legal.map((candidate) => ({
      san: candidate,
      cost: mateMoveCostAfter(board, candidate, attacker, attackerMovesAvailable, memo),
    }));
    const stored = scored.find((candidate) => candidate.san === san);

    if (board.turn() === attacker) {
      const winning = scored
        .filter((candidate) => candidate.cost != null)
        .sort((left, right) => left.cost - right.cost);
      const best = winning[0];
      if (stored?.cost == null) {
        issues.push(`la continuación ${san} abandona el mate forzado`);
      } else if (best && stored.cost > best.cost) {
        issues.push(`la continuación ${san} no es la ruta de mate más directa; ${best.san} fuerza antes`);
      }
    } else {
      const escaping = scored.find((candidate) => candidate.cost == null);
      if (escaping) {
        issues.push(`la defensa ${escaping.san} evita el mate dentro del horizonte prometido`);
      } else {
        const bestDefense = [...scored].sort((left, right) => right.cost - left.cost)[0];
        if (bestDefense && stored?.cost != null && stored.cost < bestDefense.cost) {
          issues.push(`la respuesta ${san} es cooperativa; ${bestDefense.san} resiste más`);
        }
      }
    }

    board.move(san);
  }

  return [...new Set(issues)];
}

describe('puzzle massacre · defensa óptima', () => {
  it.each(PUZZLES.filter((puzzle) => FORCED_KINDS.has(puzzle.kind)))(
    '$id almacena una línea contra defensa óptima',
    (puzzle) => {
      expect(
        curatedForcedLineOptimalityIssues(puzzle),
        `${puzzle.id}: la variante guardada no representa juego óptimo de ambos bandos`,
      ).toEqual([]);
    },
  );
});
