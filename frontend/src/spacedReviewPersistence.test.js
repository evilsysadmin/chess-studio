import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPersonalPuzzles, recordPersonalPuzzleResult, savePersonalPuzzlesFromReport } from './personalPuzzles.js';

const DAY = 86_400_000;
const START = Date.parse('2026-08-01T10:00:00.000Z');

describe('persistencia del repaso 3/7/21', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createAutopsyPuzzle() {
    const history = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }];
    savePersonalPuzzlesFromReport(history, 'w', {
      topMistakes: [{ index: 2, played: 'Nf3', suggested: 'Bc4', loss: 150 }],
    }, { gameId: 'g-retention' });
    return loadPersonalPuzzles()[0];
  }

  it('un primer acierto limpio agenda el caso a 3 días y un repaso vencido lo mueve a 7', () => {
    const puzzle = createAutopsyPuzzle();
    recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: true });
    let stored = loadPersonalPuzzles()[0];
    expect(stored).toMatchObject({ retentionStage: 0, retentionBrokenAt: null });
    expect(stored.nextReviewAt).toBe(new Date(START + (3 * DAY)).toISOString());

    vi.setSystemTime(START + (3 * DAY));
    recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: true });
    stored = loadPersonalPuzzles()[0];
    expect(stored.retentionStage).toBe(1);
    expect(stored.nextReviewAt).toBe(new Date(START + (10 * DAY)).toISOString());
  });

  it('una recaída persistida rompe la evidencia y el siguiente limpio reinicia el ciclo', () => {
    const puzzle = createAutopsyPuzzle();
    recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: true });

    vi.setSystemTime(START + (3 * DAY));
    recordPersonalPuzzleResult(puzzle.id, { solved: false, clean: false });
    let stored = loadPersonalPuzzles()[0];
    expect(stored.nextReviewAt).toBeNull();
    expect(stored.retentionBrokenAt).toBe(new Date(START + (3 * DAY)).toISOString());

    vi.setSystemTime(START + (4 * DAY));
    recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: true });
    stored = loadPersonalPuzzles()[0];
    expect(stored.retentionBrokenAt).toBeNull();
    expect(stored.retentionStage).toBe(0);
    expect(stored.nextReviewAt).toBe(new Date(START + (7 * DAY)).toISOString());
  });
});
