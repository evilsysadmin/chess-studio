import { Chess } from 'chess.js';

export function opponentForMatch(match) {
  if (!match) return null;
  return match.youAre === 'w'
    ? { username: match.black, rating: Number(match.blackRating) || 400, color: 'b' }
    : { username: match.white, rating: Number(match.whiteRating) || 400, color: 'w' };
}

export function playerResult(match) {
  if (!match || match.status !== 'finished') return null;
  if (match.result === '1/2-1/2') return 'draw';
  if (match.result === '1-0') return match.youAre === 'w' ? 'win' : 'loss';
  if (match.result === '0-1') return match.youAre === 'b' ? 'win' : 'loss';
  return null;
}

export function lastMoveFromHistory(history = []) {
  const row = Array.isArray(history) ? history.at(-1) : null;
  const uci = String(row?.uci || '');
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function selectableMoves(fen, square, playerColor) {
  if (!fen || !square || !['w', 'b'].includes(playerColor)) return [];
  try {
    const chess = new Chess(fen);
    const piece = chess.get(square);
    if (!piece || piece.color !== playerColor || chess.turn() !== playerColor) return [];
    return chess.moves({ square, verbose: true }).map((move) => ({
      from: move.from,
      to: move.to,
      san: move.san,
      promotion: move.promotion || null,
    }));
  } catch {
    return [];
  }
}

export function uniqueLegalTargets(moves = []) {
  const seen = new Set();
  return moves.filter((move) => {
    if (!move?.to || seen.has(move.to)) return false;
    seen.add(move.to);
    return true;
  });
}

export function chooseMoveTo(moves = [], target) {
  const candidates = moves.filter((move) => move?.to === target);
  if (!candidates.length) return { kind: 'none' };
  const promotions = candidates.filter((move) => move.promotion);
  if (promotions.length) return { kind: 'promotion', from: candidates[0].from, to: target };
  return { kind: 'move', move: candidates[0] };
}

export function mergeNewerMatch(current, next) {
  if (!next) return current;
  if (!current || current.id !== next.id) return next;
  const currentRevision = Number(current.revision) || 0;
  const nextRevision = Number(next.revision) || 0;
  return nextRevision >= currentRevision ? next : current;
}


export function projectPvpClock(clock, elapsedMs = 0) {
  const whiteMs = Math.max(0, Number(clock?.whiteMs) || 0);
  const blackMs = Math.max(0, Number(clock?.blackMs) || 0);
  const runningColor = clock?.runningColor === 'w' || clock?.runningColor === 'b'
    ? clock.runningColor
    : null;
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  return {
    whiteMs: runningColor === 'w' ? Math.max(0, whiteMs - elapsed) : whiteMs,
    blackMs: runningColor === 'b' ? Math.max(0, blackMs - elapsed) : blackMs,
    runningColor,
    id: clock?.id || null,
    incrementMs: Math.max(0, Number(clock?.incrementMs) || 0),
  };
}


export function opponentPresenceLabel(value) {
  if (value === 'online') return 'EN LÍNEA';
  if (value === 'reconnecting') return 'RECONECTANDO';
  if (value === 'disconnected') return 'SIN CONEXIÓN';
  return 'SIN DATO';
}


export function disconnectGraceSeconds(deadline, nowMs = Date.now()) {
  const stamp = Date.parse(deadline || '');
  if (!Number.isFinite(stamp)) return null;
  return Math.max(0, Math.ceil((stamp - Number(nowMs || 0)) / 1000));
}
