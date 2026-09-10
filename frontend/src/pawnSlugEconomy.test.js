import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_ARMORY, pawnSlugArmoryPurchase, pawnSlugCreditsForKill } from './pawnSlugEconomy.js';

describe('Pawn Slug credits and armory', () => {
  it('pays more for more dangerous chess soldiers while capping combo farming', () => {
    expect(pawnSlugCreditsForKill('pawn')).toBeLessThan(pawnSlugCreditsForKill('knight'));
    expect(pawnSlugCreditsForKill('knight')).toBeLessThan(pawnSlugCreditsForKill('rook'));
    expect(pawnSlugCreditsForKill('rook')).toBeLessThan(pawnSlugCreditsForKill('bishop'));
    expect(pawnSlugCreditsForKill('bishop')).toBeLessThan(pawnSlugCreditsForKill('boss'));
    expect(pawnSlugCreditsForKill('pawn', { combo: 99 })).toBe(pawnSlugCreditsForKill('pawn', { combo: 5 }));
  });

  it('keeps the pistol outside the paid armory economy', () => {
    expect(PAWN_SLUG_ARMORY.pistol).toBeUndefined();
  });

  it('charges an unlock once and cheaper refills afterwards', () => {
    const unlock = pawnSlugArmoryPurchase({ credits: 200, item: 'machinegun', unlocked: false });
    expect(unlock).toMatchObject({ ok: true, cost: 90, credits: 110, unlock: true, ammo: 90 });
    const refill = pawnSlugArmoryPurchase({ credits: 110, item: 'machinegun', unlocked: true });
    expect(refill).toMatchObject({ ok: true, cost: 36, credits: 74, unlock: false, ammo: 90 });
  });

  it('rejects purchases without enough credits without mutating the balance', () => {
    expect(pawnSlugArmoryPurchase({ credits: 20, item: 'panzerfaust', unlocked: false })).toMatchObject({
      ok: false,
      reason: 'insufficient-credits',
      credits: 20,
      cost: 170,
    });
  });
});
