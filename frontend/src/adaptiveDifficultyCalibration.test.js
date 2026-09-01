import { describe, expect, it } from 'vitest';
import { difficultyForRating, provisionalDifficultyRelief } from './playerRating.js';

const finished = (outcome, difficulty, mode = 'casual') => ({
  state: 'finished', outcome, difficulty, mode,
});

describe('calibración adaptativa para perfiles provisionales', () => {
  it('un usuario nuevo de ELO 400 no empieza contra la antigua CPU nivel 11', () => {
    expect(difficultyForRating(400, [], 0)).toBe(1);
    expect(difficultyForRating(400, [], 12)).toBe(11);
  });

  it('el alivio inicial desaparece progresivamente al cerrar las 12 partidas provisionales', () => {
    expect(provisionalDifficultyRelief(0)).toBe(10);
    expect(provisionalDifficultyRelief(6)).toBe(5);
    expect(provisionalDifficultyRelief(11)).toBe(1);
    expect(provisionalDifficultyRelief(12)).toBe(0);
    expect(provisionalDifficultyRelief(30)).toBe(0);
  });

  it('una primera derrota baja un poco la siguiente CPU provisional', () => {
    const base = difficultyForRating(800, [], 0);
    expect(difficultyForRating(800, [finished('loss', base)], 0)).toBe(base - 5);
  });

  it('dos derrotas seguidas bajan claramente la siguiente CPU provisional', () => {
    const base = difficultyForRating(800, [], 0);
    expect(difficultyForRating(800, [finished('loss', base), finished('loss', base)], 0)).toBe(base - 9);
  });

  it('una o dos victorias no inflan prematuramente la dificultad', () => {
    const base = difficultyForRating(800, [], 0);
    expect(difficultyForRating(800, [finished('win', base)], 0)).toBe(base);
    expect(difficultyForRating(800, [finished('win', base), finished('win', base)], 0)).toBe(base);
  });

  it('un perfil establecido conserva la muestra mínima de tres partidas', () => {
    const base = difficultyForRating(1100, [], 20);
    expect(difficultyForRating(1100, [finished('loss', base)], 20)).toBe(base);
    expect(difficultyForRating(1100, [finished('loss', base), finished('loss', base)], 20)).toBe(base);
  });
});
