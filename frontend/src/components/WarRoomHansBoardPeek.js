import { Chess } from 'chess.js';

const PIECE_NAMES = Object.freeze({
  p: 'peón',
  n: 'caballo',
  b: 'alfil',
  r: 'torre',
  q: 'dama',
  k: 'rey',
});
const PIECE_VALUES = Object.freeze({ p: 1, n: 3.2, b: 3.3, r: 5, q: 9, k: 0 });
const PRIME_CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const EXTENDED_CENTER = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);
const TOP_SCORE_WINDOW = 1.75;
const MAX_CONTENDERS = 5;

function describeMove(move) {
  if (!move) return '';
  if (move.san === 'O-O') return 'enroque corto';
  if (move.san === 'O-O-O') return 'enroque largo';

  const piece = PIECE_NAMES[move.piece] || 'pieza';
  const promotion = move.promotion ? PIECE_NAMES[move.promotion] || move.promotion : null;
  const promotionText = promotion ? `, coronando a ${promotion}` : '';
  return `${piece} de ${move.from} a ${move.to}${promotionText}`;
}

function playVerboseMove(chess, move) {
  if (!move?.from || !move?.to) return null;
  return chess.move({
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
  });
}

function immediateMoveScore(move) {
  if (!move) return -Infinity;
  if (String(move.san || '').includes('#')) return 100000;

  let score = 0;
  if (move.captured) score += (PIECE_VALUES[move.captured] || 0) * 11;
  if (move.promotion) score += Math.max(0, (PIECE_VALUES[move.promotion] || 0) - PIECE_VALUES.p) * 10;
  if (String(move.san || '').includes('+')) score += 2.25;
  if (move.san === 'O-O' || move.san === 'O-O-O') score += 4;

  if (move.piece === 'p') {
    if (PRIME_CENTER.has(move.to)) score += 3;
    else if (EXTENDED_CENTER.has(move.to)) score += 1;
  } else if (move.piece === 'n') {
    if (EXTENDED_CENTER.has(move.to)) score += 2.4;
  } else if (move.piece === 'b') {
    score += 1.2;
  } else if (move.piece === 'q') {
    score -= 0.35;
  }

  return score;
}

function worstImmediateReply(chess) {
  const replies = chess.moves({ verbose: true });
  let worst = 0;

  for (const reply of replies) {
    let threat = 0;
    if (reply.captured) threat += (PIECE_VALUES[reply.captured] || 0) * 11;
    if (reply.promotion) threat += Math.max(0, (PIECE_VALUES[reply.promotion] || 0) - PIECE_VALUES.p) * 10;
    if (String(reply.san || '').includes('+')) threat += 1.5;

    const played = playVerboseMove(chess, reply);
    if (!played) continue;
    if (chess.isCheckmate()) threat = 100000;
    chess.undo();
    worst = Math.max(worst, threat);
    if (worst >= 100000) break;
  }

  return worst;
}

function scoreHansCandidate(chess, move) {
  const played = playVerboseMove(chess, move);
  if (!played) return -Infinity;

  let score = immediateMoveScore(move);
  if (chess.isCheckmate()) score = 100000;
  else score -= worstImmediateReply(chess);
  chess.undo();
  return score;
}

function plausibleHansMoves(chess, legalMoves) {
  const ranked = legalMoves
    .map((move) => ({ move, score: scoreHansCandidate(chess, move) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score || String(a.move.san).localeCompare(String(b.move.san)));
  if (!ranked.length) return [];

  const best = ranked[0].score;
  return ranked
    .filter(({ score }) => score >= best - TOP_SCORE_WINDOW)
    .slice(0, MAX_CONTENDERS)
    .map(({ move }) => move);
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

  const plausible = plausibleHansMoves(chess, legalMoves);
  if (!plausible.length) return null;
  const raw = Number(randomValue);
  const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
  const move = plausible[Math.floor(normalized * plausible.length)];
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