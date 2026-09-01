import { describe, expect, it } from 'vitest';
import { angerLevelForMaterial, matthiasAngerState } from './matthiasAnger.js';

describe('matthiasAnger', () => {
  it('escala la rabia según material realmente capturado', () => {
    expect(angerLevelForMaterial(0)).toBe(0);
    expect(angerLevelForMaterial(1)).toBe(1);
    expect(angerLevelForMaterial(3)).toBe(2);
    expect(angerLevelForMaterial(6)).toBe(3);
    expect(angerLevelForMaterial(9)).toBe(4);
  });

  it('cuenta sólo las piezas de Matthias capturadas por el humano', () => {
    const state = matthiasAngerState([
      { san: 'e4' },
      { san: 'd5' },
      { san: 'exd5' },
      { san: 'Qxd5' },
    ], 'w');

    expect(state.reconstructable).toBe(true);
    expect(state.material).toBe(1);
    expect(state.level).toBe(1);
    expect(state.latestHumanCapture).toMatchObject({ piece: 'p', value: 1, ply: 3 });
  });

  it('no fabrica rabia si una partida especial no puede reconstruirse', () => {
    const state = matthiasAngerState([{ san: 'Qh8#' }], 'w');
    expect(state).toMatchObject({ material: 0, level: 0, reconstructable: false });
  });
});
