export const MATTHIAS_FIRE_CALL_LINE = 'HANS! El fuego, bitte.';
export const HANS_FIRE_REPLY_LINE = 'Sí, señor.';
export const MATTHIAS_HANS_WORKING_LINE = 'Hans, bitte. Estamos trabajando.';
export const HANS_WORKING_REPLY_LINE = 'Claro, señor.';
export const HANS_LEAVING_GRUMBLE_LINE = 'Grrbl… tiramo… grblx.';
export const MATTHIAS_FIRE_CALL_MS = 2500;
export const HANS_FIRE_REPLY_MS = 1350;
export const HANS_BOARD_PEEK_MS = 1200;
export const MATTHIAS_HANS_WORKING_MS = 1200;
export const HANS_WORKING_REPLY_MS = 800;
export const HANS_LEAVING_GRUMBLE_MS = 1350;
export const MATTHIAS_FIRE_EPILOGUE_LINE = 'En fin. ¿Por dónde íbamos?';
export const MATTHIAS_FIRE_EPILOGUE_MS = 1900;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveHansFireOpeningLatch(current, {
  gameId,
  eligible = false,
  historyLength = 0,
  alreadySeen = false,
} = {}) {
  const cleanGameId = String(gameId || '');
  if (current?.gameId === cleanGameId) return current;
  return {
    gameId: cleanGameId,
    enabled: Boolean(
      cleanGameId
      && eligible
      && Number(historyLength) <= 1
      && !alreadySeen
    ),
  };
}

export function shouldStartHansBoardPeek({ phase, hansPhase, suggestion } = {}) {
  return phase === 'await-peek'
    && hansPhase === 'satisfied'
    && Boolean(suggestion?.line);
}

export function shouldStartHansLeavingGrumble({ phase, hansPhase, alreadyPlayed = false } = {}) {
  return phase === 'await-exit'
    && hansPhase === 'leave'
    && !alreadyPlayed;
}

export function shouldStartHansFireEpilogue({
  phase,
  hansSeenOnscreen = false,
  hansScreen = 'missing',
} = {}) {
  return phase === 'await-exit'
    && hansSeenOnscreen
    && (hansScreen === 'hidden' || hansScreen === 'missing');
}

export function projectHansFireReplyAnchor({ ndcX, ndcY, coarsePointer = false } = {}) {
  const x = Number(ndcX);
  const y = Number(ndcY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const left = clamp((x + 1) * 50, 3, 97);
  const headLift = coarsePointer ? 7.8 : 6.8;
  const top = clamp(((1 - y) * 50) - headLift, 7, 92);

  if (x > 0.48) {
    return { left, top, bubbleShiftPercent: -82, tailPercent: 82 };
  }
  if (x < -0.48) {
    return { left, top, bubbleShiftPercent: -18, tailPercent: 18 };
  }
  return { left, top, bubbleShiftPercent: -50, tailPercent: 50 };
}

export function fireCallPhase(elapsedMs, hansOnscreen = false) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < MATTHIAS_FIRE_CALL_MS) return 'matthias';
  if (!hansOnscreen) return 'await-hans';
  if (elapsed < MATTHIAS_FIRE_CALL_MS + HANS_FIRE_REPLY_MS) return 'hans';
  return '';
}
