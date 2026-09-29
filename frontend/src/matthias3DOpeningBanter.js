import { STORAGE_SESSION, readJsonStorage, writeJsonStorage } from './safeStorage.js';

export const MATTHIAS_3D_OPENING_BANTER_KEY = 'chess-study-matthias-3d-opening-banter-v1';
export const MATTHIAS_3D_OPENING_BANTER_CHANCE = 0.4;
const MAX_SEEN_GAME_IDS = 32;

export const MATTHIAS_3D_OPENING_LINES = Object.freeze([
  'Willkommen. Dispóngase a ser destruido.',
  'Achtung. He reservado esta sala para su derrota.',
  'Sehr gut. Ha venido usted voluntariamente. Eso simplifica el papeleo.',
  'Adelante. Su rey todavía no sabe lo mal que va a terminar esto.',
  'Ordnung. Coloque sus piezas; yo me encargo del desastre.',
  'Guten Abend. Intentaré que su derrota conserve cierta dignidad.',
  'Bitte. Mueva. La artillería intelectual ya está cargada.',
  'Bienvenido a mi sala de guerra. Procure no romper nada al perder.',
]);

const EMPTY_STATE = Object.freeze({
  seenGameIds: [],
  lastEligibleStartShowed: false,
});

function cleanGameId(value) {
  return String(value || '').trim().slice(0, 160);
}

function clampRoll(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(0.999999, number));
}

export function normalizeMatthias3DOpeningBanterState(value) {
  const source = value && typeof value === 'object' ? value : EMPTY_STATE;
  const seenGameIds = Array.isArray(source.seenGameIds)
    ? source.seenGameIds.map(cleanGameId).filter(Boolean).slice(-MAX_SEEN_GAME_IDS)
    : [];
  return {
    seenGameIds,
    lastEligibleStartShowed: Boolean(source.lastEligibleStartShowed),
  };
}

export function pickMatthias3DOpeningLine(roll = Math.random()) {
  const index = Math.floor(clampRoll(roll) * MATTHIAS_3D_OPENING_LINES.length);
  return MATTHIAS_3D_OPENING_LINES[index] || MATTHIAS_3D_OPENING_LINES[0];
}

/**
 * Decide una única vez por partida si Matthias abre la sala de guerra.
 * Las partidas ya vistas no vuelven a tirar tras F5/remount y una aparición
 * fuerza silencio en la siguiente partida 3D elegible para que no se vuelva
 * una coletilla mecánica.
 */
export function resolveMatthias3DOpeningBanter({
  gameId,
  isThreeD = false,
  historyLength = 0,
  probabilityRoll = Math.random(),
  lineRoll = Math.random(),
  state = EMPTY_STATE,
} = {}) {
  const normalized = normalizeMatthias3DOpeningBanterState(state);
  const cleanId = cleanGameId(gameId);
  if (!cleanId || !isThreeD || Number(historyLength) !== 0) {
    return { line: '', state: normalized, consumed: false, reason: 'not-opening' };
  }
  if (normalized.seenGameIds.includes(cleanId)) {
    return { line: '', state: normalized, consumed: false, reason: 'already-seen' };
  }

  const nextSeen = [...normalized.seenGameIds, cleanId].slice(-MAX_SEEN_GAME_IDS);
  if (normalized.lastEligibleStartShowed) {
    return {
      line: '',
      state: { seenGameIds: nextSeen, lastEligibleStartShowed: false },
      consumed: true,
      reason: 'anti-repeat',
    };
  }

  const show = clampRoll(probabilityRoll) < MATTHIAS_3D_OPENING_BANTER_CHANCE;
  return {
    line: show ? pickMatthias3DOpeningLine(lineRoll) : '',
    state: { seenGameIds: nextSeen, lastEligibleStartShowed: show },
    consumed: true,
    reason: show ? 'show' : 'probability',
  };
}

export function claimMatthias3DOpeningBanter({
  gameId,
  isThreeD = false,
  historyLength = 0,
  probabilityRoll,
  lineRoll,
} = {}) {
  const stored = readJsonStorage(STORAGE_SESSION, MATTHIAS_3D_OPENING_BANTER_KEY, {
    fallback: EMPTY_STATE,
    removeMalformed: true,
  });
  const result = resolveMatthias3DOpeningBanter({
    gameId,
    isThreeD,
    historyLength,
    probabilityRoll: probabilityRoll ?? Math.random(),
    lineRoll: lineRoll ?? Math.random(),
    state: stored,
  });
  if (result.consumed) writeJsonStorage(STORAGE_SESSION, MATTHIAS_3D_OPENING_BANTER_KEY, result.state);
  return result.line;
}
