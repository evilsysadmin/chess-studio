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

function moveOrder(move) {
  if (move.san.endsWith('#')) return 4;
  if (move.san.endsWith('+')) return 3;
  if (move.captured) return 2;
  if (move.promotion) return 1;
  return 0;
}

function orderedMoves(board) {
  return board.moves({ verbose: true })
    .sort((left, right) => moveOrder(right) - moveOrder(left));
}

function playVerbose(board, move) {
  return board.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || undefined,
  });
}

// Boolean bounded proof. This is deliberately cheaper than calculating an
// exact distance for every legal candidate: the attacker needs one proof,
// while the defender needs every reply to remain inside the mate horizon.
function canForceMateWithin(board, attacker, attackerMovesLeft, memo) {
  if (board.isCheckmate()) return board.turn() !== attacker;
  if (board.isGameOver()) return false;
  if (board.turn() === attacker && attackerMovesLeft <= 0) return false;

  const key = transpositionKey(board, attacker, attackerMovesLeft);
  if (memo.has(key)) return memo.get(key);

  const moves = orderedMoves(board);
  let result;

  if (board.turn() === attacker) {
    result = false;
    for (const move of moves) {
      playVerbose(board, move);
      const wins = canForceMateWithin(board, attacker, attackerMovesLeft - 1, memo);
      board.undo();
      if (wins) {
        result = true;
        break;
      }
    }
  } else {
    result = moves.length > 0;
    for (const move of moves) {
      playVerbose(board, move);
      const wins = canForceMateWithin(board, attacker, attackerMovesLeft, memo);
      board.undo();
      if (!wins) {
        result = false;
        break;
      }
    }
  }

  memo.set(key, result);
  return result;
}

function moveForcesMateWithin(board, move, attacker, attackerMovesAvailable, memo) {
  const attackerToMove = board.turn() === attacker;
  playVerbose(board, move);

  const childBudget = attackerMovesAvailable - (attackerToMove ? 1 : 0);
  const result = board.isCheckmate()
    ? board.turn() !== attacker
    : childBudget >= 0 && canForceMateWithin(board, attacker, childBudget, memo);

  board.undo();
  return result;
}

function minimumStoredMateBudget(board, storedMove, attacker, maxBudget, memo) {
  const minimum = board.turn() === attacker ? 1 : 0;
  for (let budget = minimum; budget <= maxBudget; budget += 1) {
    if (moveForcesMateWithin(board, storedMove, attacker, budget, memo)) return budget;
  }
  return null;
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
    const legal = orderedMoves(board);
    const storedMove = legal.find((move) => move.san === san);

    if (!storedMove) {
      issues.push(`la línea almacenada contiene una jugada ilegal: ${san}`);
      break;
    }

    const storedBudget = minimumStoredMateBudget(
      board,
      storedMove,
      attacker,
      attackerMovesAvailable,
      memo,
    );

    if (board.turn() === attacker) {
      if (storedBudget == null) {
        issues.push(`la continuación ${san} abandona el mate forzado`);
      } else if (storedBudget > 1) {
        const faster = legal.find((candidate) => (
          candidate.san !== san
          && moveForcesMateWithin(board, candidate, attacker, storedBudget - 1, memo)
        ));
        if (faster) {
          issues.push(`la continuación ${san} no es la ruta de mate más directa; ${faster.san} fuerza antes`);
        }
      }
    } else if (storedBudget == null) {
      // A root move already proven to force mate cannot legitimately reach an
      // escaping stored defense. Keep this fail-closed in case a future bank
      // entry bypasses the older forced-mate integrity gate.
      issues.push(`la defensa ${san} sale del mate forzado dentro del horizonte prometido`);
    } else {
      const tougherDefense = legal.find((candidate) => (
        candidate.san !== san
        && !moveForcesMateWithin(board, candidate, attacker, storedBudget, memo)
      ));
      if (tougherDefense) {
        issues.push(`la respuesta ${san} es cooperativa; ${tougherDefense.san} resiste más`);
      }
    }

    playVerbose(board, storedMove);
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
