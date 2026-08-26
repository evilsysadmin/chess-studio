import { beforeEach, describe, expect, it } from 'vitest';
import { createSeries, loadActiveSeries, loadSeriesHistory, recordSeriesGame, saveActiveSeries, seriesFacts, seriesHeadline, seriesHistoryStats, seriesLiveMoment, seriesNextActionLabel, validateSeriesState } from './series.js';

describe('series al mejor de N', () => {
  beforeEach(() => localStorage.clear());

  it('cierra un mejor de 3 al llegar a dos victorias', () => {
    let s = createSeries({ bestOf: 3, difficulty: 60, firstColor: 'w', timeControlId: '3+2' });
    s = recordSeriesGame(s, 'win', { gameId: 'a', humanColor: 'w', moves: 40 });
    expect(s.winner).toBeNull();
    expect(s.nextColor).toBe('b');
    s = recordSeriesGame(s, 'win', { gameId: 'b', humanColor: 'b', moves: 36 });
    expect(s.winner).toBe('human');
    expect(loadSeriesHistory()).toHaveLength(1);
  });

  it('las tablas no cuentan como victoria de serie', () => {
    let s = createSeries({ bestOf: 5, difficulty: 50, firstColor: 'b' });
    s = recordSeriesGame(s, 'draw', { gameId: 'd1', humanColor: 'b' });
    expect(s.humanWins).toBe(0);
    expect(s.cpuWins).toBe(0);
    expect(s.draws).toBe(1);
  });

  it('no cuenta dos veces la misma partida por re-render/reintento', () => {
    let s = createSeries({ bestOf: 3, difficulty: 60, firstColor: 'w' });
    s = recordSeriesGame(s, 'win', { gameId: 'same', humanColor: 'w' });
    const again = recordSeriesGame(s, 'win', { gameId: 'same', humanColor: 'w' });
    expect(again.humanWins).toBe(1);
    expect(again.games).toHaveLength(1);
  });

  it('rechaza resultados desconocidos en vez de convertirlos silenciosamente en tablas', () => {
    const s = createSeries({ bestOf: 3, difficulty: 60, firstColor: 'w' });
    expect(() => recordSeriesGame(s, 'banana', { gameId: 'x' })).toThrow(/inválido/i);
  });

  it('restaura una serie coherente tras refresh y descarta estado corrupto', () => {
    let s = createSeries({ bestOf: 5, difficulty: 55, firstColor: 'w', timeControlId: '5+0' });
    s = recordSeriesGame(s, 'loss', { gameId: 'a', humanColor: 'w' });
    s = { ...s, currentGameId: 'b' };
    saveActiveSeries(s);
    expect(loadActiveSeries()).toMatchObject({ cpuWins: 1, currentGameId: 'b', timeControlId: '5+0' });
    expect(validateSeriesState({ ...s, humanWins: 99 })).toBeNull();
  });

  it('clasifica barridas, remontadas y decisivas sin inventar narrativa', () => {
    const sweep = { bestOf: 3, winsNeeded: 2, winner: 'human', humanWins: 2, cpuWins: 0, draws: 0, games: [{ outcome: 'win' }, { outcome: 'win' }] };
    expect(seriesFacts(sweep)).toMatchObject({ sweep: true, comeback: false, decider: false });
    expect(seriesHeadline(sweep)).toContain('barrida');

    const comeback = { bestOf: 3, winsNeeded: 2, winner: 'human', humanWins: 2, cpuWins: 1, draws: 0, games: [{ outcome: 'loss' }, { outcome: 'win' }, { outcome: 'win' }] };
    expect(seriesFacts(comeback)).toMatchObject({ sweep: false, comeback: true, decider: true });
    expect(seriesHeadline(comeback)).toContain('remontada');

    const decider = { bestOf: 3, winsNeeded: 2, winner: 'human', humanWins: 2, cpuWins: 1, draws: 0, games: [{ outcome: 'win' }, { outcome: 'loss' }, { outcome: 'win' }] };
    expect(seriesFacts(decider)).toMatchObject({ sweep: false, comeback: false, decider: true });
    expect(seriesHeadline(decider)).toContain('decisiva');
  });

  it('resume el expediente histórico de series y conserva la racha actual', () => {
    const rows = [
      { id: 's4', completedAt: '2026-01-04T00:00:00Z', bestOf: 3, winsNeeded: 2, winner: 'cpu', humanWins: 0, cpuWins: 2, draws: 0, games: [{ outcome: 'loss' }, { outcome: 'loss' }] },
      { id: 's3', completedAt: '2026-01-03T00:00:00Z', bestOf: 3, winsNeeded: 2, winner: 'cpu', humanWins: 1, cpuWins: 2, draws: 0, games: [{ outcome: 'win' }, { outcome: 'loss' }, { outcome: 'loss' }] },
      { id: 's2', completedAt: '2026-01-02T00:00:00Z', bestOf: 3, winsNeeded: 2, winner: 'human', humanWins: 2, cpuWins: 1, draws: 0, games: [{ outcome: 'win' }, { outcome: 'loss' }, { outcome: 'win' }] },
      { id: 's1', completedAt: '2026-01-01T00:00:00Z', bestOf: 3, winsNeeded: 2, winner: 'human', humanWins: 2, cpuWins: 0, draws: 0, games: [{ outcome: 'win' }, { outcome: 'win' }] },
    ];
    expect(seriesHistoryStats(rows)).toEqual({
      total: 4, won: 2, lost: 2, currentStreak: -2,
      bestHumanStreak: 2, bestCpuStreak: 2,
      humanSweeps: 1, cpuSweeps: 1,
      humanComebacks: 0, cpuComebacks: 1, deciders: 2,
    });
  });

  it('narra el momento vivo de la serie sólo desde el marcador real', () => {
    const base = { bestOf: 5, winsNeeded: 3, winner: null, draws: 0 };
    expect(seriesLiveMoment({ ...base, humanWins: 0, cpuWins: 0, games: [] })).toMatchObject({ kind: 'opening', label: 'ARRANQUE' });
    expect(seriesLiveMoment({ ...base, humanWins: 2, cpuWins: 1, games: [{ outcome: 'win' }, { outcome: 'loss' }, { outcome: 'win' }] })).toMatchObject({ kind: 'human-match-point', label: 'PUNTO DE SERIE' });
    expect(seriesLiveMoment({ ...base, humanWins: 1, cpuWins: 2, games: [{ outcome: 'loss' }, { outcome: 'win' }, { outcome: 'loss' }] })).toMatchObject({ kind: 'cpu-match-point', label: 'CONTRA LAS CUERDAS' });
    const decider = { ...base, humanWins: 2, cpuWins: 2, games: [{ outcome: 'win' }, { outcome: 'loss' }, { outcome: 'win' }, { outcome: 'loss' }] };
    expect(seriesLiveMoment(decider)).toMatchObject({ kind: 'decider', label: 'TODO O NADA' });
    expect(seriesNextActionLabel(decider)).toBe('Jugar la decisiva');
  });

});
