import { describe, expect, it } from 'vitest';
import {
  pawnSlugClaimDestructibleReward,
  pawnSlugCreateDestructibleState,
  pawnSlugDamageDestructible,
} from '../pawnSlugDestructibles.js';

describe('Pawn Slug destructibles', () => {
  it('destroys a crate deterministically without an explosion', () => {
    const crate = pawnSlugCreateDestructibleState('crate');
    expect(pawnSlugDamageDestructible(crate, 20).destroyedNow).toBe(false);
    const result = pawnSlugDamageDestructible(crate, 25);
    expect(result).toEqual({ destroyedNow: true, explosion: null, score: 60 });
    expect(crate).toMatchObject({ hp: 0, destroyed: true });
  });

  it('returns one bounded barrel explosion and cannot detonate twice', () => {
    const barrel = pawnSlugCreateDestructibleState('barrel');
    const result = pawnSlugDamageDestructible(barrel, 999);
    expect(result.destroyedNow).toBe(true);
    expect(result.explosion).toEqual({ radius: 2.4, damage: 72 });
    expect(pawnSlugDamageDestructible(barrel, 999)).toEqual({ destroyedNow: false, explosion: null, score: 0 });
  });

  it('allows a destroyed prop reward to be claimed only once', () => {
    const crate = pawnSlugCreateDestructibleState('crate');
    pawnSlugDamageDestructible(crate, 999);
    expect(pawnSlugClaimDestructibleReward(crate, { kind: 'ammo', amount: 12 })).toEqual({ kind: 'ammo', amount: 12 });
    expect(pawnSlugClaimDestructibleReward(crate, { kind: 'ammo', amount: 12 })).toBeNull();
  });
});
