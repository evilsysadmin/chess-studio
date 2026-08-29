import { Chess } from 'chess.js';

const PIECE_VALUE = Object.freeze({ p: 1, n: 3, b: 3.25, r: 5, q: 9, k: 0 });
const MATE_SCORE = 10_000;
const MATERIAL_KEY_TOLERANCE = 0.75;
const DEFENSE_COOPERATION_TOLERANCE = 0.75;
const MIN_MATERIAL_GAIN = 0.75;

export function materialBalance(board, perspective) {
  let score = 0;
  for (const row of board.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUE[piece.type] || 0;
      score += piece.color === perspective ? value : -value;
    }
  }
  return score;
}

function staticScore(board, perspective) {
  if (board.isCheckmate()) return board.turn() === perspective ? -MATE_SCORE : MATE_SCORE;
  if (board.isDraw() || board.isStalemate()) return 0;
  let score = materialBalance(board, perspective);
  // Un jaque vale muy poco frente a material: sirve sólo como desempate para
  // que el validador no considere un jaque suicida equivalente a una pieza.
  if (board.inCheck()) score += board.turn() === perspective ? -0.08 : 0.08;
  return score;
}

function minimax(board, depth, perspective, alpha = -Infinity, beta = Infinity) {
  if (depth <= 0 || board.isGameOver()) return staticScore(board, perspective);
  const maximizing = board.turn() === perspective;
  let best = maximizing ? -Infinity : Infinity;
  const moves = board.moves({ verbose: true });
  for (const move of moves) {
    board.move(move);
    const score = minimax(board, depth - 1, perspective, alpha, beta);
    board.undo();
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return Number.isFinite(best) ? best : staticScore(board, perspective);
}

function scoreLegalMove(board, san, perspective, replyDepth = 2) {
  try {
    const probe = new Chess(board.fen());
    const move = probe.move(san);
    if (!move) return null;
    return { score: minimax(probe, replyDepth, perspective), move };
  } catch {
    return null;
  }
}

function bestScoreForSideToMove(board, perspective, replyDepth = 2) {
  const maximizing = board.turn() === perspective;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of board.moves({ verbose: true })) {
    board.move(move);
    const score = minimax(board, replyDepth, perspective);
    board.undo();
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
  }
  return Number.isFinite(best) ? best : null;
}

export function tacticalScoreForFirstMove(fen, san, { replyDepth = 2 } = {}) {
  try {
    const board = new Chess(fen);
    const perspective = board.turn();
    const result = scoreLegalMove(board, san, perspective, replyDepth);
    return result ? { ...result, perspective } : null;
  } catch {
    return null;
  }
}

export function bestShallowTacticalScore(fen, { replyDepth = 2 } = {}) {
  try {
    const board = new Chess(fen);
    return bestScoreForSideToMove(board, board.turn(), replyDepth);
  } catch {
    return null;
  }
}

export function immediateCaptureRefutations(fen, san, { continuationDepth = 2 } = {}) {
  try {
    const board = new Chess(fen);
    const perspective = board.turn();
    const before = materialBalance(board, perspective);
    const played = board.move(san);
    if (!played) return [];
    const destination = played.to;
    const replies = [];
    for (const reply of board.moves({ verbose: true })) {
      if (reply.to !== destination || !reply.captured) continue;
      board.move(reply);
      const after = materialBalance(board, perspective);
      const tacticalScore = minimax(board, continuationDepth, perspective);
      replies.push({ san: reply.san, after, swing: after - before, tacticalScore, captured: reply.captured });
      board.undo();
    }
    return replies;
  } catch {
    return [];
  }
}

// Filtro conservador para puzzles de una sola jugada creados por IA. No intenta
// competir con el motor del backend: busca únicamente la vergüenza obvia de
// celebrar una pieza que queda capturable sin compensación táctica inmediata.
export function isObviouslyUnsoundSingleMovePuzzle(puzzle) {
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || puzzle.solution.length !== 1) return false;
  try {
    const board = new Chess(puzzle.fen);
    const perspective = board.turn();
    const before = materialBalance(board, perspective);
    const best = bestScoreForSideToMove(board, perspective, 2);
    const expected = scoreLegalMove(board, puzzle.solution[0], perspective, 2);
    if (!expected) return true;
    board.move(puzzle.solution[0]);
    if (board.isCheckmate()) return false;

    // Si incluso este minimax local ve que la supuesta clave queda muy por
    // debajo de una alternativa sencilla, no merece entrar como puzzle.
    if (best != null && expected.score < best - 1.25) return true;

    const destination = expected.move.to;
    for (const reply of board.moves({ verbose: true })) {
      if (reply.to !== destination || !reply.captured) continue;
      board.move(reply);
      const after = materialBalance(board, perspective);
      const continuation = minimax(board, 2, perspective);
      const terminalWin = board.isCheckmate() && board.turn() !== perspective;
      board.undo();
      // Una captura inmediata sólo refuta el ejercicio si deja una pérdida
      // material clara Y el cálculo corto no encuentra mate/recaptura/ganancia
      // que justifique el sacrificio.
      if (!terminalWin && after < before - 0.75 && continuation < before - 0.75) return true;
    }
    return false;
  } catch {
    return true;
  }
}


function canForceMateWithin(board, attacker, remainingHumanMoves) {
  if (board.isCheckmate()) return board.turn() !== attacker;
  if (remainingHumanMoves <= 0 || board.isGameOver()) return false;
  const moves = board.moves();
  if (board.turn() === attacker) {
    return moves.some((san) => {
      const next = new Chess(board.fen());
      next.move(san);
      return canForceMateWithin(next, attacker, remainingHumanMoves - 1);
    });
  }
  return moves.length > 0 && moves.every((san) => {
    const next = new Chess(board.fen());
    next.move(san);
    return canForceMateWithin(next, attacker, remainingHumanMoves);
  });
}

function forcedMateIssues(puzzle) {
  const issues = [];
  let board;
  try { board = new Chess(puzzle.fen); } catch { return ['FEN no evaluable']; }
  const attacker = board.turn();
  const humanMoves = Math.ceil(puzzle.solution.length / 2);
  const key = puzzle.solution[0];
  try {
    if (!board.move(key)) return [`la clave ${key} no es legal`];
  } catch {
    return [`la clave ${key} no es legal`];
  }
  if (!canForceMateWithin(board, attacker, humanMoves - 1)) {
    issues.push('la clave no fuerza el mate contra la mejor defensa');
  }

  try {
    const line = new Chess(puzzle.fen);
    for (const san of puzzle.solution) {
      if (!line.move(san)) {
        issues.push(`la línea almacenada contiene una jugada ilegal: ${san}`);
        return issues;
      }
    }
    if (!line.isCheckmate() || line.turn() === attacker) {
      issues.push('la línea prometida no termina en mate al rival');
    }
  } catch {
    issues.push('la línea prometida no puede reproducirse completa');
  }
  return issues;
}

function materialLineIssues(puzzle) {
  const issues = [];
  let board;
  try { board = new Chess(puzzle.fen); } catch { return ['FEN no evaluable']; }
  const perspective = board.turn();
  const initialMaterial = materialBalance(board, perspective);

  for (let index = 0; index < puzzle.solution.length; index += 1) {
    const san = puzzle.solution[index];
    const humanPly = index % 2 === 0;
    const best = bestScoreForSideToMove(board, perspective, humanPly ? 2 : 1);
    const expected = scoreLegalMove(board, san, perspective, humanPly ? 2 : 1);
    if (!expected) {
      issues.push(`la línea contiene una jugada no evaluable: ${san}`);
      return issues;
    }

    if (best != null) {
      if (humanPly && expected.score < best - MATERIAL_KEY_TOLERANCE) {
        issues.push(`la jugada ${san} queda claramente por debajo de una alternativa táctica sencilla`);
      }
      if (!humanPly && expected.score > best + DEFENSE_COOPERATION_TOLERANCE) {
        issues.push(`la respuesta ${san} es demasiado cooperativa; existe una defensa claramente mejor`);
      }
    }

    if (humanPly) {
      const fenBefore = board.fen();
      const refutations = immediateCaptureRefutations(fenBefore, san, { continuationDepth: 2 })
        .filter((item) => item.swing < -0.75 && item.tacticalScore < initialMaterial - 0.75);
      if (refutations.length) {
        issues.push(`la pieza jugada en ${san} queda capturable sin compensación: ${refutations.map((item) => item.san).join(', ')}`);
      }
    }

    board.move(san);
    if (board.isCheckmate() && board.turn() === perspective) {
      issues.push('la línea termina dando mate al jugador que debía resolver el puzzle');
      return issues;
    }
  }

  const finalMaterial = materialBalance(board, perspective);
  if (finalMaterial < initialMaterial + MIN_MATERIAL_GAIN) {
    issues.push(`la línea promete ganar material pero sólo cambia el balance ${Math.round((finalMaterial - initialMaterial) * 100)} cp`);
  }
  return issues;
}

export function curatedPuzzleTacticalIssues(puzzle) {
  const issues = [];
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || !puzzle.solution.length) return ['puzzle incompleto'];

  if (puzzle.kind === 'material') {
    issues.push(...materialLineIssues(puzzle));
  }
  if (['mate1', 'mate2', 'mate3', 'combination'].includes(puzzle.kind)) {
    issues.push(...forcedMateIssues(puzzle));
  }

  return [...new Set(issues)];
}
