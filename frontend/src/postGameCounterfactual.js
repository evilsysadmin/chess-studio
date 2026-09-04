import { Chess } from 'chess.js';

function normalizeEngineMove(move) {
  if (!move?.from || !move?.to) return null;
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion || null,
    san: move.san || null,
  };
}

function applyMove(board, move) {
  if (!move) return null;
  try {
    const played = move.from && move.to
      ? board.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' })
      : board.move(move.san);
    if (!played) return null;
    return {
      san: played.san,
      from: played.from,
      to: played.to,
      promotion: played.promotion || null,
    };
  } catch {
    return null;
  }
}

export async function buildShortCounterfactual({
  fen,
  suggested,
  analyzePosition,
  level = 95,
  maxPlies = 3,
  signal,
} = {}) {
  if (!fen || !suggested || typeof analyzePosition !== 'function') return null;
  const safePlies = Math.max(1, Math.min(3, Math.floor(Number(maxPlies) || 3)));

  let board;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }

  const line = [];
  const first = applyMove(board, typeof suggested === 'string' ? { san: suggested } : suggested);
  if (!first) return null;
  line.push(first);

  while (line.length < safePlies && !board.isGameOver()) {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    const engineMove = normalizeEngineMove(await analyzePosition(board.fen(), level, { signal }));
    const applied = applyMove(board, engineMove);
    if (!applied) break;
    line.push(applied);
  }

  return {
    fen,
    line,
    complete: board.isGameOver(),
  };
}
