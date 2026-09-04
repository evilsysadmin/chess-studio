import { Chess } from 'chess.js';

const FORCED_KINDS = new Set(['mate1', 'mate2', 'mate3', 'combination']);

function forcedMateDistance(board, attacker, remainingPlies) {
  if (board.isCheckmate()) return board.turn() !== attacker ? 0 : null;
  if (remainingPlies <= 0 || board.isGameOver()) return null;

  const moves = board.moves();
  if (!moves.length) return null;

  if (board.turn() === attacker) {
    let best = null;
    for (const san of moves) {
      const next = new Chess(board.fen());
      next.move(san);
      const distance = forcedMateDistance(next, attacker, remainingPlies - 1);
      if (distance == null) continue;
      const total = distance + 1;
      if (best == null || total < best) best = total;
    }
    return best;
  }

  let longest = 0;
  for (const san of moves) {
    const next = new Chess(board.fen());
    next.move(san);
    const distance = forcedMateDistance(next, attacker, remainingPlies - 1);
    if (distance == null) return null;
    longest = Math.max(longest, distance + 1);
  }
  return longest;
}

function distanceAfter(board, san, attacker, remainingPlies) {
  const next = new Chess(board.fen());
  try {
    if (!next.move(san)) return null;
  } catch {
    return null;
  }
  const childDistance = forcedMateDistance(next, attacker, remainingPlies - 1);
  return childDistance == null ? null : childDistance + 1;
}

export function curatedForcedLineOptimalityIssues(puzzle) {
  if (!FORCED_KINDS.has(puzzle?.kind)) return [];
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || !puzzle.solution.length) return ['puzzle forzado incompleto'];

  let board;
  try {
    board = new Chess(puzzle.fen);
  } catch {
    return ['FEN no evaluable'];
  }

  const attacker = board.turn();
  const maxPlies = puzzle.solution.length;
  const issues = [];

  for (let index = 0; index < puzzle.solution.length; index += 1) {
    const san = puzzle.solution[index];
    const remainingPlies = maxPlies - index;
    const legal = board.moves();
    if (!legal.includes(san)) {
      issues.push(`la línea almacenada contiene una jugada ilegal: ${san}`);
      break;
    }

    const storedDistance = distanceAfter(board, san, attacker, remainingPlies);
    if (board.turn() === attacker) {
      const winningDistances = legal
        .map((candidate) => ({ san: candidate, distance: distanceAfter(board, candidate, attacker, remainingPlies) }))
        .filter((candidate) => candidate.distance != null)
        .sort((left, right) => left.distance - right.distance);
      const best = winningDistances[0];
      if (storedDistance == null) {
        issues.push(`la continuación ${san} abandona el mate forzado`);
      } else if (best && storedDistance > best.distance) {
        issues.push(`la continuación ${san} no es la ruta de mate más directa; ${best.san} fuerza antes`);
      }
    } else {
      const defenses = legal.map((candidate) => ({
        san: candidate,
        distance: distanceAfter(board, candidate, attacker, remainingPlies),
      }));
      const escaping = defenses.find((candidate) => candidate.distance == null);
      if (escaping) {
        issues.push(`la defensa ${escaping.san} evita el mate dentro del horizonte prometido`);
      } else {
        const bestDefense = defenses.sort((left, right) => right.distance - left.distance)[0];
        if (bestDefense && storedDistance != null && storedDistance < bestDefense.distance) {
          issues.push(`la respuesta ${san} es cooperativa; ${bestDefense.san} resiste más`);
        }
      }
    }

    board.move(san);
  }

  return [...new Set(issues)];
}
