import { describe, expect, it } from 'vitest';
import { keyGameMoments } from './postGameHighlights.js';

function move(index, loss, played = `m${index}`, evals = {}) {
  return {
    index,
    moveNumber: index + 1,
    loss,
    played,
    severity: loss >= 150 ? 'blunder' : loss >= 60 ? 'mistake' : 'ok',
    ...evals,
  };
}

describe('keyGameMoments', () => {
  it('resume como máximo tres momentos distintos', () => {
    const best = move(1, 2, 'Cf3', { suggestedPerspectiveEval: 40, playedPerspectiveEval: 38 });
    const turning = move(5, 180, 'g4', { suggestedPerspectiveEval: 220, playedPerspectiveEval: 0 });
    const worst = move(7, 420, 'Dd2', { suggestedPerspectiveEval: 40, playedPerspectiveEval: -100 });
    const report = {
      analyzedCount: 8,
      averageLoss: 72,
      moveReports: [best, move(2, 20, 'd4', { suggestedPerspectiveEval: 30, playedPerspectiveEval: 20 }), turning, worst],
      topMistakes: [worst, turning],
      worst,
    };

    const moments = keyGameMoments(report);
    expect(moments).toHaveLength(3);
    expect(moments.map((item) => item.move.index)).toEqual([1, 5, 7]);
    expect(moments.map((item) => item.kind)).toEqual(['best', 'turning', 'worst']);
  });

  it('no duplica la peor jugada si también fue el punto de inflexión', () => {
    const best = move(1, 1, 'e4', { suggestedPerspectiveEval: 30, playedPerspectiveEval: 29 });
    const worst = move(6, 360, 'f3', { suggestedPerspectiveEval: 220, playedPerspectiveEval: -120 });
    const backup = move(8, 170, 'h3', { suggestedPerspectiveEval: -20, playedPerspectiveEval: -100 });
    const report = {
      analyzedCount: 7,
      averageLoss: 96,
      moveReports: [best, move(3, 30, 'Cc3', { suggestedPerspectiveEval: 15, playedPerspectiveEval: 0 }), worst, backup],
      topMistakes: [worst, backup],
      worst,
    };

    const moments = keyGameMoments(report);
    expect(new Set(moments.map((item) => item.move.index)).size).toBe(moments.length);
    expect(moments.some((item) => item.move.index === 8)).toBe(true);
  });

  it('devuelve vacío cuando no hubo jugadas analizables', () => {
    expect(keyGameMoments({ analyzedCount: 0, moveReports: [] })).toEqual([]);
  });
});
