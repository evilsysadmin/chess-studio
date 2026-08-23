export const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';
const VERSION = 1;
const VALID_ROUTES = new Set(['game', 'tournamentGame']);

function safeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

export function saveActiveGameSession({ route, game, learningMode = false, gameContext = {}, timeControlId = null }) {
  if (typeof localStorage === 'undefined' || !VALID_ROUTES.has(route) || !game?.id) return null;
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
  try {
    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function loadActiveGameSession() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const snapshot = JSON.parse(localStorage.getItem(ACTIVE_GAME_SESSION_KEY) || 'null');
    if (!snapshot || snapshot.version !== VERSION) return null;
    if (!VALID_ROUTES.has(snapshot.route) || typeof snapshot.gameId !== 'string' || !snapshot.gameId) return null;
    return {
      ...snapshot,
      learningMode: !!snapshot.learningMode,
      gameContext: safeContext(snapshot.gameContext),
      timeControlId: snapshot.timeControlId || null,
    };
  } catch {
    return null;
  }
}

export function clearActiveGameSession() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(ACTIVE_GAME_SESSION_KEY);
}
