import { describe, expect, it } from 'vitest';
import {
  pawnSlugClaimDestructibleReward,
  pawnSlugCreateDestructibleState,
  pawnSlugDamageDestructible,
  pawnSlugDestructibleSpec,
} from '../pawnSlugDestructibles.js';

describe('Pawn Slug destructibles', () => {
  it('destroys a crate deterministically without an explosion', () => {
    const crate = pawnSlugCreateDestructibleState('crate');
    expect(crate.maxHp).toBe(45);
    expect(pawnSlugDamageDestructible(crate, 20).destroyedNow).toBe(false);
    const result = pawnSlugDamageDestructible(crate, 25);
    expect(result).toEqual({ destroyedNow: true, explosion: null, score: 60 });
    expect(crate).toMatchObject({ hp: 0, maxHp: 45, destroyed: true });
  });

  it('returns one bounded barrel explosion and cannot detonate twice', () => {
    const barrel = pawnSlugCreateDestructibleState('barrel');
    const result = pawnSlugDamageDestructible(barrel, 999);
    expect(result.destroyedNow).toBe(true);
    expect(result.explosion).toEqual({ radius: 2.4, damage: 72 });
    expect(pawnSlugDamageDestructible(barrel, 999)).toEqual({ destroyedNow: false, explosion: null, score: 0 });
  });

  it('makes sandbags durable non-explosive cover props', () => {
    const spec = pawnSlugDestructibleSpec('sandbags');
    expect(spec).toMatchObject({ hp: 72, material: 'fabric', explosive: false });
    const sandbags = pawnSlugCreateDestructibleState('sandbags');
    expect(sandbags.maxHp).toBe(72);
    expect(pawnSlugDamageDestructible(sandbags, 45).destroyedNow).toBe(false);
    expect(pawnSlugDamageDestructible(sandbags, 27)).toEqual({ destroyedNow: true, explosion: null, score: 75 });
  });

  it('allows a destroyed prop reward to be claimed only once', () => {
    const crate = pawnSlugCreateDestructibleState('crate');
    pawnSlugDamageDestructible(crate, 999);
    expect(pawnSlugClaimDestructibleReward(crate, { kind: 'ammo', amount: 12 })).toEqual({ kind: 'ammo', amount: 12 });
    expect(pawnSlugClaimDestructibleReward(crate, { kind: 'ammo', amount: 12 })).toBeNull();
  });
});
