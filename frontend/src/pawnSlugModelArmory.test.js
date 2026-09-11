import { describe, expect, it } from 'vitest';
import {
  createPawnSlugModelArmoryState,
  PAWN_SLUG_MODEL_ARMORY_META,
  pawnSlugBuyOrEquipModel,
  pawnSlugModelArmoryOffers,
  pawnSlugSelectedModelId,
} from './pawnSlugModelArmory.js';

describe('Pawn Slug selectable model armory', () => {
  it('owns and selects the live default model for every current slot', () => {
    const state = createPawnSlugModelArmoryState();
    expect(pawnSlugSelectedModelId(state, 'pistol')).toBe('dienstpistole');
    expect(pawnSlugSelectedModelId(state, 'machinegun')).toBe('mg42');
    expect(pawnSlugSelectedModelId(state, 'shotgun')).toBe('m3-super90');
    expect(pawnSlugSelectedModelId(state, 'panzerfaust')).toBe('panzerfaust');
    for (const slot of Object.values(state)) expect(slot.owned).toContain(slot.selected);
  });

  it('blocks purchases for a weapon slot that has not been unlocked', () => {
    const state = createPawnSlugModelArmoryState();
    const offers = pawnSlugModelArmoryOffers('machinegun', state, { slotUnlocked: false });
    expect(offers.every((entry) => entry.available === false)).toBe(true);
    expect(pawnSlugBuyOrEquipModel(state, 'machinegun', 'rpk', { credits: 999, slotUnlocked: false })).toMatchObject({
      ok: false,
      reason: 'slot-locked',
      credits: 999,
    });
  });

  it('buys an alternate model once and equips it without charging twice', () => {
    const state = createPawnSlugModelArmoryState();
    const bought = pawnSlugBuyOrEquipModel(state, 'shotgun', 'spas12', { credits: 100, slotUnlocked: true });
    expect(bought).toMatchObject({ ok: true, cost: 75, credits: 25 });
    expect(bought.state.shotgun).toMatchObject({ selected: 'spas12' });
    expect(bought.state.shotgun.owned).toContain('spas12');

    const equippedAgain = pawnSlugBuyOrEquipModel(bought.state, 'shotgun', 'spas12', { credits: 25, slotUnlocked: true });
    expect(equippedAgain).toMatchObject({ ok: true, cost: 0, credits: 25 });
  });

  it('rejects insufficient credits without mutating ownership', () => {
    const state = createPawnSlugModelArmoryState();
    const result = pawnSlugBuyOrEquipModel(state, 'pistol', 'desert-eagle', { credits: 20, slotUnlocked: true });
    expect(result).toMatchObject({ ok: false, reason: 'insufficient-credits', cost: 70, credits: 20 });
    expect(result.state.pistol.owned).not.toContain('desert-eagle');
    expect(PAWN_SLUG_MODEL_ARMORY_META.purchaseCurrency).toBe('mission-credits');
  });

  it('sanitizes unknown persisted model ids back to safe defaults', () => {
    const state = createPawnSlugModelArmoryState({
      pistol: { selected: 'laser-cannon', owned: ['laser-cannon', 'glock17'] },
    });
    expect(state.pistol.selected).toBe('dienstpistole');
    expect(state.pistol.owned).toContain('glock17');
    expect(state.pistol.owned).not.toContain('laser-cannon');
  });
});
