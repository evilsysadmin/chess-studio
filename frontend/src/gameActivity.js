import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { gameModeLabel } from './gameModes.js';
import { isCompletedGameOutcome } from './gameOutcome.js';
import { recordMatthiasSessionResult } from './matthiasSessionContext.js';
import { BOARD_RENDERERS, getBoardRenderer } from './userPreferences.js';

const KEY = 'chess-study-game-activity';
const MAX_EVENTS = 160;
const STATES = new Set(['started', 'cancelled', 'finished']);
const TERMINAL_STATES = new Set(['cancelled', 'finished']);

export function loadGameActivity() {
  const parsed = readJsonStorage(STORAGE_LOCAL, KEY, { fallback: [] });
  return Array.isArray(parsed) ? parsed : [];
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
  if (state === 'finished' && !isCompletedGameOutcome(outcome)) return loadGameActivity();

  const list = loadGameActivity();
  const gameEvents = list.filter((event) => event?.gameId === gameId);
  // El journal es una pequeña máquina de estados monotónica: una vez una
  // partida queda terminal (acabada o cancelada), ninguna respuesta tardía,
  // remount o retry puede resucitarla ni reescribir su desenlace.
  if (gameEvents.some((event) => TERMINAL_STATES.has(event?.state))) return list;

  const dedupeKey = `${gameId}:${state}`;
  if (gameEvents.some((event) => event?.dedupeKey === dedupeKey)) return list;

  const record = modeRecord || { mode };
  // El renderer es una propiedad de la experiencia de tablero normal. Combat
  // Chess tiene su propia escena y no debe fingir una elección 2D/3D que el
  // jugador no ha hecho. En el resto del juego capturamos el renderer vigente
  // en cada hito; si cambia durante la partida, Admin verá ese cambio entre
  // inicio y final en vez de inventar una única respuesta retrospectiva.
  const rendererCandidate = boardRenderer ?? (mode === 'combat' ? null : getBoardRenderer());
  const normalizedRenderer = BOARD_RENDERERS.some((row) => row.id === rendererCandidate) ? rendererCandidate : null;
  const baseModeLabel = gameModeLabel(record);
  const rendererLabel = normalizedRenderer ? normalizedRenderer.toUpperCase() : null;
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dedupeKey,
    gameId,
    date: date || new Date().toISOString(),
    state,
    mode,
    // Admin ya utiliza modeLabel como etiqueta visible de cada hito. Añadir
    // aquí la vista evita otro canal de telemetría y hace que cada partida
    // diga claramente 2D/3D usando el mismo journal que ya sincronizamos.
    modeLabel: rendererLabel ? `${baseModeLabel} · ${rendererLabel}` : baseModeLabel,
    outcome: outcome || null,
    difficulty: Number.isFinite(Number(difficulty)) ? Number(difficulty) : null,
    detail: detail || null,
    boardRenderer: normalizedRenderer,
  };
  const next = [event, ...list].slice(0, MAX_EVENTS);
  setProfileStorageItem(KEY, JSON.stringify(next));
  if (state === 'finished') {
    recordMatthiasSessionResult({ gameId, outcome });
  }
  return next;
}
