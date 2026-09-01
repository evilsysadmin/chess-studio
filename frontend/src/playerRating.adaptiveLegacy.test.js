import { describe, expect, it } from 'vitest';
import { adaptiveDifficultyAdjustment, difficultyForRating } from './playerRating.js';

function finished(gameId, outcome, difficulty) {
  return { gameId, state: 'finished', mode: 'casual', outcome, difficulty };
}

function adaptiveCancel(gameId, difficulty) {
  return [
    { gameId, state: 'cancelled', mode: 'casual', difficulty },
    { gameId, state: 'started', mode: 'casual', difficulty, detail: 'adaptive-difficulty' },
  ];
}

describe('adaptive difficulty · perfiles legacy', () => {
  it('baja con contundencia un rating inflado tras una racha real de derrotas', () => {
    const activity = Array.from({ length: 6 }, (_, index) => finished(`loss-${index}`, 'loss', 50));
    // 1100 -> base 50. La forma reciente debe impedir seguir sirviendo CPU 50.
    expect(difficultyForRating(1100, activity)).toBeLessThanOrEqual(30);
  });

  it('una derrota a dificultad claramente inferior también demuestra que el rating estaba alto', () => {
    const activity = [
      finished('a', 'loss', 18),
      finished('b', 'loss', 20),
      finished('c', 'loss', 22),
      finished('d', 'loss', 20),
    ];
    expect(adaptiveDifficultyAdjustment(activity, 50)).toBeLessThan(0);
  });

  it('no castiga una paliza voluntaria contra una CPU muy por encima del automático', () => {
    const activity = [
      finished('a', 'loss', 95),
      finished('b', 'loss', 95),
      finished('c', 'loss', 95),
      finished('d', 'loss', 95),
    ];
    expect(adaptiveDifficultyAdjustment(activity, 50)).toBe(0);
  });

  it('abandono repetido de partidas automáticas cuenta como señal blanda sin tocar el ELO', () => {
    const activity = [
      ...adaptiveCancel('a', 50),
      ...adaptiveCancel('b', 50),
      ...adaptiveCancel('c', 50),
      ...adaptiveCancel('d', 50),
    ];
    expect(adaptiveDifficultyAdjustment(activity, 50)).toBeLessThan(0);
  });

  it('cancelaciones que no pertenecían a dificultad automática no alteran el nivel', () => {
    const activity = [
      { gameId: 'a', state: 'cancelled', mode: 'casual', difficulty: 50 },
      { gameId: 'b', state: 'cancelled', mode: 'casual', difficulty: 50 },
      { gameId: 'c', state: 'cancelled', mode: 'casual', difficulty: 50 },
      { gameId: 'd', state: 'cancelled', mode: 'casual', difficulty: 50 },
    ];
    expect(adaptiveDifficultyAdjustment(activity, 50)).toBe(0);
  });
});
