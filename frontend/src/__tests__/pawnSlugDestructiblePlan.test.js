import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_DESTRUCTIBLE_PLAN,
  pawnSlugClaimDestructibleId,
  pawnSlugDestructibleReward,
  pawnSlugDestructiblesForRange,
} from '../pawnSlugDestructiblePlan.js';

describe('Pawn Slug destructible placement plan', () => {
  it('keeps ids unique and placements ordered', () => {
    const ids = PAWN_SLUG_DESTRUCTIBLE_PLAN.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const xs = PAWN_SLUG_DESTRUCTIBLE_PLAN.map((entry) => entry.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('returns only props inside the requested world range', () => {
    expect(pawnSlugDestructiblesForRange(700, 1600).map((entry) => entry.id)).toEqual([
      'crate-intro-1',
      'barrel-trench-1',
    ]);
  });

  it('makes hidden rewards deterministic and claim-once', () => {
    const claimed = new Set();
    const crate = PAWN_SLUG_DESTRUCTIBLE_PLAN[0];
    expect(pawnSlugDestructibleReward(crate, claimed)).toEqual({ kind: 'ammo', weapon: 'machinegun', amount: 18 });
    expect(pawnSlugClaimDestructibleId(claimed, crate.id)).toBe(true);
    expect(pawnSlugDestructibleReward(crate, claimed)).toBeNull();
    expect(pawnSlugClaimDestructibleId(claimed, crate.id)).toBe(false);
  });
});
