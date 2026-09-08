const SQUARE_RE = /^[a-h][1-8]$/;
const CASTLE_FILES = Object.freeze({
  g: Object.freeze({ side: 'king', rookToFile: 'f' }),
  c: Object.freeze({ side: 'queen', rookToFile: 'd' }),
});

let pendingEvents = new Map();

function castlingGeometry(animate) {
  const from = String(animate?.from || '');
  const to = String(animate?.to || '');
  if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to)) return null;
  if (from[0] !== 'e' || from[1] !== to[1] || (from[1] !== '1' && from[1] !== '8')) return null;
  const target = CASTLE_FILES[to[0]];
  if (!target) return null;
  return {
    side: target.side,
    kingTo: to,
    rookTo: `${target.rookToFile}${to[1]}`,
  };
}

function validatedCastling(chess, animate) {
  const geometry = castlingGeometry(animate);
  if (!geometry) return null;
  const king = chess?.get?.(geometry.kingTo);
  const rook = chess?.get?.(geometry.rookTo);
  if (king?.type !== 'k' || rook?.type !== 'r' || king.color !== rook.color) return null;
  return Object.freeze(geometry);
}

export function deriveWarRoomMoveFinishEvent({
  fen = '',
  gameOver = false,
  animate = null,
  chessFromFen = null,
} = {}) {
  const seq = Number(animate?.seq) || 0;
  const to = String(animate?.to || '');
  const castleCandidate = castlingGeometry(animate);
  if (!seq || !SQUARE_RE.test(to) || typeof chessFromFen !== 'function') return null;
  if (!gameOver && !castleCandidate) return null;

  let chess = null;
  try {
    chess = chessFromFen(fen);
  } catch {
    return null;
  }

  const checkmate = Boolean(gameOver && chess?.isCheckmate?.());
  const castling = castleCandidate ? validatedCastling(chess, animate) : null;
  if (!checkmate && !castling) return null;

  const event = { seq, to };
  if (checkmate) event.checkmate = true;
  if (castling) event.castling = castling;
  return Object.freeze(event);
}

function castlePieceEvent(event, to, castlingRole) {
  return {
    seq: event.seq,
    to,
    castlingRole,
    castlingSide: event.castling.side,
    ...(castlingRole === 'king' && event.checkmate === true ? { checkmate: true } : {}),
  };
}

export function armWarRoomMoveFinishEvent(event) {
  const seq = Number(event?.seq) || 0;
  const to = String(event?.to || '');
  const castling = event?.castling;
  const validCastling = Boolean(
    castling
    && (castling.side === 'king' || castling.side === 'queen')
    && SQUARE_RE.test(String(castling.kingTo || ''))
    && SQUARE_RE.test(String(castling.rookTo || '')),
  );
  if (!seq || !SQUARE_RE.test(to) || (event?.checkmate !== true && !validCastling)) {
    pendingEvents = new Map();
    return null;
  }

  const next = new Map();
  if (event?.checkmate === true && !validCastling) {
    next.set(to, { seq, to, checkmate: true });
  }
  if (validCastling) {
    next.set(castling.kingTo, castlePieceEvent(event, castling.kingTo, 'king'));
    next.set(castling.rookTo, castlePieceEvent(event, castling.rookTo, 'rook'));
  }
  pendingEvents = next;
  return pendingEvents.get(to) || pendingEvents.values().next().value || null;
}

export function consumeWarRoomMoveFinishEvent(to) {
  const square = String(to || '');
  const event = pendingEvents.get(square) || null;
  if (!event) return null;
  pendingEvents.delete(square);
  return event;
}

export function clearWarRoomMoveFinishEvent(seq = null) {
  if (pendingEvents.size === 0) return false;
  if (seq !== null) {
    const matches = [...pendingEvents.values()].some((event) => Number(seq) === event.seq);
    if (!matches) return false;
  }
  pendingEvents = new Map();
  return true;
}
