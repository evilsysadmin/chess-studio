import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { clearActiveGameSession, loadActiveGameSession, saveActiveGameSession } from './activeGameSession.js';
import { clearClockSnapshot, loadClockSnapshot, saveClockSnapshot } from './clockPersistence.js';
import { clearCombatSession, loadCombatSession, saveCombatSession } from './combatSession.js';
import { createInitialRegistry } from './combat.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

const COMBAT_FEN = '8/8/8/8/8/8/8/K6k w - - 0 1';

describe('session marathon lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStorageMemoryFallback();
    clearCombatSession();
  });

  it('does not accumulate active-game or clock storage across 500 complete lifecycles', () => {
    for (let index = 0; index < 500; index += 1) {
      const gameId = `marathon-game-${index}`;
      const route = index % 2 ? 'game' : 'tournamentGame';
      const timeControlId = index % 3 ? '5+3' : '10+0';

      expect(saveActiveGameSession({
        route,
        game: {
          id: gameId,
          fen: '8/8/8/8/8/4K3/8/7k w - - 0 1',
          history: [{ san: 'Kd3' }],
          status: 'active',
        },
        learningMode: index % 2 === 0,
        gameContext: { soakIteration: index },
        timeControlId,
      })).not.toBeNull();

      expect(saveClockSnapshot({
        gameId,
        timeControlId,
        whiteTime: 300 - (index % 60),
        blackTime: 295 - (index % 45),
        activeColor: index % 2 ? 'w' : 'b',
        now: 1_700_000_000_000 + index * 1_000,
      })).not.toBeNull();

      expect(loadActiveGameSession()).toMatchObject({ gameId, route, timeControlId });
      expect(loadClockSnapshot(gameId)).toMatchObject({ gameId, timeControlId });

      clearClockSnapshot(gameId);
      clearActiveGameSession();
      expect(loadClockSnapshot(gameId)).toBeNull();
      expect(loadActiveGameSession()).toBeNull();
    }

    expect(localStorage.length).toBe(0);
  });

  it('does not accumulate Combat buckets or markers across 300 battle lifecycles', () => {
    const registry = createInitialRegistry(new Chess(COMBAT_FEN));

    for (let index = 0; index < 300; index += 1) {
      const sessionId = `marathon-combat-${index}`;
      expect(saveCombatSession(sessionId, {
        phase: 'battle',
        fen: COMBAT_FEN,
        registry,
        humanColor: index % 2 ? 'w' : 'b',
        combatLog: [],
        uiLog: [],
        positionCounts: [],
        battleParticipants: [],
        unitBattleStats: {},
      })).toBe(true);

      expect(loadCombatSession(sessionId)).toMatchObject({ sessionId, phase: 'battle', fen: COMBAT_FEN });
      clearCombatSession(sessionId);
      expect(loadCombatSession(sessionId)).toBeNull();
    }

    expect(sessionStorage.length).toBe(0);
  });
});
