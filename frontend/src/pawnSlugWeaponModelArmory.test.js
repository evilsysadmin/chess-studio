import { beforeEach, describe, expect, it } from 'vitest';
import { setStorageItem, STORAGE_LOCAL } from './safeStorage.js';
import {
  PAWN_SLUG_WEAPON_MODEL_ARMORY_META,
  pawnSlugBuyOrEquipWeaponModel,
  pawnSlugEquippedModelId,
  pawnSlugWeaponModelOffers,
  refreshPawnSlugWeaponModelArmory,
  resetPawnSlugWeaponModelArmory,
} from './pawnSlugWeaponModelArmory.js';

describe('Pawn Slug concrete weapon model armory', () => {
  beforeEach(() => resetPawnSlugWeaponModelArmory());

  it('starts with the live defaults owned and equipped', () => {
    expect(pawnSlugEquippedModelId('pistol')).toBe('dienstpistole');
    expect(pawnSlugEquippedModelId('machinegun')).toBe('mg42');
    expect(pawnSlugEquippedModelId('shotgun')).toBe('m3-super90');
    expect(pawnSlugEquippedModelId('panzerfaust')).toBe('panzerfaust');
    for (const slot of pawnSlugWeaponModelOffers()) {
      expect(slot.models.find((model) => model.equipped)).toMatchObject({ owned: true, cost: 0 });
    }
  });

  it('buys a sidegrade once and can re-equip it later for free', () => {
    const bought = pawnSlugBuyOrEquipWeaponModel({ weaponId: 'pistol', modelId: 'desert-eagle', credits: 100 });
    expect(bought).toMatchObject({ ok: true, cost: 65, credits: 35 });
    expect(pawnSlugEquippedModelId('pistol')).toBe('desert-eagle');

    expect(pawnSlugBuyOrEquipWeaponModel({ weaponId: 'pistol', modelId: 'dienstpistole', credits: 35 })).toMatchObject({ ok: true, cost: 0, credits: 35 });
    const reequipped = pawnSlugBuyOrEquipWeaponModel({ weaponId: 'pistol', modelId: 'desert-eagle', credits: 35 });
    expect(reequipped).toMatchObject({ ok: true, cost: 0, credits: 35 });
  });

  it('does not mutate selection for unknown models or insufficient credits', () => {
    expect(pawnSlugBuyOrEquipWeaponModel({ weaponId: 'machinegun', modelId: 'm249', credits: 10 })).toMatchObject({ ok: false, reason: 'insufficient-credits', cost: 85 });
    expect(pawnSlugEquippedModelId('machinegun')).toBe('mg42');
    expect(pawnSlugBuyOrEquipWeaponModel({ weaponId: 'shotgun', modelId: 'banana', credits: 999 })).toMatchObject({ ok: false, reason: 'unknown-model' });
    expect(pawnSlugEquippedModelId('shotgun')).toBe('m3-super90');
    expect(PAWN_SLUG_WEAPON_MODEL_ARMORY_META.powerCurve).toBe('sidegrades-not-upgrades');
  });

  it('refreshes cached selections after the active profile cache is replaced', () => {
    pawnSlugBuyOrEquipWeaponModel({ weaponId: 'pistol', modelId: 'desert-eagle', credits: 100 });
    expect(pawnSlugEquippedModelId('pistol')).toBe('desert-eagle');

    setStorageItem(STORAGE_LOCAL, PAWN_SLUG_WEAPON_MODEL_ARMORY_META.storage, JSON.stringify({
      pistol: { equipped: 'glock17', owned: ['glock17'] },
    }));

    expect(pawnSlugEquippedModelId('pistol')).toBe('desert-eagle');
    refreshPawnSlugWeaponModelArmory();
    expect(pawnSlugEquippedModelId('pistol')).toBe('glock17');
    expect(pawnSlugWeaponModelOffers().find((slot) => slot.weaponId === 'pistol')?.models.find((model) => model.equipped)?.id).toBe('glock17');
  });
});
