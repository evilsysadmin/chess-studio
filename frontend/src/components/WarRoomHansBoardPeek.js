import { Chess } from 'chess.js';

const PIECE_NAMES = Object.freeze({
  p: 'peón',
  n: 'caballo',
  b: 'alfil',
  r: 'torre',
  q: 'dama',
  k: 'rey',
});

function describeMove(move) {
  if (!move) return '';
  if (move.san === 'O-O') return 'enroque corto';
  if (move.san === 'O-O-O') return 'enroque largo';

  const piece = PIECE_NAMES[move.piece] || 'pieza';
  const promotion = move.promotion ? PIECE_NAMES[move.promotion] || move.promotion : null;
  const promotionText = promotion ? `, coronando a ${promotion}` : '';
  return `${piece} de ${move.from} a ${move.to}${promotionText}`;
}

export function pickHansLegalSuggestion(fen, randomValue = Math.random()) {
  let chess;
  try {
    chess = new Chess(String(fen || ''));
  } catch {
    return null;
  }

  if (chess.isGameOver()) return null;
  const legalMoves = chess.moves({ verbose: true });
  if (!legalMoves.length) return null;

  const raw = Number(randomValue);
  const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
  const move = legalMoves[Math.floor(normalized * legalMoves.length)];
  if (!move?.san) return null;

  const description = describeMove(move);
  return {
    san: move.san,
    from: move.from,
    to: move.to,
    color: move.color,
    piece: move.piece,
    line: `Yo probaría ${description}.`,
  };
}