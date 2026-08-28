import { describe, expect, it } from 'vitest';
import { buildHomeOnboarding, isFreshAccount } from './homeOnboarding.js';

describe('home onboarding', () => {
  it('distingue una cuenta nueva del progreso real', () => {
    expect(isFreshAccount({ activity: [], tournament: { progressPoints: 0 } })).toBe(true);
    expect(isFreshAccount({ activity: [{ state: 'started' }], tournament: { progressPoints: 0 } })).toBe(false);
    expect(isFreshAccount({ activity: [], tournament: { progressPoints: 15 } })).toBe(false);
  });

  it('propone un recorrido corto y avanza sólo con progreso demostrado', () => {
    expect(buildHomeOnboarding().next).toBe('game');
    expect(buildHomeOnboarding().steps[0].detail).toMatch(/Reto opcional/);
    expect(buildHomeOnboarding({ activity: [{ state: 'finished' }] }).next).toBe('puzzle');
    expect(buildHomeOnboarding({ activity: [{ state: 'finished' }], puzzlesSolved: 2 }).next).toBe('insights');
    expect(buildHomeOnboarding({ activity: [{ state: 'finished' }], puzzlesSolved: 2, insightsSeen: true })).toMatchObject({ complete: true, completed: 3, next: null });
  });
});
