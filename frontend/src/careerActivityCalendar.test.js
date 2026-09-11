import { describe, expect, it } from 'vitest';
import { careerActivityCalendar } from './careerActivityCalendar.js';

describe('career activity calendar', () => {
  it('groups only real finished games in the local anchor month', () => {
    const model = careerActivityCalendar([
      { id: 'w1', date: '2026-09-03T10:00:00', outcome: 'win' },
      { id: 'w2', date: '2026-09-03T18:00:00', outcome: 'win' },
      { id: 'l1', date: '2026-09-03T19:00:00', outcome: 'loss' },
      { id: 'd1', date: '2026-09-08T13:00:00', outcome: 'draw' },
      { id: 'old', date: '2026-08-31T23:00:00', outcome: 'win' },
      { id: 'cancelled', date: '2026-09-08T14:00:00', outcome: 'cancelled' },
    ], new Date('2026-09-11T12:00:00'));

    expect(model.cells).toHaveLength(42);
    expect(model.weekDays).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    expect(model.totals).toEqual({ games: 4, wins: 2, draws: 1, losses: 1, activeDays: 2 });
    expect(model.cells.find((cell) => cell.key === '2026-09-03')).toMatchObject({ games: 3, wins: 2, losses: 1, tone: 'positive' });
    expect(model.cells.find((cell) => cell.key === '2026-09-08')).toMatchObject({ games: 1, draws: 1, tone: 'mixed' });
    expect(model.cells.find((cell) => cell.key === '2026-09-11')).toMatchObject({ isToday: true, games: 0 });
  });

  it('does not manufacture activity from malformed or unfinished records', () => {
    const model = careerActivityCalendar([
      null,
      { date: 'nope', outcome: 'win' },
      { date: '2026-09-02T12:00:00', outcome: 'abandoned' },
      { outcome: 'loss' },
    ], new Date('2026-09-11T12:00:00'));
    expect(model.totals).toEqual({ games: 0, wins: 0, draws: 0, losses: 0, activeDays: 0 });
    expect(model.cells.every((cell) => cell.games === 0)).toBe(true);
  });
});
