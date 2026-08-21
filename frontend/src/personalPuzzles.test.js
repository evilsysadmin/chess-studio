import { beforeEach, describe, expect, it } from 'vitest';
import { loadPersonalPuzzles, personalPuzzlesForFilter, personalTrainingSummary, randomPersonalPuzzle, recordPersonalPuzzleResult, savePersonalPuzzlesFromReport } from './personalPuzzles.js';

describe('personal puzzles', () => {
  beforeEach(() => localStorage.clear());

  it('archiva blunders de la autopsia y evita duplicados', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4' },
      { san: 'e5', from: 'e7', to: 'e5' },
      { san: 'Nf3', from: 'g1', to: 'f3' },
    ];
    const report = {
      topMistakes: [{ index: 2, moveNumber: 2, played: 'Nf3', suggested: 'Bc4', loss: 150 }],
    };
    expect(savePersonalPuzzlesFromReport(history, 'w', report).added).toBe(1);
    expect(savePersonalPuzzlesFromReport(history, 'w', report).added).toBe(0);
    expect(loadPersonalPuzzles()).toHaveLength(1);
    expect(loadPersonalPuzzles()[0].solution).toEqual(['Bc4']);
  });

  it('conserva la apertura de la autopsia y permite filtrar entrenamiento némesis', () => {
    const history = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }];
    const report = { topMistakes: [{ index: 2, played: 'Nf3', suggested: 'Bc4', loss: 150 }] };
    savePersonalPuzzlesFromReport(history, 'w', report, { gameId: 'g-sic', opening: 'Defensa Siciliana' });
    const tagged = loadPersonalPuzzles()[0];
    expect(tagged).toMatchObject({ opening: 'Defensa Siciliana', sourceGameId: 'g-sic', humanColor: 'w' });
    expect(personalPuzzlesForFilter({ opening: 'Defensa Siciliana' })).toHaveLength(1);
    expect(personalPuzzlesForFilter({ opening: 'Apertura Italiana' })).toHaveLength(0);
    expect(randomPersonalPuzzle(null, { opening: 'Defensa Siciliana' })?.id).toBe(tagged.id);
  });

  it('mide si el jugador corrige sus propios errores sin borrar el origen', () => {
    const history = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }];
    savePersonalPuzzlesFromReport(history, 'w', { topMistakes: [{ index: 2, played: 'Nf3', suggested: 'Bc4', loss: 150 }] });
    const puzzle = loadPersonalPuzzles()[0];
    recordPersonalPuzzleResult(puzzle.id, { solved: false, clean: false });
    recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: true });
    expect(loadPersonalPuzzles()[0]).toMatchObject({ attempts: 2, solves: 1, cleanSolves: 1 });
    expect(personalTrainingSummary()).toMatchObject({ attempts: 2, solves: 1, cleanSolves: 1, cleanRate: 50 });
  });
});
