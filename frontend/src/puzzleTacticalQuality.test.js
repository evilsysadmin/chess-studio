import { describe, expect, it } from 'vitest';
import { isObviouslyUnsoundSingleMovePuzzle } from './puzzleTacticalQuality.js';

describe('calidad táctica mínima de puzzles', () => {
  it('rechaza el clásico jaque bonito cuyo caballo se come un peón inmediatamente', () => {
    const puzzle = {
      fen: '3k4/5p2/8/2N5/8/8/8/4K3 w - - 0 1',
      solution: ['Ne6+'],
      source: 'workers-ai-validated',
    };
    expect(isObviouslyUnsoundSingleMovePuzzle(puzzle)).toBe(true);
  });

  it('no confunde un mate inmediato con una pieza colgada', () => {
    const puzzle = {
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      solution: ['Ra8#'],
      source: 'workers-ai-validated',
    };
    expect(isObviouslyUnsoundSingleMovePuzzle(puzzle)).toBe(false);
  });
});
