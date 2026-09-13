import { describe, expect, it } from 'vitest';
import { msUntilNextLocalHour } from './matthiasRoutineClock.js';

describe('Matthias routine clock', () => {
  it('waits only until the next local hour boundary', () => {
    expect(msUntilNextLocalHour(new Date(2026, 8, 13, 15, 0, 0, 0))).toBe(3_600_000);
    expect(msUntilNextLocalHour(new Date(2026, 8, 13, 15, 59, 59, 750))).toBe(250);
    expect(msUntilNextLocalHour(new Date(2026, 8, 13, 23, 59, 59, 500))).toBe(500);
  });

  it('uses a short retry only for an invalid clock value', () => {
    expect(msUntilNextLocalHour(new Date(Number.NaN))).toBe(60_000);
  });
});
