import { describe, expect, it } from 'vitest';
import { isPlayablePersonalPuzzle, personalPuzzleFromMistake } from './personalPuzzles.js';

const HANGING_QUEEN_FEN = '8/k7/3p4/8/4Q3/8/8/7K w - - 0 1';

describe('personal autopsy puzzle quality gate', () => {
  it('rejects a new autopsy exercise whose suggested move hangs the queen to a pawn', () => {
    const puzzle = personalPuzzleFromMistake([], 'w', {
      index: 0,
      played: 'Qf4',
      suggested: 'Qe5',
      loss: 320,
    }, { initialFen: HANGING_QUEEN_FEN });

    expect(puzzle).toBeNull();
  });

  it('retires an already-persisted autopsy exercise that fails the same tactical gate', () => {
    expect(isPlayablePersonalPuzzle({
      id: 'legacy-bad-autopsy',
      kind: 'personal',
      source: 'autopsy',
      fen: HANGING_QUEEN_FEN,
      solution: ['Qe5'],
      played: 'Qf4',
    })).toBe(false);
  });
});
