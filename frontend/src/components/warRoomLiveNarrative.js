export function shouldShowNewLiveBoardRemark({ gameId, trackedGameId, currentKey, seenKey } = {}) {
  return Boolean(gameId && gameId === trackedGameId && currentKey && currentKey !== seenKey);
}
