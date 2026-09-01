import { describe, expect, it } from 'vitest';
import { boardGridFromFen, legalTargetsByDestination } from './boardRenderModel.js';

describe('board render model', () => {
  it('parses only the FEN placement into the 8x8 render grid', () => {
    const grid = boardGridFromFen('8/8/8/3k4/8/4P3/8/4K3 w - - 0 1');
    expect(grid).toHaveLength(8);
    expect(grid.every((rank) => rank.length === 8)).toBe(true);
    expect(grid[3][3]).toBe('k');
    expect(grid[5][4]).toBe('P');
    expect(grid[7][4]).toBe('K');
  });

  it('fails closed to an empty board for malformed placements', () => {
    const grid = boardGridFromFen('8/8/8/8/8/8/8/9 w - - 0 1');
    expect(grid.flat().every((piece) => piece === '')).toBe(true);
  });

  it('indexes legal destinations once while preserving Array.find semantics', () => {
    const queenPromotion = { from: 'a7', to: 'a8', promotion: 'q', san: 'a8=Q' };
    const knightPromotion = { from: 'a7', to: 'a8', promotion: 'n', san: 'a8=N' };
    const capture = { from: 'a7', to: 'b8', promotion: 'q', san: 'axb8=Q' };
    const indexed = legalTargetsByDestination([queenPromotion, knightPromotion, capture]);

    expect(indexed.size).toBe(2);
    expect(indexed.get('a8')).toBe(queenPromotion);
    expect(indexed.get('b8')).toBe(capture);
  });

  it('tolerates absent or malformed target collections', () => {
    expect(legalTargetsByDestination(null).size).toBe(0);
    expect(legalTargetsByDestination({ to: 'e4' }).size).toBe(0);
  });
});
