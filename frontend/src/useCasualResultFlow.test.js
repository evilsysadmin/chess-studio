import { describe, expect, it } from 'vitest';
import { casualModeFromContext, casualResultSummary } from './useCasualResultFlow.js';

describe('casual result flow helpers', () => {
  it('deriva el modo con prioridad estable', () => {
    expect(casualModeFromContext({ suddenDeath: true, rescue: true }, false)).toBe('sudden');
    expect(casualModeFromContext({ rescue: true, lab: true }, false)).toBe('rescue');
    expect(casualModeFromContext({ nemesis: true }, false)).toBe('nemesis-training');
    expect(casualModeFromContext({ lab: true }, false)).toBe('lab');
    expect(casualModeFromContext({ runMode: 'cup' }, false)).toBe('cup');
    expect(casualModeFromContext({ runMode: 'boss' }, false)).toBe('boss');
    expect(casualModeFromContext({ runMode: 'streak' }, false)).toBe('streak');
    expect(casualModeFromContext({}, true)).toBe('practice');
    expect(casualModeFromContext({}, false)).toBe('casual');
  });

  it('resume rating cuando el resultado es competitivo', () => {
    expect(casualResultSummary({
      gameId: 'g-1',
      outcome: 'win',
      adaptiveDifficulty: true,
      ratingSummary: {
        ratingApplied: true,
        eloDelta: 12,
        eloBefore: 400,
        eloAfter: 412,
        ratingGames: 4,
      },
    })).toEqual({
      gameId: 'g-1',
      outcome: 'win',
      title: 'Victoria',
      detail: 'Rating +12 · 400 → 412',
      endReason: null,
      adaptiveDifficulty: true,
      ratingApplied: true,
      eloDelta: 12,
      eloBefore: 400,
      eloAfter: 412,
      ratingGames: 4,
    });
  });

  it('mantiene el copy de abandono y de modos sin rating', () => {
    expect(casualResultSummary({
      gameId: 'g-2',
      outcome: 'loss',
      endReason: 'resignation',
      ratingSummary: { ratingApplied: false },
    })).toMatchObject({
      title: 'Abandono registrado como derrota',
      detail: 'Esta modalidad no afecta a tu rating.',
      endReason: 'resignation',
      ratingApplied: false,
    });
  });
});
