import { beforeEach, describe, expect, it } from 'vitest';
import { loadRivalry, reconcileRivalryHistory, recordRivalryIncident, recordRivalryResult, recurrenceSuffix } from './rivalry.js';

describe('cpu rivalry', () => {
  beforeEach(() => localStorage.clear());

  it('lleva un único marcador y sus rachas', () => {
    recordRivalryResult('win');
    recordRivalryResult('win');
    recordRivalryResult('loss');
    const row = loadRivalry().record;
    expect(row.games).toBe(3);
    expect(row.wins).toBe(2);
    expect(row.losses).toBe(1);
    expect(row.bestHumanStreak).toBe(2);
  });

  it('cuenta una partida una sola vez cuando recibe una identidad estable', () => {
    recordRivalryResult('win', { gameId: 'g-1', difficulty: 50 });
    recordRivalryResult('win', { gameId: 'g-1', difficulty: 50 });
    const state = loadRivalry();
    expect(state.record.games).toBe(1);
    expect(state.record.wins).toBe(1);
    expect(state.processedGameIds).toContain('g-1');
    expect(state.record.recentGames[0]).toMatchObject({ gameId: 'g-1', outcome: 'win' });
  });

  it('siembra ids desde Historial y no vuelve a contar una partida reconciliada', () => {
    reconcileRivalryHistory([{ id: 'archive-1', sourceGameId: 'g-old', outcome: 'draw', date: '2026-09-01T10:00:00Z', mode: 'casual', moves: [] }]);
    recordRivalryResult('draw', { gameId: 'g-old' });
    const state = loadRivalry();
    expect(state.record.games).toBe(1);
    expect(state.record.draws).toBe(1);
  });

  it('ignora resultados no terminales o desconocidos', () => {
    recordRivalryResult('cancelled', { gameId: 'g-cancelled' });
    expect(loadRivalry().record.games).toBe(0);
  });

  it('migra los viejos marcadores separados a una sola CPU', () => {
    localStorage.setItem('chess-study-cpu-rivalry', JSON.stringify({
      version: 1,
      totalGames: 5,
      byPersona: {
        legacyA: { games: 3, wins: 2, draws: 0, losses: 1, bestHumanStreak: 2, bestCpuStreak: 1 },
        legacyB: { games: 2, wins: 0, draws: 1, losses: 1, bestHumanStreak: 0, bestCpuStreak: 1 },
      },
      incidents: { 'human:MISSED_MATE': 2 },
    }));
    const state = loadRivalry();
    expect(state.version).toBe(3);
    expect(state.record.games).toBe(5);
    expect(state.record.wins).toBe(2);
    expect(state.record.draws).toBe(1);
    expect(state.record.losses).toBe(2);
    expect(state.incidents['human:MISSED_MATE']).toBe(2);
  });

  it('detecta reincidencia de un crimen', () => {
    const event = { type: 'MISSED_MATE' };
    expect(recordRivalryIncident(event, 'human')).toBe(1);
    const count = recordRivalryIncident(event, 'human');
    expect(count).toBe(2);
    expect(recurrenceSuffix(event, 'human', count)).toContain('2.ª');
  });
});
