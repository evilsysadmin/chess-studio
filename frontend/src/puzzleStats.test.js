import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPuzzlesSolved,
  incrementPuzzlesSolved,
  loadPuzzleStreak,
  loadBestPuzzleStreak,
  incrementPuzzleStreak,
  resetPuzzleStreak,
} from './puzzleStats.js';
import { matthiasSessionContext } from './matthiasSessionContext.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('puzzleStats', () => {
  it('empieza en 0', () => {
    expect(loadPuzzlesSolved()).toBe(0);
  });

  it('el total resuelto se incrementa y persiste también en el resumen de la sesión', () => {
    incrementPuzzlesSolved();
    incrementPuzzlesSolved();
    expect(loadPuzzlesSolved()).toBe(2);
    expect(matthiasSessionContext().puzzlesSolved).toBe(2);
  });
});

describe('racha de puzzles', () => {
  it('empieza en 0, tanto la racha actual como la mejor', () => {
    expect(loadPuzzleStreak()).toBe(0);
    expect(loadBestPuzzleStreak()).toBe(0);
  });

  it('la racha se incrementa y persiste', () => {
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    expect(loadPuzzleStreak()).toBe(2);
  });

  it('resetPuzzleStreak vuelve a 0 sin tocar la mejor marca', () => {
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    expect(loadBestPuzzleStreak()).toBe(3);
    resetPuzzleStreak();
    expect(loadPuzzleStreak()).toBe(0);
    expect(loadBestPuzzleStreak()).toBe(3);
  });

  it('la mejor marca solo sube, nunca baja aunque la racha actual se resetee y vuelva a crecer más chica', () => {
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    incrementPuzzleStreak();
    resetPuzzleStreak();
    incrementPuzzleStreak();
    expect(loadPuzzleStreak()).toBe(1);
    expect(loadBestPuzzleStreak()).toBe(5);
  });
});
