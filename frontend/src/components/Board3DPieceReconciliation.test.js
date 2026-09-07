import { describe, expect, it } from 'vitest';
import { planBoard3DPieceReconciliation } from './Board3DPieceReconciliation.js';

const piece = (square, type, color) => ({ square, type, color });

function compact(plan) {
  return {
    reuse: plan.reuse.map(({ from, to }) => `${from}:${to}`).sort(),
    remove: [...plan.remove].sort(),
    build: [...plan.build].sort(),
  };
}

describe('Board3D piece reconciliation', () => {
  it('reuses the whole surviving army on a quiet move', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('a1', 'r', 'w'), piece('e2', 'p', 'w'), piece('e7', 'p', 'b')],
      nextPieces: [piece('a1', 'r', 'w'), piece('e4', 'p', 'w'), piece('e7', 'p', 'b')],
      animate: { from: 'e2', to: 'e4' },
    });

    expect(compact(plan)).toEqual({
      reuse: ['a1:a1', 'e2:e4', 'e7:e7'],
      remove: [],
      build: [],
    });
  });

  it('reuses the attacker and disposes only the captured rig', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('e4', 'p', 'w'), piece('d5', 'p', 'b'), piece('e8', 'k', 'b')],
      nextPieces: [piece('d5', 'p', 'w'), piece('e8', 'k', 'b')],
      animate: { from: 'e4', to: 'd5', capture: true },
    });

    expect(compact(plan)).toEqual({
      reuse: ['e4:d5', 'e8:e8'],
      remove: ['d5'],
      build: [],
    });
  });

  it('rebuilds only the promoted piece when its physical type changes', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('a7', 'p', 'w'), piece('h8', 'k', 'b')],
      nextPieces: [piece('a8', 'q', 'w'), piece('h8', 'k', 'b')],
      animate: { from: 'a7', to: 'a8' },
    });

    expect(compact(plan)).toEqual({
      reuse: ['h8:h8'],
      remove: ['a7'],
      build: ['a8'],
    });
  });

  it('reuses both king and rook during castling', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('e1', 'k', 'w'), piece('h1', 'r', 'w'), piece('e8', 'k', 'b')],
      nextPieces: [piece('g1', 'k', 'w'), piece('f1', 'r', 'w'), piece('e8', 'k', 'b')],
      animate: { from: 'e1', to: 'g1' },
    });

    expect(compact(plan)).toEqual({
      reuse: ['e1:g1', 'e8:e8', 'h1:f1'],
      remove: [],
      build: [],
    });
  });

  it('removes the en-passant victim without rebuilding the mover', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('e5', 'p', 'w'), piece('d5', 'p', 'b')],
      nextPieces: [piece('d6', 'p', 'w')],
      animate: { from: 'e5', to: 'd6', capture: true },
    });

    expect(compact(plan)).toEqual({
      reuse: ['e5:d6'],
      remove: ['d5'],
      build: [],
    });
  });

  it('stays conservative for arbitrary FEN jumps without a known move', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('a1', 'r', 'w'), piece('e2', 'p', 'w')],
      nextPieces: [piece('a1', 'r', 'w'), piece('e4', 'p', 'w')],
    });

    expect(compact(plan)).toEqual({
      reuse: ['a1:a1'],
      remove: ['e2'],
      build: ['e4'],
    });
  });

  it('can force a full rebuild when the visual build signature changes', () => {
    const plan = planBoard3DPieceReconciliation({
      previousPieces: [piece('e1', 'k', 'w'), piece('e8', 'k', 'b')],
      nextPieces: [piece('e1', 'k', 'w'), piece('e8', 'k', 'b')],
      allowReuse: false,
    });

    expect(compact(plan)).toEqual({
      reuse: [],
      remove: ['e1', 'e8'],
      build: ['e1', 'e8'],
    });
  });
});
