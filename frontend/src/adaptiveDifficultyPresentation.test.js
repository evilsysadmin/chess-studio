import { describe, expect, it } from 'vitest';
import { PROVISIONAL_GAMES } from './playerRating.js';
import { adaptiveDifficultyPresentation } from './adaptiveDifficultyPresentation.js';

describe('adaptiveDifficultyPresentation', () => {
  it('expone progreso de calibración sin enseñar el nivel técnico 0–100', () => {
    const view = adaptiveDifficultyPresentation({ rating: 400, games: 3 }, []);

    expect(view.calibrating).toBe(true);
    expect(view.completed).toBe(3);
    expect(view.choiceCopy).toContain(`3/${PROVISIONAL_GAMES}`);
    expect(view.detailLabel).toBe(`Dificultad automática · Calibrando 3/${PROVISIONAL_GAMES}`);
    expect(view.detailLabel).not.toMatch(/nivel\s+\d+/i);
  });

  it('tras calibrar usa una etiqueta humana y mantiene oculto el valor crudo', () => {
    const view = adaptiveDifficultyPresentation({ rating: 1000, games: PROVISIONAL_GAMES }, []);

    expect(view.calibrating).toBe(false);
    expect(view.choiceCopy).toContain('Reto adaptativo');
    expect(view.detailLabel).toMatch(/^Dificultad automática · (Principiante|Aficionado|Intermedio|Avanzado|Implacable)$/);
    expect(view.detailLabel).not.toContain(String(view.level));
  });

  it('normaliza contadores inválidos o negativos para no mostrar progreso absurdo', () => {
    expect(adaptiveDifficultyPresentation({ rating: 700, games: -4 }, []).completed).toBe(0);
    expect(adaptiveDifficultyPresentation({ rating: 700, games: 'basura' }, []).completed).toBe(0);
  });
});
