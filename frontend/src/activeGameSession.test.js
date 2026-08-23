import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIVE_GAME_SESSION_KEY, clearActiveGameSession, loadActiveGameSession, saveActiveGameSession } from './activeGameSession.js';
import { clearLocalUserState } from './profileKeys.js';

describe('continuidad de partida activa', () => {
  beforeEach(() => localStorage.clear());

  it('persiste ruta, contexto, reloj y snapshot de una partida normal', () => {
    saveActiveGameSession({
      route: 'game',
      game: { id: 'g-1', fen: 'fen', history: [{ san: 'e4' }], difficulty: 55 },
      learningMode: true,
      gameContext: { suddenDeath: true, ghost: false },
      timeControlId: '10+20',
    });
    expect(loadActiveGameSession()).toMatchObject({
      route: 'game',
      gameId: 'g-1',
      learningMode: true,
      gameContext: { suddenDeath: true, ghost: false },
      timeControlId: '10+20',
      gameSnapshot: { id: 'g-1', history: [{ san: 'e4' }] },
    });
  });

  it('también identifica una partida de torneo para poder reconstruir su pantalla', () => {
    saveActiveGameSession({ route: 'tournamentGame', game: { id: 't-9', history: [] } });
    expect(loadActiveGameSession()).toMatchObject({ route: 'tournamentGame', gameId: 't-9' });
  });

  it('se elimina también al cambiar de identidad', () => {
    saveActiveGameSession({ route: 'game', game: { id: 'alice-game', history: [] } });
    clearLocalUserState();
    expect(localStorage.getItem(ACTIVE_GAME_SESSION_KEY)).toBeNull();
  });

  it('rechaza datos corruptos y se limpia explícitamente', () => {
    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify({ version: 1, route: 'banana', gameId: 'x' }));
    expect(loadActiveGameSession()).toBeNull();
    clearActiveGameSession();
    expect(localStorage.getItem(ACTIVE_GAME_SESSION_KEY)).toBeNull();
  });
});
