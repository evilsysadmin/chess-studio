import { isActiveSessionRoute } from './activeSessionRoutes.js';
import { STORAGE_LOCAL, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

export const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';
const VERSION = 1;

function safeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

export function saveActiveGameSession({ route, game, learningMode = false, gameContext = {}, timeControlId = null }) {
  if (!isActiveSessionRoute(route) || !game?.id) return null;
  const snapshot = {
    version: VERSION,
    route,
    gameId: game.id,
    gameSnapshot: game,
    learningMode: !!learningMode,
    gameContext: safeContext(gameContext),
    timeControlId: timeControlId || null,
    savedAt: Date.now(),
  };
  return writeJsonStorage(STORAGE_LOCAL, ACTIVE_GAME_SESSION_KEY, snapshot) ? snapshot : null;
}

export function loadActiveGameSession() {
  const snapshot = readJsonStorage(STORAGE_LOCAL, ACTIVE_GAME_SESSION_KEY, { fallback: null, removeMalformed: true });
  if (!snapshot || snapshot.version !== VERSION) return null;
  if (!isActiveSessionRoute(snapshot.route) || typeof snapshot.gameId !== 'string' || !snapshot.gameId) return null;
  return {
    ...snapshot,
    learningMode: !!snapshot.learningMode,
    gameContext: safeContext(snapshot.gameContext),
    timeControlId: snapshot.timeControlId || null,
  };
}

export function clearActiveGameSession() {
  removeStorageItem(STORAGE_LOCAL, ACTIVE_GAME_SESSION_KEY);
}
