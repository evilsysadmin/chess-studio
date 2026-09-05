import { describe, expect, it } from 'vitest';
import { matthiasTimeScene, normalizeMatthiasHour } from './matthiasTime.js';

describe('Matthias · jornada horaria', () => {
  it('rota actividades hora a hora y reserva comida para desayuno, comida y cena', () => {
    const keys = Array.from({ length: 24 }, (_, hour) => matthiasTimeScene(hour).key);
    expect(keys.slice(0, 6)).toEqual(Array(6).fill('late-sleep'));
    expect(keys.filter((key) => key === 'lunch-bocata')).toHaveLength(1);
    expect(keys.filter((key) => key === 'lunch-campaign-dinner')).toHaveLength(1);
    expect(keys[7]).toBe('breakfast-news');
    expect(keys[12]).toBe('lunch-bocata');
    expect(keys[20]).toBe('lunch-campaign-dinner');
    expect(new Set(keys).size).toBeGreaterThanOrEqual(10);
    expect(keys[9]).toBe('chess-inception');
    expect(keys[19]).toBe('beer-break');
    expect(keys[23]).toBe('strategy-book');

    const solidFoodHours = keys
      .map((key, hour) => ({ key, hour }))
      .filter(({ key }) => ['breakfast-news', 'lunch-bocata', 'lunch-campaign-dinner'].includes(key))
      .map(({ hour }) => hour);
    expect(solidFoodHours).toEqual([7, 12, 20]);

    const workingHours = keys.slice(8, 19);
    expect(workingHours).toContain('dossier');
    expect(workingHours).toContain('strategy-book');
    expect(workingHours).toContain('chess-inception');
    expect(workingHours).toContain('afternoon-ops');
  });

  it('a medianoche ya está sobando', () => {
    const scene = matthiasTimeScene(0);
    expect(scene.key).toBe('late-sleep');
    expect(scene.label).toBe('Sobando');
  });

  it('normaliza horas fuera de rango sin romper la escena', () => {
    expect(normalizeMatthiasHour(24)).toBe(0);
    expect(normalizeMatthiasHour(-1)).toBe(23);
    expect(matthiasTimeScene('basura').key).toBe('lunch-bocata');
  });
});
