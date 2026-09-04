import { describe, expect, it } from 'vitest';
import {
  buildBoard3DParityHighlights,
  buildBoard3DParityHintMove,
  buildBoard3DParityRows,
} from './Board3DParity.js';

describe('Board3D parity adapter', () => {
  it('translates forensic, arena and Combat annotations into 3D square semantics', () => {
    const highlights = buildBoard3DParityHighlights({
      mistakeMove: { from: 'f3', to: 'g5', piece: 'N' },
      squareClassName: (square) => {
        if (square === 'd4') return 'arena-terrain-blocked';
        if (square === 'e2') return 'deployment-square deployment-square-valid';
        if (square === 'a1') return 'combat-square-mercenary';
        return '';
      },
      pieceRankLevels: { b2: 4 },
      pieceXp: { c2: 7 },
      pieceVeteranMarks: { h2: [{ id: 'survivor', glyph: '✦', label: 'Superviviente' }] },
    });

    expect(highlights).toMatchObject({
      a1: 'mercenary',
      b2: 'veteran',
      c2: 'xp',
      d4: 'terrain',
      e2: 'deployment',
      f3: 'mistake',
      g5: 'mistake',
      h2: 'veteran',
    });
  });

  it('keeps the normal engine hint while attaching parity metadata', () => {
    const hint = buildBoard3DParityHintMove({
      hintMove: { from: 'g1', to: 'f3' },
      mistakeMove: { from: 'd2', to: 'd4', piece: 'P' },
    });

    expect(hint).toMatchObject({
      from: 'g1',
      to: 'f3',
      parityHighlights: { d2: 'mistake', d4: 'mistake' },
    });
  });

  it('keeps exact veteran identity, level, XP and decorations available beside the 3D board', () => {
    const rows = buildBoard3DParityRows({
      pieces: [{ square: 'e2', type: 'p', color: 'w' }, { square: 'g1', type: 'n', color: 'w' }],
      pieceLabels: { e2: 'Klaus' },
      pieceRankLevels: { e2: 5 },
      pieceXp: { e2: 12 },
      pieceVeteranMarks: { e2: [{ id: 'boss', glyph: '★', label: 'Matabosses' }] },
      pieceLevels: { g1: 3 },
    });

    expect(rows).toEqual([
      { square: 'e2', text: 'Klaus · rango 5 · 12 XP · ★ Matabosses' },
      { square: 'g1', text: 'nv.3' },
    ]);
  });
});
