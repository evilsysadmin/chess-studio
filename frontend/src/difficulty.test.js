import { describe, expect, it } from 'vitest';
import { difficultyLabel } from './difficulty.js';

describe('difficulty labels', () => {
  it('mantiene alineados los cinco tramos visibles con el motor', () => {
    expect(difficultyLabel(0)).toBe('Principiante');
    expect(difficultyLabel(19)).toBe('Principiante');
    expect(difficultyLabel(20)).toBe('Aficionado');
    expect(difficultyLabel(44)).toBe('Aficionado');
    expect(difficultyLabel(45)).toBe('Intermedio');
    expect(difficultyLabel(69)).toBe('Intermedio');
    expect(difficultyLabel(70)).toBe('Avanzado');
    expect(difficultyLabel(89)).toBe('Avanzado');
    expect(difficultyLabel(90)).toBe('Implacable');
    expect(difficultyLabel(100)).toBe('Implacable');
  });
});
