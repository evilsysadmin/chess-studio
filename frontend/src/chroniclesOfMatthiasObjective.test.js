import { describe, expect, it } from 'vitest';
import {
  chroniclesObjective,
  createChroniclesState,
} from './chroniclesOfMatthias.js';

describe('Chronicles exploration objective', () => {
  it('derives the crypt progression from authored map content', () => {
    let state = createChroniclesState();
    expect(chroniclesObjective(state)).toBe('Derrota al peón corrompido');

    state = { ...state, enemyHp: 0 };
    expect(chroniclesObjective(state)).toBe('Encuentra y pisa el sello');

    state = { ...state, sigilAwake: true };
    expect(chroniclesObjective(state)).toBe('Derrota a la torre carcelero');

    state = { ...state, jailerHp: 0 };
    expect(chroniclesObjective(state)).toBe('Caza al caballo carroñero');

    state = { ...state, scavengerHp: 0, blackGateKey: true };
    expect(chroniclesObjective(state)).toBe('Cruza la puerta negra');

    state = { ...state, phase: 'escaped' };
    expect(chroniclesObjective(state)).toBe('Vertical slice completado');
  });
});
