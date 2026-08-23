export function reconnectTarget({ route, game = null, tournamentGame = null, savedSession = null } = {}) {
  if (route === 'game') {
    const gameId = game?.id || (savedSession?.route === 'game' ? savedSession?.gameId : null);
    return gameId ? { route: 'game', gameId } : null;
  }
  if (route === 'tournamentGame') {
    const gameId = tournamentGame?.id || (savedSession?.route === 'tournamentGame' ? savedSession?.gameId : null);
    return gameId ? { route: 'tournamentGame', gameId } : null;
  }
  return null;
}

export async function fetchReconnectGame(gameId, getGame) {
  if (!gameId || typeof getGame !== 'function') return { ok: false, reason: 'invalid-target', game: null, error: null };
  try {
    const game = await getGame(gameId);
    if (!game || game.id !== gameId) {
      return { ok: false, reason: 'invalid-response', game: null, error: null };
    }
    return { ok: true, reason: 'recovered', game, error: null };
  } catch (error) {
    return { ok: false, reason: 'request-failed', game: null, error };
  }
}
