import { describe, it, expect, beforeEach } from 'vitest';
import { loadWorstMoveCache, saveWorstMoveCache } from './worstMoveCache.js';

beforeEach(() => localStorage.clear());

describe('worstMoveCache', () => {
  it('devuelve un objeto vacío si nunca se guardó nada', () => {
    expect(loadWorstMoveCache()).toEqual({});
  });

  it('guarda y recupera el caché tal cual', () => {
    const cache = { g1: { worst: { played: 'Qh5', loss: 230 }, analyzedAt: '2026-01-01' } };
    saveWorstMoveCache(cache);
    expect(loadWorstMoveCache()).toEqual(cache);
  });

  it('limita el caché a los 145 análisis más recientes', () => {
    const cache = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [
      `g${index}`,
      {
        worst: { played: `m${index}`, loss: index },
        analyzedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      },
    ]));

    saveWorstMoveCache(cache);
    const stored = loadWorstMoveCache();

    expect(Object.keys(stored)).toHaveLength(145);
    expect(stored.g149).toBeDefined();
    expect(stored.g5).toBeDefined();
    expect(stored.g4).toBeUndefined();
    expect(stored.g0).toBeUndefined();
  });

  it('no revienta si el valor guardado no es JSON válido', () => {
    localStorage.setItem('chess-study-worst-move-cache', 'esto no es json');
    expect(loadWorstMoveCache()).toEqual({});
  });

  it('no revienta si el valor guardado es un array en vez de un objeto', () => {
    localStorage.setItem('chess-study-worst-move-cache', JSON.stringify(['algo']));
    expect(loadWorstMoveCache()).toEqual({});
  });
});
