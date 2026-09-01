import { beforeEach, describe, expect, it } from 'vitest';
import { difficultyForRating, saveRating } from './playerRating.js';

beforeEach(() => {
  localStorage.clear();
});

describe('dificultad adaptativa · ruta de producto', () => {
  it('usa el contador persistido aunque el caller no pase games explícitamente', () => {
    saveRating({ rating: 400, games: 0 });
    expect(difficultyForRating(400)).toBe(1);

    saveRating({ rating: 400, games: 12 });
    expect(difficultyForRating(400)).toBe(11);
  });

  it('mantiene el modo de análisis estable cuando se pasa actividad explícita', () => {
    saveRating({ rating: 400, games: 0 });
    expect(difficultyForRating(400, [])).toBe(11);
  });
});
