import { Chess } from 'chess.js';
import { detectNoteworthyMove } from './cpuCommentary.js';

const INCIDENT_LABELS = Object.freeze({
  MISSED_MATE: 'Mate en 1 ignorado',
  ALLOWED_MATE: 'Mate en 1 regalado',
  STALEMATE_BLUNDER: 'Victoria convertida en ahogado',
  QUEEN_EN_PRISE_TO_PAWN: 'Reina dejada a tiro de peón',
  QUEEN_SACRIFICE_OFFER: 'Dama ofrecida en sacrificio',
  ROOK_SACRIFICE_OFFER: 'Torre ofrecida en sacrificio',
});

const PIECE_LABELS = Object.freeze({ p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' });

function safeMove(chess, entry) {
  if (!entry) return null;
  try {
    if (entry.san) return chess.move(entry.san);
    if (entry.from && entry.to) return chess.move({ from: entry.from, to: entry.to, promotion: entry.promotion || 'q' });
  } catch {
    return null;
  }
  return null;
}

export function buildWorstMoveAutopsy(payload, worstMove) {
  if (!payload || !worstMove?.gameId) return null;
  const normalRecord = (payload.gameHistory || []).find((record) => record?.id === worstMove.gameId);
  const combatRecord = (payload.combatHistory || []).find((record) => record?.id === worstMove.gameId);
  const record = normalRecord || combatRecord;
  if (!record) return null;

  const isCombat = !!combatRecord;
  const moves = isCombat ? (record.log || []) : (record.moves || []);
  let index = Number.isInteger(worstMove.index) ? worstMove.index : null;
  if (index == null && Number.isFinite(Number(worstMove.moveNumber))) {
    index = (Number(worstMove.moveNumber) - 1) * 2 + (record.humanColor === 'b' ? 1 : 0);
  }
  if (index == null || index < 0 || index >= moves.length) return null;

  const entry = moves[index];
  let fenBefore = isCombat ? entry?.fenBefore : null;
  let fenAfter = isCombat ? entry?.fenAfter : null;

  if (!isCombat) {
    let chess;
    try { chess = record.initialFen ? new Chess(record.initialFen) : new Chess(); } catch { return null; }
    for (let i = 0; i < index; i += 1) {
      if (!safeMove(chess, moves[i])) return null;
    }
    fenBefore = chess.fen();
    if (!safeMove(chess, entry)) return null;
    fenAfter = chess.fen();
  } else if (!fenAfter && fenBefore) {
    try {
      const chess = new Chess(fenBefore);
      if (safeMove(chess, entry)) fenAfter = chess.fen();
    } catch {
      fenAfter = null;
    }
  }

  let bestFen = null;
  if (fenBefore && worstMove.suggestedFrom && worstMove.suggestedTo) {
    try {
      const best = new Chess(fenBefore);
      const result = best.move({ from: worstMove.suggestedFrom, to: worstMove.suggestedTo, promotion: 'q' });
      if (result) bestFen = best.fen();
    } catch {
      bestFen = null;
    }
  }

  const moveForDetection = {
    from: worstMove.playedFrom || entry?.from,
    to: worstMove.playedTo || entry?.to,
    promotion: entry?.promotion,
  };
  const event = fenBefore ? detectNoteworthyMove(fenBefore, moveForDetection) : null;
  const next = moves[index + 1];
  const nextCaptured = next?.capturedPiece || next?.captured;
  let incident = event?.type ? INCIDENT_LABELS[event.type] : null;
  if (next?.piece === 'p' && nextCaptured === 'q') incident = 'Reina comida por peón';
  if (!incident) incident = worstMove.severity === 'blunder' ? 'Error grave' : worstMove.severity === 'mistake' ? 'Error' : 'Pérdida de evaluación';

  return {
    incident,
    record,
    index,
    fenBefore,
    fenAfter,
    bestFen,
    playedPiece: PIECE_LABELS[worstMove.playedPiece || entry?.piece] || 'Pieza',
    playedFrom: worstMove.playedFrom || entry?.from,
    playedTo: worstMove.playedTo || entry?.to,
    suggestedPiece: PIECE_LABELS[worstMove.suggestedPiece] || 'Pieza',
    mode: isCombat ? 'Combate' : (record.mode === 'tournament' ? 'Torneo' : record.mode === 'practice' ? 'Partida de práctica' : 'Partida rápida'),
  };
}
