import { Chess } from 'chess.js';

const GAME_STATUSES = new Set(['playing', 'check', 'checkmate', 'stalemate', 'repetition', 'draw']);
const SQUARE = /^[a-h][1-8]$/;
const PIECE = /^[pnbrqk]$/;

function validFen(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

export function gamePayloadIssues(payload, expectedId = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['payload'];
  const issues = [];
  if (typeof payload.id !== 'string' || !payload.id) issues.push('id');
  else if (expectedId && payload.id !== expectedId) issues.push('identity');

  const chess = validFen(payload.fen);
  if (!chess) issues.push('fen');
  if (!['w', 'b'].includes(payload.turn)) issues.push('turn');
  else if (chess && chess.turn() !== payload.turn) issues.push('turn-fen');
  if (!['w', 'b'].includes(payload.humanColor)) issues.push('human-color');
  if (!Number.isFinite(Number(payload.difficulty)) || Number(payload.difficulty) < 0 || Number(payload.difficulty) > 100) issues.push('difficulty');
  if (!GAME_STATUSES.has(payload.status)) issues.push('status');
  if (typeof payload.isGameOver !== 'boolean') issues.push('game-over');

  if (!Array.isArray(payload.history)) {
    issues.push('history');
  } else {
    payload.history.forEach((move, index) => {
      if (!move || typeof move !== 'object' || typeof move.san !== 'string'
        || !SQUARE.test(move.from || '') || !SQUARE.test(move.to || '')
        || !PIECE.test(move.piece || '') || typeof move.captured !== 'boolean') {
        issues.push(`history:${index}`);
      }
    });
  }

  if (payload.lastMove != null) {
    const move = payload.lastMove;
    if (!move || typeof move !== 'object' || !SQUARE.test(move.from || '') || !SQUARE.test(move.to || '')
      || !['human', 'cpu'].includes(move.by) || typeof move.captured !== 'boolean'
      || !PIECE.test(move.piece || '')) {
      issues.push('last-move');
    }
  }
  return issues;
}

export function requireGamePayload(payload, expectedId = null) {
  const issues = gamePayloadIssues(payload, expectedId);
  if (!issues.length) return payload;
  const error = new Error('El servidor devolvió una partida incoherente. Se conserva la última posición confirmada y se intentará resincronizar.');
  error.name = 'GamePayloadError';
  error.integrityIssues = issues;
  throw error;
}
