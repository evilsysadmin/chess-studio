import { beforeEach, describe, it, expect } from 'vitest';
import { handicapForGap } from './handicap.js';
import { saveRating } from './playerRating.js';

beforeEach(() => localStorage.clear());

const ENABLED = { enabled: true };

describe('handicapForGap', () => {
  it('no retira material por defecto aunque la brecha sea enorme', () => {
    expect(handicapForGap(600, 100)).toBeNull();
  });

  it('sin hándicap si la brecha es chica cuando un modo lo activa explícitamente', () => {
    // rating 600 -> dificultad "justa" ~22, elegir 30 es una brecha de 8, chica
    expect(handicapForGap(600, 30, ENABLED)).toBeNull();
  });

  it('el alivio provisional automático no deforma el hándicap explícito de una dificultad manual', () => {
    saveRating({ rating: 600, games: 0 });
    expect(handicapForGap(600, 30, ENABLED)).toBeNull();
    expect(handicapForGap(600, 40, ENABLED)?.id).toBe('pawn');
  });

  it('sin hándicap si la dificultad elegida es MENOR a lo que el rating sugiere', () => {
    // rating 1600 -> dificultad "justa" ~78, elegir 50 es más fácil, no hace falta compensar
    expect(handicapForGap(1600, 50, ENABLED)).toBeNull();
  });

  it('hándicap de peón con una brecha moderada', () => {
    // rating 600 -> ~22 de dificultad justa, elegir 40 = brecha de 18 (>= 15, < 30)
    const h = handicapForGap(600, 40, ENABLED);
    expect(h.id).toBe('pawn');
  });

  it('hándicap de caballo con una brecha mayor', () => {
    // rating 600 -> ~22, elegir 55 = brecha de 33 (>= 30, < 50)
    const h = handicapForGap(600, 55, ENABLED);
    expect(h.id).toBe('knight');
  });

  it('hándicap de torre con una brecha grande', () => {
    // rating 600 -> ~22, elegir 75 = brecha de 53 (>= 50, < 70)
    const h = handicapForGap(600, 75, ENABLED);
    expect(h.id).toBe('rook');
  });

  it('hándicap de dama con la brecha máxima', () => {
    // rating 200 (piso) -> dificultad justa 0, elegir 100 = brecha de 100 (>= 70)
    const h = handicapForGap(200, 100, ENABLED);
    expect(h.id).toBe('queen');
  });

  it('la progresión explícita es monótona: más brecha nunca da un hándicap más chico', () => {
    const order = ['pawn', 'knight', 'rook', 'queen'];
    const gaps = [20, 35, 55, 75];
    const results = gaps.map((g) => handicapForGap(600, 22 + g, ENABLED));
    results.forEach((r, i) => expect(r.id).toBe(order[i]));
  });
});
