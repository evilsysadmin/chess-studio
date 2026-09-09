export const MATTHIAS_FIRE_CALL_LINE = 'HANS! El fuego, bitte.';
export const HANS_FIRE_REPLY_LINE = 'Sí, señor.';
export const MATTHIAS_HANS_WORKING_LINE = 'Hans, bitte. Estamos trabajando.';
export const HANS_WORKING_REPLY_LINE = 'Claro, señor.';
export const HANS_LEAVING_GRUMBLE_LINE = 'Grrbl… tiramo… grblx.';
export const MATTHIAS_FIRE_CALL_MS = 2500;
export const HANS_FIRE_REPLY_MS = 1600;
export const HANS_BOARD_PEEK_MS = 2800;
export const HANS_BOARD_DIALOGUE_GAP_MS = 3000;
export const MATTHIAS_HANS_WORKING_MS = 2600;
export const HANS_WORKING_REPLY_MS = 2000;
export const HANS_LEAVING_GRUMBLE_MS = 1500;
export const HANS_BOARD_PEEK_ROUTE = 'leave-side';
export const HANS_BOARD_PEEK_LOGICAL_X = 1.24;
export const HANS_INITIAL_REPLY_ENTRY_MAX_LOGICAL_X = 1.82;
export const MATTHIAS_FIRE_EPILOGUE_LINE = 'En fin. ¿Por dónde íbamos?';
export const MATTHIAS_FIRE_EPILOGUE_MS = 1900;

const HANS_BOARD_PEEK_HOLD_PHASES = new Set([
  'peek',
  'gap-after-peek',
  'matthias-working',
  'gap-after-matthias',
  'hans-working-reply',
]);

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

export function hansBoardPeekHoldsMovement(phase) {
  return HANS_BOARD_PEEK_HOLD_PHASES.has(String(phase || ''));
}

export function hansInitialReplyPointReached({
  hansScreen = 'missing',
  route = '',
  logicalX,
} = {}) {
  const x = Number(logicalX);
  const routeName = String(route || '');
  return hansScreen === 'onscreen'
    && Number.isFinite(x)
    && x <= HANS_INITIAL_REPLY_ENTRY_MAX_LOGICAL_X
    && !routeName.startsWith('leave-');
}

export function hansBoardPeekPointReached({ phase, route, logicalX } = {}) {
  return phase === 'await-exit-peek'
    && route === HANS_BOARD_PEEK_ROUTE
    && Number(logicalX) >= HANS_BOARD_PEEK_LOGICAL_X;
}

export function shouldStartHansBoardPeek({ phase, route, logicalX, suggestion } = {}) {
  return hansBoardPeekPointReached({ phase, route, logicalX })
    && Boolean(suggestion?.line);
}

export function shouldStartHansLeavingGrumble({ phase, route, alreadyPlayed = false } = {}) {
  return phase === 'await-exit'
    && String(route || '').startsWith('leave-')
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

  if (x > 0.48) return { left, top, bubbleShiftPercent: -82, tailPercent: 82 };
  if (x < -0.48) return { left, top, bubbleShiftPercent: -18, tailPercent: 18 };
  return { left, top, bubbleShiftPercent: -50, tailPercent: 50 };
}

export function projectHansInitialReplyAnchor({ ndcX, ndcY, coarsePointer = false } = {}) {
  const x = Number(ndcX);
  const y = Number(ndcY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const left = clamp((x + 1) * 50, 6, 94);
  const headLift = coarsePointer ? 6.6 : 5.8;
  const top = clamp(((1 - y) * 50) - headLift, 7, 92);

  if (x > 0.48) return { left, top, bubbleShiftPercent: -62, tailPercent: 62 };
  if (x < -0.48) return { left, top, bubbleShiftPercent: -38, tailPercent: 38 };
  return { left, top, bubbleShiftPercent: -50, tailPercent: 50 };
}

export function fireCallPhase(elapsedMs, hansOnscreen = false) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < MATTHIAS_FIRE_CALL_MS) return 'matthias';
  if (!hansOnscreen) return 'await-hans';
  if (elapsed < MATTHIAS_FIRE_CALL_MS + HANS_FIRE_REPLY_MS) return 'hans';
  return '';
}
