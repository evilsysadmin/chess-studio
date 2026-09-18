import { isActiveSessionRoute } from './activeSessionRoutes.js';
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, readJsonStorage, removeStorageItem, setStorageItem, writeJsonStorage } from './safeStorage.js';

export const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';
export const ACTIVE_GAME_VISIBLE_ROUTE_KEY = 'chess-study-active-game-visible-route-v1';
const VERSION = 1;

export function setActiveGameSessionVisible(route) {
  if (isActiveSessionRoute(route)) {
    setStorageItem(STORAGE_SESSION, ACTIVE_GAME_VISIBLE_ROUTE_KEY, route);
    return route;
  }
  removeStorageItem(STORAGE_SESSION, ACTIVE_GAME_VISIBLE_ROUTE_KEY);
  return null;
}

export function loadVisibleActiveGameSession() {
  const snapshot = loadActiveGameSession();
  if (!snapshot) return null;
  return getStorageItem(STORAGE_SESSION, ACTIVE_GAME_VISIBLE_ROUTE_KEY) === snapshot.route ? snapshot : null;
}

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
  removeStorageItem(STORAGE_SESSION, ACTIVE_GAME_VISIBLE_ROUTE_KEY);
}
