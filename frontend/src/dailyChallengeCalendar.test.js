import { describe, expect, it } from 'vitest';
import { dailyChallengeCalendarMonth } from './dailyChallengeCalendar.js';

describe('dailyChallengeCalendarMonth', () => {
  it('builds a Monday-first six-week month grid from persisted factual results', () => {
    const state = {
      solvedDates: ['2026-09-02', '2026-09-03', '2026-09-04'],
      results: {
        '2026-09-02': { slots: { tactic: { solved: true } } },
        '2026-09-03': { slots: { tactic: { solved: true }, precision: { solved: true }, finish: { solved: true } } },
        '2026-09-04': { slots: { tactic: { solved: true, clean: true }, precision: { solved: true, clean: true }, finish: { solved: true, clean: true } } },
      },
    };

    const calendar = dailyChallengeCalendarMonth(state, new Date(2026, 8, 11, 18, 0, 0));
    expect(calendar.cells).toHaveLength(42);
    expect(calendar.cells[0]).toMatchObject({ day: '2026-08-31', inMonth: false });
    expect(calendar.cells.find((cell) => cell.day === '2026-09-02')).toMatchObject({ status: 'partial', solvedCount: 1 });
    expect(calendar.cells.find((cell) => cell.day === '2026-09-03')).toMatchObject({ status: 'full', solvedCount: 3 });
    expect(calendar.cells.find((cell) => cell.day === '2026-09-04')).toMatchObject({ status: 'clean', cleanCount: 3 });
    expect(calendar.cells.find((cell) => cell.day === '2026-09-11')).toMatchObject({ today: true, inMonth: true });
  });

  it('keeps legacy solvedDates visible even without per-slot results', () => {
    const calendar = dailyChallengeCalendarMonth({ solvedDates: ['2026-09-07'], results: {} }, new Date(2026, 8, 11));
    expect(calendar.cells.find((cell) => cell.day === '2026-09-07')).toMatchObject({ status: 'partial', solvedCount: 1 });
  });
});
