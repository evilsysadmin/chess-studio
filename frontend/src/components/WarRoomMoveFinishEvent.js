const SQUARE_RE = /^[a-h][1-8]$/;

let pendingEvent = null;

export function deriveWarRoomMoveFinishEvent({
  fen = '',
  gameOver = false,
  animate = null,
  chessFromFen = null,
} = {}) {
  const seq = Number(animate?.seq) || 0;
  const to = String(animate?.to || '');
  if (!gameOver || !seq || !SQUARE_RE.test(to) || typeof chessFromFen !== 'function') return null;

  const chess = chessFromFen(fen);
  if (!chess?.isCheckmate?.()) return null;

  return Object.freeze({
    seq,
    to,
    checkmate: true,
  });
}

export function armWarRoomMoveFinishEvent(event) {
  const seq = Number(event?.seq) || 0;
  const to = String(event?.to || '');
  if (!seq || !SQUARE_RE.test(to) || event?.checkmate !== true) {
    pendingEvent = null;
    return null;
  }

  pendingEvent = {
    seq,
    to,
    checkmate: true,
  };
  return pendingEvent;
}

export function consumeWarRoomMoveFinishEvent(to) {
  if (!pendingEvent || pendingEvent.to !== String(to || '')) return null;
  const event = pendingEvent;
  pendingEvent = null;
  return event;
}

export function clearWarRoomMoveFinishEvent(seq = null) {
  if (!pendingEvent) return false;
  if (seq !== null && Number(seq) !== pendingEvent.seq) return false;
  pendingEvent = null;
  return true;
}
