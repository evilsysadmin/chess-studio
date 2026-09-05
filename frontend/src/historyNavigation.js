export const HISTORY_GAME_OPEN_EVENT = 'chess-study-history-game-open';

export function requestHistoryGameOpen(gameId) {
  if (gameId == null || typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return false;
  globalThis.dispatchEvent(new CustomEvent(HISTORY_GAME_OPEN_EVENT, { detail: { gameId: String(gameId) } }));
  return true;
}
