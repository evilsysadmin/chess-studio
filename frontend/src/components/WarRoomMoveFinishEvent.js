const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTION_TYPES = new Set(['q', 'r', 'b', 'n']);
const CASTLE_FILES = Object.freeze({
  g: Object.freeze({ side: 'king', rookToFile: 'f' }),
  c: Object.freeze({ side: 'queen', rookToFile: 'd' }),
});

let pendingEvents = new Map();

function squareCoords(square) {
  if (!SQUARE_RE.test(String(square || ''))) return null;
  return {
    file: String(square).charCodeAt(0) - 97,
    rank: Number(String(square)[1]),
  };
}

function squareFromCoords(file, rank) {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return '';
  return `${String.fromCharCode(97 + file)}${rank}`;
}

function sliderPathClear(from, to, occupied) {
  const df = to.file - from.file;
  const dr = to.rank - from.rank;
  const stepFile = Math.sign(df);
  const stepRank = Math.sign(dr);
  let file = from.file + stepFile;
  let rank = from.rank + stepRank;
  while (file !== to.file || rank !== to.rank) {
    if (occupied.has(squareFromCoords(file, rank))) return false;
    file += stepFile;
    rank += stepRank;
  }
  return true;
}

function pieceAttacksSquare(piece, targetSquare, occupied) {
  const from = squareCoords(piece?.square);
  const to = squareCoords(targetSquare);
  if (!from || !to) return false;
  const df = to.file - from.file;
  const dr = to.rank - from.rank;
  const adf = Math.abs(df);
  const adr = Math.abs(dr);

  switch (piece.type) {
    case 'p':
      return adf === 1 && dr === (piece.color === 'w' ? 1 : -1);
    case 'n':
      return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
    case 'b':
      return adf === adr && adf > 0 && sliderPathClear(from, to, occupied);
    case 'r':
      return ((df === 0) !== (dr === 0)) && sliderPathClear(from, to, occupied);
    case 'q':
      return ((adf === adr && adf > 0) || ((df === 0) !== (dr === 0)))
        && sliderPathClear(from, to, occupied);
    case 'k':
      return Math.max(adf, adr) === 1;
    default:
      return false;
  }
}

function checkingSquares(chess) {
  if (!chess?.isCheck?.()) return [];
  const board = chess?.board?.()?.flat?.().filter(Boolean) || [];
  const checkedColor = chess?.turn?.();
  const king = board.find((piece) => piece?.type === 'k' && piece.color === checkedColor);
  if (!king?.square) return [];
  const occupied = new Set(board.map((piece) => piece.square).filter(Boolean));
  return board
    .filter((piece) => piece?.color && piece.color !== checkedColor && pieceAttacksSquare(piece, king.square, occupied))
    .map((piece) => piece.square)
    .filter((square) => SQUARE_RE.test(String(square || '')))
    .sort();
}

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
  checkSquare = '',
  animate = null,
  chessFromFen = null,
} = {}) {
  const seq = Number(animate?.seq) || 0;
  const to = String(animate?.to || '');
  const castleCandidate = castlingGeometry(animate);
  const promotionCandidate = promotionGeometry(animate);
  const checkCandidate = SQUARE_RE.test(String(checkSquare || ''));
  if (!seq || !SQUARE_RE.test(to) || typeof chessFromFen !== 'function') return null;
  if (!gameOver && !checkCandidate && !castleCandidate && !promotionCandidate) return null;

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
  const checkers = !checkmate && checkCandidate ? checkingSquares(chess) : [];
  const castling = castleCandidate ? validatedCastling(chess, animate) : null;
  const promotion = promotionCandidate ? validatedPromotion(previousChess, chess, animate) : null;
  if (!checkmate && checkers.length === 0 && !castling && !promotion) return null;

  const event = { seq, to };
  if (checkmate) event.checkmate = true;
  if (checkers.length) event.checkers = Object.freeze(checkers);
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

function mergePieceEvent(next, seq, square, payload) {
  const current = next.get(square) || { seq, to: square };
  next.set(square, { ...current, ...payload, seq, to: square });
}

export function armWarRoomMoveFinishEvent(event) {
  const seq = Number(event?.seq) || 0;
  const to = String(event?.to || '');
  const castling = event?.castling;
  const promotion = event?.promotion;
  const checkers = Array.isArray(event?.checkers)
    ? [...new Set(event.checkers.map((square) => String(square || '')).filter((square) => SQUARE_RE.test(square)))]
    : [];
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
  if (!seq || !SQUARE_RE.test(to) || (event?.checkmate !== true && checkers.length === 0 && !validCastling && !validPromotion)) {
    pendingEvents = new Map();
    return null;
  }

  const next = new Map();
  if (validCastling) {
    mergePieceEvent(next, seq, castling.kingTo, castlePieceEvent(event, castling.kingTo, 'king'));
    mergePieceEvent(next, seq, castling.rookTo, castlePieceEvent(event, castling.rookTo, 'rook'));
  }
  if (validPromotion) {
    mergePieceEvent(next, seq, promotion.to, promotionPieceEvent(event));
  }
  if (event?.checkmate === true && !validCastling && !validPromotion) {
    mergePieceEvent(next, seq, to, { checkmate: true });
  }
  for (const checkerSquare of checkers) {
    const checkerMoved = checkerSquare === to
      || (validCastling && (checkerSquare === castling.kingTo || checkerSquare === castling.rookTo));
    mergePieceEvent(next, seq, checkerSquare, {
      check: true,
      checkRole: checkerMoved ? 'moving' : 'stationary',
    });
  }
  pendingEvents = next;
  return pendingEvents.get(to) || pendingEvents.values().next().value || null;
}

export function peekWarRoomMoveFinishEvent(to) {
  return pendingEvents.get(String(to || '')) || null;
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
