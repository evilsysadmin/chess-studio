import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { gameModeLabel } from './gameModes.js';
import { recordMatthiasSessionResult } from './matthiasSessionContext.js';

const KEY = 'chess-study-game-activity';
const MAX_EVENTS = 160;
const STATES = new Set(['started', 'cancelled', 'finished']);

export function loadGameActivity() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordGameActivity({ gameId, state, mode = 'casual', modeRecord = null, outcome = null, difficulty = null, detail = null, date = null } = {}) {
  if (!gameId || !STATES.has(state)) return loadGameActivity();
  const list = loadGameActivity();
  const dedupeKey = `${gameId}:${state}`;
  if (list.some((event) => event?.dedupeKey === dedupeKey)) return list;
  // Una partida ya finalizada no debe convertirse después en "cancelada"
  // simplemente porque el usuario pulse volver desde la pantalla de resultado.
  if (state === 'cancelled' && list.some((event) => event?.gameId === gameId && event?.state === 'finished')) return list;

  const record = modeRecord || { mode };
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
  };
  const next = [event, ...list].slice(0, MAX_EVENTS);
  setProfileStorageItem(KEY, JSON.stringify(next));
  if (state === 'finished' && ['win', 'draw', 'loss'].includes(outcome)) {
    recordMatthiasSessionResult({ gameId, outcome });
  }
  return next;
}
