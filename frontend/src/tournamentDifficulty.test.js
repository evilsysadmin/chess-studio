import { describe, expect, it } from 'vitest';
import {
  calibrateTournamentDifficulty,
  difficultyForLevel,
} from './tournament.js';

describe('calibración de fuerza del torneo', () => {
  it('preserva intacto el tramo bajo y medio que ya estaba bien calibrado', () => {
    expect(calibrateTournamentDifficulty(0)).toBe(0);
    expect(calibrateTournamentDifficulty(35)).toBe(35);
    expect(calibrateTournamentDifficulty(48)).toBe(48);
    expect(calibrateTournamentDifficulty(60)).toBe(60);
  });

  it('aplaza los saltos de profundidad del motor y los cruza por un solo punto', () => {
    expect(calibrateTournamentDifficulty(70)).toBe(65);
    expect(calibrateTournamentDifficulty(80)).toBe(69);
    expect(calibrateTournamentDifficulty(81)).toBe(70);

    expect(calibrateTournamentDifficulty(93)).toBe(89);
    expect(calibrateTournamentDifficulty(94)).toBe(90);

    expect(calibrateTournamentDifficulty(98)).toBe(97);
    expect(calibrateTournamentDifficulty(99)).toBe(98);
    expect(calibrateTournamentDifficulty(100)).toBe(100);
  });

  it('es monótona en todo el rango: subir nunca da una CPU más fácil', () => {
    let previous = -1;
    for (let raw = 0; raw <= 100; raw += 1) {
      const current = calibrateTournamentDifficulty(raw);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('mantiene los hitos históricos tempranos y el techo real del torneo', () => {
    expect(difficultyForLevel(13)).toBe(35);
    expect(difficultyForLevel(24)).toBe(48);
    expect(difficultyForLevel(101)).toBe(100);
  });

  it('ya no dispara profundidad 4 al llegar alrededor del nivel 50', () => {
    expect(difficultyForLevel(50)).toBeLessThan(70);
    expect(difficultyForLevel(50)).toBe(65);
  });
});
