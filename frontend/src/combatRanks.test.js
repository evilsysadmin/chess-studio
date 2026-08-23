import { describe, expect, it } from 'vitest';
import { METAMORPHOSIS_MIN_RANK_ID, PIECE_RANKS, pieceRankAtLeast, pieceRankForLevel, pieceRankInsignia, pieceRankTooltip } from './combatRanks.js';

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

  it('expone una silueta distinta para cada rango sin alterar la progresión', () => {
    expect(pieceRankInsignia(1)).toMatchObject({ icon: 'none', label: 'Recluta' });
    expect(pieceRankInsignia(3)).toMatchObject({ icon: 'chevron', label: 'Cabo', family: 'nco' });
    expect(pieceRankInsignia(4)).toMatchObject({ icon: 'shield', label: 'Sargento', family: 'nco' });
    expect(pieceRankInsignia(6)).toMatchObject({ icon: 'double-bar', label: 'Capitán', family: 'officer' });
    expect(pieceRankInsignia(10)).toMatchObject({ icon: 'eagle', label: 'Coronel', family: 'senior' });
    expect(pieceRankInsignia(12)).toMatchObject({ icon: 'star', label: 'General', family: 'general' });

    const icons = PIECE_RANKS.map((rank) => pieceRankInsignia(rank).icon);
    expect(new Set(icons).size).toBe(PIECE_RANKS.length);
  });

  it('explica jerarquía, nivel y siguiente ascenso en el tooltip de rango', () => {
    expect(pieceRankTooltip(6)).toContain('Capitán · rango 6/9');
    expect(pieceRankTooltip(6)).toContain('niveles 6–7 · oficial');
    expect(pieceRankTooltip(6)).toContain('Siguiente: Comandante · nivel 8');
    expect(pieceRankTooltip(8)).toContain('Primer rango elegible para metamorfosis');
    expect(pieceRankTooltip(12)).toContain('Rango máximo');
  });

});
