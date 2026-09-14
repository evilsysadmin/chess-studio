import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_RENDER_BUDGET, pawnSlugPaintHzForState } from './pawnSlugRenderBudget.js';

describe('Pawn Slug render cadence', () => {
  it('keeps full paint cadence during active play', () => {
    expect(pawnSlugPaintHzForState({ phase: 'playing' })).toBe(PAWN_SLUG_RENDER_BUDGET.maxPaintHz);
  });

  it('drops static overlay phases to a cinematic idle cadence', () => {
    expect(pawnSlugPaintHzForState({ phase: 'ready' })).toBe(PAWN_SLUG_RENDER_BUDGET.idlePaintHz);
    expect(pawnSlugPaintHzForState({ phase: 'gameover' })).toBe(PAWN_SLUG_RENDER_BUDGET.idlePaintHz);
    expect(pawnSlugPaintHzForState({ phase: 'victory' })).toBe(PAWN_SLUG_RENDER_BUDGET.idlePaintHz);
  });

  it('nearly suspends WebGL paints while settings pause the simulation', () => {
    expect(pawnSlugPaintHzForState({ phase: 'playing', paused: true })).toBe(PAWN_SLUG_RENDER_BUDGET.pausedPaintHz);
    expect(pawnSlugPaintHzForState({ phase: 'playing', paused: 'true' })).toBe(PAWN_SLUG_RENDER_BUDGET.pausedPaintHz);
    expect(PAWN_SLUG_RENDER_BUDGET.pausedPaintHz).toBeLessThan(PAWN_SLUG_RENDER_BUDGET.idlePaintHz);
  });
});
