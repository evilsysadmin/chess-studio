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

  it('explica qué señales cambiaron de verdad el rival sin enseñar ajustes internos', () => {
    const adaptive = (gameId, outcome, difficulty = 56) => [
      { gameId, state: 'finished', outcome, difficulty, mode: 'casual' },
      { gameId, state: 'started', detail: 'adaptive-difficulty', difficulty, mode: 'casual' },
    ];
    const activity = [
      ...adaptive('g3', 'loss'),
      ...adaptive('g2', 'loss'),
      ...adaptive('g1', 'loss'),
    ];
    const quality = {
      g1: { sufficientSample: true, clean: false, averageLoss: 140, blunders: 2 },
      g2: { sufficientSample: true, clean: false, averageLoss: 120, blunders: 2 },
      g3: { sufficientSample: true, clean: false, averageLoss: 130, blunders: 2 },
    };

    const view = adaptiveDifficultyPresentation({ rating: 1000, games: 20 }, activity, quality);

    expect(view.evidenceCopy).toBe('Señales activas: rating · forma reciente · partidas analizadas.');
    expect(view.evidenceCopy).not.toMatch(/[+-]\d+/);
    expect(view.evidenceCopy).not.toMatch(/Elo/i);
  });

  it('no presume señal de calidad cuando el análisis no cambia el objetivo', () => {
    const view = adaptiveDifficultyPresentation({ rating: 1000, games: 20 }, [], {});
    expect(view.evidenceCopy).toBe('Señales activas: rating.');
  });

  it('no promete estar por encima cuando el jugador supera el techo estimado del motor', () => {
    const view = adaptiveDifficultyPresentation({ rating: 2200, games: 40 }, [], {});

    expect(view.level).toBe(100);
    expect(view.ceilingLimited).toBe(true);
    expect(view.choiceCopy).toContain('máximo disponible');
    expect(view.choiceCopy).not.toContain('por encima de tu nivel');
    expect(view.detailLabel).toBe('Dificultad automática · Implacable · máximo disponible');
  });

  it('normaliza contadores inválidos o negativos para no mostrar progreso absurdo', () => {
    expect(adaptiveDifficultyPresentation({ rating: 700, games: -4 }, []).completed).toBe(0);
    expect(adaptiveDifficultyPresentation({ rating: 700, games: 'basura' }, []).completed).toBe(0);
  });
});
