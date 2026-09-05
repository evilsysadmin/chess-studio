import { beforeEach, describe, expect, it } from 'vitest';
import { focusPersonalPuzzle, randomPersonalPuzzle } from './personalPuzzles.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function puzzle(id, move, loss) {
  return {
    id,
    kind: 'personal',
    fen: START,
    solution: [move],
    source: 'autopsy',
    createdAt: '2026-09-05T12:00:00.000Z',
    loss,
    incidentKeys: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
    puzzle('focused', 'e4', 90),
    puzzle('stronger', 'd4', 500),
  ]));
});

describe('personal puzzle focus', () => {
  it('abre una vez el crimen solicitado aunque otro puzzle tenga mayor prioridad adaptativa', () => {
    focusPersonalPuzzle('focused');
    expect(randomPersonalPuzzle(null)?.id).toBe('focused');
    expect(randomPersonalPuzzle(null)?.id).toBe('stronger');
  });

  it('ignora un foco inexistente y vuelve a la cola normal', () => {
    focusPersonalPuzzle('missing');
    expect(randomPersonalPuzzle(null)?.id).toBe('stronger');
  });
});
