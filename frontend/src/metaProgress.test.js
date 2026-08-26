import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCemetery,
  buildOpeningTree,
  deriveChessProfile,
  evolutionBuckets,
} from './metaProgress.js';

beforeEach(() => localStorage.clear());

describe('meta progress derivado de historial real', () => {
  it('cementerio conserva sólo derrotas y prioriza las más graves', () => {
    const rows = buildCemetery([
      { id: 'w', outcome: 'win', difficulty: 90, moves: Array(80).fill({}) },
      { id: 'l1', outcome: 'loss', difficulty: 30, moves: Array(20).fill({}) },
      { id: 'l2', outcome: 'loss', difficulty: 70, moves: Array(10).fill({}) },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['l2', 'l1']);
    expect(rows.every((row) => row.outcome === 'loss')).toBe(true);
  });

  it('árbol de aperturas acumula frecuencia y victorias por secuencia', () => {
    const tree = buildOpeningTree([
      { outcome: 'win', moves: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }] },
      { outcome: 'loss', moves: [{ san: 'e4' }, { san: 'c5' }] },
    ]);
    expect(tree).toMatchObject({ count: 2, wins: 1 });
    expect(tree.children.e4).toMatchObject({ count: 2, wins: 1 });
    expect(tree.children.e4.children.e5).toMatchObject({ count: 1, wins: 1 });
    expect(tree.children.e4.children.c5).toMatchObject({ count: 1, wins: 0 });
  });

  it('perfil sólo describe métricas realmente presentes en el historial', () => {
    const history = Array.from({ length: 2 }, (_, game) => ({
      outcome: game === 0 ? 'win' : 'loss',
      moves: [
        { piece: 'p', captured: true, san: 'exd5' },
        { piece: 'p', captured: true, san: 'cxd4' },
        { piece: 'q', san: 'Qh5' },
        { piece: 'p', captured: true, san: 'exd5' },
        { piece: 'k', san: 'O-O' },
        { piece: 'p', captured: true, san: 'cxd4' },
        { piece: 'p', captured: true, san: 'exd5' },
      ],
    }));
    const profile = deriveChessProfile(history).join(' ');
    expect(profile).toMatch(/táctica/i);
    expect(profile).toMatch(/enrocas/i);
    expect(profile).toMatch(/dama sale pronto/i);
    expect(profile).toMatch(/duración media/i);
  });

  it('evolución ordena por fecha y calcula buckets sin depender del orden de entrada', () => {
    const rows = evolutionBuckets([
      { date: '2026-08-03', outcome: 'loss', difficulty: 60 },
      { date: '2026-08-01', outcome: 'win', difficulty: 20 },
      { date: '2026-08-02', outcome: 'win', difficulty: 40 },
    ], 2);
    expect(rows).toEqual([
      { label: '1-2', games: 2, winPct: 100, avgDifficulty: 30 },
      { label: '3-3', games: 1, winPct: 0, avgDifficulty: 60 },
    ]);
  });

});
