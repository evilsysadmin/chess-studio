import { Chess } from 'chess.js';

const PIECE_NAMES = Object.freeze({
  p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama',
});

/**
 * A factual consequence of a move already validated by chess.js. This is not
 * an engine evaluation: checks and captures alone cannot prove a good move.
 * Remain silent for ordinary moves instead of inventing a tactical verdict.
 */
export function schoolVerifiedMoveConsequence(boardAfter, move) {
  if (!boardAfter || !move?.san) return null;
  if (boardAfter.isCheckmate()) {
    return 'Mate comprobado: el rey rival está en jaque y no tiene ninguna respuesta legal.';
  }
  if (move.promotion) {
    const promotion = PIECE_NAMES[move.promotion] || 'pieza';
    const capture = move.captured ? ' y capturó un ' + (PIECE_NAMES[move.captured] || 'pieza') + ' rival' : '';
    return 'El peón llegó a ' + move.to + capture + ' y se convirtió en ' + promotion + '. La promoción cambia la pieza, no sólo su aspecto.';
  }
  if (move.flags?.includes('k') || move.flags?.includes('q')) {
    return 'Enroque comprobado: rey y torre cambian de posición en una sola jugada. No equivale automáticamente a estar a salvo.';
  }
  if (move.captured) {
    const piece = PIECE_NAMES[move.captured] || 'pieza';
    const check = boardAfter.isCheck() ? ' Además, da jaque.' : '';
    return 'Captura comprobada en ' + move.to + ': retiró un ' + piece + ' rival.' + check + ' Eso no demuestra por sí solo que fuera la mejor jugada.';
  }
  if (boardAfter.isCheck()) {
    return 'Jaque comprobado: el rival debe responder a la amenaza sobre su rey. Dar jaque no garantiza ventaja.';
  }
  return null;
}

/**
 * A hypothetical legal alternative can be described without changing the
 * active board. Never show such feedback during exams or no-hints replays.
 * No SAN, analysis, or expected route is emitted for those modes.
 */
export function schoolRejectedMoveFact({ fen, from, to, exam = false, noHints = false } = {}) {
  if (exam || noHints || !fen || !from || !to) return null;
  try {
    const board = new Chess(fen);
    const move = board.move({ from, to, promotion: 'q' });
    const fact = move && schoolVerifiedMoveConsequence(board, move);
    if (!fact) return null;
    return move.san + ' es legal. ' + fact + ' Sin embargo, no cumple el objetivo de esta lección.';
  } catch {
    return null;
  }
}
