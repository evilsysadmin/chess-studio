import { describe, expect, it } from 'vitest';
import { buildHomeOnboarding, isFreshAccount } from './homeOnboarding.js';

describe('home onboarding', () => {
  it('distingue una cuenta nueva del progreso real', () => {
    expect(isFreshAccount({ activity: [], tournament: { progressPoints: 0 } })).toBe(true);
    expect(isFreshAccount({ activity: [{ state: 'started' }], tournament: { progressPoints: 0 } })).toBe(false);
    expect(isFreshAccount({ activity: [], tournament: { progressPoints: 15 } })).toBe(false);
  });

  it('presenta primero la Escuela y avanza sólo con progreso demostrado', () => {
    expect(buildHomeOnboarding().next).toBe('school');
    expect(buildHomeOnboarding().steps[0]).toMatchObject({ id: 'school', done: false });
    expect(buildHomeOnboarding({ schoolStarted: true }).next).toBe('game');
    expect(buildHomeOnboarding({ schoolStarted: true }).steps[1].detail).toMatch(/Reto opcional/);
    expect(buildHomeOnboarding({ schoolStarted: true, activity: [{ state: 'finished' }] }).next).toBe('puzzle');
    expect(buildHomeOnboarding({ schoolStarted: true, activity: [{ state: 'finished' }], puzzlesSolved: 2 }).next).toBe('insights');
    expect(buildHomeOnboarding({ schoolStarted: true, activity: [{ state: 'finished' }], puzzlesSolved: 2, insightsSeen: true })).toMatchObject({ complete: true, completed: 4, next: null });
  });
});
