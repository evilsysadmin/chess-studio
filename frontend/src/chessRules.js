import { Chess } from 'chess.js';
import { historyStart, historyMoverColor, historyMoveNumber } from './historyTimeline.js';

export function chessFromFen(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}


export { historyStart, historyMoverColor, historyMoveNumber };

export function safeChessMove(chess, move) {
  if (!chess || !move) return null;
  try {
    return chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || 'q',
    });
  } catch {
    return null;
  }
}

export function standardChessStatus(chess) {
  if (!chess) return 'invalid';
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isDraw()) return 'draw';
  if (chess.isCheck()) return 'check';
  return 'playing';
}

/**
 * Rebuilds a saved normal-game history without inventing promotions. Older
 * records may not carry `promotion`; only those retain the historical queen
 * default. A malformed legacy record stops reconstruction at the last valid
 * position instead of throwing through Replay/ErrorBoundary.
 */
export function replayFenPositions(moves = [], initialFen = null) {
  const chess = chessFromFen(initialFen || undefined);
  if (!chess) return { positions: [new Chess().fen()], complete: false, failedAt: 0, invalidInitial: true };
  const positions = [chess.fen()];
  const history = Array.isArray(moves) ? moves : [];
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index];
    let applied = null;
    if (entry?.from && entry?.to) applied = safeChessMove(chess, entry);
    else if (entry?.san) {
      try { applied = chess.move(entry.san); } catch { applied = null; }
    }
    if (!applied) return { positions, complete: false, failedAt: index, invalidInitial: false };
    positions.push(chess.fen());
  }
  return { positions, complete: true, failedAt: null, invalidInitial: false };
}

/**
 * Applies a remotely suggested move only if chess.js accepts it. If it does
 * not, picks a legal local move from the exact same position. This keeps the
 * remote engine advisory: it can never manufacture an illegal board or freeze
 * a mode just because its response was stale/corrupt.
 */
export function applySuggestedOrLegalFallback(chess, suggestion, randomFn = Math.random) {
  const suggested = safeChessMove(chess, suggestion);
  if (suggested) return { move: suggested, usedFallback: false };

  const legal = chess?.moves?.({ verbose: true }) || [];
  if (!legal.length) return { move: null, usedFallback: false };
  const raw = Number(typeof randomFn === 'function' ? randomFn() : 0);
  const normalized = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0;
  const candidate = legal[Math.floor(normalized * legal.length)] || legal[0];
  const fallback = safeChessMove(chess, candidate);
  return { move: fallback, usedFallback: true };
}
