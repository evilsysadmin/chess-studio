import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIVE_GAME_SESSION_KEY, clearActiveGameSession, loadActiveGameSession, saveActiveGameSession } from './activeGameSession.js';
import { loadClockSnapshot, saveClockSnapshot } from './clockPersistence.js';
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

  it('mantiene estable el round-trip guardar → restaurar → guardar para partida normal y torneo', () => {
    const cases = [
      {
        route: 'game',
        game: {
          id: 'roundtrip-normal',
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 3',
          history: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }, { san: 'Bc4' }],
          difficulty: 73,
          humanColor: 'w',
          status: 'active',
        },
        learningMode: true,
        gameContext: {
          suddenDeath: false,
          ghost: true,
          series: { id: 'series-3', score: { human: 1, cpu: 0 } },
          runMode: 'nemesis',
        },
        timeControlId: '5+3',
      },
      {
        route: 'tournamentGame',
        game: {
          id: 'roundtrip-tournament',
          fen: '8/8/8/3k4/8/4K3/8/8 w - - 17 58',
          history: [{ san: 'Kd3' }],
          tournamentId: 'cup-7',
          round: 4,
          status: 'active',
        },
        learningMode: false,
        gameContext: {
          tournament: { id: 'cup-7', round: 4, bracket: ['a', 'b'] },
          specialRun: { id: 'run-2', modifiers: ['no-hints'] },
        },
        timeControlId: '10+0',
      },
    ];

    for (const input of cases) {
      localStorage.clear();
      const firstSaved = saveActiveGameSession(input);
      const firstLoaded = loadActiveGameSession();
      expect(firstSaved).not.toBeNull();
      expect(firstLoaded).not.toBeNull();

      const secondSaved = saveActiveGameSession({
        route: firstLoaded.route,
        game: firstLoaded.gameSnapshot,
        learningMode: firstLoaded.learningMode,
        gameContext: firstLoaded.gameContext,
        timeControlId: firstLoaded.timeControlId,
      });
      const secondLoaded = loadActiveGameSession();

      const stableShape = (snapshot) => ({
        version: snapshot.version,
        route: snapshot.route,
        gameId: snapshot.gameId,
        gameSnapshot: snapshot.gameSnapshot,
        learningMode: snapshot.learningMode,
        gameContext: snapshot.gameContext,
        timeControlId: snapshot.timeControlId,
      });

      expect(stableShape(secondSaved)).toEqual(stableShape(firstSaved));
      expect(stableShape(secondLoaded)).toEqual(stableShape(firstLoaded));
    }
  });

  it('mantiene exactos los snapshots de reloj al cargarlos y volverlos a guardar', () => {
    for (let index = 1; index <= 24; index += 1) {
      const gameId = `clock-roundtrip-${index}`;
      const input = {
        gameId,
        timeControlId: index % 2 ? '3+2' : '10+0',
        whiteTime: 180 - index * 1.25,
        blackTime: 175 - index * 0.75,
        activeColor: index % 2 ? 'w' : 'b',
        now: 1_700_000_000_000 + index * 1_000,
      };
      const firstSaved = saveClockSnapshot(input);
      const firstLoaded = loadClockSnapshot(gameId);
      expect(firstLoaded).toEqual(firstSaved);

      const secondSaved = saveClockSnapshot({
        gameId: firstLoaded.gameId,
        timeControlId: firstLoaded.timeControlId,
        whiteTime: firstLoaded.whiteTime,
        blackTime: firstLoaded.blackTime,
        activeColor: firstLoaded.activeColor,
        now: firstLoaded.savedAt,
      });
      expect(secondSaved).toEqual(firstSaved);
      expect(loadClockSnapshot(gameId)).toEqual(firstSaved);
    }
  });

  it('abre snapshots v1 de releases antiguas y rechaza versiones futuras sin reinterpretarlas', () => {
    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify({
      version: 1,
      route: 'game',
      gameId: 'legacy-g1',
      learningMode: false,
      gameContext: { runMode: 'streak' },
      timeControlId: 'none',
      savedAt: 1700000000000,
    }));
    expect(loadActiveGameSession()).toMatchObject({ gameId: 'legacy-g1', route: 'game', gameContext: { runMode: 'streak' } });

    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify({ version: 999, route: 'game', gameId: 'future-g1' }));
    expect(loadActiveGameSession()).toBeNull();
    expect(localStorage.getItem(ACTIVE_GAME_SESSION_KEY)).toContain('future-g1');
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
