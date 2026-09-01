import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { gameModeLabel } from './gameModes.js';
import { recordMatthiasSessionResult } from './matthiasSessionContext.js';
import { getBoardRenderer } from './userPreferences.js';

const KEY = 'chess-study-game-activity';
const MAX_EVENTS = 160;
const STATES = new Set(['started', 'cancelled', 'finished']);
const BOARD_RENDERERS = new Set(['2d', '3d']);

export function loadGameActivity() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordGameActivity({
  gameId,
  state,
  mode = 'casual',
  modeRecord = null,
  outcome = null,
  difficulty = null,
  detail = null,
  date = null,
  boardRenderer = null,
} = {}) {
  if (!gameId || !STATES.has(state)) return loadGameActivity();
  const list = loadGameActivity();
  const dedupeKey = `${gameId}:${state}`;
  if (list.some((event) => event?.dedupeKey === dedupeKey)) return list;
  // Una partida ya finalizada no debe convertirse después en "cancelada"
  // simplemente porque el usuario pulse volver desde la pantalla de resultado.
  if (state === 'cancelled' && list.some((event) => event?.gameId === gameId && event?.state === 'finished')) return list;

  const record = modeRecord || { mode };
  // El renderer es una propiedad de la experiencia de tablero normal. Combat
  // Chess tiene su propia escena y no debe fingir una elección 2D/3D que el
  // jugador no ha hecho. En el resto del juego capturamos el renderer vigente
  // en cada hito; si cambia durante la partida, Admin verá ese cambio entre
  // inicio y final en vez de inventar una única respuesta retrospectiva.
  const rendererCandidate = boardRenderer ?? (mode === 'combat' ? null : getBoardRenderer());
  const normalizedRenderer = BOARD_RENDERERS.has(rendererCandidate) ? rendererCandidate : null;
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dedupeKey,
    gameId,
    date: date || new Date().toISOString(),
    state,
    mode,
    modeLabel: gameModeLabel(record),
    outcome: outcome || null,
    difficulty: Number.isFinite(Number(difficulty)) ? Number(difficulty) : null,
    detail: detail || null,
    boardRenderer: normalizedRenderer,
  };
  const next = [event, ...list].slice(0, MAX_EVENTS);
  setProfileStorageItem(KEY, JSON.stringify(next));
  if (state === 'finished' && ['win', 'draw', 'loss'].includes(outcome)) {
    recordMatthiasSessionResult({ gameId, outcome });
  }
  return next;
}
