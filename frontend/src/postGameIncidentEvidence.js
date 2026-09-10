import { Chess } from 'chess.js';
import { detectNoteworthyMove } from './cpuCommentary.js';
import { mistakeSeverity } from './gameReport.js';

const PIECE_CP = Object.freeze({ p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 });
const SACRIFICE_OFFERS = new Set(['QUEEN_SACRIFICE_OFFER', 'ROOK_SACRIFICE_OFFER']);
const TACTICAL_OPPORTUNITIES = new Set([
  'MATE_FOUND',
  'QUEEN_CAPTURE',
  'PAWN_TAKES_QUEEN',
  'PAWN_TAKES_ROOK',
  'KNIGHT_FORK',
  'PAWN_FORK',
  'SKEWER',
  'DISCOVERED_CHECK',
]);
const TACTICAL_PUNISHMENTS = new Set([
  'MATE_FOUND',
  'PAWN_TAKES_QUEEN',
  'QUEEN_CAPTURE',
  'KNIGHT_FORK',
  'PAWN_FORK',
  'SKEWER',
]);

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMove(move) {
  if (!move?.from || !move?.to) return null;
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion || null,
    san: move.san || null,
  };
}

function reportMove(moveReport, prefix) {
  const from = moveReport?.[`${prefix}From`];
  const to = moveReport?.[`${prefix}To`];
  if (from && to) {
    return normalizeMove({
      from,
      to,
      promotion: moveReport?.[`${prefix}Promotion`],
      san: moveReport?.[prefix],
    });
  }
  return normalizeMove(moveReport?.context?.[prefix]);
}

function eventFor(fen, move) {
  if (!fen || !move?.from || !move?.to) return null;
  return detectNoteworthyMove(fen, move);
}

function materialBalance(fen, color) {
  if (!fen || !color) return null;
  try {
    const board = new Chess(fen);
    let own = 0;
    let enemy = 0;
    for (const row of board.board()) {
      for (const piece of row) {
        if (!piece) continue;
        const value = PIECE_CP[piece.type] || 0;
        if (piece.color === color) own += value;
        else enemy += value;
      }
    }
    return own - enemy;
  } catch {
    return null;
  }
}

function materialSwing(fenBefore, fenAfter, color) {
  const before = materialBalance(fenBefore, color);
  const after = materialBalance(fenAfter, color);
  return before === null || after === null ? null : after - before;
}

function classificationFor({ playedEvent, replyEvent, suggestedEvent, severity, lossCp }) {
  const playedType = playedEvent?.type || null;
  const replyType = replyEvent?.type || null;
  const suggestedType = suggestedEvent?.type || null;

  if (playedType === 'MISSED_MATE') return 'missed-mate';
  if (playedType === 'ALLOWED_MATE') return 'allowed-mate';
  if (playedType === 'STALEMATE_BLUNDER') return 'stalemate-blunder';
  if (playedType && SACRIFICE_OFFERS.has(playedType) && lossCp !== null && lossCp < 20) return 'justified-sacrifice';
  if (replyType && TACTICAL_PUNISHMENTS.has(replyType)) return 'tactical-punishment';
  if (suggestedType && TACTICAL_OPPORTUNITIES.has(suggestedType) && lossCp !== null && lossCp >= 80) return 'missed-tactic';
  if (severity === 'blunder') return 'blunder';
  if (severity === 'mistake') return 'mistake';
  if (severity === 'inaccuracy') return 'inaccuracy';
  if (severity === 'ok') return 'sound';
  return 'unrated';
}

export function buildPostGameIncidentEvidence(moveReport) {
  const fenBefore = moveReport?.context?.fenBefore || null;
  if (!fenBefore) return null;

  let moverColor = null;
  try {
    moverColor = new Chess(fenBefore).turn();
  } catch {
    return null;
  }

  const played = reportMove(moveReport, 'played');
  const suggested = reportMove(moveReport, 'suggested');
  const reply = normalizeMove(moveReport?.context?.reply);
  const playedFenAfter = moveReport?.context?.played?.fenAfter || null;
  const suggestedFenAfter = moveReport?.context?.suggested?.fenAfter || null;

  const playedEvent = eventFor(fenBefore, played);
  const suggestedEvent = eventFor(fenBefore, suggested);
  const replyEvent = eventFor(playedFenAfter, reply);
  const incidentKeys = [
    playedEvent?.type ? `human:${playedEvent.type}` : null,
    replyEvent?.type ? `cpu:${replyEvent.type}` : null,
  ].filter(Boolean);

  const lossCp = finiteOrNull(moveReport?.loss);
  const severity = moveReport?.severity || mistakeSeverity(lossCp);

  return {
    version: 1,
    fenBefore,
    moverColor,
    lossCp,
    severity,
    classification: classificationFor({ playedEvent, replyEvent, suggestedEvent, severity, lossCp }),
    primaryIncidentKey: incidentKeys[0] || null,
    incidentKeys: [...new Set(incidentKeys)],
    played,
    suggested,
    reply,
    playedEventType: playedEvent?.type || null,
    suggestedEventType: suggestedEvent?.type || null,
    replyEventType: replyEvent?.type || null,
    evalAfterPlayed: finiteOrNull(moveReport?.evalAfterPlayed),
    evalAfterSuggested: finiteOrNull(moveReport?.evalAfterSuggested),
    materialSwingPlayedCp: materialSwing(fenBefore, playedFenAfter, moverColor),
    materialSwingSuggestedCp: materialSwing(fenBefore, suggestedFenAfter, moverColor),
  };
}
