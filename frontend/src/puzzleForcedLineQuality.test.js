import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES } from './puzzles.js';

const FORCED_KINDS = new Set(['mate1', 'mate2', 'mate3', 'combination']);

function canForceMateWithin(board, attacker, remainingAttackerMoves, memo) {
  if (board.isCheckmate()) return board.turn() !== attacker;
  if (board.isGameOver()) return false;
  if (board.turn() === attacker && remainingAttackerMoves <= 0) return false;

  const key = `${attacker}|${remainingAttackerMoves}|${board.fen()}`;
  if (memo.has(key)) return memo.get(key);

  const moves = board.moves();
  let result;
  if (board.turn() === attacker) {
    result = moves.some((san) => {
      board.move(san);
      const wins = canForceMateWithin(board, attacker, remainingAttackerMoves - 1, memo);
      board.undo();
      return wins;
    });
  } else {
    result = moves.length > 0 && moves.every((san) => {
      board.move(san);
      const wins = canForceMateWithin(board, attacker, remainingAttackerMoves, memo);
      board.undo();
      return wins;
    });
  }

  memo.set(key, result);
  return result;
}

function minimumAttackerMovesToMate(board, attacker, maxMoves, memo) {
  if (board.isCheckmate()) return board.turn() !== attacker ? 0 : null;
  for (let moves = 1; moves <= maxMoves; moves += 1) {
    if (canForceMateWithin(board, attacker, moves, memo)) return moves;
  }
  return null;
}

function mateMoveCostAfter(board, san, attacker, attackerMovesAvailable, memo) {
  const attackerToMove = board.turn() === attacker;
  try {
    if (!board.move(san)) return null;
  } catch {
    return null;
  }

  const childBudget = attackerMovesAvailable - (attackerToMove ? 1 : 0);
  let childCost = null;
  if (childBudget >= 0) childCost = minimumAttackerMovesToMate(board, attacker, childBudget, memo);
  const terminalMate = board.isCheckmate() && board.turn() !== attacker;
  board.undo();

  if (terminalMate) return attackerToMove ? 1 : 0;
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
