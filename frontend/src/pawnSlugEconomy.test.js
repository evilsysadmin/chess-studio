import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ARMORY,
  createPawnSlugArmoryState,
  pawnSlugArmoryOffers,
  pawnSlugArmoryPurchase,
  pawnSlugBankMissionLoot,
  pawnSlugBuyArmoryItem,
  pawnSlugCreditsForKill,
} from './pawnSlugEconomy.js';

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

  it('banks mission loot and preserves unlocked weapons across intermissions', () => {
    const base = createPawnSlugArmoryState({ credits: 40, grenades: 1 });
    const banked = pawnSlugBankMissionLoot(base, {
      credits: 80,
      grenades: 2,
      weapons: { machinegun: { unlocked: true, ammo: 35 } },
    });
    expect(banked).toMatchObject({ credits: 120, grenades: 3 });
    expect(banked.weapons.machinegun).toEqual({ unlocked: true, ammo: 35 });
    expect(banked.weapons.shotgun).toEqual({ unlocked: false, ammo: 0 });
  });

  it('turns first purchase into unlock and later purchase into refill', () => {
    const base = createPawnSlugArmoryState({ credits: 200 });
    const firstOffers = pawnSlugArmoryOffers(base);
    expect(firstOffers.find((offer) => offer.id === 'machinegun')).toMatchObject({ kind: 'unlock', cost: 90 });

    const unlocked = pawnSlugBuyArmoryItem(base, 'machinegun');
    expect(unlocked.ok).toBe(true);
    expect(unlocked.state).toMatchObject({ credits: 110 });
    expect(unlocked.state.weapons.machinegun).toEqual({ unlocked: true, ammo: 90 });

    const refill = pawnSlugBuyArmoryItem(unlocked.state, 'machinegun');
    expect(refill.ok).toBe(true);
    expect(refill.state).toMatchObject({ credits: 74 });
    expect(refill.state.weapons.machinegun.ammo).toBe(180);
  });

  it('handles grenades and insufficient intermission purchases atomically', () => {
    const base = createPawnSlugArmoryState({ credits: 50, grenades: 1 });
    const grenades = pawnSlugBuyArmoryItem(base, 'grenades');
    expect(grenades.ok).toBe(true);
    expect(grenades.state).toMatchObject({ credits: 22, grenades: 4 });

    const rejected = pawnSlugBuyArmoryItem(grenades.state, 'shotgun');
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toBe(grenades.state);
  });
});
