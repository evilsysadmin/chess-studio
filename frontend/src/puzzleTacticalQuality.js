import { Chess } from 'chess.js';

const PIECE_VALUE = Object.freeze({ p: 1, n: 3, b: 3.25, r: 5, q: 9, k: 0 });
const MATE_SCORE = 10_000;

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

export function tacticalScoreForFirstMove(fen, san, { replyDepth = 2 } = {}) {
  try {
    const board = new Chess(fen);
    const perspective = board.turn();
    const move = board.move(san);
    if (!move) return null;
    return { score: minimax(board, replyDepth, perspective), move, perspective };
  } catch {
    return null;
  }
}

export function bestShallowTacticalScore(fen, { replyDepth = 2 } = {}) {
  try {
    const board = new Chess(fen);
    const perspective = board.turn();
    let best = -Infinity;
    for (const move of board.moves({ verbose: true })) {
      board.move(move);
      best = Math.max(best, minimax(board, replyDepth, perspective));
      board.undo();
    }
    return Number.isFinite(best) ? best : null;
  } catch {
    return null;
  }
}

export function immediateCaptureRefutations(fen, san) {
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
      replies.push({ san: reply.san, after, swing: after - before, captured: reply.captured });
      board.undo();
    }
    return replies;
  } catch {
    return [];
  }
}

// Filtro deliberadamente conservador para puzzles de una sola jugada creados
// por IA. No pretende sustituir al motor: sólo evita el caso vergonzoso de
// "da jaque" -> un peón se come la pieza y el ejercicio lo celebra igual.
export function isObviouslyUnsoundSingleMovePuzzle(puzzle) {
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || puzzle.solution.length !== 1) return false;
  try {
    const board = new Chess(puzzle.fen);
    const perspective = board.turn();
    const before = materialBalance(board, perspective);
    const played = board.move(puzzle.solution[0]);
    if (!played || board.isCheckmate()) return false;
    const replies = board.moves({ verbose: true });
    for (const reply of replies) {
      if (reply.to !== played.to || !reply.captured) continue;
      board.move(reply);
      const after = materialBalance(board, perspective);
      const terminalWin = board.isCheckmate() && board.turn() !== perspective;
      board.undo();
      if (!terminalWin && after < before - 0.75) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function curatedPuzzleTacticalIssues(puzzle) {
  const issues = [];
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || !puzzle.solution.length) return ['puzzle incompleto'];

  if (puzzle.kind === 'material') {
    const expected = tacticalScoreForFirstMove(puzzle.fen, puzzle.solution[0], { replyDepth: 2 });
    const best = bestShallowTacticalScore(puzzle.fen, { replyDepth: 2 });
    if (!expected || best == null) issues.push('no se pudo evaluar la clave');
    else if (expected.score < best - 0.35) issues.push(`la clave queda ${Math.round((best - expected.score) * 100)} cp por debajo de una alternativa táctica simple`);

    const refutations = immediateCaptureRefutations(puzzle.fen, puzzle.solution[0]).filter((item) => item.swing < -0.75);
    if (refutations.length) issues.push(`la pieza de la clave queda trivialmente capturable: ${refutations.map((item) => item.san).join(', ')}`);
  }

  return issues;
}
