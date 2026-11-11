import { describe, expect, it } from 'vitest';
import { weeklyReport } from './advancedCareer.js';

const NOW = new Date('2026-11-11T12:00:00Z');
const date = '2026-11-10T12:00:00Z';

describe('weeklyReport · analysis game identity', () => {
  it('no atribuye al game-10 la accuracy archivada para game-1', () => {
    const history = [{
      id: 'game-10-1762800000000', sourceGameId: 'game-10',
      outcome: 'win', date,
    }];
    const archive = {
      wrongPrefix: { gameId: 'game-1', accuracy: 99 },
      missingId: { accuracy: 100 },
    };
    expect(weeklyReport(history, archive, NOW).current).toMatchObject({
      games: 1, winPct: 100, accuracy: null,
    });

    archive.real = { gameId: 'game-10', accuracy: 64 };
    expect(weeklyReport(history, archive, NOW).current.accuracy).toBe(64);
  });

  it('preserva el vínculo exacto con los identificadores de historia antiguos', () => {
    const history = [{
      id: 'legacy-game-1762800000000', outcome: 'loss', date,
    }];
    const archive = {
      actual: { gameId: 'legacy-game', accuracy: 52 },
      unrelated: { gameId: 'legacy-gam', accuracy: 100 },
    };
    expect(weeklyReport(history, archive, NOW).current).toMatchObject({
      games: 1, accuracy: 52,
    });
  });

  it('no permite que un archive sin ID capture partidas mediante startsWith vacío', () => {
    const history = [{ id: 'some-game-123', outcome: 'draw', date }];
    const archive = { broken: { gameId: '', accuracy: 100 } };
    expect(weeklyReport(history, archive, NOW).current.accuracy).toBeNull();
  });
});
