import { describe, expect, it } from 'vitest';
import { METAMORPHOSIS_MIN_RANK_ID, PIECE_RANKS, pieceRankAtLeast, pieceRankForLevel } from './combatRanks.js';

describe('rangos militares de piezas de Combate', () => {
  it('deriva el rango exclusivamente del nivel real', () => {
    expect(pieceRankForLevel(1).label).toBe('Recluta');
    expect(pieceRankForLevel(4).label).toBe('Sargento');
    expect(pieceRankForLevel(6).label).toBe('Capitán');
    expect(pieceRankForLevel(12).label).toBe('General');
  });

  it('Comandante es el primer rango elegible para metamorfosis', () => {
    expect(METAMORPHOSIS_MIN_RANK_ID).toBe('commander');
    expect(pieceRankAtLeast(7, METAMORPHOSIS_MIN_RANK_ID)).toBe(false);
    expect(pieceRankAtLeast(8, METAMORPHOSIS_MIN_RANK_ID)).toBe(true);
  });

  it('el catálogo mantiene orden e ids únicos', () => {
    expect(new Set(PIECE_RANKS.map((rank) => rank.id)).size).toBe(PIECE_RANKS.length);
    expect(PIECE_RANKS.map((rank) => rank.minLevel)).toEqual([...PIECE_RANKS.map((rank) => rank.minLevel)].sort((a, b) => a - b));
  });
});
