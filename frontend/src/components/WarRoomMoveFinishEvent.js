const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTION_TYPES = new Set(['q', 'r', 'b', 'n']);
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

function promotionGeometry(animate) {
  const from = String(animate?.from || '');
  const to = String(animate?.to || '');
  if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to)) return null;
  const whiteCandidate = from[1] === '7' && to[1] === '8';
  const blackCandidate = from[1] === '2' && to[1] === '1';
  if (!whiteCandidate && !blackCandidate) return null;
  if (Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) > 1) return null;
  return { from, to };
}

function validatedCastling(chess, animate) {
  const geometry = castlingGeometry(animate);
  if (!geometry) return null;
  const king = chess?.get?.(geometry.kingTo);
  const rook = chess?.get?.(geometry.rookTo);
  if (king?.type !== 'k' || rook?.type !== 'r' || king.color !== rook.color) return null;
  return Object.freeze(geometry);
}

function validatedPromotion(previousChess, chess, animate) {
  const geometry = promotionGeometry(animate);
  if (!geometry) return null;
  const before = previousChess?.get?.(geometry.from);
  const after = chess?.get?.(geometry.to);
  if (before?.type !== 'p' || !after || !PROMOTION_TYPES.has(after.type) || before.color !== after.color) return null;
  if (before.color === 'w' && (geometry.from[1] !== '7' || geometry.to[1] !== '8')) return null;
  if (before.color === 'b' && (geometry.from[1] !== '2' || geometry.to[1] !== '1')) return null;
  return Object.freeze({
    from: geometry.from,
    to: geometry.to,
    promotedType: after.type,
    color: after.color,
  });
}

export function deriveWarRoomMoveFinishEvent({
  previousFen = '',
  fen = '',
  gameOver = false,
  animate = null,
  chessFromFen = null,
} = {}) {
  const seq = Number(animate?.seq) || 0;
  const to = String(animate?.to || '');
  const castleCandidate = castlingGeometry(animate);
  const promotionCandidate = promotionGeometry(animate);
  if (!seq || !SQUARE_RE.test(to) || typeof chessFromFen !== 'function') return null;
  if (!gameOver && !castleCandidate && !promotionCandidate) return null;

  let chess = null;
  let previousChess = null;
  try {
    chess = chessFromFen(fen);
  } catch {
    return null;
  }
  if (promotionCandidate) {
    try {
      previousChess = chessFromFen(previousFen);
    } catch {
      previousChess = null;
    }
  }

  const checkmate = Boolean(gameOver && chess?.isCheckmate?.());
  const castling = castleCandidate ? validatedCastling(chess, animate) : null;
  const promotion = promotionCandidate ? validatedPromotion(previousChess, chess, animate) : null;
  if (!checkmate && !castling && !promotion) return null;

  const event = { seq, to };
  if (checkmate) event.checkmate = true;
  if (castling) event.castling = castling;
  if (promotion) event.promotion = promotion;
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

function promotionPieceEvent(event) {
  return {
    seq: event.seq,
    to: event.promotion.to,
    promotion: event.promotion,
    ...(event.checkmate === true ? { checkmate: true } : {}),
  };
}

export function armWarRoomMoveFinishEvent(event) {
  const seq = Number(event?.seq) || 0;
  const to = String(event?.to || '');
  const castling = event?.castling;
  const promotion = event?.promotion;
  const validCastling = Boolean(
    castling
    && (castling.side === 'king' || castling.side === 'queen')
    && SQUARE_RE.test(String(castling.kingTo || ''))
    && SQUARE_RE.test(String(castling.rookTo || '')),
  );
  const validPromotion = Boolean(
    promotion
    && SQUARE_RE.test(String(promotion.from || ''))
    && SQUARE_RE.test(String(promotion.to || ''))
    && PROMOTION_TYPES.has(String(promotion.promotedType || ''))
    && (promotion.color === 'w' || promotion.color === 'b'),
  );
  if (!seq || !SQUARE_RE.test(to) || (event?.checkmate !== true && !validCastling && !validPromotion)) {
    pendingEvents = new Map();
    return null;
  }

  const next = new Map();
  if (validCastling) {
    next.set(castling.kingTo, castlePieceEvent(event, castling.kingTo, 'king'));
    next.set(castling.rookTo, castlePieceEvent(event, castling.rookTo, 'rook'));
  } else if (validPromotion) {
    next.set(promotion.to, promotionPieceEvent(event));
  } else if (event?.checkmate === true) {
    next.set(to, { seq, to, checkmate: true });
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
