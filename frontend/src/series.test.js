import { beforeEach, describe, expect, it } from 'vitest';
import { createSeries, recordSeriesGame, loadSeriesHistory } from './series.js';

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
    s = recordSeriesGame(s, 'draw', { humanColor: 'b' });
    expect(s.humanWins).toBe(0);
    expect(s.cpuWins).toBe(0);
    expect(s.draws).toBe(1);
  });
});
