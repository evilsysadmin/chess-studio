import { Chess } from 'chess.js';

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

  return {
    san: move.san,
    from: move.from,
    to: move.to,
    color: move.color,
    line: `Yo probaría ${move.san}.`,
  };
}
