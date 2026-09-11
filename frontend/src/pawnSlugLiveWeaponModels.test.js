import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_LIVE_WEAPON_META,
  PAWN_SLUG_LIVE_WEAPON_MODELS,
  pawnSlugApplyLiveWeaponModel,
  pawnSlugLiveWeaponLabel,
  pawnSlugLiveWeaponModel,
} from './pawnSlugLiveWeaponModels.js';

describe('Pawn Slug live concrete weapon models', () => {
  it('binds each live weapon slot to a concrete existing model', () => {
    expect(PAWN_SLUG_LIVE_WEAPON_MODELS).toEqual({
      pistol: { family: 'pistol', modelId: 'dienstpistole' },
      machinegun: { family: 'machinegun', modelId: 'mg42' },
      shotgun: { family: 'shotgun', modelId: 'm3-super90' },
      panzerfaust: { family: 'launcher', modelId: 'panzerfaust' },
    });
    for (const id of Object.keys(PAWN_SLUG_LIVE_WEAPON_MODELS)) {
      expect(pawnSlugLiveWeaponModel(id)?.id).toBe(PAWN_SLUG_LIVE_WEAPON_MODELS[id].modelId);
    }
  });

  it('surfaces concrete labels instead of generic family labels', () => {
    expect(pawnSlugLiveWeaponLabel('pistol')).toBe('Dienstpistole');
    expect(pawnSlugLiveWeaponLabel('machinegun')).toBe('MG-42');
    expect(pawnSlugLiveWeaponLabel('shotgun')).toBe('Benelli M3');
    expect(pawnSlugLiveWeaponLabel('panzerfaust')).toBe('Panzerfaust');
  });

  it('applies concrete model modifiers to live combat stats', () => {
    const base = { damage: 20, cadence: 100, spread: 0.1, recoil: 1, capacity: 20, reload: 1, mobility: 1 };
    const mg42 = pawnSlugApplyLiveWeaponModel(base, 'machinegun');
    const benelli = pawnSlugApplyLiveWeaponModel(base, 'shotgun');
    expect(mg42.modelId).toBe('mg42');
    expect(mg42.cadence).toBe(88);
    expect(mg42.spread).toBeCloseTo(0.112);
    expect(benelli.modelId).toBe('m3-super90');
    expect(benelli.damage).toBeCloseTo(20.6);
    expect(PAWN_SLUG_LIVE_WEAPON_META.affectsStats).toBe(true);
  });
});
